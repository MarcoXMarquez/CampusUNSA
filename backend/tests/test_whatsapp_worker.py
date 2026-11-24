"""Integration coverage for actual Redis claim, restart recovery and acknowledgment."""

import asyncio
import json
import os
from hashlib import sha256
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from redis.asyncio import Redis
from sqlalchemy.orm import Session

from app.models.user import User
from app.services.messaging import webhook_queue, whatsapp_worker
from app.services.messaging.gateway import EvolutionWhatsAppGateway
from app.services.messaging.whatsapp_worker import WhatsAppTaskQueue
from app.services.tasks.task_parser import NLPTaskParserService
import test_assignment_completion as board_tests
import test_whatsapp_tasks as task_tests

authorization = board_tests.authorization
completion_client = board_tests.completion_client
completion_db = board_tests.completion_db
student = task_tests.student
delivery = task_tests.delivery


@pytest.mark.skipif(
    not os.environ.get("WHATSAPP_WEBHOOK_TEST_REDIS_URL"),
    reason="Set WHATSAPP_WEBHOOK_TEST_REDIS_URL to an isolated Redis database",
)
def test_interrupted_and_failed_jobs_recover_and_expired_claims_cannot_ack() -> None:
    async def verify() -> None:
        redis = Redis.from_url(os.environ["WHATSAPP_WEBHOOK_TEST_REDIS_URL"], decode_responses=True)
        namespace = f"test-us11:{uuid4().hex}"
        queue = WhatsAppTaskQueue(redis, namespace=namespace, lease_seconds=10)
        raw = delivery().model_dump_json()
        try:
            await redis.lpush(queue.pending, raw)
            first = await queue.claim()
            assert first is not None and first.raw == raw and first.attempt == 1
            assert await queue.claim() is None
            # Simulate a crashed worker by moving its visibility deadline into the past.
            await redis.zadd(queue.inflight, {first.member: 0}, xx=True)

            second = await queue.claim()
            assert second is not None and second.attempt == 2
            await queue.ack(first)
            assert await redis.zcard(queue.inflight) == 1
            await queue.retry(second, delay_seconds=0)

            third = await queue.claim()
            assert third is not None and third.attempt == 3
            await queue.retry(third, delay_seconds=0)
            assert await queue.claim() is None
            assert await redis.zcard(queue.inflight) == 0
            assert await redis.llen(queue.dead_letter) == 1

            await redis.lpush(queue.pending, raw)
            fourth = await queue.claim()
            assert fourth is not None and fourth.attempt == 1
            await queue.ack(fourth)
            assert await redis.zcard(queue.inflight) == 0
            assert await redis.llen(queue.pending) == 0
        finally:
            await redis.delete(queue.pending, queue.inflight, queue.dead_letter)
            await redis.aclose()

    asyncio.run(verify())

@pytest.mark.skipif(
    not os.environ.get("WHATSAPP_WEBHOOK_TEST_REDIS_URL"),
    reason="Set WHATSAPP_WEBHOOK_TEST_REDIS_URL to an isolated Redis database",
)
def test_webhook_queue_worker_confirms_via_evolution_and_exposes_committed_task(
    completion_db: Session, completion_client: TestClient, student: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers = authorization(student.id)
    completion_db.commit()
    monkeypatch.setattr(whatsapp_worker, "SessionLocal", lambda: completion_db)
    outbound: list[dict[str, str]] = []

    def simulate_evolution(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert request.url.path == "/message/sendText/campusunsa"
        assert request.headers["apikey"] == "fixture-evolution-secret"
        outbound.append(json.loads(request.content))
        return httpx.Response(201)

    original_client = httpx.AsyncClient

    def client_with_mock_transport(**kwargs: object) -> httpx.AsyncClient:
        return original_client(
            timeout=kwargs.get("timeout", 10.0),
            transport=httpx.MockTransport(simulate_evolution),
        )

    monkeypatch.setattr("app.services.messaging.gateway.httpx.AsyncClient", client_with_mock_transport)
    gateway = EvolutionWhatsAppGateway(
        base_url="http://evolution.test", instance_name="campusunsa", api_key="fixture-evolution-secret"
    )
    namespace = f"test-us11:{uuid4().hex}"
    parser = NLPTaskParserService()
    record = delivery("Compilers Lab for Compilers 2026-10-16T18:00:00-05:00")
    key = record.payload.data.key.model_copy(update={"id": uuid4().hex})
    record.payload.data.key = key
    identity = "\0".join((record.payload.instance, key.remoteJid, key.id))
    dedupe = "webhook:event:" + sha256(identity.encode()).hexdigest()

    async def run_pipeline() -> None:
        redis = Redis.from_url(os.environ["WHATSAPP_WEBHOOK_TEST_REDIS_URL"], decode_responses=True)
        queue = WhatsAppTaskQueue(redis, namespace=namespace)
        monkeypatch.setattr(webhook_queue, "PENDING_QUEUE", queue.pending)
        try:
            assert await webhook_queue.enqueue_event(redis, record)
            assert await whatsapp_worker.process_one(queue, parser, gateway)
            assert await redis.zcard(queue.inflight) == 0
        finally:
            await redis.delete(queue.pending, queue.inflight, queue.dead_letter, dedupe)
            await redis.aclose()

    asyncio.run(run_pipeline())
    assert outbound == [
        {"number": "51999888777", "text": "Task scheduled: Compilers Lab due Oct 16, 18:00"}
    ]
    response = completion_client.get("/api/v1/courses/assignments", headers=headers)
    assert response.status_code == 200
    (task,) = response.json()
    assert (task["title"], task["course_code"], task["origin"]) == (
        "Compilers Lab", "COMP", "whatsapp",
    )
