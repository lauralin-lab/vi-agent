import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import redis.asyncio as aioredis
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .limiter import limiter
from .models import Session, engine, init_db
from .routes.auth import router as auth_router
from .routes.invite import router as invite_router
from .routes.devices import router as devices_router
from .routes.events import router as events_router
from .routes.fs import router as fs_router
from .routes.internal import router as internal_router
from .routes.livekit import router as livekit_router
from .routes.memory import router as memory_router
from .routes.skills import router as skills_router
from .routes.tokens import router as tokens_router
from .routes.upload import router as upload_router
from .routes.users import router as users_router
from .services.event_aggregator import run_event_aggregator

logger = logging.getLogger(__name__)


async def cleanup_stale_sessions():
    """Periodically mark stale dispatched sessions as failed."""
    while True:
        await asyncio.sleep(300)  # every 5 minutes
        try:
            async with AsyncSession(engine) as db:
                cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
                result = await db.execute(
                    update(Session)
                    .where(Session.status.in_(["dispatched"]))
                    .where(Session.dispatched_at < cutoff)
                    .values(status="failed", completed_at=datetime.now(timezone.utc))
                )
                if result.rowcount > 0:
                    await db.commit()
                    logger.info("Cleaned up %d stale sessions", result.rowcount)
        except Exception:
            logger.error("Stale session cleanup failed", exc_info=True)


def parse_firebase_projects(config_str: str) -> list[dict]:
    """Parse FIREBASE_PROJECTS env var.

    Format: "package:project_id:sa_path,package2:project_id2:sa_path2"
    """
    projects = []
    for entry in config_str.split(","):
        entry = entry.strip()
        if not entry:
            continue
        parts = entry.split(":")
        if len(parts) < 2:
            continue
        projects.append({
            "package_name": parts[0],
            "project_id": parts[1],
            "service_account_path": parts[2] if len(parts) > 2 else None,
        })
    return projects


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()

    # Firebase Manager
    if settings.FIREBASE_ENABLED:
        try:
            from .services.firebase_manager import FirebaseManager

            project_configs = parse_firebase_projects(settings.FIREBASE_PROJECTS)
            if not project_configs:
                logger.error(
                    "FIREBASE_ENABLED=true but FIREBASE_PROJECTS is empty or invalid. "
                    "Format: 'package_name:project_id:sa_path' (sa_path optional on GCP). "
                    "Auth endpoints will return 503."
                )
                app.state.firebase_manager = None
            else:
                firebase_mgr = FirebaseManager()
                for project_config in project_configs:
                    firebase_mgr.register_project(
                        package_name=project_config["package_name"],
                        project_id=project_config["project_id"],
                        service_account_path=project_config.get("service_account_path"),
                    )
                app.state.firebase_manager = firebase_mgr
                logger.info("Firebase initialized with %d project(s)", firebase_mgr.project_count)
        except Exception:
            logger.error("Firebase initialization failed — auth endpoints will return 503", exc_info=True)
            app.state.firebase_manager = None
    else:
        app.state.firebase_manager = None
        logger.warning("Firebase disabled (FIREBASE_ENABLED != true) — auth endpoints will return 503")

    # Connect to Redis (graceful degradation if unavailable)
    try:
        redis_client = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
        )
        await redis_client.ping()
        app.state.redis = redis_client
        logger.info("Redis connected: %s", settings.REDIS_URL)
    except Exception:
        app.state.redis = None
        logger.warning("Redis unavailable — SSE events disabled", exc_info=True)

    cleanup_task = asyncio.create_task(cleanup_stale_sessions())

    # V4: Start event aggregator if Redis is available
    aggregator_task = None
    if app.state.redis is not None:
        aggregator_task = asyncio.create_task(run_event_aggregator(app.state.redis))
        logger.info("Event aggregator started")

    try:
        yield
    finally:
        cleanup_task.cancel()
        if aggregator_task is not None:
            aggregator_task.cancel()

        # Close Redis
        if getattr(app.state, "redis", None) is not None:
            await app.state.redis.close()

        await engine.dispose()


app = FastAPI(title="VI API Server", version="1.0.0", lifespan=lifespan)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(invite_router, prefix="/api/invite", tags=["invite"])
app.include_router(devices_router, prefix="/api/devices", tags=["devices"])
app.include_router(internal_router, prefix="/api/internal", tags=["internal"])
app.include_router(livekit_router, prefix="/api/livekit", tags=["livekit"])
app.include_router(upload_router, prefix="/api/upload", tags=["upload"])
app.include_router(users_router, prefix="/api/users", tags=["users"])
app.include_router(memory_router, prefix="/api/users", tags=["memory"])
app.include_router(events_router, prefix="/api/users", tags=["events"])
# V4 routes
app.include_router(tokens_router, prefix="/api/tokens", tags=["tokens"])
app.include_router(fs_router, prefix="/api/fs", tags=["fs"])
app.include_router(skills_router, prefix="/api/skills", tags=["skills"])


@app.get("/health")
@limiter.exempt
async def health(request: Request):
    return {"status": "ok"}


@app.get("/api/config")
@limiter.exempt
async def client_config(request: Request):
    """Public runtime config for frontend — avoids baking env vars at build time."""
    return {
        "livekit_url": settings.LIVEKIT_URL,
        "version": os.getenv("IMAGE_TAG", "dev"),
    }
