"""Sample total PostgreSQL connections from an independent observer container."""

import json
import time

import psycopg2

from app.core.config import settings
from tests.load.seed_load_users import require_isolation


def monitor() -> None:
    require_isolation()
    with psycopg2.connect(settings.DATABASE_URL) as connection:
        connection.autocommit = True
        while True:
            with connection.cursor() as cursor:
                cursor.execute("SELECT count(*) FROM pg_stat_activity")
                count = cursor.fetchone()[0]
                cursor.execute("SHOW max_connections")
                maximum = int(cursor.fetchone()[0])
            print(
                json.dumps(
                    {
                        "connections": count,
                        "max_connections": maximum,
                    }
                ),
                flush=True,
            )
            time.sleep(1)


if __name__ == "__main__":
    monitor()
