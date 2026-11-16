from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import _resolve_authenticated_user
from app.core.database import get_db
from app.core.redis import get_redis
from app.main import app


@dataclass
class _Entry:
    value: str
    expires_at: float | None


class InMemoryTTLRedis:
    """Deterministic in-memory Redis double supporting SETEX, GET, TTL, INCR, EXPIRE, DELETE."""

    def __init__(self) -> None:
        self.now: float = 1_000_000.0
        self.data: dict[str, _Entry] = {}
        self.setex_calls: list[tuple[str, int, str]] = []

    def advance(self, seconds: float) -> None:
        self.now += seconds

    def _prune(self, key: str) -> None:
        entry = self.data.get(key)
        if entry is not None and entry.expires_at is not None and self.now >= entry.expires_at:
            del self.data[key]

    def ping(self) -> bool:
        return True

    def setex(self, name: str, time: int, value: str) -> bool:
        ttl_seconds = int(time)
        self.setex_calls.append((name, ttl_seconds, value))
        self.data[name] = _Entry(value=value, expires_at=self.now + ttl_seconds)
        return True

    def get(self, name: str) -> str | None:
        self._prune(name)
        entry = self.data.get(name)
        return entry.value if entry is not None else None

    def ttl(self, name: str) -> int:
        self._prune(name)
        entry = self.data.get(name)
        if entry is None:
            return -2
        if entry.expires_at is None:
            return -1
        return max(0, int(entry.expires_at - self.now))

    def delete(self, *names: str) -> int:
        removed = 0
        for name in names:
            if name in self.data:
                del self.data[name]
                removed += 1
        return removed

    def incr(self, name: str, amount: int = 1) -> int:
        self._prune(name)
        entry = self.data.get(name)
        current = int(entry.value) if entry is not None else 0
        new_value = current + amount
        expires_at = entry.expires_at if entry is not None else None
        self.data[name] = _Entry(value=str(new_value), expires_at=expires_at)
        return new_value

    def expire(self, name: str, time: int) -> bool:
        self._prune(name)
        entry = self.data.get(name)
        if entry is None:
            return False
        entry.expires_at = self.now + int(time)
        return True


def _make_user(
    *,
    user_id: uuid.UUID | None = None,
    email: str = "jflores@unsa.edu.pe",
    cui: str | None = "20231234",
    phone_number: str | None = None,
    telegram_chat_id: str | None = None,
) -> MagicMock:
    user = MagicMock()
    user.id = user_id or uuid.UUID("11111111-1111-1111-1111-111111111111")
    user.email = email
    user.cui = cui
    user.role = "student"
    user.is_active = True
    user.phone_number = phone_number
    user.telegram_chat_id = telegram_chat_id
    return user


def _build_db_session(users: list[MagicMock]) -> MagicMock:
    """Builds a minimal SQLAlchemy Session double backed by an in-memory user list."""
    session = MagicMock()

    def _query_side_effect(model: Any) -> MagicMock:
        query_mock = MagicMock()

        def _filter_side_effect(*expressions: Any) -> MagicMock:
            filter_mock = MagicMock()

            def _first() -> MagicMock | None:
                for expr in expressions:
                    left_key = getattr(getattr(expr, "left", None), "key", None)
                    right_val = getattr(getattr(expr, "right", None), "value", None)
                    if left_key and right_val is not None:
                        for candidate in users:
                            if getattr(candidate, left_key, None) == right_val:
                                return candidate
                return None

            filter_mock.first.side_effect = _first
            return filter_mock

        query_mock.filter.side_effect = _filter_side_effect
        return query_mock

    session.query.side_effect = _query_side_effect
    return session


@pytest.fixture
def otp_env():
    redis_double = InMemoryTTLRedis()
    student = _make_user()
    other_student = _make_user(
        user_id=uuid.UUID("22222222-2222-2222-2222-222222222222"),
        email="other@unsa.edu.pe",
        cui="20239999",
        phone_number="+51999111222",
        telegram_chat_id="987654321",
    )
    db_double = _build_db_session([student, other_student])

    app.dependency_overrides[get_redis] = lambda: redis_double
    app.dependency_overrides[get_db] = lambda: db_double
    app.dependency_overrides[_resolve_authenticated_user] = lambda: student

    with TestClient(app) as test_client:
        yield test_client, redis_double, db_double, student, other_student

    app.dependency_overrides.clear()


def test_generate_otp_requires_authentication() -> None:
    app.dependency_overrides.clear()
    with TestClient(app) as unauth_client:
        response = unauth_client.post("/api/v1/auth/otp/generate", json={"channel": "whatsapp"})
    assert response.status_code == 401


@pytest.mark.parametrize("channel", ["whatsapp", "telegram"])
def test_generate_otp_uses_strict_300s_ttl_and_hashed_redis_storage(
    otp_env: tuple[TestClient, InMemoryTTLRedis, MagicMock, MagicMock, MagicMock],
    channel: str,
) -> None:
    test_client, redis_double, _, _, _ = otp_env

    with patch("app.core.config.settings.WHATSAPP_BOT_NUMBER", "51954123456"), \
         patch("app.core.config.settings.TELEGRAM_BOT_USERNAME", "CampusUNSABot"):
        response = test_client.post("/api/v1/auth/otp/generate", json={"channel": channel})

    assert response.status_code == 200
    payload = response.json()
    otp_code = payload["otp_code"]
    assert len(otp_code) == 6
    assert otp_code.isdigit()
    assert payload["channel"] == channel
    assert payload["expires_in_seconds"] == 300
    parsed_expiry = datetime.fromisoformat(payload["expires_at"].replace("Z", "+00:00"))
    assert parsed_expiry > datetime.now(timezone.utc)

    if channel == "whatsapp":
        assert payload["deep_link_url"] == f"https://wa.me/51954123456?text={otp_code}"
    else:
        assert payload["deep_link_url"] == f"https://t.me/CampusUNSABot?start={otp_code}"

    # Verify strict 300-second TTL and ensure plaintext OTP is never stored in Redis keys or values
    ttl_calls = [ttl for _, ttl, _ in redis_double.setex_calls]
    assert ttl_calls == [300, 300]
    for key, entry in redis_double.data.items():
        assert otp_code not in key
        assert otp_code not in entry.value


def test_generate_otp_invalidates_previous_code_and_enforces_generation_rate_limit(
    otp_env: tuple[TestClient, InMemoryTTLRedis, MagicMock, MagicMock, MagicMock],
) -> None:
    test_client, redis_double, _, _, _ = otp_env

    first_resp = test_client.post("/api/v1/auth/otp/generate", json={"channel": "whatsapp"})
    assert first_resp.status_code == 200
    first_code = first_resp.json()["otp_code"]

    second_resp = test_client.post("/api/v1/auth/otp/generate", json={"channel": "whatsapp"})
    assert second_resp.status_code == 200
    second_code = second_resp.json()["otp_code"]

    # First code must be invalidated before verification attempts even start
    if first_code != second_code:
        stale_verify = test_client.post(
            "/api/v1/auth/otp/verify",
            json={"channel": "whatsapp", "code": first_code, "identifier": "+51951000111"},
        )
        assert stale_verify.status_code == 400

    # Exhaust generation rate limit (default 5 requests per 600s window)
    for _ in range(3):
        resp = test_client.post("/api/v1/auth/otp/generate", json={"channel": "whatsapp"})
        assert resp.status_code == 200

    blocked = test_client.post("/api/v1/auth/otp/generate", json={"channel": "whatsapp"})
    assert blocked.status_code == 429
    assert blocked.json()["detail"]["code"] == "OTP_GENERATION_RATE_LIMITED"


def test_verify_whatsapp_otp_normalizes_phone_binds_user_and_prevents_reuse(
    otp_env: tuple[TestClient, InMemoryTTLRedis, MagicMock, MagicMock, MagicMock],
) -> None:
    test_client, redis_double, db_double, student, _ = otp_env

    gen_resp = test_client.post("/api/v1/auth/otp/generate", json={"channel": "whatsapp"})
    otp_code = gen_resp.json()["otp_code"]

    redis_double.advance(299)
    verify_resp = test_client.post(
        "/api/v1/auth/otp/verify",
        json={"channel": "whatsapp", "code": otp_code, "identifier": "51951222333@s.whatsapp.net"},
    )
    assert verify_resp.status_code == 200
    body = verify_resp.json()
    assert body["channel"] == "whatsapp"
    assert body["identifier"] == "+51951222333"
    assert student.phone_number == "+51951222333"
    assert db_double.commit.called

    # Single-use enforcement: reusing the exact same code must fail
    reuse_resp = test_client.post(
        "/api/v1/auth/otp/verify",
        json={"channel": "whatsapp", "code": otp_code, "identifier": "+51951222333"},
    )
    assert reuse_resp.status_code == 400
    assert reuse_resp.json()["detail"]["code"] == "OTP_EXPIRED"


def test_verify_telegram_otp_binds_chat_id_and_consumes_token(
    otp_env: tuple[TestClient, InMemoryTTLRedis, MagicMock, MagicMock, MagicMock],
) -> None:
    test_client, redis_double, db_double, student, _ = otp_env

    gen_resp = test_client.post("/api/v1/auth/otp/generate", json={"channel": "telegram"})
    otp_code = gen_resp.json()["otp_code"]

    verify_resp = test_client.post(
        "/api/v1/auth/otp/verify",
        json={"channel": "telegram", "code": otp_code, "identifier": "556677889"},
    )
    assert verify_resp.status_code == 200
    assert verify_resp.json()["identifier"] == "556677889"
    assert student.telegram_chat_id == "556677889"
    assert db_double.commit.called
    assert all("otp:user:" not in key for key in redis_double.data)


def test_verify_otp_rejects_expired_code_at_301_seconds(
    otp_env: tuple[TestClient, InMemoryTTLRedis, MagicMock, MagicMock, MagicMock],
) -> None:
    test_client, redis_double, _, student, _ = otp_env

    gen_resp = test_client.post("/api/v1/auth/otp/generate", json={"channel": "whatsapp"})
    otp_code = gen_resp.json()["otp_code"]

    redis_double.advance(301)
    expired_resp = test_client.post(
        "/api/v1/auth/otp/verify",
        json={"channel": "whatsapp", "code": otp_code, "identifier": "+51951222333"},
    )
    assert expired_resp.status_code == 400
    detail = expired_resp.json()["detail"]
    assert detail["code"] == "OTP_EXPIRED"
    assert detail["message"] == "Code expired. Please generate a new code from the web portal"
    assert student.phone_number is None


def test_verify_otp_enforces_max_three_failed_attempts(
    otp_env: tuple[TestClient, InMemoryTTLRedis, MagicMock, MagicMock, MagicMock],
) -> None:
    test_client, redis_double, _, student, _ = otp_env

    gen_resp = test_client.post("/api/v1/auth/otp/generate", json={"channel": "whatsapp"})
    real_code = gen_resp.json()["otp_code"]
    wrong_code = "000000" if real_code != "000000" else "999999"

    for attempt in (1, 2):
        resp = test_client.post(
            "/api/v1/auth/otp/verify",
            json={"channel": "whatsapp", "code": wrong_code, "identifier": "+51951222333"},
        )
        assert resp.status_code == 400
        assert resp.json()["detail"]["code"] == "INVALID_OTP"
        assert resp.json()["detail"]["attempts_remaining"] == 3 - attempt

    # 3rd failed attempt invalidates the OTP and returns HTTP 429
    third_resp = test_client.post(
        "/api/v1/auth/otp/verify",
        json={"channel": "whatsapp", "code": wrong_code, "identifier": "+51951222333"},
    )
    assert third_resp.status_code == 429
    assert third_resp.json()["detail"]["code"] == "OTP_MAX_ATTEMPTS_EXCEEDED"

    # Even submitting the real code afterward must fail because the OTP was destroyed
    after_lock = test_client.post(
        "/api/v1/auth/otp/verify",
        json={"channel": "whatsapp", "code": real_code, "identifier": "+51951222333"},
    )
    assert after_lock.status_code == 400
    assert after_lock.json()["detail"]["code"] == "OTP_EXPIRED"
    assert student.phone_number is None


def test_verify_otp_rejects_identifier_owned_by_another_student(
    otp_env: tuple[TestClient, InMemoryTTLRedis, MagicMock, MagicMock, MagicMock],
) -> None:
    test_client, _, _, student, other_student = otp_env

    gen_resp = test_client.post("/api/v1/auth/otp/generate", json={"channel": "whatsapp"})
    otp_code = gen_resp.json()["otp_code"]

    conflict_resp = test_client.post(
        "/api/v1/auth/otp/verify",
        json={"channel": "whatsapp", "code": otp_code, "identifier": other_student.phone_number},
    )
    assert conflict_resp.status_code == 409
    assert conflict_resp.json()["detail"]["code"] == "CHANNEL_IDENTIFIER_ALREADY_LINKED"
    assert student.phone_number is None


def test_verify_otp_rejects_invalid_identifiers(
    otp_env: tuple[TestClient, InMemoryTTLRedis, MagicMock, MagicMock, MagicMock],
) -> None:
    test_client, _, _, _, _ = otp_env

    bad_wa = test_client.post(
        "/api/v1/auth/otp/verify",
        json={"channel": "whatsapp", "code": "123456", "identifier": "abc"},
    )
    assert bad_wa.status_code == 400
    assert bad_wa.json()["detail"]["code"] == "INVALID_CHANNEL_IDENTIFIER"

    bad_tg = test_client.post(
        "/api/v1/auth/otp/verify",
        json={"channel": "telegram", "code": "123456", "identifier": "@not_numeric"},
    )
    assert bad_tg.status_code == 400
    assert bad_tg.json()["detail"]["code"] == "INVALID_CHANNEL_IDENTIFIER"


def test_verify_inbound_channel_otp_resolves_student_without_jwt(
    otp_env: tuple[TestClient, InMemoryTTLRedis, MagicMock, MagicMock, MagicMock],
) -> None:
    from app.services.messaging.otp_service import OTPService

    test_client, redis_double, db_double, student, _ = otp_env

    gen_resp = test_client.post("/api/v1/auth/otp/generate", json={"channel": "whatsapp"})
    otp_code = gen_resp.json()["otp_code"]

    linked_user = OTPService.verify_inbound_channel_otp(
        db=db_double,
        redis_client=redis_double,
        channel="whatsapp",
        identifier="51987654321@s.whatsapp.net",
        submitted_code=otp_code,
    )
    assert linked_user.id == student.id
    assert student.phone_number == "+51987654321"


def test_status_and_unlink_endpoints(
    otp_env: tuple[TestClient, InMemoryTTLRedis, MagicMock, MagicMock, MagicMock],
) -> None:
    test_client, _, _, student, _ = otp_env

    initial = test_client.get("/api/v1/auth/otp/status")
    assert initial.status_code == 200
    assert initial.json()["whatsapp_connected"] is False
    assert initial.json()["telegram_connected"] is False

    gen_resp = test_client.post("/api/v1/auth/otp/generate", json={"channel": "telegram"})
    otp_code = gen_resp.json()["otp_code"]

    pending = test_client.get("/api/v1/auth/otp/status")
    assert pending.json()["pending_telegram_ttl"] > 0

    test_client.post(
        "/api/v1/auth/otp/verify",
        json={"channel": "telegram", "code": otp_code, "identifier": "12345678"},
    )
    linked = test_client.get("/api/v1/auth/otp/status")
    assert linked.json()["telegram_connected"] is True
    assert linked.json()["telegram_chat_id"] == "12345678"

    unlink = test_client.delete("/api/v1/auth/otp/link/telegram")
    assert unlink.status_code == 200
    assert student.telegram_chat_id is None


@pytest.mark.asyncio
async def test_messaging_gateways_send_text_via_evolution_and_telegram() -> None:
    from app.services.messaging.gateway import EvolutionWhatsAppGateway, TelegramBotGateway

    mock_response = MagicMock()
    mock_response.status_code = 200

    with patch("app.services.messaging.gateway.httpx.AsyncClient") as client_cls:
        async_client = MagicMock()
        async_client.post = AsyncMock(return_value=mock_response)
        client_cls.return_value.__aenter__ = AsyncMock(return_value=async_client)
        client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        evo = EvolutionWhatsAppGateway(
            base_url="http://evolution:8080",
            instance_name="campusunsa",
            api_key="test-evo-key",
        )
        ok_evo = await evo.send_text("+51951222333", "WhatsApp linked successfully.")
        assert ok_evo is True
        call_kwargs = async_client.post.call_args.kwargs
        assert call_kwargs["json"]["number"] == "51951222333"
        assert call_kwargs["headers"]["apikey"] == "test-evo-key"

        tg = TelegramBotGateway(bot_token="12345:test-token")
        ok_tg = await tg.send_text("556677889", "Telegram linked successfully.")
        assert ok_tg is True
        tg_url = async_client.post.call_args.args[0]
        assert "api.telegram.org/bot12345:test-token/sendMessage" in tg_url
        assert json.loads(json.dumps(async_client.post.call_args.kwargs["json"])) == {
            "chat_id": "556677889",
            "text": "Telegram linked successfully.",
        }
