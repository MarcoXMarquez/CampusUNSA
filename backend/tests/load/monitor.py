"""Sample total PostgreSQL connections from an independent observer container."""

import json
import time
from contextlib import closing
from pathlib import Path

import psycopg2

from app.core.config import settings
from tests.load.seed_load_users import require_isolation


def monitor() -> None:
    require_isolation()
    with closing(psycopg2.connect(settings.DATABASE_URL)) as connection:
        connection.autocommit = True
        while True:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT count(*),
                           count(*) FILTER (WHERE datname = current_database()
                               AND state = 'active' AND pid <> pg_backend_pid()),
                           count(*) FILTER (WHERE datname = current_database()
                               AND wait_event_type = 'Lock')
                    FROM pg_stat_activity
                    """
                )
                count, active, lock_waiters = cursor.fetchone()
                cursor.execute(
                    "SELECT deadlocks FROM pg_stat_database WHERE datname = current_database()"
                )
                deadlocks = cursor.fetchone()[0]
                cursor.execute("SHOW max_connections")
                maximum = int(cursor.fetchone()[0])
            print(
                json.dumps(
                    {
                        "sampled_at": time.time(),
                        "connections": count,
                        "active_connections": active,
                        "lock_waiters": lock_waiters,
                        "database_deadlocks": deadlocks,
                        "max_connections": maximum,
                    }
                ),
                flush=True,
            )
            Path("/tmp/observer-ready").touch()
            time.sleep(1)


if __name__ == "__main__":
    monitor()
