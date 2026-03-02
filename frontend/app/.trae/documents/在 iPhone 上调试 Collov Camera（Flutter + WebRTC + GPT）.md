## 架构速览
- 实时媒体: 使用 `flutter_webrtc` 获取相机流，创建 `RTCPeerConnection`，本地渲染到 `RTCVideoRenderer`，远端轨道绑定到另一个渲染器（`lib/modules/pages/home/home_page.dart`）。
- GPT 连接: 通过 `ApiService.openAiRealTime(...)` 将本地 SDP 发到 `https://api.openai.com/v1/realtime/calls` 获取应答 SDP（`lib/service/network/api_service.dart`）。使用 DataChannel `'oai'` 接收/发送控制指令（如缩放、拍照）。
- 权限与 ATS: `ios/Runner/Info.plist` 已包含 `NSCameraUsageDescription`、`NSMicrophoneUsageDescription`、`NSPhotoLibraryUsageDescription`、`NSPhotoLibraryAddUsageDescription`，并启用 `NSAppTransportSecurity`→`NSAllowsArbitraryLoads: true` 以便连接本地 `http://` 服务。
- 环境选择: `lib/config/envs.dart` 的 `ServerEnv.host` 指向局域网地址（示例 `http://192.168.x.x:5037`）。

## 调试前准备
- 安装与检查环境：
  - 安装最新 `Xcode` 与命令行工具，安装 `CocoaPods`（如需：`sudo gem install cocoapods`）。
  - 安装 `Flutter` 稳定版；执行 `flutter doctor -v`，确保 `iOS toolchain`、`CocoaPods`、`Xcode` 均为 OK。
  - 执行 `flutter pub get` 拉取依赖。
- Apple 开发账号：在 Xcode 登录你的 Apple ID（免费账号即可用于真机调试）。

## 设备设置（真机必需）
- 使用数据线连接 iPhone，首次需在手机上“信任此电脑”。
- iOS 16+ 开启“开发者模式”：设置→隐私与安全性→开发者模式。
- 在 Xcode 菜单 Window→Devices and Simulators 确认设备在线、无错误提示。

## 项目配置检查
- 权限文案：确认 `ios/Runner/Info.plist` 的相机、麦克风与相册权限文案符合预期。
- ATS：如需访问局域网 `http://`，保持 `NSAllowsArbitraryLoads: true`（仅调试使用；发布时建议改为域名白名单）。
- 插件注册：`ios/Runner/AppDelegate.swift` 中存在 `GeneratedPluginRegistrant.register(with:)`。
- 网络环境：
  - 你的 iPhone 与开发机在同一 Wi‑Fi。
  - 如使用项目内的本地后端（`lib/config/envs.dart`），将 `ServerEnv.host` 改为开发机的实际局域网 IP 与端口，确保可达。
- API Key：`lib/service/network/api_service.dart` 里使用 `Authorization: Bearer <密钥>`。调试阶段确保密钥有效；避免将密钥提交到版本库。

## 在 iPhone 上运行
- 命令行方式：
  - `flutter devices` 查看设备 ID。
  - `flutter run -d <设备ID>` 构建并安装到 iPhone。
- Xcode 方式：
  - 打开 `ios/Runner.xcworkspace`。
  - Target 选择 `Runner`，Signing & Capabilities 中选择你的 Team，自动生成签名。
  - 选择你的 iPhone 作为运行目标，点击 Run。
- 若遇到 Pods 问题：`cd ios && pod install && cd ..` 后再构建。

## 功能验证清单（真机）
- 首次启动同意权限：相机、麦克风、相册写入。
- 本地预览：确认本地视频出现在预览视图；尝试前后摄切换与变焦。
- 拍照保存：点击拍照后在系统“照片”里出现新图片。
- GPT 会话：
  - 启动会话后观察是否成功完成 SDP 交换（日志中无 401/403/网络错误）。
  - 远端轨道（若服务返回）是否渲染；DataChannel 指令是否触发（如变焦、结束）。

## 常见问题排查
- Code Signing 报错：在 Xcode 的 `Runner`→`Signing & Capabilities` 选择 Team；勾选“Automatically manage signing”。
- 需要开发者模式：在设备上启用开发者模式并重启。
- ATS 拦截（`NSURLErrorDomain -1022`）：确保 `Info.plist` 中允许 `http://` 或添加目标域名例外。
- 无法访问本地后端：确认手机能 Ping 到开发机 IP；排除防火墙；后端服务进程在线。
- API 401/403：检查 `Bearer` 密钥有效、未过期且对应模型授权已开通。
- WebRTC 建立失败：确保网络通畅；查看 `flutter_webrtc` 日志是否完成 `setLocalDescription`/`setRemoteDescription`；确认后端返回完整 SDP。

## 安全提醒
- 不要将 OpenAI API 密钥硬编码提交到仓库。调试可用本地不提交的配置文件或环境变量；发布时改为安全存储与服务端签署。
