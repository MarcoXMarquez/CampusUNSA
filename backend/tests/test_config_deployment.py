"""Unit tests for cloud DATABASE_URL and REDIS_URL overrides in Settings."""

import pytest

from app.core.config import Settings


def test_settings_builds_default_urls_when_overrides_absent() -> None:
    cfg = Settings(
        ENVIRONMENT="development",
        POSTGRES_USER="u_dev",
        POSTGRES_PASSWORD="p_dev",
        POSTGRES_SERVER="db_host",
        POSTGRES_PORT=5433,
        POSTGRES_DB="campus_dev",
        REDIS_HOST="redis_host",
        REDIS_PORT=6380,
    )
    assert cfg.DATABASE_URL == "postgresql://u_dev:p_dev@db_host:5433/campus_dev"
    assert cfg.REDIS_URL == "redis://redis_host:6380/0"


def test_settings_accepts_direct_supabase_and_upstash_urls_in_production() -> None:
    cfg = Settings(
        ENVIRONMENT="production",
        SECRET_KEY="prod-jwt-secret-key-distinct-value",
        ENCRYPTION_KEY="prod-fernet-encryption-key-distinct",
        DATABASE_URL="postgres://postgres.proj:StrongProdPass123@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require",
        REDIS_URL="rediss://default:UpstashToken123@us1-example.upstash.io:6379",
    )
    assert cfg.DATABASE_URL == (
        "postgresql://postgres.proj:StrongProdPass123@"
        "aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require"
    )
    assert cfg.REDIS_URL == "rediss://default:UpstashToken123@us1-example.upstash.io:6379"


def test_settings_rejects_default_postgres_password_in_direct_database_url() -> None:
    with pytest.raises(ValueError, match="POSTGRES_PASSWORD"):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY="prod-jwt-secret-key-distinct-value",
            ENCRYPTION_KEY="prod-fernet-encryption-key-distinct",
            DATABASE_URL="postgresql://postgres:postgres_dev_password@db.example.com:5432/postgres",
            REDIS_URL="rediss://default:UpstashToken123@us1-example.upstash.io:6379",
        )


def test_settings_rejects_default_postgres_password_when_url_not_provided() -> None:
    with pytest.raises(ValueError, match="POSTGRES_PASSWORD"):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY="prod-jwt-secret-key-distinct-value",
            ENCRYPTION_KEY="prod-fernet-encryption-key-distinct",
        )
