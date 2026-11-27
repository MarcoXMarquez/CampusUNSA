import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from redis.asyncio import Redis
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app.core.config import settings
from app.core.private_calendar_logs import PrivateCalendarAccessFilter
from app.core.request_capacity import RequestCapacityMiddleware
from app.api.v1.health import router as health_router
from app.api.v1.auth import router as auth_router
from app.api.v1.tickets import router as tickets_router
from app.api.v1.classroom import router as classroom_router
from app.api.v1.courses import router as courses_router
from app.api.v1.calendar import router as calendar_router
from app.api.v1.dutic import router as dutic_router
from app.api.v1.nlp import get_task_parser, router as nlp_router
from app.api.v1.webhooks import router as webhooks_router
from app.services.messaging.gateway import EvolutionWhatsAppGateway
from app.services.messaging.whatsapp_worker import WhatsAppTaskQueue, run_whatsapp_task_worker
from app.services.ticket_notifications import run_ticket_notice_worker


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    client = Redis.from_url(
        settings.REDIS_URL,
        decode_responses=True,
        socket_connect_timeout=0.2,
        socket_timeout=0.2,
    )
    app.state.webhook_redis = client
    try:
        # Keep startup hooks used by existing integrations and load workers.
        await app.router.startup()
        stopping = asyncio.Event()
        workers: list[asyncio.Task[None]] = []
        try:
            evolution_key = settings.EVOLUTION_API_KEY.get_secret_value()
            if evolution_key:
                gateway = EvolutionWhatsAppGateway(
                    base_url=settings.EVOLUTION_API_URL,
                    instance_name=settings.EVOLUTION_INSTANCE_NAME,
                    api_key=evolution_key,
                )
                if (
                    settings.WHATSAPP_TASK_WORKER_ENABLED
                    and settings.EVOLUTION_WEBHOOK_API_KEY.get_secret_value()
                ):
                    workers.append(asyncio.create_task(run_whatsapp_task_worker(
                        WhatsAppTaskQueue(client), get_task_parser(), gateway, stopping,
                    )))
                workers.append(asyncio.create_task(run_ticket_notice_worker(gateway, stopping)))
            yield
        finally:
            stopping.set()
            try:
                if workers:
                    await asyncio.wait(workers)
                    for worker in workers:
                        worker.result()
            finally:
                await app.router.shutdown()
    finally:
        await client.aclose()


app = FastAPI(
    lifespan=lifespan,
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
)

logging.getLogger("uvicorn.access").addFilter(PrivateCalendarAccessFilter())

# CORS Middleware
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Bound synchronous request admission below the database connection pool capacity.
app.add_middleware(RequestCapacityMiddleware)

# Include API Routers
app.include_router(health_router, prefix=settings.API_V1_STR, tags=["Health"])
app.include_router(auth_router, prefix=f"{settings.API_V1_STR}/auth", tags=["Authentication"])
app.include_router(tickets_router, prefix=f"{settings.API_V1_STR}/tickets", tags=["Tickets"])
app.include_router(classroom_router, prefix=f"{settings.API_V1_STR}/classroom", tags=["Classroom"])
app.include_router(courses_router, prefix=f"{settings.API_V1_STR}/courses", tags=["Curriculum Courses"])
app.include_router(calendar_router, prefix=f"{settings.API_V1_STR}/courses/calendar", tags=["Calendar"])
app.include_router(dutic_router, prefix=f"{settings.API_V1_STR}/dutic", tags=["DUTIC Moodle"])
app.include_router(nlp_router, prefix=f"{settings.API_V1_STR}/nlp", tags=["Task Extraction"])


app.include_router(webhooks_router, prefix=f"{settings.API_V1_STR}/webhooks", tags=["Webhooks"])


@app.get("/docs", include_in_schema=False)
def redirect_docs():
    return RedirectResponse(url=f"{settings.API_V1_STR}/docs")


@app.get("/", tags=["Root"])
async def root():
    return {
        "project": settings.PROJECT_NAME,
        "environment": settings.ENVIRONMENT,
        "docs_url": f"{settings.API_V1_STR}/docs",
        "health_url": f"{settings.API_V1_STR}/health",
    }
