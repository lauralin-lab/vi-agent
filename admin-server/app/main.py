"""Admin server — independent FastAPI app for admin management."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .models import engine, init_db
from .routes.auth import router as auth_router
from .routes.devices import router as devices_router
from .routes.invite_codes import router as invite_codes_router
from .routes.settings import router as settings_router
from .routes.users import router as users_router

logger = logging.getLogger(__name__)


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
                logger.error("FIREBASE_ENABLED=true but FIREBASE_PROJECTS is empty.")
                app.state.firebase_manager = None
            else:
                firebase_mgr = FirebaseManager()
                for pc in project_configs:
                    firebase_mgr.register_project(
                        package_name=pc["package_name"],
                        project_id=pc["project_id"],
                        service_account_path=pc.get("service_account_path"),
                    )
                app.state.firebase_manager = firebase_mgr
                logger.info("Firebase initialized with %d project(s)", firebase_mgr.project_count)
        except Exception:
            logger.error("Firebase initialization failed", exc_info=True)
            app.state.firebase_manager = None
    else:
        app.state.firebase_manager = None
        logger.warning("Firebase disabled")

    try:
        yield
    finally:
        await engine.dispose()


app = FastAPI(title="VI Admin Server", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/admin/auth", tags=["auth"])
app.include_router(users_router, prefix="/admin/users", tags=["users"])
app.include_router(devices_router, prefix="/admin/devices", tags=["devices"])
app.include_router(settings_router, prefix="/admin/settings", tags=["settings"])
app.include_router(invite_codes_router, prefix="/admin/invite-codes", tags=["invite-codes"])


@app.get("/health")
async def health(request: Request):
    return {"status": "ok"}
