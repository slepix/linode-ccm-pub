from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List
import sys

ALLOWED_LINODE_API_BASE = "https://api.linode.com/v4"


class Settings(BaseSettings):
    DB_HOST: str
    DB_PORT: int = 16409
    DB_NAME: str
    DB_USER: str
    DB_PASSWORD: str
    DB_SSL: str = "require"

    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"

    JWT_EXPIRE_MINUTES: int = 60

    LINODE_API_BASE: str = ALLOWED_LINODE_API_BASE
    REFRESH_API_SECRET: str = ""

    CORS_ORIGINS: str = "http://localhost:5173"
    TOKEN_ENCRYPTION_KEY: str
    ALLOW_REGISTRATION: bool = False
    TRUSTED_PROXY_COUNT: int = 0

    @field_validator("JWT_SECRET")
    @classmethod
    def jwt_secret_strength(cls, v: str) -> str:
        if not v or len(v) < 32:
            raise ValueError(
                "JWT_SECRET must be at least 32 characters long. "
                "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        if len(set(v)) < 10:
            raise ValueError(
                "JWT_SECRET lacks sufficient entropy. Use a randomly generated value."
            )
        return v

    @field_validator("TOKEN_ENCRYPTION_KEY")
    @classmethod
    def encryption_key_required(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError(
                "TOKEN_ENCRYPTION_KEY is required and must not be empty. "
                "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
        try:
            from cryptography.fernet import Fernet
            Fernet(v.encode())
        except Exception as exc:
            raise ValueError(
                f"TOKEN_ENCRYPTION_KEY is not a valid Fernet key: {exc}. "
                "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            ) from exc
        return v

    @field_validator("LINODE_API_BASE")
    @classmethod
    def linode_api_base_must_be_exact(cls, v: str) -> str:
        from urllib.parse import urlparse
        parsed = urlparse(v.rstrip("/"))
        if parsed.scheme != "https" or parsed.hostname != "api.linode.com":
            raise ValueError(
                f"LINODE_API_BASE must be exactly {ALLOWED_LINODE_API_BASE}"
            )
        return v.rstrip("/")

    @field_validator("REFRESH_API_SECRET")
    @classmethod
    def refresh_api_secret_entropy(cls, v: str) -> str:
        if v and len(v) < 32:
            raise ValueError(
                "REFRESH_API_SECRET must be at least 32 characters long. "
                "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        return v

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    @property
    def database_url(self) -> str:
        return (
            f"postgresql://{self.DB_USER}:***"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

    def get_database_dsn(self) -> str:
        return (
            f"postgresql://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()

if not settings.REFRESH_API_SECRET:
    print(
        "WARNING: REFRESH_API_SECRET is not set. "
        "The GET /api/refresh endpoint will reject all unauthenticated requests. "
        "Set REFRESH_API_SECRET to enable scheduled refresh calls.",
        file=sys.stderr,
    )
