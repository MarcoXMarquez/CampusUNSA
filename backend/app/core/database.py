from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import settings

# Engine configuration with connection recycling to prevent stale idle sockets without per-request pre-ping overhead
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=False,
    pool_recycle=300,
    pool_size=10,
    max_overflow=20,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


async def get_db():
    """Async dependency that yields a database session without extra threadpool context hops."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
