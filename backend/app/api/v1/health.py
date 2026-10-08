from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session
import redis

from app.core.database import get_db
from app.core.redis import get_redis

router = APIRouter()


@router.get("/health", status_code=status.HTTP_200_OK)
def check_health(
    db: Session = Depends(get_db),
    redis_instance: redis.Redis = Depends(get_redis),
):
    """
    Healthcheck endpoint verifying backend connectivity to PostgreSQL and Redis.
    Returns HTTP 200 if all dependencies are healthy, or HTTP 503 if any dependency fails.
    """
    health_status = {
        "status": "healthy",
        "services": {
            "database": "unknown",
            "redis": "unknown",
        },
        "version": "1.0.0",
    }
    is_healthy = True

    # 1. Verify PostgreSQL connection
    try:
        db.execute(text("SELECT 1"))
        health_status["services"]["database"] = "healthy"
    except Exception as e:
        health_status["services"]["database"] = f"unhealthy: {str(e)}"
        is_healthy = False

    # 2. Verify Redis connection
    try:
        if redis_instance.ping():
            health_status["services"]["redis"] = "healthy"
        else:
            health_status["services"]["redis"] = "unhealthy: ping returned False"
            is_healthy = False
    except Exception as e:
        health_status["services"]["redis"] = f"unhealthy: {str(e)}"
        is_healthy = False

    if not is_healthy:
        health_status["status"] = "degraded"
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=health_status,
        )

    return health_status
