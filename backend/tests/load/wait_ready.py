"""Wait for every benchmark worker before opening persistent load connections."""

import time

import redis

from app.core.config import settings
from tests.load.seed_load_users import require_isolation


def wait_ready() -> None:
    require_isolation()
    with redis.Redis.from_url(settings.REDIS_URL) as client:
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            if client.scard("perf:ready_workers") == 4:
                print("All four performance workers are ready")
                return
            time.sleep(0.5)
    raise RuntimeError("Not all four performance workers became ready")


if __name__ == "__main__":
    wait_ready()
