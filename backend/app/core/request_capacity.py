"""Queue HTTP work asynchronously before synchronous SQLAlchemy dependencies."""

import asyncio

from starlette.types import ASGIApp, Receive, Scope, Send


class RequestCapacityMiddleware:
    def __init__(self, app: ASGIApp, max_inflight: int = 15) -> None:
        if max_inflight < 1:
            raise ValueError("Request capacity must be positive")
        self.app = app
        # Bound per-worker admission safely below the 30-connection pool and 4x25 Postgres budget.
        self.capacity = asyncio.Semaphore(max_inflight)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        async with self.capacity:
            await self.app(scope, receive, send)
