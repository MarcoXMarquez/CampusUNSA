"""Redis 7 integration checks for concurrent admission and retry safety."""

import asyncio
import hashlib
import os
import uuid
from datetime import datetime, timezone

import pytest
from redis.asyncio import Redis
from redis.exceptions import ResponseError

from app.schemas.webhook import EvolutionMessageEvent, QueuedWhatsAppEvent
from app.services.messaging import webhook_queue


@pytest.mark.skipif(
    not os.environ.get("WHATSAPP_WEBHOOK_TEST_REDIS_URL"),
    reason="Set WHATSAPP_WEBHOOK_TEST_REDIS_URL to an isolated Redis database",
)
def test_real_redis_atomic_deduplication_fifo_and_failed_write_retry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def verify() -> None:
        client = Redis.from_url(
            os.environ["WHATSAPP_WEBHOOK_TEST_REDIS_URL"], decode_responses=True
        )
        namespace = f"test-us09-{uuid.uuid4().hex}"
        queue = f"{namespace}:pending"
        monkeypatch.setattr(webhook_queue, "PENDING_QUEUE", queue)
        event = QueuedWhatsAppEvent(
            received_at=datetime.now(timezone.utc),
            payload=EvolutionMessageEvent(
                event="messages.upsert",
                instance=namespace,
                data={
                    "key": {
                        "id": "message-1",
                        "remoteJid": "student@s.whatsapp.net",
                        "fromMe": False,
                    },
                    "message": {"conversation": "Submit the report"},
                },
            ),
        )
        identity = "\0".join((namespace, "student@s.whatsapp.net", "message-1"))
        dedupe = "webhook:event:" + hashlib.sha256(identity.encode()).hexdigest()
        try:
            await client.set(queue, "invalid-queue-type")
            with pytest.raises(ResponseError):
                await webhook_queue.enqueue_event(client, event)
            assert not await client.exists(dedupe)
            await client.delete(queue)

            results = await asyncio.gather(
                *(webhook_queue.enqueue_event(client, event) for _ in range(40))
            )
            assert sum(results) == 1
            assert await client.llen(queue) == 1
            assert 86390 <= await client.ttl(dedupe) <= 86400
            assert await client.rpop(queue) == event.model_dump_json()
        finally:
            await client.delete(queue, dedupe)
            await client.aclose()

    asyncio.run(verify())
