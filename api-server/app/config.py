"""Application configuration with python-dotenv."""

import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root
_env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(_env_path)


class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql+asyncpg://localhost:5432/vi_db")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "dev-only-secret-DO-NOT-USE-IN-PRODUCTION")
    LIVEKIT_URL: str = os.getenv("LIVEKIT_URL", "wss://localhost:7880")
    LIVEKIT_API_KEY: str = os.getenv("LIVEKIT_API_KEY", "")
    LIVEKIT_API_SECRET: str = os.getenv("LIVEKIT_API_SECRET", "")
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000")
    VI_AGENT_NAME: str = os.getenv("VI_AGENT_NAME", "")

    # Firebase Authentication
    FIREBASE_ENABLED: bool = os.getenv("FIREBASE_ENABLED", "false").lower() in ("true", "1", "yes")
    FIREBASE_PROJECTS: str = os.getenv("FIREBASE_PROJECTS", "")


settings = Settings()
