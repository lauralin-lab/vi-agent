# Invite Code System — Design Document

> Version: 1.4
> Date: 2026-03-10
> Status: Implemented

---

## 1. Executive Summary

邀请码系统为 VI Agent 提供用户增长控制能力。通过邀请码机制，实现：
- **默认关闭**：邀请码为可选，用于追踪推荐关系
- **需要时开启**：通过数据库 settings 表设置 `invite_required=true`，强制新用户提供邀请码
- **邀请码管理**：通过内部 API（curl 触发）创建邀请码，无需管理后台

系统采用「**先登录，后补码**」策略——登录按钮始终可见，已有用户直接登录不受影响。新用户首次登录时后端返回 403，前端随即显示邀请码输入框，验证通过后自动重新登录完成注册。

---

## 2. Key Decisions Log

| # | 决策 | 选择 | 理由 |
|---|------|------|------|
| 1 | 邀请码是否必须 | 默认关闭，需要时通过数据库开启 | 灵活控制，运行时可切换 |
| 2 | 邀请码格式 | 可自定义 + 随机生成 | 支持 `WELCOME2024` 类营销码和随机码 |
| 3 | 有效期 | `expires_at` 可为 NULL（永不过期） | 最灵活 |
| 4 | 使用次数 | `max_uses` 可为 NULL（无限次） | 最灵活 |
| 5 | 用户表改动 | 不改动，关系存在 `invite_records` 表 | 避免冗余 |
| 6 | 前端入口 | 输入框，不是 URL 链接 | 用户手动输入邀请码 |
| 7 | 客户端范围 | Web 先行，App 后续（接口通用） | 后端接口不区分客户端 |
| 8 | 创建方式 | 已登录用户 API | 所有用户均可创建邀请码，前端暂不放开入口 |
| 9 | 注册时自动生成用户专属码 | 不自动生成 | 前期简单，后续管理后台再加 |
| 10 | 校验时机 | 先登录 → 403 后补码 → 重新登录 | 不阻塞已有用户 + 安全 |

---

## 3. Database Design

### 3.1 `invite_codes` 表

```sql
CREATE TABLE invite_codes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(32) NOT NULL UNIQUE,
    creator_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    max_uses        INTEGER,                    -- NULL = 无限次
    used_count      INTEGER NOT NULL DEFAULT 0,
    expires_at      TIMESTAMPTZ,                -- NULL = 永不过期
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    note            VARCHAR(255),               -- 管理备注
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_invite_codes_code ON invite_codes(code);
CREATE INDEX ix_invite_codes_creator_id ON invite_codes(creator_id);
```

**字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `code` | VARCHAR(32) UNIQUE | 邀请码，支持自定义（如 `WELCOME2024`）或系统随机生成（8 位字母数字） |
| `creator_id` | UUID FK → users | 创建者，NULL 表示系统生成 |
| `max_uses` | INTEGER NULL | 最大使用次数，NULL = 无限 |
| `used_count` | INTEGER | 已使用次数，每次消费 +1 |
| `expires_at` | TIMESTAMPTZ NULL | 过期时间，NULL = 永不过期 |
| `is_active` | BOOLEAN | 手动停用开关，管理后台可随时禁用 |
| `note` | VARCHAR(255) | 管理备注，如"给 XX 活动的码" |

### 3.2 `invite_records` 表

```sql
CREATE TABLE invite_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invite_code_id  UUID NOT NULL REFERENCES invite_codes(id) ON DELETE CASCADE,
    inviter_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    invitee_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_invite_records_invite_code_id ON invite_records(invite_code_id);
CREATE INDEX ix_invite_records_inviter_id ON invite_records(inviter_id);
CREATE INDEX ix_invite_records_invitee_id ON invite_records(invitee_id);
```

**字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `invite_code_id` | UUID FK → invite_codes | 使用了哪个邀请码 |
| `inviter_id` | UUID FK → users | 邀请人（= invite_codes.creator_id） |
| `invitee_id` | UUID FK → users | 被邀请的新用户 |
| `created_at` | TIMESTAMPTZ | 使用时间 |

### 3.3 `settings` 表

```sql
CREATE TABLE settings (
    key         VARCHAR(100) PRIMARY KEY,
    value       TEXT NOT NULL,
    note        VARCHAR(255),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 默认配置
INSERT INTO settings (key, value, note) VALUES
  ('invite_required', 'false', '新用户注册是否强制需要邀请码');
```

**字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `key` | VARCHAR(100) PK | 配置键，唯一标识 |
| `value` | TEXT | 配置值（字符串存储，读取时按需转换） |
| `note` | VARCHAR(255) | 配置说明 |
| `is_active` | BOOLEAN | 是否生效，false 表示此配置失效（回退到环境变量 fallback） |
| `is_deleted` | BOOLEAN | 软删除标记 |

### 3.4 校验逻辑（SQL）

```sql
-- 邀请码是否有效
SELECT * FROM invite_codes
WHERE code = :code
  AND is_active = TRUE
  AND (expires_at IS NULL OR expires_at > now())
  AND (max_uses IS NULL OR used_count < max_uses);
```

---

## 4. Configuration

### 4.1 数据库 settings 表（优先）

`invite_required` 配置存储在 `settings` 表中，支持运行时修改，无需重启服务。

```sql
-- 查看当前配置
SELECT key, value, note, is_active FROM settings WHERE key = 'invite_required';

-- 修改配置（关闭强制邀请码）
UPDATE settings SET value = 'false', updated_at = now() WHERE key = 'invite_required';

-- 临时停用（不删除）
UPDATE settings SET is_active = false, updated_at = now() WHERE key = 'invite_required';
```

### 4.2 环境变量（fallback）

当数据库中没有对应配置时，回退到环境变量：

```bash
INVITE_REQUIRED=false
```

优先级：**数据库 > 环境变量**。数据库中有值且 `is_active=true`、`is_deleted=false` 时以数据库为准。

---

## 5. API Design

### 5.1 校验邀请码（公开接口，无需认证）

```
GET /api/invite/validate?code={code}
```

**Response 200:**
```json
{
  "valid": true
}
```

**Response 200 (无效):**
```json
{
  "valid": false,
  "reason": "expired"       // "expired" | "used_up" | "disabled" | "not_found"
}
```

**Rate Limit:** 10/minute（防暴力枚举）

### 5.2 注册时消费邀请码

修改现有 `POST /api/auth/firebase` 接口：

**新增 Header:**
```
invite-code: ABC123    (可选 / 必须，取决于 INVITE_REQUIRED)
```

**逻辑变更（仅 `is_new_user = True` 时）：**

```
1. 检查 INVITE_REQUIRED 配置
2. 如果必须 && 没有 invite-code → 403 "Invite code required"
3. 如果有 invite-code:
   a. 查询并校验邀请码有效性
   b. 无效 → 400 "Invalid invite code" + reason
   c. 有效 → 创建用户 → 创建 invite_record → used_count += 1
4. 如果不必须 && 没有 invite-code → 正常创建用户（无邀请记录）
```

**Response 新增字段:**
```json
{
  ...existing fields,
  "is_new_user": true,
  "invite_required": true    // 告诉前端当前是否需要邀请码
}
```

### 5.3 检查是否需要邀请码（公开接口）

```
GET /api/invite/status
```

**Response:**
```json
{
  "invite_required": true
}
```

前端启动时调用，决定是否显示邀请码输入框。

### 5.4 创建邀请码（需登录）

```
POST /api/invite/create
```

**Headers:** `id-token`, `package-name`（需已登录用户，使用现有 `get_firebase_user` 鉴权）

> 所有已登录用户均可创建邀请码。前端暂不放开入口，可通过 curl 调用。

**Request Body:**
```json
{
  "code": "WELCOME2024",     // 可选，不提供则随机生成 8 位
  "max_uses": 100,           // 可选，不提供则无限
  "expires_at": "2026-12-31T23:59:59Z",  // 可选，不提供则永不过期
  "note": "给朋友的邀请码"     // 可选
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "code": "WELCOME2024",
  "max_uses": 100,
  "used_count": 0,
  "expires_at": "2026-12-31T23:59:59Z",
  "is_active": true,
  "note": "给朋友的邀请码",
  "created_at": "2026-03-09T..."
}
```

**逻辑：**
- `creator_id` 自动设为当前登录用户
- `code` 不提供时随机生成 8 位字母数字
- 返回创建成功的邀请码信息

**curl 使用示例：**
```bash
# 先获取 Firebase ID Token，然后调用
curl -X POST http://localhost:8000/api/invite/create \
  -H "Content-Type: application/json" \
  -H "id-token: $ID_TOKEN" \
  -H "package-name: com.example.app" \
  -d '{"code": "WELCOME2024", "max_uses": 100}'

# 创建随机邀请码
curl -X POST http://localhost:8000/api/invite/create \
  -H "id-token: $ID_TOKEN" \
  -H "package-name: com.example.app" \
  -d '{}'
```

---

## 6. SQLAlchemy Models

```python
class InviteCode(Base):
    __tablename__ = "invite_codes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(32), unique=True, nullable=False, index=True)
    creator_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    max_uses = Column(Integer, nullable=True)         # NULL = unlimited
    used_count = Column(Integer, nullable=False, default=0)
    expires_at = Column(DateTime, nullable=True)       # NULL = never expires
    is_active = Column(Boolean, nullable=False, default=True)
    note = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    creator = relationship("User", foreign_keys=[creator_id])
    records = relationship("InviteRecord", back_populates="invite_code")


class InviteRecord(Base):
    __tablename__ = "invite_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invite_code_id = Column(
        UUID(as_uuid=True),
        ForeignKey("invite_codes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    inviter_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    invitee_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    invite_code = relationship("InviteCode", back_populates="records")
    inviter = relationship("User", foreign_keys=[inviter_id])
    invitee = relationship("User", foreign_keys=[invitee_id])
```

---

## 7. Frontend Flow

### 7.1 登录页面流程（先登录，后补码）

```
┌────────────────────────────────────────────┐
│              LoginPage                     │
│                                            │
│  登录按钮始终可见（不受邀请码状态影响）         │
│                                            │
│  ┌──────────────────────────────┐          │
│  │  [🍎 Continue with Apple]    │          │
│  │  [G  Continue with Google]   │          │
│  └──────────────────────────────┘          │
│           │                                │
│     Firebase OAuth Popup                   │
│           │                                │
│     POST /api/auth/firebase                │
│           │                                │
│     ┌─ 已有用户 → 200 → 进入 App            │
│     │                                      │
│     └─ 新用户 + 无邀请码 → 403              │
│           │                                │
│     signOut(Firebase)                      │
│     显示邀请码输入框:                        │
│                                            │
│  ┌──────────────────────────────┐          │
│  │  New user? Enter your invite │          │
│  │  code to get started.        │          │
│  │                              │          │
│  │  输入邀请码: [______] [验证]  │          │
│  └──────────────────────────────┘          │
│           │                                │
│     GET /api/invite/validate?code=XXX      │
│     valid: true → localStorage 存码         │
│                 → 自动重新触发 Google 登录    │
│           │                                │
│     POST /api/auth/firebase                │
│       Header: invite-code: XXX             │
│           │                                │
│     ✓ 注册成功，进入 App                     │
│     清除 localStorage 中的 pending_invite   │
└────────────────────────────────────────────┘
```

### 7.2 LoginPage 改动要点

```jsx
// LoginPage.jsx — needsInviteCode 由 useAuth 传入
function LoginPage({ onLoginWithGoogle, error, needsInviteCode }) {
  const [inviteCode, setInviteCode] = useState('');
  const [inviteValid, setInviteValid] = useState(false);

  // 仅在后端返回 403 后显示邀请码输入框
  const showInviteInput = needsInviteCode && !inviteValid;

  const validateAndSaveCode = async () => {
    const data = await api.validateInviteCode(inviteCode);
    if (data.valid) {
      setInviteValid(true);
      localStorage.setItem('pending_invite_code', inviteCode);
      onLoginWithGoogle(); // 自动重新触发登录
    }
  };

  // 登录按钮始终渲染，不受邀请码状态影响
}
```

### 7.3 useAuth Hook 改动要点

```javascript
// useAuth.js
// 1. 读取 localStorage 中的 pending_invite_code 作为 invite-code header
// 2. 处理 403 响应：signOut Firebase + 设置 needsInviteCode=true
// 3. 注册成功后清除 localStorage

if (response.status === 403) {
  await signOut(auth);
  setNeedsInviteCode(true); // 触发 LoginPage 显示邀请码输入框
} else if (response.ok) {
  if (data.is_new_user) {
    localStorage.removeItem('pending_invite_code');
  }
}
```

---

## 8. Sequence Diagram

```
User          Frontend           Backend              Firebase         DB
 │               │                  │                    │              │
 │  打开登录页    │                  │                    │              │
 │──────────────>│  (登录按钮始终可见)                    │              │
 │               │                  │                    │              │
 │  ── 场景 A: 已有用户 ──          │                    │              │
 │  点击 Google   │                  │                    │              │
 │──────────────>│  signInWithPopup │                    │              │
 │               │──────────────────────────────────────>│              │
 │               │  Firebase ID Token                   │              │
 │               │<─────────────────────────────────────│              │
 │               │  POST /auth/firebase                 │              │
 │               │────────────────>│  verify token      │              │
 │               │                 │───────────────────>│              │
 │               │                 │  SELECT user (found)               │
 │               │                 │───────────────────────────────────>│
 │               │  200 { user, is_new_user: false }    │              │
 │               │<────────────────│                    │              │
 │  进入 App      │                  │                    │              │
 │<──────────────│                  │                    │              │
 │               │                  │                    │              │
 │  ── 场景 B: 新用户（无邀请码）──  │                    │              │
 │  点击 Google   │                  │                    │              │
 │──────────────>│  signInWithPopup │                    │              │
 │               │──────────────────────────────────────>│              │
 │               │  Firebase ID Token                   │              │
 │               │<─────────────────────────────────────│              │
 │               │  POST /auth/firebase (无 invite-code) │              │
 │               │────────────────>│  verify token      │              │
 │               │                 │  SELECT user (not found)           │
 │               │                 │  INVITE_REQUIRED=true              │
 │               │  403 "Invite code required"          │              │
 │               │<────────────────│                    │              │
 │               │  signOut(Firebase)                   │              │
 │               │  显示邀请码输入框  │                    │              │
 │               │                  │                    │              │
 │  输入邀请码    │                  │                    │              │
 │──────────────>│  GET /invite/validate?code=ABC       │              │
 │               │────────────────>│  校验有效            │              │
 │               │  { valid: true }│                    │              │
 │               │<────────────────│                    │              │
 │               │  localStorage 存码                    │              │
 │               │  自动重新触发 Google 登录              │              │
 │               │  signInWithPopup (用户已存在于 Firebase)              │
 │               │──────────────────────────────────────>│              │
 │               │  Firebase ID Token                   │              │
 │               │<─────────────────────────────────────│              │
 │               │  POST /auth/firebase                 │              │
 │               │  + invite-code: ABC                  │              │
 │               │────────────────>│  verify token      │              │
 │               │                 │  SELECT user (still not found)     │
 │               │                 │  validate invite_code              │
 │               │                 │───────────────────────────────────>│
 │               │                 │  CREATE user                      │
 │               │                 │  CREATE invite_record              │
 │               │                 │  UPDATE used_count += 1            │
 │               │                 │───────────────────────────────────>│
 │               │  200 { user, is_new_user: true }     │              │
 │               │<────────────────│                    │              │
 │               │  清除 localStorage pending_invite    │              │
 │  进入 App      │                  │                    │              │
 │<──────────────│                  │                    │              │
```

---

## 9. Migration

文件：`api-server/alembic/versions/v6_invite_codes.py`

```python
"""v6: invite codes system

Revision ID: v6_invite_codes
Revises: v5_add_sessions_metadata
"""

revision = "v6_invite_codes"
down_revision = "v5_add_sessions_metadata"

def upgrade():
    op.create_table(
        "invite_codes",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("creator_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("max_uses", sa.Integer(), nullable=True),
        sa.Column("used_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("note", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_invite_codes_code", "invite_codes", ["code"], unique=True)
    op.create_index("ix_invite_codes_creator_id", "invite_codes", ["creator_id"])

    op.create_table(
        "invite_records",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("invite_code_id", sa.UUID(), sa.ForeignKey("invite_codes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("inviter_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("invitee_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_invite_records_invite_code_id", "invite_records", ["invite_code_id"])
    op.create_index("ix_invite_records_inviter_id", "invite_records", ["inviter_id"])
    op.create_index("ix_invite_records_invitee_id", "invite_records", ["invitee_id"])

def downgrade():
    op.drop_table("invite_records")
    op.drop_table("invite_codes")
```

---

## 10. File Changes Summary

### Backend (api-server/)

| 文件 | 操作 | 说明 |
|------|------|------|
| `app/config.py` | 修改 | 新增 `INVITE_REQUIRED` |
| `app/models.py` | 修改 | 新增 `InviteCode`, `InviteRecord` 模型 |
| `app/routes/invite.py` | **新建** | `GET /validate`, `GET /status`, `POST /create` |
| `app/routes/auth.py` | 修改 | `POST /firebase` 增加邀请码校验逻辑 |
| `app/main.py` | 修改 | 注册 invite router |
| `alembic/versions/v6_invite_codes.py` | **新建** | 邀请码表迁移 |
| `alembic/versions/v7_settings.py` | **新建** | settings 表迁移 + 默认配置 |

### Frontend (frontend/)

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/components/LoginPage.jsx` | 修改 | 新增邀请码输入框、验证逻辑 |
| `src/hooks/useAuth.js` | 修改 | POST 时附带 invite-code header |
| `src/services/api.js` | 修改 | 新增 invite validate/status API 方法 |

---

## 11. 邀请码创建权限

所有已登录用户均可通过 `POST /api/invite/create` 创建邀请码，使用现有的 Firebase 认证（`get_firebase_user`）。

本版本前端暂不放开创建入口，可通过 curl 或后续前端页面调用。

---

## 12. Security Considerations

| 风险 | 缓解措施 |
|------|----------|
| 暴力枚举邀请码 | `/validate` 限速 10 次/分钟 |
| 绕过前端直接调 API | 后端注册时二次校验（前端校验仅为 UX） |
| 竞态条件（并发消费同一码） | `used_count` 使用 `UPDATE ... SET used_count = used_count + 1 WHERE used_count < max_uses` 原子操作 |
| 恶意批量创建邀请码 | 需登录才能创建；后续可加限速（如每用户每天 N 个） |

---

## 12. Implementation Roadmap

### Phase 1 — MVP（本次实现）
- [ ] 数据库迁移（invite_codes + invite_records）
- [ ] SQLAlchemy 模型
- [ ] `GET /api/invite/status` — 返回是否需要邀请码
- [ ] `GET /api/invite/validate` — 校验邀请码
- [ ] `POST /api/invite/create` — 已登录用户创建邀请码
- [ ] `POST /api/auth/firebase` — 注册时消费邀请码
- [ ] LoginPage 邀请码输入框 + 校验
- [ ] useAuth 传递 invite-code header

### Phase 2 — 管理后台（后续）
- [ ] 独立 admin-server 服务
- [ ] 邀请码管理页面（CRUD + 数据统计）
- [ ] 邀请记录查看（谁邀请了谁）
- [ ] 批量创建邀请码
- [ ] 用户自助生成邀请码

### Phase 3 — 增长功能
- [ ] 邀请奖励机制
- [ ] 推荐链路追踪（多级邀请）
- [ ] 邀请数据分析（转化率、渠道效果）
