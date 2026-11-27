"""Institutional queries and protected publication of official PDFs."""

from contextlib import contextmanager
from collections.abc import Iterator
from hashlib import sha256
from threading import BoundedSemaphore
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.api.dependencies import has_role
from app.core.config import settings
from app.core.database import get_db
from app.core.security import validate_institutional_email
from app.models.regulations import OfficialRegulation, RegulationArticle
from app.models.user import User
from app.schemas.regulations import (
    Category,
    RegulationAnswer,
    RegulationDocument,
    RegulationQuestion,
    RegulationStatusUpdate,
    RegulationUpload,
)
from app.services.regulations import (
    MAX_PDF_BYTES,
    Article,
    Evidence,
    InvalidRegulation,
    OllamaRegulations,
    RegulationProviderUnavailable,
    angular_similarity,
    answer_from_evidence,
    no_evidence,
    parse_regulation_pdf,
)

router = APIRouter()
Database = Annotated[Session, Depends(get_db)]
Viewer = Annotated[User, Depends(has_role(["student", "secretary", "admin"]))]
Publisher = Annotated[User, Depends(has_role(["secretary", "admin"]))]


def get_regulation_models() -> OllamaRegulations:
    return OllamaRegulations(
        settings.OLLAMA_BASE_URL,
        settings.REGULATIONS_EMBEDDING_MODEL,
        settings.REGULATIONS_ANSWER_MODEL,
    )


Models = Annotated[OllamaRegulations, Depends(get_regulation_models)]
inference_slots = BoundedSemaphore(2)


@contextmanager
def reserve_inference() -> Iterator[None]:
    # Keep model calls from filling the app's shared request capacity.
    if not inference_slots.acquire(blocking=False):
        raise HTTPException(503, detail="Regulation processing is busy")
    try:
        yield
    finally:
        inference_slots.release()


@router.post("/query", response_model=RegulationAnswer)
def query_regulations(
    payload: RegulationQuestion, db: Database, user: Viewer, models: Models, response: Response,
) -> RegulationAnswer:
    validate_institutional_email(user.email)
    response.headers["Cache-Control"] = "private, no-store"
    # A deployment without an active corpus can offer escalation without calling a model.
    active = db.scalar(select(OfficialRegulation.id).where(OfficialRegulation.active.is_(True)).limit(1))
    if not active:
        return no_evidence()
    if not models.embedding_model or not models.answer_model:
        raise HTTPException(503, detail="The regulation models are unavailable")
    compatible = db.scalar(select(OfficialRegulation.id).where(
        OfficialRegulation.active.is_(True), OfficialRegulation.embedding_model == models.embedding_model,
    ).limit(1))
    if not compatible:
        raise HTTPException(503, detail="The active corpus needs to be reindexed")
    db.rollback()
    try:
        with reserve_inference():
            vector, = models.embed([payload.question], "query")
            distance = RegulationArticle.embedding.cosine_distance(vector)
            matches = db.execute(
                select(RegulationArticle, OfficialRegulation, distance.label("distance"))
                .join(OfficialRegulation, OfficialRegulation.id == RegulationArticle.regulation_id)
                .where(
                    OfficialRegulation.active.is_(True),
                    OfficialRegulation.embedding_model == models.embedding_model,
                )
                .order_by(distance, RegulationArticle.id)
                .limit(5)
            )
            evidence = [
                Evidence(Article(chunk.ordinal, chunk.number, chunk.page, chunk.content),
                         doc.title, doc.resolution, doc.source_url, angular_similarity(cosine_distance))
                for chunk, doc, cosine_distance in matches
            ]
            db.rollback()
            return answer_from_evidence(payload.question, evidence, models.choose)
    except RegulationProviderUnavailable as exc:
        raise HTTPException(503, detail="The regulation models are unavailable") from exc


@router.get("/documents", response_model=list[RegulationDocument])
def list_regulations(
    db: Database, user: Publisher, response: Response,
    offset: Annotated[int, Query(ge=0, le=10000)] = 0,
) -> list[OfficialRegulation]:
    validate_institutional_email(user.email)
    response.headers["Cache-Control"] = "private, no-store"
    return list(db.scalars(
        select(OfficialRegulation).order_by(OfficialRegulation.created_at.desc(), OfficialRegulation.id)
        .offset(offset).limit(20)
    ))


@router.post(
    "/documents", response_model=RegulationDocument, status_code=201,
    openapi_extra={"requestBody": {"required": True, "content": {
        "application/pdf": {"schema": {"type": "string", "format": "binary"}},
    }}},
)
async def publish_regulation(
    request: Request, db: Database, user: Publisher, models: Models,
    title: Annotated[str, Query(min_length=5, max_length=180)],
    resolution: Annotated[str, Query(max_length=11)],
    category: Category,
    source_url: Annotated[str, Query(max_length=1000)],
) -> RegulationDocument:
    validate_institutional_email(user.email)
    if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/pdf":
        raise HTTPException(415, detail="Expected application/pdf")
    try:
        metadata = RegulationUpload(title=title, resolution=resolution, category=category, source_url=source_url)
    except ValidationError as exc:
        raise HTTPException(422, detail="Invalid publication metadata") from exc
    if not models.embedding_model:
        raise HTTPException(503, detail="The embedding model is unavailable")
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_PDF_BYTES:
            raise HTTPException(413, detail="The PDF exceeds the upload limit")
        body.extend(chunk)
    return await run_in_threadpool(index_regulation, db, user.id, metadata, bytes(body), models)


def index_regulation(
    db: Session, actor: UUID, metadata: RegulationUpload, data: bytes, models: OllamaRegulations,
) -> RegulationDocument:
    # Canonicalize zero-padded IDs so repeated publication targets the same resolution.
    number, year = metadata.resolution.split("-")
    metadata.resolution = f"{int(number):04d}-{year}"
    checksum = sha256(data).hexdigest()
    try:
        page_count, articles = parse_regulation_pdf(data, metadata.resolution)
    except InvalidRegulation as exc:
        raise HTTPException(422, detail=str(exc)) from exc

    existing = db.scalar(select(OfficialRegulation).where(OfficialRegulation.resolution == metadata.resolution))
    if existing:
        current = RegulationDocument.model_validate(existing)
        if existing.checksum != checksum or current.model_dump(include=set(type(metadata).model_fields)) != metadata.model_dump():
            raise HTTPException(409, detail="This resolution already has different publication metadata or content")
        if existing.embedding_model == models.embedding_model:
            return current

    try:
        with reserve_inference():
            embeddings = models.embed([f"{metadata.title}\n{article.content}" for article in articles], "document")
    except RegulationProviderUnavailable as exc:
        raise HTTPException(503, detail="The embedding model is unavailable") from exc
    doc = existing or OfficialRegulation(
        **metadata.model_dump(), checksum=checksum, published_by=actor,
        active=False, page_count=page_count, article_count=len({article.number for article in articles}),
    )
    try:
        if existing:
            # Serialize a rebuild with retirement and any concurrent rebuild.
            db.refresh(doc, with_for_update=True)
            if doc.embedding_model == models.embedding_model:
                return RegulationDocument.model_validate(doc)
            doc.embedding_model = models.embedding_model
            db.query(RegulationArticle).filter_by(regulation_id=doc.id).delete(synchronize_session=False)
        else:
            doc.embedding_model = models.embedding_model
            db.add(doc)
            db.flush()
        db.add_all([
            RegulationArticle(
                regulation_id=doc.id, ordinal=article.ordinal, number=article.number,
                page=article.page, content=article.content, embedding=embedding,
            )
            for article, embedding in zip(articles, embeddings, strict=True)
        ])
        result = RegulationDocument.model_validate(doc)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, detail="This resolution was changed by another request. Retry.") from exc
    return result


@router.patch("/documents/{publication_id}", response_model=RegulationDocument)
def set_regulation_status(
    publication_id: UUID, payload: RegulationStatusUpdate, db: Database, user: Publisher,
) -> RegulationDocument:
    validate_institutional_email(user.email)
    document = db.scalar(select(OfficialRegulation).where(OfficialRegulation.id == publication_id).with_for_update())
    if document is None:
        raise HTTPException(404, detail="Regulation not found")
    document.active = payload.active
    result = RegulationDocument.model_validate(document)
    db.commit()
    return result
