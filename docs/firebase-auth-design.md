# Firebase Authentication System Design

> 文档日期: 2026-03-06
> 状态: Design Complete

---

## 1. Executive Summary

VI Agent V4 将认证体系从 **email/password JWT** 完全迁移到 **Firebase Authentication**。

核心变更：
- **Flutter App** 使用 Firebase Client SDK 完成 Google/Apple/匿名登录，获得 ID Token
- **React Web** 使用 Firebase JS SDK 完成 Google/匿名登录，获得 ID Token (共用同一 Firebase 项目)
- **API Server** 使用 `firebase-admin` Python SDK 验证 ID Token，创建/管理用户
- **Device Registry** 新增独立模块，管理 FCM push token 和硬件信息上报
- **影响范围最小化**: 主要修改 API Server 认证层 + React Web 前端 auth 模块。NanoClaw 需适配动态 userId（Redis channel 订阅 + cloud-sync），Realtime/Gateway 不变

---

## 2. Architecture Overview

### 2.1 系统架构图

```
╔══════════════════════════════════════════════════════════════════════════╗
║                    VI Agent V4 — Firebase Auth Architecture              ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║  ┌──────────────┐  ┌──────────────┐   ┌─────────────────────────┐        ║
║  │ Flutter App   │  │ React Web    │   │ Firebase Cloud           │        ║
║  │              │  │              │   │ (Firebase Project)       │        ║
║  │ Firebase SDK  │  │ Firebase JS  │   │ • Google Sign-In         │        ║
║  │ FCM SDK       │  │ SDK          │   │ • Apple Sign-In (iOS)    │        ║
║  │              │  │              │   │                          │        ║
║  │ package-name  │  │ package-name │   │ • FCM Push               │        ║
║  │ = {ios_pkg}   │  │ = {web_pkg}  │◄─►│                          │        ║
║  └──────┬───────┘  └──────┬───────┘   └─────────────────────────┘        ║
║         │                 │                                               ║
║         └────────┬────────┘                                               ║
║                  │ HTTPS (id-token + package-name headers)                ║
║         ▼                                                                ║
║  ┌──────────────────────────────────────────────────────────────────┐    ║
║  │                        API Server (FastAPI)                       │    ║
║  │                                                                    │    ║
║  │  ┌─────────────────────────────────────────────────────────────┐  │    ║
║  │  │              Firebase Auth Module (NEW)                      │  │    ║
║  │  │                                                              │  │    ║
║  │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │  │    ║
║  │  │  │ Firebase      │  │ Auth         │  │ Device           │  │  │    ║
║  │  │  │ Manager       │  │ Dependency   │  │ Service          │  │  │    ║
║  │  │  │              │  │              │  │                  │  │  │    ║
║  │  │  │ multi-project │  │ Depends()    │  │ POST /devices    │  │  │    ║
║  │  │  │ verify token  │  │ verify+find  │  │ upsert device    │  │  │    ║
║  │  │  │ get user info │  │ user lookup  │  │ FCM token mgmt   │  │  │    ║
║  │  │  └──────────────┘  └──────────────┘  └──────────────────┘  │  │    ║
║  │  └─────────────────────────────────────────────────────────────┘  │    ║
║  │                                                                    │    ║
║  │  [Existing Modules — unchanged]                                    │    ║
║  │  • Session Center  • Memory V3  • SSE Relay  • FS Proxy           │    ║
║  │  • Internal API (X-Internal-Token) — 保持不变                      │    ║
║  └────────────────────┬──────────────────────────────────────────────┘    ║
║                       │ Internal Token (不变)                             ║
║         ┌─────────────┼─────────────┐                                    ║
║         ▼             ▼             ▼                                    ║
║  ┌──────────┐  ┌──────────┐  ┌──────────┐                               ║
║  │ Realtime │  │ NanoClaw │  │ Redis    │                               ║
║  │ Agent    │  │ Agent    │  │          │                               ║
║  │ (不变)   │  │ (不变)   │  │ (不变)   │                               ║
║  └──────────┘  └──────────┘  └──────────┘                               ║
╚══════════════════════════════════════════════════════════════════════════╝
```

### 2.2 Key Design Decisions

| # | 决策 | 选择 | 理由 |
|---|------|------|------|
| D1 | Firebase SDK | `firebase-admin` + `asyncio.to_thread()` | 官方 SDK 处理所有安全边界，to_thread 解决异步兼容 |
| D2 | Auth Middleware | FastAPI `Depends()` | 与现有架构一致，路由级别控制 |
| D3 | User Lifecycle | First-request-create | 专门 API 创建用户，中间件只查询。职责清晰 |
| D4 | Device Registry | 独立 API + 登录强制上报 | 混合方案 (Phase 1)，后续加后台恢复 + 推送失败清理 |
| D5 | Cross-service Auth | 保留 `X-Internal-Token` | NanoClaw/Realtime 不需要知道 Firebase |
| D6 | User Primary Key | 独立 UUID (非 Firebase UID) | 内部引用不暴露第三方 ID，更安全 |
| D7 | 用户数据库 | 独立部署 | VI Agent 独立维护 User 记录 |

---

## 3. Data Models

### 3.1 User Model (修改)

```python
class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Firebase Identity (NEW — 替代 email/password)
    firebase_uid = Column(String(128), unique=True, nullable=False, index=True)
    package_name = Column(String(128), nullable=False, index=True)
    sign_in_provider = Column(String(50))       # google.com, apple.com
    firebase_info = Column(JSONB, default=dict)  # 完整 Firebase 用户元数据

    # VI Agent Identity (保留)
    vi_user_id = Column(String(64), unique=True, nullable=False, index=True)

    # Profile (从 Firebase 同步 + 用户自定义)
    display_name = Column(String(100))
    email = Column(String(255), index=True)      # nullable — 社交登录用户可能无 email
    photo_url = Column(String(500))
    phone_number = Column(String(20))
    language = Column(String(10), default="en")

    # App Info
    app_version = Column(String(20))

    # Status
    is_active = Column(Boolean, default=True)
    role = Column(String(20), default="user")     # user, admin

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_login = Column(DateTime(timezone=True))

    # Relationships
    sessions = relationship("Session", back_populates="user")
    memories = relationship("AgentMemory", back_populates="user")
    devices = relationship("Device", back_populates="user")
```

**字段变更 (vs 当前模型):**

| 操作 | 字段 | 说明 |
|------|------|------|
| `+` 新增 | `firebase_uid` | Firebase UID (unique, indexed) |
| `+` 新增 | `package_name` | App bundle identifier |
| `+` 新增 | `sign_in_provider` | 登录方式 (google.com, apple.com) |
| `+` 新增 | `firebase_info` | Firebase 用户完整元数据 (JSONB) |
| `+` 新增 | `photo_url` | 头像 URL (从 Firebase 同步) |
| `+` 新增 | `phone_number` | 手机号 |
| `+` 新增 | `language` | 用户语言偏好 |
| `+` 新增 | `app_version` | App 版本 |
| `+` 新增 | `role` | 用户角色 (user, admin) |
| `+` 新增 | `updated_at` | 更新时间戳 |
| `~` 修改 | `email` | 改为 nullable (社交登录用户可能无 email) |
| `-` 删除 | `password_hash` | 不再需要密码 |


### 3.2 Device Model (新增)

```python
class Device(Base):
    __tablename__ = "devices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                     nullable=False, index=True)

    # Device Identity
    device_id = Column(String(128), nullable=False)     # 客户端生成的设备标识
    package_name = Column(String(128), nullable=False)

    # Push Token (核心)
    device_token = Column(String(512))                  # FCM/APNs push token

    # Hardware IDs (用于设备识别 + 归因)
    gaid = Column(String(128))           # Google Advertising ID
    idfa = Column(String(128))           # iOS Advertising ID
    idfv = Column(String(128))           # iOS Vendor ID
    adjust_id = Column(String(128))      # Adjust attribution ID
    app_instance_id = Column(String(128))  # Firebase App Instance ID
    appsflyer_id = Column(String(128))   # AppsFlyer ID

    # App & Environment
    version = Column(String(20))         # App version
    store = Column(String(20))           # ios, android, play_store, app_store
    timezone = Column(Integer)           # UTC offset in minutes
    ip = Column(String(45))              # Client IP (IPv4/IPv6)
    user_agent = Column(String(500))     # User-Agent header

    # Status
    token_valid = Column(Boolean, default=True)         # 推送失败时标记 False

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="devices")

    __table_args__ = (
        UniqueConstraint("device_id", "package_name", name="uq_device_package"),
        Index("ix_device_user_id", "user_id"),
    )
```

**设计说明：**
- `token_valid`: Phase 2 推送失败时标记为 False

---

## 4. Component Specification

### 4.1 Firebase Manager Service

**职责**: 管理多 Firebase 项目的 Admin SDK 实例，提供异步 Token 验证。


```python
# api-server/app/services/firebase_manager.py

class FirebaseManager:
    """Multi-project Firebase Admin SDK manager.

    每个 package_name 对应一个独立的 Firebase App 实例。
    所有 Firebase Admin SDK 调用通过 asyncio.to_thread() 包装为异步。
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
        """注册一个 Firebase 项目。

        Args:
            package_name: App bundle ID (e.g. com.example.myapp.ios)
            project_id: Firebase project ID
            service_account_path: 服务账号 JSON 文件路径
            service_account_json: 服务账号 JSON 内容 (inline)
        """
        if service_account_path:
            cred = credentials.Certificate(service_account_path)
        elif service_account_json:
            cred = credentials.Certificate(service_account_json)
        else:
            cred = credentials.ApplicationDefault()

        app = initialize_app(cred, {"projectId": project_id}, name=package_name)
        self._apps[package_name] = app

    async def verify_id_token(self, package_name: str, id_token: str) -> dict:
        """验证 Firebase ID Token。

        Returns:
            Decoded token dict containing uid, email, sign_in_provider, etc.
        Raises:
            ValueError: Unknown package_name
            firebase_admin.auth.InvalidIdTokenError: Token invalid
            firebase_admin.auth.ExpiredIdTokenError: Token expired
            firebase_admin.auth.RevokedIdTokenError: Token revoked
        """
        app = self._apps.get(package_name)
        if not app:
            raise ValueError(f"Unknown Firebase project for package: {package_name}")

        return await asyncio.to_thread(auth.verify_id_token, id_token, app=app)

    async def get_user(self, package_name: str, uid: str) -> auth.UserRecord:
        """获取 Firebase 用户详细信息。"""
        app = self._apps.get(package_name)
        if not app:
            raise ValueError(f"Unknown Firebase project for package: {package_name}")

        return await asyncio.to_thread(auth.get_user, uid, app=app)

    async def create_custom_token(
        self, package_name: str, uid: str, claims: dict | None = None
    ) -> str:
        """生成 Firebase Custom Token (用于设备恢复, Phase 2)。"""
        app = self._apps.get(package_name)
        if not app:
            raise ValueError(f"Unknown Firebase project for package: {package_name}")

        token = await asyncio.to_thread(
            auth.create_custom_token, uid, developer_claims=claims, app=app
        )
        return token.decode("utf-8") if isinstance(token, bytes) else token
```

**接口说明:**

| 方法 | 异步 | 用途 |
|------|------|------|
| `register_project()` | 否 (启动时调用) | 注册 Firebase 项目 |
| `verify_id_token()` | 是 (to_thread) | 验证 ID Token |
| `get_user()` | 是 (to_thread) | 获取用户信息 |
| `create_custom_token()` | 是 (to_thread) | 生成自定义 Token |

### 4.2 Auth Dependency (Middleware)

**职责**: FastAPI Dependency，从请求 headers 提取 Firebase token 并验证。

```python
# api-server/app/deps.py

async def get_firebase_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Firebase Auth Dependency — 用于需要用户认证的路由。

    Required Headers:
        id-token: Firebase ID Token
        package-name: App bundle identifier

    Returns:
        Authenticated User object

    Raises:
        401: Missing/invalid token
        403: User disabled
        404: User not found (需要先 POST /api/auth/firebase)
    """
    id_token = request.headers.get("id-token")
    package_name = request.headers.get("package-name")

    if not id_token or not package_name:
        raise HTTPException(
            status_code=401,
            detail={"code": "missing_credentials", "message": "Missing id-token or package-name header"}
        )

    firebase_mgr: FirebaseManager = request.app.state.firebase_manager

    try:
        decoded = await firebase_mgr.verify_id_token(package_name, id_token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail={"code": "unknown_package", "message": str(e)})
    except auth.ExpiredIdTokenError:
        raise HTTPException(status_code=401, detail={"code": "token_expired", "message": "Firebase token expired"})
    except auth.RevokedIdTokenError:
        raise HTTPException(status_code=401, detail={"code": "token_revoked", "message": "Firebase token revoked"})
    except auth.InvalidIdTokenError:
        raise HTTPException(status_code=401, detail={"code": "invalid_token", "message": "Invalid Firebase token"})
    except Exception as e:
        raise HTTPException(status_code=503, detail={"code": "auth_service_error", "message": str(e)})

    firebase_uid = decoded["uid"]

    result = await db.execute(
        select(User).where(User.firebase_uid == firebase_uid)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail={"code": "user_not_found", "message": "User not registered"})
    if not user.is_active:
        raise HTTPException(status_code=403, detail={"code": "user_disabled", "message": "Account disabled"})

    return user


async def get_current_user_or_device(
    request: Request,
    vi_user_id: str | None = Query(None),
    x_internal_token: str | None = Header(None, alias="X-Internal-Token"),
    db: AsyncSession = Depends(get_db),
) -> User:
    """兼容层 — Firebase auth 优先，内部服务 token 次之，vi_user_id 兜底。

    Priority:
    1. Firebase auth (id-token + package-name headers)
    2. X-Internal-Token + vi_user_id query param (内部服务调用)
    3. vi_user_id query param alone (设备认证)
    """
    # 1. 尝试 Firebase auth
    id_token = request.headers.get("id-token")
    package_name = request.headers.get("package-name")

    if id_token and package_name:
        return await get_firebase_user(request, db)

    # 2. 内部服务: X-Internal-Token + vi_user_id
    if x_internal_token and vi_user_id:
        from .routes.internal import INTERNAL_API_TOKEN
        if x_internal_token == INTERNAL_API_TOKEN:
            result = await db.execute(select(User).where(User.vi_user_id == vi_user_id))
            user = result.scalar_one_or_none()
            if user is not None:
                return user

    # 3. 设备认证: vi_user_id query param
    if vi_user_id:
        result = await db.execute(select(User).where(User.vi_user_id == vi_user_id))
        user = result.scalar_one_or_none()
        if user is not None:
            return user

    raise HTTPException(status_code=401, detail="Authentication required")
```

### 4.3 Auth Routes


```python
# api-server/app/routes/auth.py (重写)

router = APIRouter()

@router.post("/firebase")
async def create_or_login_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """创建或获取 Firebase 用户 — Flutter App / React Web 登录后调用。

    Required Headers:
        id-token: Firebase ID Token
        package-name: App bundle identifier
        app-version: App version (e.g. "0.1.8+123")
        accept-language: User language preference

    Returns:
        User info + is_new_user flag
    """
    # 1. Extract headers
    id_token = request.headers.get("id-token")
    package_name = request.headers.get("package-name")
    app_version = request.headers.get("app-version", "")
    language = request.headers.get("accept-language", "en")[:10]

    if not id_token or not package_name:
        raise HTTPException(status_code=401, detail="Missing id-token or package-name")

    # 2. Verify Firebase token
    firebase_mgr: FirebaseManager = request.app.state.firebase_manager
    try:
        decoded = await firebase_mgr.verify_id_token(package_name, id_token)
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

    firebase_uid = decoded["uid"]
    sign_in_provider = decoded.get("firebase", {}).get("sign_in_provider", "unknown")

    # 3. Check existing user
    result = await db.execute(
        select(User).where(User.firebase_uid == firebase_uid)
    )
    user = result.scalar_one_or_none()
    is_new_user = user is None

    if is_new_user:
        # 4a. Create new user
        firebase_user = await firebase_mgr.get_user(package_name, firebase_uid)

        user = User(
            firebase_uid=firebase_uid,
            package_name=package_name,
            sign_in_provider=sign_in_provider,
            firebase_info={
                "display_name": firebase_user.display_name,
                "email": firebase_user.email,
                "photo_url": firebase_user.photo_url,
                "phone_number": firebase_user.phone_number,
                "email_verified": firebase_user.email_verified,
                "provider_data": [
                    {"provider_id": p.provider_id, "uid": p.uid}
                    for p in (firebase_user.provider_data or [])
                ],
            },
            vi_user_id=generate_vi_user_id(),  # vi-{uuid[:16]}
            display_name=firebase_user.display_name or "",
            email=firebase_user.email,
            photo_url=firebase_user.photo_url,
            phone_number=firebase_user.phone_number,
            language=language,
            app_version=app_version,
            last_login=datetime.now(timezone.utc),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    else:
        # 4b. Update existing user
        user.last_login = datetime.now(timezone.utc)
        user.app_version = app_version
        user.sign_in_provider = sign_in_provider
        await db.commit()

    return {
        "user_id": str(user.id),
        "vi_user_id": user.vi_user_id,
        "firebase_uid": user.firebase_uid,
        "display_name": user.display_name,
        "email": user.email,
        "photo_url": user.photo_url,
        "sign_in_provider": user.sign_in_provider,
        "language": user.language,
        "is_new_user": is_new_user,
    }


@router.get("/me")
async def get_me(user: User = Depends(get_firebase_user)):
    """获取当前用户信息。"""
    return {
        "user_id": str(user.id),
        "vi_user_id": user.vi_user_id,
        "firebase_uid": user.firebase_uid,
        "display_name": user.display_name,
        "email": user.email,
        "photo_url": user.photo_url,
        "sign_in_provider": user.sign_in_provider,
        "language": user.language,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }
```

### 4.4 Device Routes


```python
# api-server/app/routes/devices.py (新增)

router = APIRouter()

@router.post("")
async def report_device_info(
    request: Request,
    body: DeviceReportRequest,
    user: User = Depends(get_firebase_user),
    db: AsyncSession = Depends(get_db),
):
    """上报/更新设备信息。

    Upsert by (device_id, package_name):
    - 已存在 → 更新字段
    - 不存在 → 创建新记录
    """
    package_name = request.headers.get("package-name", user.package_name)

    # Determine IP
    ip = (
        request.headers.get("cf-connecting-ip")
        or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or request.client.host
    )

    # Determine user agent
    user_agent = body.user_agent or request.headers.get("user-agent", "")



    # Upsert
    result = await db.execute(
        select(Device).where(
            Device.device_id == body.device_id,
            Device.package_name == package_name,
        )
    )
    device = result.scalar_one_or_none()

    if device:
        # Update existing
        device.user_id = user.id
        device.device_token = body.device_token or device.device_token
        device.gaid = body.gaid or device.gaid
        device.idfa = body.idfa or device.idfa
        device.idfv = body.idfv or device.idfv
        device.adjust_id = body.adjust_id or device.adjust_id
        device.app_instance_id = body.app_instance_id or device.app_instance_id
        device.appsflyer_id = body.appsflyer_id or device.appsflyer_id
        device.version = body.version or device.version
        device.store = body.store or device.store
        device.timezone = body.timezone if body.timezone is not None else device.timezone
        device.ip = ip
        device.user_agent = user_agent

        device.token_valid = True  # 上报时重置为有效
    else:
        # Create new
        device = Device(
            user_id=user.id,
            device_id=body.device_id,
            package_name=package_name,
            device_token=body.device_token,
            gaid=body.gaid,
            idfa=body.idfa,
            idfv=body.idfv,
            adjust_id=body.adjust_id,
            app_instance_id=body.app_instance_id,
            appsflyer_id=body.appsflyer_id,
            version=body.version,
            store=body.store,
            timezone=body.timezone,
            ip=ip,
            user_agent=user_agent,

        )
        db.add(device)

    await db.commit()
    await db.refresh(device)

    return {
        "id": str(device.id),
        "device_id": device.device_id,
        "device_token": device.device_token[:20] + "..." if device.device_token else None,
        "updated": True,
    }


@router.get("")
async def list_devices(
    user: User = Depends(get_firebase_user),
    db: AsyncSession = Depends(get_db),
):
    """获取当前用户的所有设备。"""
    result = await db.execute(
        select(Device).where(Device.user_id == user.id).order_by(Device.updated_at.desc())
    )
    devices = result.scalars().all()

    return [
        {
            "id": str(d.id),
            "device_id": d.device_id,
            "store": d.store,
            "version": d.version,
            "has_push_token": bool(d.device_token),
            "token_valid": d.token_valid,
            "updated_at": d.updated_at.isoformat() if d.updated_at else None,
        }
        for d in devices
    ]
```

**Request Schema:**

```python
class DeviceReportRequest(BaseModel):
    device_id: str                          # required
    device_token: str | None = None         # FCM/APNs token
    gaid: str | None = None                 # Google Advertising ID
    idfa: str | None = None                 # iOS Advertising ID
    idfv: str | None = None                 # iOS Vendor ID
    adjust_id: str | None = None            # Adjust ID
    app_instance_id: str | None = None      # Firebase App Instance ID
    appsflyer_id: str | None = None         # AppsFlyer ID
    version: str | None = None              # App version
    store: str | None = None                # ios | android
    timezone: int | None = None             # UTC offset minutes
    user_agent: str | None = None           # User-Agent
```

### 4.5 App Initialization

```python
# api-server/app/main.py (修改)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Database
    await init_db()

    # Firebase Manager (NEW)
    if settings.FIREBASE_ENABLED:
        firebase_mgr = FirebaseManager()
        for project_config in parse_firebase_projects(settings.FIREBASE_PROJECTS):
            firebase_mgr.register_project(
                package_name=project_config["package_name"],
                project_id=project_config["project_id"],
                service_account_path=project_config.get("service_account_path"),
            )
        app.state.firebase_manager = firebase_mgr
        logger.info(f"Firebase initialized with {len(firebase_mgr._apps)} project(s)")
    else:
        logger.warning("Firebase disabled — auth endpoints will not work")

    # Redis (unchanged)
    # ...existing code...

    try:
        yield
    finally:
        # ...existing cleanup...
        pass


def parse_firebase_projects(config_str: str) -> list[dict]:
    """Parse FIREBASE_PROJECTS env var.

    Format: "package:project_id:sa_path,package2:project_id2:sa_path2"
    Example: "<package_name>:<project_id>:<service_account_path>"
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


# Route registration (修改)
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(devices_router, prefix="/api/devices", tags=["devices"])  # NEW
# ...existing routers unchanged...
```

### 4.6 Configuration

```bash
# .env 新增

# Firebase Authentication
FIREBASE_ENABLED=true
# 格式: <package_name>:<project_id>:<service_account_json_path>
# 多项目用逗号分隔
FIREBASE_PROJECTS=<package_name>:<project_id>:./configs/<service_account_file>.json

# JWT_SECRET 保留 — token_center AES 密钥派生仍在使用
JWT_SECRET=xxx
# 已移除: JWT_ALGORITHM, JWT_EXPIRE_MINUTES (不再使用 PyJWT)
```

**获取方式:**
1. **project_id**: [Firebase Console](https://console.firebase.google.com/) → 项目设置 → 常规 → 项目 ID
2. **service_account_json**: Firebase Console → 项目设置 → 服务帐号 → 生成新的私钥 → 下载 JSON 文件放入 `configs/` 目录
3. **package_name**: Firebase Console → 项目设置 → 您的应用 → 应用 ID / 软件包名称

```yaml
# docker-compose.yml 修改 (api-server service)
services:
  api-server:
    # ...existing config...
    volumes:
      - ./configs/<service_account_file>.json:/app/configs/<service_account_file>.json:ro
    environment:
      - FIREBASE_ENABLED=true
      - FIREBASE_PROJECTS=${FIREBASE_PROJECTS}
```

---

## 5. Auth Flow — Complete Sequence Diagram

```
┌─────────┐     ┌────────────┐     ┌──────────┐     ┌──────────┐
│ Flutter  │     │  Firebase   │     │API Server│     │PostgreSQL│
│   App    │     │   Cloud     │     │ (FastAPI)│     │          │
└────┬─────┘     └─────┬──────┘     └────┬─────┘     └────┬─────┘
     │                 │                  │                 │
     │ ═══ REGISTRATION / LOGIN ═══      │                 │
     │                 │                  │                 │
     │  1. signInWithGoogle()             │                 │
     │────────────────►│                  │                 │
     │                 │                  │                 │
     │  2. ID Token (JWT, 1h TTL)        │                 │
     │◄────────────────│                  │                 │
     │                 │                  │                 │
     │  3. POST /api/auth/firebase        │                 │
     │  Headers:                          │                 │
     │    id-token: eyJhbG...             │                 │
     │    package-name: <package_name>     │                 │
     │    app-version: 1.0.0              │                 │
     │    accept-language: zh             │                 │
     │───────────────────────────────────►│                 │
     │                 │                  │                 │
     │                 │ 4. verify_id_token()               │
     │                 │◄─────────────────│                 │
     │                 │                  │                 │
     │                 │ 5. decoded claims│                 │
     │                 │─────────────────►│                 │
     │                 │                  │                 │
     │                 │                  │ 6. SELECT user   │
     │                 │                  │────────────────►│
     │                 │                  │                 │
     │                 │                  │ 7. user / null   │
     │                 │                  │◄────────────────│
     │                 │                  │                 │
     │                 │ 8. get_user()    │ (if new user)   │
     │                 │◄─────────────────│                 │
     │                 │                  │                 │
     │                 │ 9. UserRecord    │                 │
     │                 │─────────────────►│                 │
     │                 │                  │                 │
     │                 │                  │ 10. INSERT user  │
     │                 │                  │────────────────►│
     │                 │                  │◄────────────────│
     │                 │                  │                 │
     │  11. {vi_user_id, is_new_user: true, ...}            │
     │◄───────────────────────────────────│                 │
     │                 │                  │                 │
     │ ═══ DEVICE REGISTRATION ═══       │                 │
     │                 │                  │                 │
     │  12. POST /api/devices             │                 │
     │  Headers: id-token, package-name   │                 │
     │  Body: {device_id, device_token,   │                 │
     │         gaid, idfv, store, ...}    │                 │
     │───────────────────────────────────►│                 │
     │                 │                  │                 │
     │                 │  13. verify      │                 │
     │                 │  + UPSERT device │                 │
     │                 │                  │────────────────►│
     │                 │                  │◄────────────────│
     │                 │                  │                 │
     │  14. {device_id, updated: true}    │                 │
     │◄───────────────────────────────────│                 │
     │                 │                  │                 │
     │ ═══ SUBSEQUENT REQUESTS ═══       │                 │
     │                 │                  │                 │
     │  GET /api/users/sessions           │                 │
     │  Headers: id-token, package-name   │                 │
     │───────────────────────────────────►│                 │
     │                 │  verify + lookup │                 │
     │                 │◄─────────────────│                 │
     │                 │─────────────────►│                 │
     │                 │                  │ query sessions  │
     │                 │                  │────────────────►│
     │  Response                          │◄────────────────│
     │◄───────────────────────────────────│                 │
```

---

## 6. Device Token Lifecycle

### 6.1 Phase 1 策略 (MVP)

```
Device Token 上报触发点:

1. 首次登录/注册                ← 强制上报 (POST /api/auth/firebase 后立即调用)
2. onTokenRefresh callback     ← Flutter FCM SDK 回调 (token 变化时自动触发)
3. App 冷启动                  ← App 每次打开时检查并上报

Flutter 客户端伪代码:
```

```dart
// Flutter — Firebase Auth + Device Token reporting

class AuthService {
  final ApiClient _api;

  Future<void> loginAndRegisterDevice() async {
    // 1. Firebase login
    final userCredential = await FirebaseAuth.instance.signInWithGoogle();
    final idToken = await userCredential.user!.getIdToken();

    // 2. Register/login on API Server
    final response = await _api.post('/api/auth/firebase', headers: {
      'id-token': idToken,
      'package-name': packageInfo.packageName,
      'app-version': packageInfo.version,
      'accept-language': Platform.localeName,
    });

    // 3. 立即上报设备信息 (强制)
    await _reportDeviceInfo(idToken);
  }

  Future<void> _reportDeviceInfo(String idToken) async {
    final fcmToken = await FirebaseMessaging.instance.getToken();
    final deviceInfo = DeviceInfoPlugin();

    await _api.post('/api/devices', headers: {
      'id-token': idToken,
      'package-name': packageInfo.packageName,
    }, body: {
      'device_id': await _getDeviceId(),
      'device_token': fcmToken,
      'idfv': (await deviceInfo.iosInfo)?.identifierForVendor,
      'store': Platform.isIOS ? 'ios' : 'android',
      'version': packageInfo.version,
      'timezone': DateTime.now().timeZoneOffset.inMinutes,
    });
  }

  void _setupTokenRefreshListener() {
    // FCM token 变化时自动上报
    FirebaseMessaging.instance.onTokenRefresh.listen((newToken) async {
      final idToken = await FirebaseAuth.instance.currentUser?.getIdToken();
      if (idToken != null) {
        await _api.post('/api/devices', headers: {
          'id-token': idToken,
          'package-name': packageInfo.packageName,
        }, body: {
          'device_id': await _getDeviceId(),
          'device_token': newToken,
        });
      }
    });
  }
}
```

### 6.2 Phase 2 策略 (增强)

```
Phase 2 新增:

4. App 从后台恢复              ← AppLifecycleState.resumed 时检查 token
5. 推送失败反向清理             ← FCM 返回 InvalidRegistration 时标记 token_valid=false
6. 定期校验 (可选)             ← 服务端 cron job 每 24h 用 FCM dry-run 验证 token

服务端推送失败处理:
  try:
      send_push(device.device_token, payload)
  except InvalidRegistration:
      device.token_valid = False
      device.save()
  except NotRegistered:
      device.delete()
```

---

## 7. Database Migration Plan

### 7.1 Migration 1: Add Firebase columns to users

```sql
-- alembic: add_firebase_auth_columns

ALTER TABLE users ADD COLUMN firebase_uid VARCHAR(128);
ALTER TABLE users ADD COLUMN package_name VARCHAR(128);
ALTER TABLE users ADD COLUMN sign_in_provider VARCHAR(50);
ALTER TABLE users ADD COLUMN firebase_info JSONB DEFAULT '{}';
ALTER TABLE users ADD COLUMN photo_url VARCHAR(500);
ALTER TABLE users ADD COLUMN phone_number VARCHAR(20);
ALTER TABLE users ADD COLUMN language VARCHAR(10) DEFAULT 'en';
ALTER TABLE users ADD COLUMN app_version VARCHAR(20);
ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user';
ALTER TABLE users ADD COLUMN updated_at TIMESTAMPTZ;

-- email 改为 nullable (社交登录用户可能无 email)
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- 索引
CREATE UNIQUE INDEX ix_users_firebase_uid ON users (firebase_uid);
CREATE INDEX ix_users_package_name ON users (package_name);
```

### 7.2 Migration 2: Create devices table

```sql
-- alembic: create_devices_table

CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(128) NOT NULL,
    package_name VARCHAR(128) NOT NULL,
    device_token VARCHAR(512),
    gaid VARCHAR(128),
    idfa VARCHAR(128),
    idfv VARCHAR(128),
    adjust_id VARCHAR(128),
    app_instance_id VARCHAR(128),
    appsflyer_id VARCHAR(128),
    version VARCHAR(20),
    store VARCHAR(20),
    timezone INTEGER,
    ip VARCHAR(45),
    user_agent VARCHAR(500),

    token_valid BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ,
    CONSTRAINT uq_device_package UNIQUE (device_id, package_name)
);

CREATE INDEX ix_device_user_id ON devices (user_id);
```

### 7.3 Migration 3: Remove legacy auth columns

```sql
-- v5_drop_password_hash
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
```

无老用户迁移负担，直接删除。同步清理 `token_service.py`、`get_current_user()` JWT 依赖、`hash_password/verify_password`、`PyJWT`、`passlib`、`bcrypt` 依赖。

---

## 8. API Endpoint Summary

### 8.1 新增/修改端点

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| POST | `/api/auth/firebase` | id-token header | 创建/获取用户 |
| GET | `/api/auth/me` | Firebase | 当前用户信息 |
| POST | `/api/devices` | Firebase | 上报设备信息 |
| GET | `/api/devices` | Firebase | 用户设备列表 |
| DELETE | `/api/devices/{device_id}` | Firebase | 删除设备 |

### 8.2 移除端点

| Method | Path | 原因 |
|--------|------|------|
| POST | `/api/auth/signup` | 替换为 Firebase 注册 |
| POST | `/api/auth/login` | 替换为 Firebase 登录 |
| POST | `/api/livekit/anonymous` | 移除，不再支持匿名模式 |

### 8.3 不变端点 (auth dependency 切换)

| Method | Path | Auth 变更 |
|--------|------|----------|
| GET | `/api/users/sessions` | JWT → Firebase |
| DELETE | `/api/users/sessions/{id}` | JWT → Firebase |
| GET/PUT/DELETE | `/api/users/memories/*` | JWT → Firebase |
| GET | `/api/users/events` | JWT → Firebase |
| POST | `/api/livekit/token` | JWT → Firebase |
| POST | `/api/upload/presign` | JWT → Firebase |

### 8.4 完全不变端点

| Method | Path | Auth |
|--------|------|------|
| ALL | `/api/internal/*` | X-Internal-Token (不变) |
| GET | `/health` | 无 (不变) |
| GET | `/api/config` | 无 (不变) |

---

## 9. Error Handling

### 9.1 错误码矩阵

| 场景 | HTTP | Code | Message |
|------|------|------|---------|
| 缺少 id-token header | 401 | `missing_credentials` | Missing id-token or package-name header |
| Firebase token 过期 | 401 | `token_expired` | Firebase token expired |
| Firebase token 签名无效 | 401 | `invalid_token` | Invalid Firebase token |
| Firebase token 被撤销 | 401 | `token_revoked` | Firebase token revoked |
| 未知 package_name | 401 | `unknown_package` | Unknown Firebase project for package |
| 用户未注册 | 404 | `user_not_found` | User not registered |
| 用户被禁用 | 403 | `user_disabled` | Account disabled |
| Firebase 服务不可用 | 503 | `auth_service_error` | Firebase service temporarily unavailable |

### 9.2 错误响应格式

```json
{
  "detail": {
    "code": "token_expired",
    "message": "Firebase token expired"
  }
}
```

---

## 10. Impact Analysis

### 10.1 需要修改的文件

| 文件 | 改动 |
|------|------|
| `api-server/app/models.py` | User 模型扩展 + Device 模型新增 |
| `api-server/app/deps.py` | 认证依赖替换为 Firebase |
| `api-server/app/routes/auth.py` | 重写认证路由 |
| `api-server/app/config.py` | 增加 Firebase 配置 |
| `api-server/app/main.py` | 初始化 Firebase Manager + 注册 devices 路由 |
| `api-server/requirements.txt` | + `firebase-admin` |
| `api-server/app/routes/livekit.py` | auth dependency 切换 |
| `api-server/app/routes/users.py` | auth dependency 切换 |
| `api-server/app/routes/memory.py` | auth dependency 切换 |
| `api-server/app/routes/events.py` | auth dependency 切换 |
| `frontend/src/services/api.js` | auth headers 切换为 Firebase |
| `frontend/src/hooks/useAuth.js` | 重写为 Firebase auth state |
| `frontend/src/hooks/useRoomConnection.js` | token 获取方式修改 |

### 10.2 需要新增的文件

| 文件 | 内容 |
|------|------|
| `api-server/app/services/firebase_manager.py` | Firebase Multi-project Manager |
| `api-server/app/routes/devices.py` | Device 上报路由 |
| `api-server/alembic/versions/xxx_add_firebase_auth.py` | Migration 1 |
| `api-server/alembic/versions/xxx_create_devices.py` | Migration 2 |
| `frontend/src/services/firebase.js` | Firebase SDK 初始化 + auth |

### 10.3 NanoClaw 动态 userId 适配

Firebase Auth 引入后，用户 ID 不再是静态的 `config.userId` (env `USER_ID`)，而是由 Firebase 登录动态生成（如 `vi-f59bcfeff6fb4282`）。NanoClaw 需要适配：

| 文件 | 变更 | 说明 |
|------|------|------|
| `nanoclaw/src/channels/active-users.ts` | 新增 | 跟踪活跃用户 ID（10 分钟过期） |
| `nanoclaw/src/channels/exec-handler.ts` | 修改 | 添加 `trackUser()` 调用 |
| `nanoclaw/src/channels/frames-consumer.ts` | 重写 | SUBSCRIBE → PSUBSCRIBE `vi:frames:*`，按用户存储帧 |
| `nanoclaw/src/channels/media-consumer.ts` | 重写 | SUBSCRIBE → PSUBSCRIBE `vi:media:*`，按用户 debounce |
| `nanoclaw/src/channels/actions-consumer.ts` | 重写 | `pollActions(userId)` 接受动态参数 |
| `nanoclaw/src/context/context-compiler.ts` | 重写 | 遍历活跃用户列表编译上下文 |
| `nanoclaw/src/fs/cloud-sync.ts` | 修改 | `apiUrl(path, userId)` + `syncToCloud(files, userId)` 接受动态参数 |
| `nanoclaw/src/executor/task-executor.ts` | 修改 | 从 `requestContext` 取 userId 传给 `syncToCloud` |

关键设计决策：
- `exec-handler` 已使用 PSUBSCRIBE `vi:exec:*`，无需修改订阅逻辑
- `frames-consumer` / `media-consumer` 从 SUBSCRIBE 单用户 channel 改为 PSUBSCRIBE 通配
- `active-users` 模块作为用户发现机制：任何 channel 收到消息时记录 userId
- `context-compiler` 每 30s tick 遍历所有活跃用户，不再依赖 `config.userId`
- `config.userId` 仅用作无活跃用户时的 fallback 默认值
- **pmessage handler channel prefix guard**: 多个 PSUBSCRIBE 共享同一 Redis subscriber 时，`pmessage` 事件会触发所有 handler。每个 handler 必须检查 channel 前缀 (`ch.startsWith('vi:exec:')` / `vi:frames:` / `vi:media:`) 以避免跨 handler 误处理
- **启动时 syncFromCloud**: 无 `USER_ID` 环境变量时跳过，等待动态用户登录后按需同步

配置变更：
- 移除 `docker-compose.yml` 中的 `USER_ID` 和 `VITE_DEFAULT_USER_ID` 环境变量（所有 deploy 模板同步移除）
- 移除 `frontend/Dockerfile` 中的 `ARG VITE_DEFAULT_USER_ID`
- 前端 `App.jsx` SSE 连接延迟到 Firebase auth 完成后建立，避免未认证时 401

### 10.4 完全不变

| 模块 | 说明 |
|------|------|
| `api-server/app/routes/internal.py` | 内部 API 保持 X-Internal-Token |
| `api-server/app/services/session_center.py` | Session 逻辑不变 |
| `api-server/app/services/memory_center.py` | Memory 逻辑不变 |
| `api-server/app/services/events.py` | Event 逻辑不变 |
| `realtime/*` | Realtime Agent 完全不变 |
| `gateway/*` | Gateway 完全不变 |

---

## 11. Risk Register

| # | 风险 | 可能性 | 影响 | 缓解措施 |
|---|------|--------|------|---------|
| R1 | firebase-admin SDK 阻塞事件循环 | 低 | 高 | `asyncio.to_thread()` 隔离 |
| R2 | Firebase 服务暂时不可用 | 低 | 高 | 返回 503，客户端指数退避重试 |
| R3 | 服务账号密钥泄露 | 低 | 极高 | Docker volume 只读挂载，不提交到 git |
| R4 | 匿名用户升级后数据丢失 | 中 | 中 | Firebase UID 不变，用户记录自动关联 |
| R5 | 数据库迁移失败 | 低 | 高 | 分步迁移，每步可回滚，先加列再改约束 |

---

## 12. Implementation Roadmap

### Phase 1: Firebase Auth + Device (MVP)

```
Sprint 1 — Backend 核心认证:
  ☐ 新增 firebase-admin 依赖
  ☐ 实现 FirebaseManager (multi-project)
  ☐ 实现 get_firebase_user dependency
  ☐ 重写 /api/auth/firebase endpoint
  ☐ 重写 /api/auth/me endpoint
  ☐ Database migration: users 表加 Firebase 列
  ☐ 切换现有路由的 auth dependency
  ☐ 移除 get_current_user (JWT bearer) dependency
  ☐ 移除 token_service.py + PyJWT/passlib/bcrypt 依赖
  ☐ 单元测试 + 集成测试

Sprint 2 — Backend 设备管理:
  ☐ 实现 Device model
  ☐ Database migration: 创建 devices 表
  ☐ 实现 POST/GET/DELETE /api/devices
  ☐ 单元测试 + 集成测试

Sprint 3 — React Web 前端 Firebase 集成:
  ☐ 安装 firebase npm 包
  ☐ 创建 src/services/firebase.js (初始化 + auth 方法)
  ☐ 修改 src/services/api.js (auth headers 切换)
  ☐ 重写 src/hooks/useAuth.js (Firebase onAuthStateChanged)
  ☐ 修改 src/hooks/useRoomConnection.js (token 获取)
  ☐ 添加 Google Sign-In 按钮
  ☐ 新增 LoginPage.jsx — 未登录时显示登录页
  ☐ 配置 .env Firebase 变量

Sprint 4 — NanoClaw 动态 userId 适配:
  ☐ 新增 active-users.ts — 活跃用户追踪
  ☐ Redis channels 改为 PSUBSCRIBE 通配符模式 (vi:frames:*, vi:media:*, vi:exec:*)
  ☐ context-compiler 遍历活跃用户编译上下文
  ☐ cloud-sync / task-executor 接受动态 userId 参数
  ☐ 移除静态 USER_ID / VITE_DEFAULT_USER_ID 配置

Sprint 5 — 验收 + 清理:
  ☐ 端到端测试
  ☐ 移除旧的 email/password 路由 + UI
  ☐ 移除 password_hash 列 (v5_drop_password_hash migration)
  ☐ 更新 .env.example, docker-compose.yml
```

### Phase 2: 增强 (后续)

```
  ☐ Device Recovery API (POST /api/auth/recover — 通过硬件标识恢复账号)
  ☐ 推送失败 token 清理 (FCM dry-run 验证)
  ☐ App 后台恢复时 device token 刷新
  ☐ API Key 系统
  ☐ 用户 balance + tier 系统
```

---

## 13. React Web Frontend — Firebase Integration

### 13.1 Current State

当前 React Web 前端使用 **JWT token + Device ID** 双模认证：

```
认证模式:  Authorization: Bearer {jwt}  → /api/auth/login, /api/auth/signup
存储:      sessionStorage (token)  +  localStorage (device_id, vi_user_id)
UI:        无登录页面 — camera-first 设计
```

### 13.2 目标状态

```
Firebase 认证:  id-token + package-name headers → /api/auth/firebase
存储:          Firebase SDK 管理 token + localStorage (device_id, vi_user_id)
UI:            登录页面 — Google/Apple Sign-In 按钮
```

### 13.3 变更清单

| 文件 | 变更 |
|------|------|
| `package.json` | + `firebase` SDK |
| `src/services/firebase.js` | **新增** — Firebase 初始化 + auth 方法 |
| `src/services/api.js` | 修改 — auth headers 切换为 Firebase |
| `src/hooks/useAuth.js` | 重写 — 使用 Firebase auth state |
| `src/hooks/useRoomConnection.js` | 修改 — token 获取方式 |
| `.env` | 添加 Firebase config |

### 13.4 Firebase 初始化

```javascript
// src/services/firebase.js (新增)

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// FCM for Web Push
let messaging = null;
try {
  messaging = getMessaging(app);
} catch (e) {
  console.warn('FCM not supported in this browser');
}

// Google Provider
const googleProvider = new GoogleAuthProvider();

export {
  auth,
  messaging,
  googleProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  getToken as getFcmToken,
  onMessage,
};
```

### 13.5 API Client 修改

```javascript
// src/services/api.js — 关键修改

class ApiClient {
  constructor() {
    // ... existing setup ...
    this.packageName = import.meta.env.VITE_FIREBASE_PACKAGE_NAME;  // Web 端的 package name
  }

  async request(path, options = {}, { retries = 2, backoff = 500 } = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Firebase Auth: 获取当前用户的 ID Token
    const { auth } = await import('./firebase.js');
    const currentUser = auth.currentUser;

    if (currentUser) {
      const idToken = await currentUser.getIdToken();  // 自动处理过期刷新
      headers['id-token'] = idToken;
      headers['package-name'] = this.packageName;
    } else {
      // Fallback: Device ID (向后兼容，用于完全未登录的边缘情况)
      headers['X-Device-Id'] = this.getDeviceId();
    }

    // ... rest of request logic unchanged ...
  }

  // 移除: login(), signup() 方法
  // 保留: getMe(), getSessions(), listMemory(), etc.

  // 新增: 设备上报
  async reportDevice(deviceInfo) {
    return this.request('/api/devices', {
      method: 'POST',
      body: JSON.stringify(deviceInfo),
    });
  }
}
```

**关键变化:**
- `Authorization: Bearer {jwt}` → `id-token` + `package-name` headers
- Firebase SDK 自动管理 token 刷新 (无需手动处理 401→relogin)
- 移除 sessionStorage 中的 token 管理 (Firebase SDK 内部管理)

### 13.6 Auth Hook 重写

```javascript
// src/hooks/useAuth.js (重写)

import { useState, useEffect, useCallback } from 'react';
import {
  auth,
  googleProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from '../services/firebase';
import api from '../services/api';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Firebase auth state listener — 核心变化
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // 在 API Server 注册/获取用户
          const idToken = await firebaseUser.getIdToken();
          const response = await fetch(`${api.apiUrl}/api/auth/firebase`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'id-token': idToken,
              'package-name': api.packageName,
              'app-version': import.meta.env.VITE_APP_VERSION || '1.0.0',
              'accept-language': navigator.language,
            },
          });

          if (response.ok) {
            const data = await response.json();
            setUser({
              ...data,
              firebaseUser,
            });
            api.setViUserId(data.vi_user_id);

            // 上报设备信息 (Web 端)
            await reportWebDevice(idToken);
          }
        } catch (e) {
          console.error('Failed to sync with API server:', e);
          setError(e.message);
        }
      } else {
        setUser(null);
        api.setViUserId(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = useCallback(async () => {
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      // onAuthStateChanged 会自动触发用户同步
    } catch (e) {
      setError(e.message);
    }
  }, []);
    loginWithGoogle,
    logout,
  };
}

async function reportWebDevice(idToken) {
  try {
    const deviceId = api.getDeviceId();
    await api.reportDevice({
      device_id: deviceId,
      device_token: null,  // Web Push token 通过 FCM 单独处理
      store: 'web',
      version: import.meta.env.VITE_APP_VERSION || '1.0.0',
      timezone: new Date().getTimezoneOffset() * -1,
      user_agent: navigator.userAgent,
    });
  } catch (e) {
    console.warn('Device report failed:', e);
  }
}
```

### 13.7 LiveKit Connection 修改

```javascript
// src/hooks/useRoomConnection.js — 关键修改

// 之前: 区分 authenticated 和 anonymous 两条路径
// 之后: 统一走 Firebase auth，必须登录

async function getToken() {
  const { auth } = await import('../services/firebase.js');
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error('User must be logged in');
  }

  // 认证用户 → /api/livekit/token (Firebase auth)
  return await api.getLiveKitToken();
}
```

### 13.8 Web Push (FCM) — Optional

```javascript
// Web Push Token 上报 (可选, Phase 2)
// Web Push 和移动端 FCM 使用不同的 token 格式

async function requestWebPushPermission() {
  if (!messaging) return null;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    const token = await getFcmToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    });

    // 上报 Web Push token
    await api.reportDevice({
      device_id: api.getDeviceId(),
      device_token: token,
      store: 'web',
    });

    return token;
  } catch (e) {
    console.warn('Web Push setup failed:', e);
    return null;
  }
}
```

### 13.9 环境变量

```bash
# frontend/.env 新增

# Firebase Web SDK Config
# 获取方式: Firebase Console → 项目设置 → 您的应用 → 添加 Web 应用 → 复制 firebaseConfig
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_PACKAGE_NAME=         # Web 端的 package name，用于 API 请求 header
VITE_FIREBASE_VAPID_KEY=            # 可选, Web Push 用。获取方式: Firebase Console → 项目设置 → Cloud Messaging → Web Push 证书
VITE_APP_VERSION=1.0.0
```

### 13.10 API Server 适配 — Web package-name

API Server 需要为 React Web 注册对应的 package_name。iOS 和 Web 可共用同一个 Firebase 项目和 service account，但使用不同的 package_name 来区分平台：

```bash
# .env — 多平台配置示例 (逗号分隔)
FIREBASE_PROJECTS=<ios_package_name>:<project_id>:<sa_path>,<web_package_name>:<project_id>:<sa_path>
```

**注意**: Firebase Admin SDK 验证 ID Token 时不区分平台 — 它只验证 token 是否由该项目签发。因此多个 package_name 可以指向同一个 Firebase App 实例。

简化方案: 如果不需要区分平台，可以让 Web 和 iOS 使用相同的 package_name。

### 13.11 登录要求

迁移到 Firebase 后，用户必须通过 Google 或 Apple 登录才能使用系统。不再支持匿名模式。

```
之前:  打开 App → X-Device-Id → /api/livekit/anonymous → 获得 vi_user_id
之后:  打开 App → 登录页 → Google/Apple Sign-In → Firebase → /api/auth/firebase → 获得 vi_user_id
```

### 13.12 前端实施路线图

```
Sprint 1 (Firebase SDK 集成):
  ☐ 安装 firebase npm 包
  ☐ 创建 src/services/firebase.js
  ☐ 配置 .env Firebase 变量
  ☐ 修改 api.js 的 auth headers

Sprint 2 (Auth 流程重写):
  ☐ 重写 useAuth.js (Firebase onAuthStateChanged)
  ☐ 修改 useRoomConnection.js (token 获取)
  ☐ 添加 Google Sign-In 按钮 (Profile 页)
  ☐ 实现自动匿名登录

Sprint 3 (设备上报 + 清理):
  ☐ 实现 Web 设备上报
  ☐ 移除旧的 login/signup UI 和 API 调用
  ☐ 移除 sessionStorage token 管理
  ☐ 端到端测试
```

---

## Appendix A: Rejected Alternatives

### A1. 手动 JWT 验证 (google-auth 库)

**方案**: 不用 firebase-admin，直接用 google-auth 验证 Firebase JWT 签名。

**拒绝原因**: Firebase JWT 验证不只是签名验证——还包括 email_verified check、token revocation check、custom claims 处理、Google 公钥 rotation 缓存。手动实现容易遗漏安全边界，对于认证模块不值得冒这个风险。

### A2. 全局 Starlette Middleware

**方案**: 用 Starlette Middleware 拦截所有请求，白名单放行公开路由。

**拒绝原因**: V4 有 `/api/internal/*` 使用 X-Internal-Token、`/health` 无需认证。维护白名单容易出错且不直观。FastAPI Dependency 更明确、更安全。

### A3. Firebase Token 透传到内部服务

**方案**: NanoClaw/Realtime 转发用户的 Firebase token 调用 API Server。

**拒绝原因**:
- NanoClaw 容器需要额外安装 Firebase SDK（增加镜像大小和复杂度）
- Firebase token 有效期 1 小时，长时间运行的 NanoClaw 任务可能 token 过期
- 现有 X-Internal-Token 简单可靠，在内部网络中完全够用

### A4. 每次请求携带 Device Token

**方案**: 每个 API 请求 header 里带 device_token，服务端比对变化时更新。

**拒绝原因**: FCM token ~160 bytes，99.9% 的请求 token 未变化。Header 膨胀 + 每次请求多一次 DB/Redis 查询，收益远小于开销。客户端主动上报 + 登录强制上报已覆盖绝大多数场景。

