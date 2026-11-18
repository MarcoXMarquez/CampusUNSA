"""US-09 webhook authentication, durable dispatch, and malformed-event handling."""

import asyncio
import json
import time
from collections.abc import Iterator
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from redis.exceptions import ConnectionError, ResponseError

from app.core.config import settings
from app.main import app
from app.services.messaging.webhook_queue import get_webhook_redis

ENDPOINT = "/api/v1/webhooks/whatsapp"
HEADERS = {"apikey": "test-webhook-secret"}
PENDING = "webhook:whatsapp:pending"
DEAD_LETTER = "webhook:whatsapp:dead-letter"


def message_payload(message_id: str = "message-001") -> dict:
    return {
        "event": "messages.upsert",
        "instance": "campusunsa",
        "data": {
            "key": {
                "id": message_id,
                "remoteJid": "51999888777@s.whatsapp.net",
                "fromMe": False,
            },
            "pushName": "Student",
            "message": {"conversation": "Prepare the report"},
            "messageTimestamp": 1795000000,
            "messageType": "conversation",
        },
        "apikey": "provider-secret-that-must-not-be-stored",
        "date_time": "2026-11-18T12:00:00Z",
    }


@pytest.fixture
def webhook_redis(monkeypatch: pytest.MonkeyPatch) -> Iterator[AsyncMock]:
    monkeypatch.setattr(
        settings, "EVOLUTION_WEBHOOK_API_KEY", SecretStr("test-webhook-secret")
    )
    client = AsyncMock()
    client.eval.return_value = 1
    client.lpush.return_value = 1

    async def override_webhook_redis() -> AsyncMock:
        return client

    app.dependency_overrides[get_webhook_redis] = override_webhook_redis
    yield client
    app.dependency_overrides.pop(get_webhook_redis, None)


@pytest.fixture
def webhook_client(webhook_redis: AsyncMock) -> Iterator[TestClient]:
    with TestClient(app) as client:
        yield client


@pytest.mark.parametrize(
    "headers",
    [{}, {"apikey": ""}, {"apikey": "wrong"}, {"apikey": b"non-ascii-\xc3\xb1"}],
)
def test_rejects_invalid_key_before_parsing_body(
    webhook_client: TestClient, webhook_redis: AsyncMock, headers: dict[str, str]
) -> None:
    response = webhook_client.post(ENDPOINT, content=b"{", headers=headers)
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "INVALID_WEBHOOK_KEY"
    webhook_redis.eval.assert_not_called()
    webhook_redis.lpush.assert_not_called()


def test_fails_closed_when_key_is_unconfigured(
    webhook_client: TestClient,
    webhook_redis: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "EVOLUTION_WEBHOOK_API_KEY", SecretStr(""))
    response = webhook_client.post(ENDPOINT, json=message_payload(), headers=HEADERS)
    assert response.status_code == 503
    webhook_redis.eval.assert_not_called()


def test_enqueues_real_evolution_payload_without_provider_credentials(
    webhook_client: TestClient, webhook_redis: AsyncMock
) -> None:
    payload = message_payload()
    response = webhook_client.post(ENDPOINT, json=payload, headers=HEADERS)
    assert response.status_code == 200
    assert response.json() == {"status": "queued"}
    call = webhook_redis.eval.call_args.args
    assert call[1] == 2
    assert call[2] == PENDING
    assert call[3].startswith("webhook:event:")
    assert call[-1] == 86400
    record = json.loads(call[-2])
    assert record["version"] == 1
    assert record["payload"]["data"] == payload["data"]
    assert record["payload"]["event"] == "messages.upsert"
    assert record["received_at"]
    assert "apikey" not in record["payload"]
    webhook_redis.lpush.assert_not_called()


@pytest.mark.parametrize("event", ["MESSAGES_UPSERT", "messages.upsert"])
@pytest.mark.parametrize(
    "message",
    [
        {"conversation": "Prepare the report"},
        {"extendedTextMessage": {"text": "Read chapter 2"}},
        {"imageMessage": {"caption": "Review this image", "mimetype": "image/jpeg"}},
    ],
)
def test_accepts_provider_event_names_and_preserves_message_types(
    webhook_client: TestClient, webhook_redis: AsyncMock, event: str, message: dict
) -> None:
    payload = message_payload()
    payload["event"] = event
    payload["data"]["message"] = message
    response = webhook_client.post(ENDPOINT, json=payload, headers=HEADERS)
    assert response.status_code == 200
    record = json.loads(webhook_redis.eval.call_args.args[-2])
    assert record["payload"]["data"]["message"] == message


def test_acknowledges_duplicate_after_atomic_queue_operation(
    webhook_client: TestClient, webhook_redis: AsyncMock
) -> None:
    webhook_redis.eval.return_value = 0
    response = webhook_client.post(ENDPOINT, json=message_payload(), headers=HEADERS)
    assert response.status_code == 200
    assert response.json() == {"status": "duplicate"}


@pytest.mark.parametrize(
    "event", ["connection.update", "MESSAGES_UPDATE", "send.message"]
)
def test_acknowledges_unsubscribed_events_without_dispatch(
    webhook_client: TestClient, webhook_redis: AsyncMock, event: str
) -> None:
    response = webhook_client.post(ENDPOINT, json={"event": event}, headers=HEADERS)
    assert response.status_code == 200
    assert response.json()["status"] == "ignored"
    webhook_redis.eval.assert_not_called()
    webhook_redis.lpush.assert_not_called()


def test_ignores_bot_echoes(
    webhook_client: TestClient, webhook_redis: AsyncMock
) -> None:
    payload = message_payload()
    payload["data"]["key"]["fromMe"] = True
    response = webhook_client.post(ENDPOINT, json=payload, headers=HEADERS)
    assert response.status_code == 200
    assert response.json()["status"] == "ignored"
    webhook_redis.eval.assert_not_called()


@pytest.mark.parametrize(
    "change",
    [
        {"instance": "unexpected"},
        {"data": {}},
        {"event": 17},
        {
            "data": {
                "key": {"id": "", "remoteJid": "phone", "fromMe": False},
                "message": {"conversation": "hello"},
            }
        },
        {
            "data": {
                "key": {"id": "id", "remoteJid": "phone", "fromMe": "false"},
                "message": {},
            }
        },
    ],
)
def test_quarantines_malformed_payload_without_losing_it(
    webhook_client: TestClient, webhook_redis: AsyncMock, change: dict
) -> None:
    payload = {**message_payload(), **change}
    response = webhook_client.post(ENDPOINT, json=payload, headers=HEADERS)
    assert response.status_code == 200
    assert response.json()["status"] == "dead_lettered"
    webhook_redis.eval.assert_not_called()
    call = webhook_redis.lpush.call_args.args
    assert call[0] == DEAD_LETTER
    record = json.loads(call[1])
    assert record["reason"] == "INVALID_PAYLOAD"
    assert "provider-secret" not in call[1]
    assert record["payload"]["instance"] == payload["instance"]


@pytest.mark.parametrize("raw", [b"{", b"null", b"[]", b"true", b'{"event":NaN}'])
def test_quarantines_invalid_json_and_non_object_bodies(
    webhook_client: TestClient, webhook_redis: AsyncMock, raw: bytes
) -> None:
    response = webhook_client.post(ENDPOINT, content=raw, headers=HEADERS)
    assert response.status_code == 200
    assert response.json()["status"] == "dead_lettered"
    webhook_redis.eval.assert_not_called()
    webhook_redis.lpush.assert_awaited_once()


def test_malformed_json_does_not_expose_secrets_in_dead_letter(
    webhook_client: TestClient, webhook_redis: AsyncMock
) -> None:
    response = webhook_client.post(
        ENDPOINT, content=b'{"apikey":"hidden",', headers=HEADERS
    )
    assert response.status_code == 200
    stored = webhook_redis.lpush.call_args.args[1]
    assert "hidden" not in stored
    assert json.loads(stored)["body_sha256"]


@pytest.mark.parametrize(
    "error", [ConnectionError("offline"), ResponseError("wrong type")]
)
@pytest.mark.parametrize("malformed", [False, True])
def test_never_acknowledges_unstored_events(
    webhook_client: TestClient,
    webhook_redis: AsyncMock,
    error: Exception,
    malformed: bool,
) -> None:
    webhook_redis.eval.side_effect = error
    webhook_redis.lpush.side_effect = error
    response = webhook_client.post(
        ENDPOINT, json={} if malformed else message_payload(), headers=HEADERS
    )
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "WEBHOOK_QUEUE_UNAVAILABLE"


def test_limits_request_size_without_writing_a_partial_event(
    webhook_client: TestClient, webhook_redis: AsyncMock
) -> None:
    response = webhook_client.post(
        ENDPOINT, content=b"x" * (256 * 1024 + 1), headers=HEADERS
    )
    assert response.status_code == 413
    webhook_redis.eval.assert_not_called()
    webhook_redis.lpush.assert_not_called()


def test_concurrent_acknowledgments_stay_below_200ms_with_mock_redis(
    webhook_redis: AsyncMock,
) -> None:
    async def run_load() -> list[float]:
        async def mock_dispatch(*args: object) -> int:
            await asyncio.sleep(0.002)
            return 1

        webhook_redis.eval.side_effect = mock_dispatch
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:

            async def send(index: int) -> float:
                started = time.perf_counter()
                response = await client.post(
                    ENDPOINT, json=message_payload(str(index)), headers=HEADERS
                )
                elapsed = time.perf_counter() - started
                assert response.status_code == 200
                return elapsed

            return await asyncio.gather(*(send(index) for index in range(50)))

    durations = asyncio.run(run_load())
    print(f"50 concurrent webhooks: max acknowledgment {max(durations) * 1000:.2f} ms")
    assert max(durations) < 0.2
    assert webhook_redis.eval.await_count == 50


def test_preserves_existing_startup_and_shutdown_handlers(
    webhook_redis: AsyncMock,
) -> None:
    startup = AsyncMock()
    shutdown = AsyncMock()
    app.router.on_startup.append(startup)
    app.router.on_shutdown.append(shutdown)
    try:
        with TestClient(app):
            startup.assert_awaited_once()
        shutdown.assert_awaited_once()
    finally:
        app.router.on_startup.remove(startup)
        app.router.on_shutdown.remove(shutdown)


@pytest.mark.parametrize("malformed", [False, True])
def test_bounds_redis_timeout_and_allows_a_later_retry(
    webhook_client: TestClient, webhook_redis: AsyncMock, malformed: bool
) -> None:
    async def stalled(*args: object) -> None:
        await asyncio.sleep(1)

    operation = webhook_redis.lpush if malformed else webhook_redis.eval
    operation.side_effect = stalled
    started = time.perf_counter()
    response = webhook_client.post(
        ENDPOINT, json={} if malformed else message_payload(), headers=HEADERS
    )
    assert response.status_code == 503
    assert time.perf_counter() - started < 0.5
    operation.side_effect = None
    operation.return_value = 1
    retry = webhook_client.post(
        ENDPOINT, json={} if malformed else message_payload(), headers=HEADERS
    )
    assert retry.status_code == 200


def test_redacts_nested_authentication_metadata(
    webhook_client: TestClient, webhook_redis: AsyncMock
) -> None:
    payload = message_payload()
    payload["data"]["metadata"] = {
        "headers": {"apikey": "hidden"},
        "attachments": [{"token": "hidden", "name": "file"}],
    }
    response = webhook_client.post(ENDPOINT, json=payload, headers=HEADERS)
    assert response.status_code == 200
    stored = webhook_redis.eval.call_args.args[-2]
    assert "hidden" not in stored
    assert json.loads(stored)["payload"]["data"]["metadata"]["attachments"] == [
        {"name": "file"}
    ]


def test_accepts_a_persisted_event_after_a_brief_redis_scheduling_delay(
    webhook_client: TestClient, webhook_redis: AsyncMock
) -> None:
    async def briefly_delayed_dispatch(*args: object) -> int:
        await asyncio.sleep(0.16)
        return 1

    webhook_redis.eval.side_effect = briefly_delayed_dispatch
    response = webhook_client.post(ENDPOINT, json=message_payload(), headers=HEADERS)
    assert response.status_code == 200
    assert response.json()["status"] == "queued"
