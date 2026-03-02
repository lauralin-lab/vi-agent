# API 接口文档格式规范

本文档定义 API 接口文档的标准格式，便于 AI 解析并生成 Model 类和网络请求代码。

## 文件位置

所有 API 文档存放在：`.agent/api/endpoints/[模块名].md`

## 标准模板

```markdown
# [模块名] API

## 基础信息

- **Base URL**: `/api/v1/[module]`
- **认证方式**: Bearer Token

---

## [接口名称]

### 基本信息

| 属性 | 值 |
|------|------|
| 路径 | `/api/v1/xxx` |
| 方法 | `GET` / `POST` / `PUT` / `DELETE` |
| 认证 | 是/否 |
| 说明 | 接口功能描述 |

### 请求参数

#### Path 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | String | 是 | 资源 ID |

#### Query 参数
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|------|------|
| page | int | 否 | 1 | 页码 |
| limit | int | 否 | 20 | 每页数量 |

#### Body 参数 (JSON)
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | String | 是 | 名称 |
| description | String? | 否 | 描述 |

### 响应

#### 成功响应 (200)
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "xxx",
    "name": "xxx"
  }
}
```

#### 错误响应
| 状态码 | 错误码 | 说明 |
|--------|--------|------|
| 400 | 1001 | 参数错误 |
| 401 | 1002 | 未授权 |
| 404 | 1003 | 资源不存在 |

---

## 数据模型

### [ModelName]

```json
{
  "id": "string",
  "name": "string",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String | 唯一标识 |
| name | String | 名称 |
| created_at | DateTime | 创建时间 |
| updated_at | DateTime | 更新时间 |
```

## AI 代码生成说明

AI 解析 API 文档时会自动生成：

### 1. Model 类

根据「数据模型」部分生成 `@JsonSerializable` 类：

```dart
@JsonSerializable()
class ModelName {
  final String id;
  final String name;
  @JsonKey(name: 'created_at')
  final DateTime? createdAt;
  
  // ...
}
```

### 2. API 请求方法

根据接口定义生成 Dio 请求：

```dart
Future<ModelName> getModelById(String id) async {
  final response = await dio.get('/api/v1/xxx/$id');
  return ModelName.fromJson(response.data['data']);
}
```

### 3. 错误处理

根据错误响应生成异常处理逻辑。

## 示例

见 `.agent/api/endpoints/_example.md`
