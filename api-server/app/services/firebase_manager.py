"""Firebase Admin SDK manager — multi-project support with async wrappers."""

import asyncio
import logging

import firebase_admin
from firebase_admin import auth, credentials

logger = logging.getLogger(__name__)


class FirebaseManager:
    """Multi-project Firebase Admin SDK manager.

    Each package_name maps to an independent Firebase App instance.
    All Firebase Admin SDK calls are wrapped via asyncio.to_thread().
    """

    def __init__(self):
        self._apps: dict[str, firebase_admin.App] = {}

    def register_project(
        self,
        package_name: str,
        project_id: str,
        service_account_path: str | None = None,
        service_account_json: dict | None = None,
    ):
        if service_account_path:
            cred = credentials.Certificate(service_account_path)
        elif service_account_json:
            cred = credentials.Certificate(service_account_json)
        else:
            cred = credentials.ApplicationDefault()

        app = firebase_admin.initialize_app(
            cred, {"projectId": project_id}, name=package_name
        )
        self._apps[package_name] = app
        logger.info("Firebase project registered: %s (%s)", package_name, project_id)

    async def verify_id_token(self, package_name: str, id_token: str) -> dict:
        """Verify a Firebase ID Token. Returns decoded claims dict."""
        app = self._apps.get(package_name)
        if not app:
            raise ValueError(f"Unknown Firebase project for package: {package_name}")

        return await asyncio.to_thread(auth.verify_id_token, id_token, app=app)

    async def get_user(self, package_name: str, uid: str) -> auth.UserRecord:
        """Get Firebase user details."""
        app = self._apps.get(package_name)
        if not app:
            raise ValueError(f"Unknown Firebase project for package: {package_name}")

        return await asyncio.to_thread(auth.get_user, uid, app=app)

    @property
    def project_count(self) -> int:
        return len(self._apps)
