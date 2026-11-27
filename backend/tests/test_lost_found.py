import base64
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Iterator
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
import httpx
from fastapi.testclient import TestClient
from pydantic import SecretStr
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.dependencies import get_current_user
from app.core.config import settings
from app.core.database import Base, get_db
from app.main import app
from app.models.lost_found import LostClaim, LostItem
from app.models.user import User
from app.services.lost_found_media import (
    InvalidPhoto,
    MediaUnavailable,
    load_photo,
    prepare_photo,
    store_photos,
)


def photo() -> str:
    with Image.new("RGB", (900, 450), "blue") as image:
        metadata = Image.Exif()
        metadata[270] = "private metadata"
        with BytesIO() as stream:
            image.save(stream, "JPEG", exif=metadata)
            return base64.b64encode(stream.getvalue()).decode()


def test_photo_is_sanitized_and_thumbnail_preserves_aspect_ratio() -> None:
    full, thumbnail = prepare_photo(photo())
    with Image.open(BytesIO(full)) as image:
        assert image.size == (900, 450)
        assert not image.getexif()
    with Image.open(BytesIO(thumbnail)) as image:
        assert image.size == (320, 160)
        assert not image.getexif()
    with pytest.raises(InvalidPhoto):
        prepare_photo(base64.b64encode(b"<svg/>").decode())


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine, tables=[User.__table__, LostItem.__table__, LostClaim.__table__])
    with Session(engine) as db:
        users = {name: User(email=f"{name}@unsa.edu.pe", role="student") for name in ("finder", "owner", "other")}
        db.add_all(users.values())
        db.commit()
        monkeypatch.setattr(settings, "LOST_FOUND_MEDIA_DIR", str(tmp_path))
        monkeypatch.setattr(settings, "LOST_FOUND_STORAGE_URL", "")
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_user] = lambda: users["finder"]
        try:
            yield TestClient(app)
        finally:
            for dependency in (get_db, get_current_user):
                app.dependency_overrides.pop(dependency, None)
    engine.dispose()


def test_private_claim_review_and_return(client: TestClient) -> None:
    base = "/api/v1/lost-found"
    report = {
        "title": "Blue lunchbox",
        "description": "Found after class",
        "location": "Engineering, library entrance",
        "campus": "engineering",
        "found_on": datetime.now(ZoneInfo("America/Lima")).date().isoformat(),
        "request_id": str(uuid4()),
        "photo_base64": photo(),
    }
    response = client.post(base, json=report)
    assert response.status_code == 201
    item = response.json()
    assert "reporter_id" not in item and "photo_base64" not in item
    assert client.post(base, json=report).json() == item
    assert len(client.get(base).json()) == 1
    path = f"{base}/{item['id']}"
    thumbnail = client.get(f"{path}/photo?thumbnail=true")
    assert thumbnail.status_code == 200
    assert thumbnail.headers["content-type"] == "image/jpeg"
    with Image.open(BytesIO(thumbnail.content)) as image:
        assert image.width == 320
    assert client.post(f"{path}/claims", json={"proof": "Distinctive mark inside"}).status_code == 409

    db = app.dependency_overrides[get_db]()
    for person in ("owner", "other", "finder", "other"):
        user = db.query(User).filter_by(email=f"{person}@unsa.edu.pe").one()
        app.dependency_overrides[get_current_user] = lambda: user
        if person == "owner":
            submitted = client.post(f"{path}/claims", json={"proof": "Distinctive mark inside"})
            assert submitted.status_code == 201
            claim_path = f"{path}/claims/{submitted.json()['id']}"
            assert client.post(f"{path}/claims", json={"proof": "Duplicate proof"}).status_code == 409
            assert client.patch(claim_path, json={"decision": "approved", "pickup": "Private handoff"}).status_code == 404
        elif person == "finder":
            assert "Distinctive mark inside" in client.get(f"{base}/claims").text
            assert "Distinctive mark inside" not in client.get(base).text
            approved = client.patch(claim_path, json={"decision": "approved", "pickup": "Private handoff"})
            assert approved.status_code == 200 and approved.json()["pickup"] == "Private handoff"
            assert client.patch(path, json={"status": "returned"}).status_code == 200
        else:
            private = client.get(f"{base}/claims")
            assert "Distinctive mark inside" not in private.text
            assert "Private handoff" not in private.text
            if client.get(base).json()[0]["status"] == "open":
                assert client.post(f"{path}/claims", json={"proof": "Competing proof"}).status_code == 201
            else:
                assert private.json()[0]["status"] == "rejected"
                assert client.post(f"{path}/claims", json={"proof": "Late claim"}).status_code == 409

    assert "Private handoff" not in client.get(base).text
    assert client.get(base).json()[0]["status"] == "returned"
    app.dependency_overrides.pop(get_current_user)
    assert client.get(base).status_code == 200
    assert client.get(f"{base}/claims").status_code == 401



def test_supabase_private_storage_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    origin = "https://storage.example.test"
    monkeypatch.setattr(settings, "LOST_FOUND_STORAGE_URL", origin)
    monkeypatch.setattr(settings, "LOST_FOUND_STORAGE_SERVICE_KEY", SecretStr("test-key"))
    item_id = uuid4()
    requests: list[httpx.Request] = []
    fail_thumbnail = False

    def respond(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == "Bearer test-key"
        assert request.headers["apikey"] == "test-key"
        requests.append(request)
        if fail_thumbnail and request.method == "POST" and request.url.path.endswith("/thumbnail.jpg"):
            return httpx.Response(503)
        return httpx.Response(200, content=b"image")

    client_class = httpx.Client
    monkeypatch.setattr(httpx, "Client", lambda **kwargs: client_class(
        transport=httpx.MockTransport(respond), **kwargs,
    ))
    store_photos(item_id, (b"full", b"small"))
    assert requests[0].url.path == f"/storage/v1/object/lost-found/{item_id}/photo.jpg"
    assert requests[1].content == b"small"
    assert requests[1].headers["x-upsert"] == "true"
    assert load_photo(item_id, True) == b"image"
    assert requests[-1].url.path == f"/storage/v1/object/authenticated/lost-found/{item_id}/thumbnail.jpg"

    fail_thumbnail = True
    with pytest.raises(MediaUnavailable):
        store_photos(item_id, (b"full", b"small"))
    assert requests[-1].method == "DELETE"
    assert requests[-1].url.path == "/storage/v1/object/lost-found"


def test_private_routes_validate_institutional_identity(client: TestClient) -> None:
    app.dependency_overrides[get_current_user] = lambda: User(
        email="external@example.com", role="student", is_active=True,
    )
    response = client.get("/api/v1/lost-found/claims")
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "DOMAIN_NOT_ALLOWED"
    assert client.get("/api/v1/lost-found").status_code == 200
