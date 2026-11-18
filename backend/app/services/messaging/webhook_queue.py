"""Asynchronous Redis producer with atomic 24-hour delivery deduplication."""

from hashlib import sha256

from fastapi import Request
from redis.asyncio import Redis

from app.schemas.webhook import QueuedWhatsAppEvent

PENDING_QUEUE = "webhook:whatsapp:pending"
DEAD_LETTER_QUEUE = "webhook:whatsapp:dead-letter"
DEDUPLICATION_TTL_SECONDS = 86400

# Push first so an invalid queue type cannot leave an event marked as delivered.
# Redis executes the script atomically, including against concurrent deliveries.
ENQUEUE_EVENT = """
if redis.call('EXISTS', KEYS[2]) == 1 then
    return 0
end
redis.call('LPUSH', KEYS[1], ARGV[1])
redis.call('SET', KEYS[2], '1', 'EX', ARGV[2])
return 1
"""


async def get_webhook_redis(request: Request) -> Redis:
    """Use the app-scoped async pool, independent of the synchronous OTP client."""
    return request.app.state.webhook_redis


async def enqueue_event(client: Redis, event: QueuedWhatsAppEvent) -> bool:
    """Store a message once even when Evolution retries its webhook delivery."""
    payload = event.payload
    key = payload.data.key
    identity = "\0".join((payload.instance, key.remoteJid, key.id))
    digest = sha256(identity.encode("utf-8")).hexdigest()
    result = await client.eval(
        ENQUEUE_EVENT,
        2,
        PENDING_QUEUE,
        f"webhook:event:{digest}",
        event.model_dump_json(),
        DEDUPLICATION_TTL_SECONDS,
    )
    return result == 1
