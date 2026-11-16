from typing import List, Literal
from urllib.parse import urlparse
from pydantic import ConfigDict, Field, SecretStr, model_validator
from pydantic_settings import BaseSettings


_INSECURE_SECRET_KEYS = frozenset(
    {
        "",
        "temporary_development_secret_key_change_in_production",
        "fallback_campusunsa_secret_key",
        "isolated_performance_only_not_a_production_secret",
    }
)
_INSECURE_ENCRYPTION_KEYS = frozenset(
    {
        "",
        "temporary_development_encryption_key_change_in_production",
        "fallback_campusunsa_secret_key",
    }
)


class Settings(BaseSettings):
    PROJECT_NAME: str = "CampusUNSA Core API"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    API_V1_STR: str = "/api/v1"

    # Security
    SECRET_KEY: str = "temporary_development_secret_key_change_in_production"
    ENCRYPTION_KEY: str = "temporary_development_encryption_key_change_in_production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    INSTITUTIONAL_DOMAIN: str = "unsa.edu.pe"

    # Google OAuth & Classroom Integration
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:9000/api/v1/auth/google/callback"

    # US-10: optional structured extraction; disabled mode uses the local fallback.
    TASK_PARSER_PROVIDER: Literal["disabled", "ollama", "gemini"] = "disabled"
    TASK_PARSER_MODEL: str = ""
    TASK_PARSER_TIMEOUT_SECONDS: float = Field(default=30, gt=0, le=60)
    OLLAMA_BASE_URL: str = "http://ollama:11434"
    GEMINI_API_KEY: SecretStr = SecretStr("")

    # Messaging Gateways & Omnichannel OTP Binding (US-08 / REQ-16 / REQ-36)
    OTP_TTL_SECONDS: int = 300
    OTP_MAX_ATTEMPTS: int = 3
    OTP_GENERATION_RATE_LIMIT: int = 5
    OTP_GENERATION_WINDOW_SECONDS: int = 600
    WHATSAPP_BOT_NUMBER: str = ""
    EVOLUTION_API_URL: str = "http://evolution:8080"
    EVOLUTION_INSTANCE_NAME: str = "campusunsa"
    EVOLUTION_API_KEY: SecretStr = SecretStr("")
    TELEGRAM_BOT_USERNAME: str = ""
    TELEGRAM_BOT_TOKEN: SecretStr = SecretStr("")

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    # Database
    POSTGRES_SERVER: str = "postgres"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres_dev_password"
    POSTGRES_DB: str = "campusunsa"
    DATABASE_URL: str = ""

    # Redis Cache & Queues
    REDIS_HOST: str = "redis"
    REDIS_PORT: int = 6379
    REDIS_URL: str = ""

    @model_validator(mode="after")
    def validate_and_resolve_urls(self) -> "Settings":
        explicit_db_url = self.DATABASE_URL.strip()
        if explicit_db_url:
            if explicit_db_url.startswith("postgres://"):
                explicit_db_url = "postgresql://" + explicit_db_url.removeprefix("postgres://")
            self.DATABASE_URL = explicit_db_url
        else:
            self.DATABASE_URL = (
                f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
                f"@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
            )

        explicit_redis_url = self.REDIS_URL.strip()
        if explicit_redis_url:
            self.REDIS_URL = explicit_redis_url
        else:
            self.REDIS_URL = f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/0"

        env = self.ENVIRONMENT.strip().lower()
        if env in {"production", "staging"}:
            secret = self.SECRET_KEY.strip()
            encryption = self.ENCRYPTION_KEY.strip()
            if secret in _INSECURE_SECRET_KEYS:
                raise ValueError("SECRET_KEY must be set to a strong non-default value in non-development environments")
            if encryption in _INSECURE_ENCRYPTION_KEYS:
                raise ValueError("ENCRYPTION_KEY must be set to a strong non-default value in non-development environments")
            if encryption == secret:
                raise ValueError("ENCRYPTION_KEY must be distinct from SECRET_KEY in non-development environments")
            if explicit_db_url:
                parsed_pw = urlparse(self.DATABASE_URL).password or ""
                if not parsed_pw or parsed_pw == "postgres_dev_password":
                    raise ValueError("POSTGRES_PASSWORD must be changed from the development default in non-development environments")
            elif self.POSTGRES_PASSWORD == "postgres_dev_password":
                raise ValueError("POSTGRES_PASSWORD must be changed from the development default in non-development environments")
        return self

    model_config = ConfigDict(
        case_sensitive=True,
        env_file=".env",
        extra="ignore",
    )


settings = Settings()
