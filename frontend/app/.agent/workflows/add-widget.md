---
description: 添加可复用组件的流程
---

# 添加可复用组件

## 组件分类

| 类型 | 位置 | 说明 |
|------|------|------|
| 全局组件 | `lib/modules/widgets/` | 跨页面复用 |
| 页面组件 | `lib/modules/pages/[页面]/widget/` | 仅在特定页面使用 |

## 步骤

### 1. 确定组件位置

- 如果组件会被多个页面使用 → 放在 `lib/modules/widgets/`
- 如果组件仅在单个页面使用 → 放在页面的 `widget/` 子目录

### 2. 创建组件文件

命名规范：`[功能名]_widget.dart` 或 `[功能名].dart`

### 3. 组件模板

```dart
import 'package:flutter/material.dart';

/// [组件功能描述]
class YourWidget extends StatelessWidget {
  const YourWidget({
    super.key,
    // 必要参数
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      // 实现
    );
  }
}
```

## 现有全局组件

查看 `lib/modules/widgets/` 目录了解现有组件，避免重复造轮子。
