"""Admission backpressure prevents synchronous dependency/pool starvation."""

import asyncio

import pytest
from starlette.types import Message, Scope


@pytest.mark.asyncio
async def test_http_capacity_is_bounded_without_rejecting_waiting_clients() -> None:
    from app.core.request_capacity import RequestCapacityMiddleware

    active = 0
    peak = 0
    completed = 0

    async def downstream(scope: Scope, receive: object, send: object) -> None:
        nonlocal active, peak, completed
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0.005)
        completed += 1
        active -= 1

    async def receive() -> Message:
        return {"type": "http.request"}

    async def send(message: Message) -> None:
        pass

    middleware = RequestCapacityMiddleware(downstream, max_inflight=3)
    await asyncio.gather(
        *(middleware({"type": "http"}, receive, send) for _ in range(30))
    )
    assert peak == 3
    assert completed == 30


@pytest.mark.asyncio
async def test_failed_request_releases_its_capacity() -> None:
    from app.core.request_capacity import RequestCapacityMiddleware

    calls = 0

    async def downstream(scope: Scope, receive: object, send: object) -> None:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise ValueError("endpoint failure")

    middleware = RequestCapacityMiddleware(downstream, max_inflight=1)
    with pytest.raises(ValueError):
        await middleware({"type": "http"}, None, None)
    await asyncio.wait_for(middleware({"type": "http"}, None, None), timeout=1)
    assert calls == 2


@pytest.mark.asyncio
async def test_non_http_scopes_are_forwarded() -> None:
    from app.core.request_capacity import RequestCapacityMiddleware

    async def downstream(scope: Scope, receive: object, send: object) -> None:
        assert scope["type"] == "lifespan"

    await RequestCapacityMiddleware(downstream)({"type": "lifespan"}, None, None)


def test_capacity_must_be_positive() -> None:
    from app.core.request_capacity import RequestCapacityMiddleware

    with pytest.raises(ValueError):
        RequestCapacityMiddleware(None, max_inflight=0)


@pytest.mark.asyncio
async def test_cancelled_request_releases_capacity() -> None:
    from app.core.request_capacity import RequestCapacityMiddleware

    entered = asyncio.Event()
    calls = 0

    async def downstream(scope: Scope, receive: object, send: object) -> None:
        nonlocal calls
        calls += 1
        if calls == 1:
            entered.set()
            await asyncio.Future()

    middleware = RequestCapacityMiddleware(downstream, max_inflight=1)
    running = asyncio.create_task(middleware({"type": "http"}, None, None))
    await entered.wait()
    running.cancel()
    with pytest.raises(asyncio.CancelledError):
        await running
    await asyncio.wait_for(middleware({"type": "http"}, None, None), timeout=1)
    assert calls == 2
