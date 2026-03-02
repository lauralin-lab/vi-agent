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
from .routes.events import router as events_router
from .routes.internal import router as internal_router
from .routes.livekit import router as livekit_router
from .routes.memory import router as memory_router
from .routes.upload import router as upload_router
from .routes.users import router as users_router

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()

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
    try:
        yield
    finally:
        cleanup_task.cancel()

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
app.include_router(internal_router, prefix="/api/internal", tags=["internal"])
app.include_router(livekit_router, prefix="/api/livekit", tags=["livekit"])
app.include_router(upload_router, prefix="/api/upload", tags=["upload"])
app.include_router(users_router, prefix="/api/users", tags=["users"])
app.include_router(memory_router, prefix="/api/users", tags=["memory"])
app.include_router(events_router, prefix="/api/users", tags=["events"])


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
