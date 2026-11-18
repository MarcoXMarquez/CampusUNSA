"""US-09 fast, authenticated Evolution webhook ingestion."""

import asyncio
import hashlib
import hmac
import json
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import JsonValue, ValidationError
from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.config import settings
from app.schemas.webhook import (
    DeadLetterWebhook,
    EvolutionMessageEvent,
    QueuedWhatsAppEvent,
    WebhookAcknowledgment,
)
from app.services.messaging.webhook_queue import (
    DEAD_LETTER_QUEUE,
    enqueue_event,
    get_webhook_redis,
)

router = APIRouter()
MAX_BODY_BYTES = 256 * 1024
QUEUE_TIMEOUT_SECONDS = 0.15
_SENSITIVE_FIELDS = frozenset(
    {"apikey", "api_key", "authorization", "password", "secret", "token", "headers"}
)


async def require_webhook_key(apikey: Annotated[str | None, Header()] = None) -> None:
    """Reject unauthenticated requests before reading or validating their body."""
    expected = settings.EVOLUTION_WEBHOOK_API_KEY.get_secret_value()
    if not expected:
        raise HTTPException(
            503,
            detail={
                "code": "WEBHOOK_NOT_CONFIGURED",
                "message": "Webhook authentication is not configured.",
            },
        )
    if apikey is None or not hmac.compare_digest(
        apikey.encode("utf-8"), expected.encode("utf-8")
    ):
        raise HTTPException(
            401,
            detail={
                "code": "INVALID_WEBHOOK_KEY",
                "message": "A valid webhook API key is required.",
            },
        )


def redact_payload(value: JsonValue) -> JsonValue:
    """Avoid persisting provider authentication metadata in processing queues."""
    if isinstance(value, dict):
        return {
            key: redact_payload(item)
            for key, item in value.items()
            if key.lower() not in _SENSITIVE_FIELDS
        }
    if isinstance(value, list):
        return [redact_payload(item) for item in value]
    return value


def reject_nonfinite(value: str) -> None:
    """JSON NaN and Infinity are invalid payload values."""
    raise ValueError("Non-finite JSON number")


@router.post(
    "/whatsapp",
    response_model=WebhookAcknowledgment,
    dependencies=[Depends(require_webhook_key)],
)
async def receive_whatsapp_webhook(
    request: Request,
    client: Annotated[Redis, Depends(get_webhook_redis)],
) -> WebhookAcknowledgment:
    """Acknowledge only events persisted in Redis, without running NLP inline."""
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_BODY_BYTES:
            raise HTTPException(
                413,
                detail={
                    "code": "WEBHOOK_TOO_LARGE",
                    "message": "Webhook exceeds the 256 KiB limit.",
                },
            )

        body.extend(chunk)

    received_at = datetime.now(timezone.utc)
    try:
        raw: JsonValue = json.loads(body, parse_constant=reject_nonfinite)
        payload = redact_payload(raw)
    except (ValueError, UnicodeError, RecursionError):
        # Invalid JSON cannot be reliably redacted. Keep a digest for correlation.
        dead_letter = DeadLetterWebhook(
            received_at=received_at,
            reason="INVALID_JSON",
            body_sha256=hashlib.sha256(body).hexdigest(),
        )
    else:
        event_name = payload.get("event") if isinstance(payload, dict) else None
        if (
            isinstance(event_name, str)
            and event_name.lower().replace("_", ".") != "messages.upsert"
        ):
            return WebhookAcknowledgment(status="ignored")
        try:
            event = EvolutionMessageEvent.model_validate(payload)
            if event.instance != settings.EVOLUTION_INSTANCE_NAME:
                raise ValueError("Unexpected Evolution instance")
        except (ValidationError, ValueError):
            dead_letter = DeadLetterWebhook(
                received_at=received_at,
                reason="INVALID_PAYLOAD",
                payload=payload,
            )
        else:
            if event.data.key.fromMe:
                return WebhookAcknowledgment(status="ignored")
            try:
                async with asyncio.timeout(QUEUE_TIMEOUT_SECONDS):
                    queued = await enqueue_event(
                        client,
                        QueuedWhatsAppEvent(received_at=received_at, payload=event),
                    )
            except (RedisError, TimeoutError):
                raise queue_unavailable() from None
            return WebhookAcknowledgment(status="queued" if queued else "duplicate")

    try:
        async with asyncio.timeout(QUEUE_TIMEOUT_SECONDS):
            await client.lpush(DEAD_LETTER_QUEUE, dead_letter.model_dump_json())
    except (RedisError, TimeoutError):
        raise queue_unavailable() from None
    return WebhookAcknowledgment(status="dead_lettered")


def queue_unavailable() -> HTTPException:
    return HTTPException(
        503,
        headers={"Retry-After": "1"},
        detail={
            "code": "WEBHOOK_QUEUE_UNAVAILABLE",
            "message": "The webhook queue is unavailable. Retry the delivery.",
        },
    )
