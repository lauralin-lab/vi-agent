---
description: 添加新页面的标准流程
---

# 添加新页面

本项目采用 **页面逻辑与 UI 分离** 的模式：
- `xxx_page.dart` - 页面逻辑、状态管理
- `xxx_page.ui.dart` - 纯 UI 构建

## 文件结构

```
lib/modules/pages/[功能名]/
├── [功能名]_page.dart      # 页面逻辑
├── [功能名]_page.ui.dart   # UI 实现
├── widget/                 # 页面专用组件
├── model/                  # 页面专用模型
└── provider/               # 页面专用 Provider
```

## 步骤

### 1. 创建页面目录

在 `lib/modules/pages/` 下创建功能目录

### 2. 创建页面文件

参考模板 `.agent/templates/page_template.dart`

### 3. 添加路由

在 `lib/routing/router.dart` 中添加路由定义：

```dart
@TypedGoRoute<YourPageRoute>(
  path: RouterPaths.yourPath,
)
class YourPageRoute extends GoRouteData {
  const YourPageRoute();

  @override
  Widget build(BuildContext context, GoRouterState state) {
    return const YourPage();
  }
}
```

### 4. 生成路由代码

// turbo
执行 build_runner：
```bash
cd /Users/elanzhou/Desktop/collov/collov-camera && flutter pub run build_runner build --delete-conflicting-outputs
```

## 命名规范

| 类型 | 命名规则 | 示例 |
|------|----------|------|
| 目录 | 小写下划线 | `user_profile` |
| 页面类 | 驼峰 + Page | `UserProfilePage` |
| 路由类 | 驼峰 + Route | `UserProfileRoute` |
| 路由路径 | 小写斜杠 | `/user-profile` |
