import redis
from app.core.config import settings

redis_client = redis.Redis.from_url(
    settings.REDIS_URL,
    decode_responses=True,
    socket_timeout=5,
)


def get_redis():
    """Dependency that provides the global Redis client."""
    return redis_client
