"""Recoverable consumer for the versioned WhatsApp ingress queue."""

import asyncio
import json
import logging
from dataclasses import dataclass
from uuid import uuid4

from pydantic import ValidationError
from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.database import SessionLocal
from app.schemas.webhook import QueuedWhatsAppEvent
from app.services.messaging.gateway import MessagingGatewayProtocol
from app.services.tasks.task_parser import NLPTaskParserService
from app.services.tasks.whatsapp import TaskService

logger = logging.getLogger(__name__)

_CLAIM = """
local now = tonumber(redis.call('TIME')[1])
local expired = redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', now, 'LIMIT', 0, 1)[1]
local job
if expired then
    job = cjson.decode(expired)
    if job.attempt >= 3 then
        redis.call('LPUSH', KEYS[3], cjson.encode({reason='RETRIES_EXHAUSTED', event=job.raw}))
        redis.call('ZREM', KEYS[2], expired)
        return false
    end
else
    local raw = redis.call('LINDEX', KEYS[1], -1)
    if not raw then
        return false
    end
    job = {raw=raw, attempt=0}
end
job.attempt = job.attempt + 1
job.claim_id = ARGV[1]
local member = cjson.encode(job)
redis.call('ZADD', KEYS[2], now + tonumber(ARGV[2]), member)
if expired then
    redis.call('ZREM', KEYS[2], expired)
else
    redis.call('RPOP', KEYS[1])
end
return member
"""

_RETRY = """
local now = tonumber(redis.call('TIME')[1])
return redis.call('ZADD', KEYS[1], 'XX', now + tonumber(ARGV[1]), ARGV[2])
"""

_DISCARD = """
if redis.call('ZSCORE', KEYS[1], ARGV[1]) then
    redis.call('LPUSH', KEYS[2], ARGV[2])
    redis.call('ZREM', KEYS[1], ARGV[1])
end
"""


@dataclass(frozen=True)
class DeliveryClaim:
    member: str
    raw: str
    attempt: int


class WhatsAppTaskQueue:
    """Atomically claim records with expiring visibility and bounded retries."""

    def __init__(
        self, redis: Redis, *, namespace: str = "webhook:whatsapp", lease_seconds: int = 120
    ) -> None:
        self.redis = redis
        self.pending = f"{namespace}:pending"
        self.inflight = f"{namespace}:processing"
        self.dead_letter = f"{namespace}:processing-dead-letter"
        self.lease_seconds = lease_seconds

    async def claim(self) -> DeliveryClaim | None:
        member = await self.redis.eval(
            _CLAIM, 3, self.pending, self.inflight, self.dead_letter,
            uuid4().hex, self.lease_seconds,
        )
        if member is None:
            return None
        job = json.loads(member)
        return DeliveryClaim(member, job["raw"], job["attempt"])

    async def ack(self, claim: DeliveryClaim) -> None:
        await self.redis.zrem(self.inflight, claim.member)

    async def retry(self, claim: DeliveryClaim, *, delay_seconds: int) -> None:
        await self.redis.eval(_RETRY, 1, self.inflight, delay_seconds, claim.member)

    async def discard_invalid(self, claim: DeliveryClaim) -> None:
        await self.redis.eval(
            _DISCARD, 2, self.inflight, self.dead_letter, claim.member,
            '{"reason":"INVALID_QUEUE_RECORD"}',
        )


def _process(
    event: QueuedWhatsAppEvent, parser: NLPTaskParserService, gateway: MessagingGatewayProtocol
) -> None:
    # This thread owns both its SQLAlchemy session and its outbound I/O.
    with SessionLocal() as db:
        asyncio.run(TaskService(db, parser, gateway).create_from_whatsapp(event))


async def process_one(
    queue: WhatsAppTaskQueue, parser: NLPTaskParserService, gateway: MessagingGatewayProtocol
) -> bool:
    """Process one claimed record and acknowledge it only after its transaction commits."""
    claim = await queue.claim()
    if claim is None:
        return False
    try:
        event = QueuedWhatsAppEvent.model_validate_json(claim.raw)
    except ValidationError:
        await queue.discard_invalid(claim)
        return True
    try:
        await asyncio.to_thread(_process, event, parser, gateway)
    except Exception as error:
        logger.warning("WhatsApp task processing failed (%s)", type(error).__name__)
        await queue.retry(claim, delay_seconds=2 ** claim.attempt)
    else:
        await queue.ack(claim)
    return True


async def run_whatsapp_task_worker(
    queue: WhatsAppTaskQueue,
    parser: NLPTaskParserService,
    gateway: MessagingGatewayProtocol,
    stopping: asyncio.Event,
) -> None:
    """Poll for new or recoverable work until the application shuts down."""
    while not stopping.is_set():
        try:
            if await process_one(queue, parser, gateway):
                continue
        except RedisError as error:
            logger.warning("WhatsApp task queue unavailable (%s)", type(error).__name__)
        try:
            await asyncio.wait_for(stopping.wait(), timeout=1)
        except TimeoutError:
            pass
