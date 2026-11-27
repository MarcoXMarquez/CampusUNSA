from datetime import datetime, timedelta
from unittest.mock import MagicMock
from uuid import UUID

from fastapi.testclient import TestClient
from pydantic import SecretStr
from pytest import MonkeyPatch

from app.api.dependencies import _resolve_authenticated_user
from app.core.config import settings
from app.core.database import get_db
from app.main import app
from app.models.user import User
from app.services.academic.calendar_feed import feed_digest
from app.services.academic.schedule_calculator import LIMA_TIMEZONE


def test_calendar_link_can_be_rotated_and_revoked(monkeypatch: MonkeyPatch) -> None:
    user = User(id=UUID(int=8), email="student@unsa.edu.pe", is_active=True)
    db = MagicMock()
    query = db.query.return_value

    def lookup(digest_filter: MagicMock, active_filter: MagicMock) -> MagicMock:
        digest = digest_filter.right.value
        return MagicMock(first=lambda: user if digest == user.calendar_feed_hash else None)

    query.filter.side_effect = lookup
    monkeypatch.setitem(app.dependency_overrides, _resolve_authenticated_user, lambda: user)
    monkeypatch.setitem(app.dependency_overrides, get_db, lambda: db)
    monkeypatch.setattr("app.api.v1.calendar.AcademicSyncRepository.list_courses", lambda *args, **kwargs: [])
    today = datetime.now(LIMA_TIMEZONE).date()
    with TestClient(app) as client:
        base = "/api/v1/courses/calendar/subscription"
        assert client.post(base, json={"ends_on": (today - timedelta(days=1)).isoformat()}).status_code == 422
        first = client.post(base, json={"ends_on": today.isoformat()})
        assert first.status_code == 200
        path = first.json()["path"]
        assert user.calendar_feed_hash == feed_digest(path.split("/")[-1].removesuffix(".ics"))
        feed = client.get("/api/v1" + path)
        assert feed.status_code == 200
        assert feed.headers["Cache-Control"] == "private, no-store"
        assert feed.headers["Content-Type"].startswith("text/calendar")
        assert "BEGIN:VCALENDAR" in feed.text

        second = client.post(base, json={"ends_on": today.isoformat()})
        assert second.json()["path"] != path
        assert client.get("/api/v1" + path).status_code == 404
        assert client.delete(base).status_code == 204
        assert client.get("/api/v1" + second.json()["path"]).status_code == 404


def test_telegram_webhook_checks_secret_before_processing_body(monkeypatch: MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "TELEGRAM_WEBHOOK_SECRET", SecretStr("test-telegram-secret"))
    with TestClient(app) as client:
        path = "/api/v1/webhooks/telegram"
        assert client.post(path, content="{invalid").status_code == 401
        headers = {"X-Telegram-Bot-Api-Secret-Token": "test-telegram-secret"}
        assert client.post(path, content="{invalid", headers=headers).status_code == 422
        assert client.post(path, json={"update_id": 1}, headers=headers).json() == {"ok": True}
