"""Application configuration with python-dotenv."""

import os
import warnings
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root
_env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(_env_path)


class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql+asyncpg://localhost:5432/vi_db")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "dev-only-secret-DO-NOT-USE-IN-PRODUCTION")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    JWT_EXPIRE_MINUTES: int = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))
    LIVEKIT_URL: str = os.getenv("LIVEKIT_URL", "wss://localhost:7880")
    LIVEKIT_API_KEY: str = os.getenv("LIVEKIT_API_KEY", "")
    LIVEKIT_API_SECRET: str = os.getenv("LIVEKIT_API_SECRET", "")
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000")

    def __init__(self):
        if "DO-NOT-USE-IN-PRODUCTION" in self.JWT_SECRET or "change-this" in self.JWT_SECRET:
            warnings.warn(
                "JWT_SECRET is using an insecure default! "
                "Set a proper secret via environment variable for production.",
                UserWarning,
                stacklevel=2,
            )


settings = Settings()
