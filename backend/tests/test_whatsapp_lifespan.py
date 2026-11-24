
"""Start both WhatsApp flows with their required configuration and cleanly stop them."""

import asyncio
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import FastAPI
from pydantic import SecretStr

from app import main


@pytest.mark.parametrize(
    ("api", "webhook", "task_enabled", "expected"),
    [
        ("configured", "configured", True, {"tasks", "tickets"}),
        ("configured", "", True, {"tickets"}),
        ("configured", "configured", False, {"tickets"}),
        ("", "configured", True, set()),
    ],
)
def test_whatsapp_workers_share_gateway_and_stop_before_resources_close(
    monkeypatch: pytest.MonkeyPatch,
    api: str,
    webhook: str,
    task_enabled: bool,
    expected: set[str],
) -> None:
    client = AsyncMock()
    monkeypatch.setattr(main.Redis, "from_url", Mock(return_value=client))
    monkeypatch.setattr(main.settings, "EVOLUTION_API_KEY", SecretStr(api))
    monkeypatch.setattr(main.settings, "EVOLUTION_WEBHOOK_API_KEY", SecretStr(webhook))
    monkeypatch.setattr(main.settings, "WHATSAPP_TASK_WORKER_ENABLED", task_enabled)
    gateway_factory = Mock()
    monkeypatch.setattr(main, "EvolutionWhatsAppGateway", gateway_factory)
    parser = object()
    monkeypatch.setattr(main, "get_task_parser", lambda: parser)
    running: set[str] = set()
    stopped: set[str] = set()

    async def remember(name: str, gateway: object, stop: asyncio.Event) -> None:
        assert gateway is gateway_factory.return_value
        assert not stop.is_set()
        running.add(name)
        await stop.wait()
        assert not client.aclose.await_count
        stopped.add(name)

    async def tasks(queue: object, task_parser: object, gateway: object, stop: asyncio.Event) -> None:
        assert task_parser is parser
        await remember("tasks", gateway, stop)

    async def tickets(gateway: object, stop: asyncio.Event) -> None:
        await remember("tickets", gateway, stop)

    monkeypatch.setattr(main, "run_whatsapp_task_worker", tasks)
    monkeypatch.setattr(main, "run_ticket_notice_worker", tickets, raising=False)

    async def verify() -> None:
        app = FastAPI()
        async with main.lifespan(app):
            await asyncio.sleep(0)
            assert running == expected
            assert not stopped
            assert app.state.webhook_redis is client
        assert stopped == expected
        assert gateway_factory.call_count == bool(expected)
        client.aclose.assert_awaited_once()

    asyncio.run(verify())
