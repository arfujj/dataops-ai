from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "DataOps AI"
    environment: str = "development"
    log_level: str = "INFO"
    database_url: str = "postgresql+psycopg://dataops:dataops@localhost:5432/dataops"
    redis_url: str = "redis://localhost:6379/0"
    kafka_bootstrap_servers: str = "localhost:19092"
    jwt_secret: str = "development-secret-change-before-deploying"
    jwt_access_token_minutes: int = 720
    frontend_origin: str = "http://localhost:3100"
    openai_api_key: str = ""
    openai_model: str = ""
    agent_max_tool_calls: int = 8
    seed_admin_email: str = "admin@example.com"
    seed_admin_password: str = "change-me-now"

    model_config = SettingsConfigDict(env_file="../../.env", extra="ignore")

    @model_validator(mode="after")
    def require_production_jwt_secret(self):
        if self.environment.lower() in {"production", "prod"} and len(self.jwt_secret) < 32:
            raise ValueError("JWT_SECRET must contain at least 32 characters in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
