"""Test-only entrypoint: real app/DB/security, deterministic external HTTP boundaries."""

import asyncio
import os
import socket
import time

import httpx
import redis
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from tests.load.seed_load_users import identity, require_isolation

require_isolation()
OriginalClient = httpx.Client


def upstream(request: httpx.Request) -> httpx.Response:
    if request.url.host == "oauth2.googleapis.com":
        name = request.url.params.get("id_token", "")
        try:
            index = int(name.removeprefix("perf-user-"))
            if name != identity(index):
                raise ValueError("Invalid synthetic token")
        except ValueError:
            return httpx.Response(401, json={"error": "invalid_token"})
        return httpx.Response(
            200,
            json={
                "email": f"{name}@unsa.edu.pe",
                "email_verified": "true",
                "hd": "unsa.edu.pe",
                "name": name,
            },
        )
    if request.url.host == "classroom.googleapis.com":
        if request.url.path.endswith("/courseWork"):
            return httpx.Response(200, json={"courseWork": []})
        return httpx.Response(
            200,
            json={"courses": [{"id": "perf-google", "name": "Performance Classroom"}]},
        )
    if request.url.host == "aulavirtual.unsa.edu.pe":
        import json

        calls = json.loads(request.content)
        data = [
            (
                {
                    "data": {
                        "courses": [
                            {
                                "id": 42,
                                "fullname": "Performance Moodle",
                                "shortname": "PERF",
                            }
                        ]
                    }
                }
                if call["methodname"].startswith("core_course_")
                else {"data": {"events": []}}
            )
            for call in calls
        ]
        return httpx.Response(200, json=data)
    raise httpx.ConnectError(
        "External network access is forbidden in the performance fixture",
        request=request,
    )


class FixtureClient(OriginalClient):
    def __init__(self, **kwargs: object) -> None:
        kwargs["transport"] = httpx.MockTransport(upstream)
        kwargs["trust_env"] = False
        super().__init__(**kwargs)


def fixture_get(url: str, **kwargs: object) -> httpx.Response:
    with FixtureClient() as client:
        return client.get(url, **kwargs)


httpx.Client = FixtureClient
httpx.get = fixture_get

from app.main import app  # noqa: E402
from app.core.config import settings  # noqa: E402


@app.on_event("startup")
async def announce_ready() -> None:
    client = redis.Redis.from_url(settings.REDIS_URL)
    client.sadd("perf:ready_workers", socket.gethostname())
    client.close()


class FixtureTelemetry:
    """Pure ASGI timing and fault injection without response-stream wrappers."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = time.perf_counter()
        delay = float(os.environ.get("PERF_DELAY_MS", "0"))
        if delay and scope["path"] == "/api/v1/auth/me":
            await asyncio.sleep(delay / 1000)

        async def measured_send(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers["X-Perf-Processing-Ms"] = str(
                    (time.perf_counter() - started) * 1000
                )
                headers["X-Perf-Worker"] = socket.gethostname()
            await send(message)

        await self.app(scope, receive, measured_send)


app.add_middleware(FixtureTelemetry)
