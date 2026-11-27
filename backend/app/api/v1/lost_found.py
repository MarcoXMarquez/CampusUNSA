"""Campus catalog and moderated ownership handoff."""

from typing import Annotated
from uuid import UUID, uuid5

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import ValidationError
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.api.dependencies import get_current_user, has_role
from app.core.database import get_db
from app.core.security import validate_institutional_email
from app.models.lost_found import LostClaim, LostItem
from app.models.user import User
from app.schemas.lost_found import (
    LostClaimCreate,
    LostClaimPrivate,
    LostClaimReview,
    LostItemPublic,
    LostItemReturn,
    LostReportCreate,
)
from app.services.lost_found_media import (
    MAX_PHOTO_BASE64,
    InvalidPhoto,
    MediaUnavailable,
    load_photo,
    prepare_photo,
    store_photos,
)

router = APIRouter()
Database = Annotated[Session, Depends(get_db)]
require_student_role = has_role(["student"])
PageSize = Annotated[int, Query(ge=1, le=24)]
PageOffset = Annotated[int, Query(ge=0, le=10000)]
MAX_REPORT_BODY_BYTES = MAX_PHOTO_BASE64 + 8192


async def institutional_student(student: Annotated[User, Depends(get_current_user)]) -> User:
    require_student_role(student)
    validate_institutional_email(student.email)
    return student


Student = Annotated[User, Depends(institutional_student)]


@router.get("", response_model=list[LostItemPublic])
def catalog(db: Database, limit: PageSize = 12, offset: PageOffset = 0) -> list[LostItem]:
    return list(db.scalars(
        select(LostItem).order_by(LostItem.found_on.desc(), LostItem.id.desc()).offset(offset).limit(limit)
    ))


@router.post(
    "", response_model=LostItemPublic, status_code=201,
    openapi_extra={"requestBody": {
        "required": True,
        "content": {"application/json": {"schema": LostReportCreate.model_json_schema()}},
    }},
)
async def report_item(request: Request, db: Database, student: Student) -> LostItemPublic:
    if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
        raise HTTPException(415, detail="Expected application/json")
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_REPORT_BODY_BYTES:
            raise HTTPException(413, detail="The report exceeds the upload limit")
        body.extend(chunk)
    try:
        report = LostReportCreate.model_validate_json(body)
    except ValidationError as exc:
        raise HTTPException(422, detail="Invalid report fields") from exc
    return await run_in_threadpool(_save_report, report, db, student.id)


def _save_report(report: LostReportCreate, db: Session, reporter_id: UUID) -> LostItemPublic:
    item_id = uuid5(reporter_id, str(report.request_id))
    try:
        images = prepare_photo(report.photo_base64)
    except InvalidPhoto as exc:
        raise HTTPException(422, detail=str(exc)) from exc
    item = LostItem(
        id=item_id, reporter_id=reporter_id, **report.model_dump(exclude={"photo_base64", "request_id"}),
    )
    db.add(item)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        existing = db.get(LostItem, item_id)
        if existing is None:
            raise
        return LostItemPublic.model_validate(existing)
    try:
        store_photos(item.id, images)
    except MediaUnavailable as exc:
        db.rollback()
        raise HTTPException(503, detail="Lost and found photos are temporarily unavailable") from exc
    result = LostItemPublic.model_validate(item)
    db.commit()
    return result


@router.get("/claims", response_model=list[LostClaimPrivate])
def list_my_claims(
    db: Database, student: Student, response: Response, limit: PageSize = 12, offset: PageOffset = 0,
) -> list[LostClaimPrivate]:
    response.headers["Cache-Control"] = "private, no-store"
    visible_claims = select(LostClaim.id).where(LostClaim.claimant_id == student.id).union_all(
        select(LostClaim.id)
        .join(LostItem, LostItem.id == LostClaim.item_id)
        .where(LostItem.reporter_id == student.id)
    )
    claims = db.execute(
        select(LostClaim, LostItem)
        .join(LostItem, LostItem.id == LostClaim.item_id)
        .where(LostClaim.id.in_(visible_claims))
        .order_by(LostClaim.created_at.desc(), LostClaim.id.desc())
        .offset(offset)
        .limit(limit)
    )
    return [_private_claim(claim, item, student.id) for claim, item in claims]


@router.get(
    "/{item_id}/photo", response_class=Response,
    responses={200: {"content": {"image/jpeg": {"schema": {"type": "string", "format": "binary"}}}}},
)
def item_photo(item_id: UUID, db: Database, thumbnail: bool = False) -> Response:
    if not db.scalar(select(LostItem.id).where(LostItem.id == item_id)):
        raise HTTPException(404, detail="Item not found")
    try:
        data = load_photo(item_id, thumbnail)
    except MediaUnavailable as exc:
        raise HTTPException(503, detail="Lost and found photos are temporarily unavailable") from exc
    return Response(
        data, media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff"},
    )


def _lock_item(db: Session, item_id: UUID) -> LostItem:
    item = db.scalar(select(LostItem).where(LostItem.id == item_id).with_for_update())
    if item is None:
        raise HTTPException(404, detail="Item not found")
    return item


def _private_claim(claim: LostClaim, item: LostItem, viewer_id: UUID) -> LostClaimPrivate:
    return LostClaimPrivate(
        id=claim.id, item_id=item.id, item_title=item.title, item_status=item.status,
        proof=claim.proof, status=claim.status, pickup=claim.pickup, is_reporter=item.reporter_id == viewer_id,
    )


@router.post("/{item_id}/claims", response_model=LostClaimPrivate, status_code=201)
def submit_claim(
    item_id: UUID, payload: LostClaimCreate, db: Database, student: Student, response: Response,
) -> LostClaimPrivate:
    response.headers["Cache-Control"] = "private, no-store"
    item = _lock_item(db, item_id)
    if item.reporter_id == student.id or item.status != "open":
        raise HTTPException(409, detail="The item does not accept this claim")
    duplicate = db.scalar(select(LostClaim.id).where(
        LostClaim.item_id == item_id, LostClaim.claimant_id == student.id,
    ))
    if duplicate:
        raise HTTPException(409, detail="A claim has already been filed for this item")
    claim = LostClaim(item_id=item_id, claimant_id=student.id, proof=payload.proof)
    db.add(claim)
    db.flush()
    result = _private_claim(claim, item, student.id)
    db.commit()
    return result


@router.patch("/{item_id}/claims/{claim_id}", response_model=LostClaimPrivate)
def review_claim(
    item_id: UUID, claim_id: UUID, payload: LostClaimReview, db: Database, student: Student, response: Response,
) -> LostClaimPrivate:
    response.headers["Cache-Control"] = "private, no-store"
    item = _lock_item(db, item_id)
    if item.reporter_id != student.id:
        raise HTTPException(404, detail="Claim not found")
    claim_filter = (LostClaim.id == claim_id, LostClaim.item_id == item_id)
    claim = None
    if item.status == "open":
        claim = db.scalar(
            update(LostClaim)
            .where(*claim_filter, LostClaim.status == "pending")
            .values(status=payload.decision, pickup=payload.pickup)
            .returning(LostClaim)
        )
    if claim is None:
        reviewed = db.scalar(select(LostClaim).where(*claim_filter))
        if reviewed is None:
            raise HTTPException(404, detail="Claim not found")
        if reviewed.status == payload.decision and reviewed.pickup == payload.pickup:
            return _private_claim(reviewed, item, student.id)
        raise HTTPException(409, detail="The claim has already been reviewed")
    if payload.decision == "approved":
        item.status = "reserved"
        db.execute(update(LostClaim).where(
            LostClaim.item_id == item_id, LostClaim.id != claim.id, LostClaim.status == "pending",
        ).values(status="rejected"))
    result = _private_claim(claim, item, student.id)
    db.commit()
    return result


@router.patch("/{item_id}", response_model=LostItemPublic)
def mark_returned(item_id: UUID, payload: LostItemReturn, db: Database, student: Student) -> LostItemPublic:
    item = _lock_item(db, item_id)
    if item.reporter_id != student.id:
        raise HTTPException(404, detail="Item not found")
    if item.status not in {"reserved", "returned"}:
        raise HTTPException(409, detail="Approve an ownership claim before marking the item returned")
    item.status = payload.status
    result = LostItemPublic.model_validate(item)
    db.commit()
    return result
