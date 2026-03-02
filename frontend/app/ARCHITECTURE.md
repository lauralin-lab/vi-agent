# Collov Camera 项目架构

## 概述

这是一个 Flutter 移动端相机应用，支持 iOS 和 Android 平台。

## 技术栈

| 类别 | 技术 | 说明 |
|------|------|------|
| **框架** | Flutter 3.35+ | 跨平台 UI 框架 |
| **语言** | Dart 3.9+ | 编程语言 |
| **状态管理** | Riverpod | 使用 `@riverpod` 注解 |
| **路由** | go_router | 使用 `go_router_builder` 自动生成 |
| **网络** | Dio | 带缓存拦截器 |
| **后端** | Supabase | 认证、数据库、存储 |
| **实时通信** | LiveKit | 音视频通话 |
| **日志** | Talker | 日志与调试 |

## 目录结构

```
lib/
├── app.dart                 # 应用单例入口，全局服务管理
├── entry.dart               # 应用入口配置
├── main.dart                # 正式环境入口
├── main_debug.dart          # 调试环境入口
│
├── common/                  # 🔧 公共基础模块
│   ├── exception/           # 异常处理
│   ├── extension/           # Dart 扩展方法
│   ├── io/                  # IO 操作（路径、配置持久化）
│   ├── misc/                # 杂项工具（设备ID、编解码等）
│   ├── network/             # 网络基础设施
│   ├── pool/                # 资源缓存池
│   └── utils/               # 工具类
│
├── configs/                 # ⚙️ 配置
│   ├── backend.dart         # 后端 API 配置
│   ├── constans.dart        # 常量定义
│   ├── envs.dart            # 环境配置（开发/生产）
│   └── default_system_instruction.md  # AI 系统提示
│
├── modules/                 # 📦 业务模块
│   ├── models/              # 数据模型（使用 @JsonSerializable）
│   ├── pages/               # 页面
│   │   ├── main/            # 主相机页面
│   │   ├── session/         # 会话页面
│   │   └── album/           # 相册页面
│   ├── style/               # 样式定义
│   └── widgets/             # 可复用组件
│
├── routing/                 # 🛣️ 路由管理
│   ├── router.dart          # 路由定义（go_router）
│   ├── router.g.dart        # 自动生成的路由代码
│   ├── router_data.dart     # 路由数据和路径常量
│   └── navigator_observer.dart  # 导航观察者
│
└── service/                 # 🔌 服务层
    ├── authentication.dart  # 认证服务（Google/Apple 登录）
    ├── global_provider.dart # 全局 Provider
    ├── hardware/            # 硬件初始化
    ├── network/             # 网络服务
    └── supabase/            # Supabase 集成
```

## 架构模式

### 页面结构

每个页面采用 **逻辑与 UI 分离** 模式：

```
pages/[功能名]/
├── [功能名]_page.dart      # 页面逻辑、生命周期、状态管理
├── [功能名]_page.ui.dart   # 纯 UI Widget 构建
├── widget/                 # 页面专用组件
├── model/                  # 页面专用模型
├── provider/               # 页面专用 Provider
└── dialog/                 # 页面专用对话框
```

### 状态管理

使用 Riverpod 进行状态管理：

```dart
// 使用注解方式定义 Provider
@riverpod
Future<YourData> yourProvider(Ref ref) async {
  // ...
}

// 在 Widget 中使用
class YourWidget extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(yourProviderProvider);
    // ...
  }
}
```

### 数据模型

使用 `json_serializable` 进行 JSON 序列化：

```dart
@JsonSerializable()
class YourModel {
  final String id;
  
  const YourModel({required this.id});
  
  factory YourModel.fromJson(Map<String, dynamic> json) => 
      _$YourModelFromJson(json);
  
  Map<String, dynamic> toJson() => _$YourModelToJson(this);
}
```

### 路由定义

使用 `go_router_builder` 自动生成类型安全路由：

```dart
@TypedGoRoute<YourPageRoute>(path: '/your-path')
class YourPageRoute extends GoRouteData {
  const YourPageRoute();
  
  @override
  Widget build(BuildContext context, GoRouterState state) {
    return const YourPage();
  }
}
```

## 代码生成

修改带有以下注解的文件后，需要运行代码生成：

- `@JsonSerializable` - JSON 序列化
- `@TypedGoRoute` - 路由生成
- `@riverpod` - Provider 生成

```bash
flutter pub run build_runner build --delete-conflicting-outputs
```

## 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 文件名 | 小写下划线 | `user_profile_page.dart` |
| 类名 | 大驼峰 | `UserProfilePage` |
| 变量/方法 | 小驼峰 | `getUserProfile()` |
| 常量 | 小驼峰 | `defaultTimeout` |
| 路由路径 | 小写短横线 | `/user-profile` |

## 依赖管理

- 第三方包：在 `pubspec.yaml` 中声明
- 私有包：使用 Git 依赖（见 `pubspec.yaml` 中的 `rive_rolls_*` 包）
- 版本管理：使用 FVM（`.fvmrc` 文件）

## 环境配置

- 开发环境：`main_debug.dart`
- 生产环境：`main.dart`
- 环境变量：`lib/configs/envs.dart`
