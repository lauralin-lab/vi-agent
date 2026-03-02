---
description: 添加新 API 接口的流程
---

# 添加新 API 接口

## 项目网络层结构

```
lib/common/network/       # 公共网络模块
lib/service/network/      # 业务网络服务
```

## 步骤

### 1. 定义数据模型

在 `lib/modules/models/` 中创建 Model：

```dart
import 'package:json_annotation/json_annotation.dart';

part 'your_model.g.dart';

@JsonSerializable()
class YourModel {
  final String id;
  final String name;

  const YourModel({
    required this.id,
    required this.name,
  });

  factory YourModel.fromJson(Map<String, dynamic> json) =>
      _$YourModelFromJson(json);

  Map<String, dynamic> toJson() => _$YourModelToJson(this);
}
```

### 2. 生成序列化代码

// turbo
```bash
cd /Users/elanzhou/Desktop/collov/collov-camera && flutter pub run build_runner build --delete-conflicting-outputs
```

### 3. 创建 API 服务方法

在对应的 service 文件中添加方法，使用 `Dio` 进行请求。

### 4. 创建 Provider（可选）

如果需要状态管理，使用 Riverpod：

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'your_provider.g.dart';

@riverpod
Future<YourModel> fetchYourData(Ref ref) async {
  // API 调用逻辑
}
```

## 注意事项

- 所有 Model 类必须使用 `@JsonSerializable()` 注解
- 生成的 `.g.dart` 文件不要手动修改
- 使用 `Talker` 进行日志记录
