from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app.core.config import settings
from app.core.request_capacity import RequestCapacityMiddleware
from app.api.v1.health import router as health_router
from app.api.v1.auth import router as auth_router
from app.api.v1.tickets import router as tickets_router
from app.api.v1.classroom import router as classroom_router
from app.api.v1.dutic import router as dutic_router
from app.api.v1.nlp import router as nlp_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
)

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
app.include_router(dutic_router, prefix=f"{settings.API_V1_STR}/dutic", tags=["DUTIC Moodle"])
app.include_router(nlp_router, prefix=f"{settings.API_V1_STR}/nlp", tags=["Task Extraction"])


@app.get("/docs", include_in_schema=False)
def redirect_docs():
    return RedirectResponse(url=f"{settings.API_V1_STR}/docs")


@app.get("/", tags=["Root"])
def root():
    return {
        "project": settings.PROJECT_NAME,
        "environment": settings.ENVIRONMENT,
        "docs_url": f"{settings.API_V1_STR}/docs",
        "health_url": f"{settings.API_V1_STR}/health",
    }
