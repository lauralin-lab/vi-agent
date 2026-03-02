# User API

## 基础信息

- **Base URL**: `/api/v1/user`
- **认证方式**: Bearer Token

---

## 获取当前用户信息

### 基本信息

| 属性 | 值 |
|------|------|
| 路径 | `/api/v1/user/me` |
| 方法 | `GET` |
| 认证 | 是 |
| 说明 | 获取当前登录用户的详细信息 |

### 请求参数

无

### 响应

#### 成功响应 (200)
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "user_123",
    "nickname": "张三",
    "email": "zhangsan@example.com",
    "avatar_url": "https://example.com/avatar.jpg",
    "google_bound": true,
    "apple_bound": false,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-15T12:30:00Z"
  }
}
```

---

## 更新用户信息

### 基本信息

| 属性 | 值 |
|------|------|
| 路径 | `/api/v1/user/me` |
| 方法 | `PUT` |
| 认证 | 是 |
| 说明 | 更新当前用户的个人信息 |

### Body 参数 (JSON)

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| nickname | String? | 否 | 昵称（2-20字符） |
| avatar_url | String? | 否 | 头像 URL |

### 响应

#### 成功响应 (200)
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "user_123",
    "nickname": "新昵称",
    "email": "zhangsan@example.com",
    "avatar_url": "https://example.com/new-avatar.jpg",
    "google_bound": true,
    "apple_bound": false,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-15T14:00:00Z"
  }
}
```

#### 错误响应

| 状态码 | 错误码 | 说明 |
|--------|--------|------|
| 400 | 1001 | 昵称长度不符合要求 |
| 401 | 1002 | 未登录 |

---

## 上传头像

### 基本信息

| 属性 | 值 |
|------|------|
| 路径 | `/api/v1/user/avatar` |
| 方法 | `POST` |
| 认证 | 是 |
| Content-Type | `multipart/form-data` |
| 说明 | 上传用户头像图片 |

### Body 参数 (Form)

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | File | 是 | 图片文件（支持 jpg/png，最大 5MB） |

### 响应

#### 成功响应 (200)
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "avatar_url": "https://example.com/avatar/user_123.jpg"
  }
}
```

---

## 数据模型

### UserInfo

```json
{
  "id": "string",
  "nickname": "string",
  "email": "string",
  "avatar_url": "string?",
  "google_bound": "boolean",
  "apple_bound": "boolean",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String | 用户唯一标识 |
| nickname | String | 用户昵称 |
| email | String | 邮箱地址 |
| avatar_url | String? | 头像 URL，可为空 |
| google_bound | bool | 是否绑定 Google 账号 |
| apple_bound | bool | 是否绑定 Apple 账号 |
| created_at | DateTime | 账号创建时间 |
| updated_at | DateTime | 最后更新时间 |
