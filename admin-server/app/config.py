"""Admin server configuration."""

import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root
_env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(_env_path)


class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql+asyncpg://localhost:5432/vi_db")
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "http://localhost:3001")

    # Firebase Authentication
    FIREBASE_ENABLED: bool = os.getenv("FIREBASE_ENABLED", "false").lower() in ("true", "1", "yes")
    FIREBASE_PROJECTS: str = os.getenv("FIREBASE_PROJECTS", "")


settings = Settings()
