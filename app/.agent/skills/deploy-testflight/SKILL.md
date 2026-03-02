---
name: deploy-testflight
description: 发布 iOS 应用到 TestFlight（通过 Fastlane）
---

# 发布到 TestFlight

将 Flutter iOS 应用构建并上传到 TestFlight 进行测试分发。

## 快速执行

// turbo-all

### 正式版本

运行脚本：

```bash
.agent/skills/deploy-testflight/scripts/deploy.sh
```

### 内部版本（包含 DevTools）

运行脚本：

```bash
.agent/skills/deploy-testflight/scripts/deploy.sh internal
```

内部版本会通过 `--dart-define=IS_INTERNAL_VERSION=true` 编译，启用 `kEnableDebugTools`，包含调试工具入口。

## 手动步骤

### 1. 检查代码

```bash
flutter analyze
```

### 2. 完整发布（build + upload）

正式版本：
```bash
cd ios && bundle exec fastlane beta
```

内部版本（含 DevTools）：
```bash
cd ios && bundle exec fastlane beta_internal
```

此命令会依次执行：
1. 自增 build number
2. `flutter build ios --release`（内部版本额外传 `--dart-define=IS_INTERNAL_VERSION=true`）
3. 签名打包 IPA
4. 上传到 TestFlight

### 可选：仅构建 IPA

```bash
cd ios && bundle exec fastlane build
```

### 可选：仅上传已有 IPA

```bash
cd ios && bundle exec fastlane upload
```

## Fastlane Lanes

| Lane | 说明 |
|------|------|
| `beta` | 正式版本：构建 + 上传 TestFlight |
| `beta_internal` | 内部版本：含 DevTools，构建 + 上传 TestFlight |
| `build` | 仅构建 IPA（不上传） |
| `upload` | 仅上传已有 IPA |

## 相关文件

| 文件 | 说明 |
|------|------|
| `ios/fastlane/Fastfile` | Lane 定义（beta / beta_internal / build / upload） |
| `ios/fastlane/Appfile` | Bundle ID、Team ID |
| `ios/Gemfile` | Ruby 依赖 |
| `lib/configs/constans.dart` | `kEnableDebugTools` 常量定义 |

## 常见问题

### 首次登录
Fastlane 会要求登录 App Store Connect：
- **App-specific password**: 在 appleid.apple.com 生成，设置环境变量 `FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD`
- **API Key**: 在 App Store Connect > Users and Access > Keys 创建

### 签名问题
如遇签名错误，在 `Fastfile` 的 `build_app` 中添加 `export_options` 配置 provisioning profile。
