import 'dart:io';

import '../../../common/utils/log_utils.dart';
import 'web_bridge.dart';

/// Session 页面的 JS 桥
///
/// 提供:
/// - `dispatchMessage(text)` — 通过 JS 端发送消息到后端
/// - `receiveInput(source, path)` — 发送图片到 WebView
/// - 监听 `messageSent` / `messageError` 回调
///
/// ```dart
/// final sessionBridge = SessionBridge(
///   onMessageSent: (text) => print('已发送: $text'),
///   onMessageError: (error) => print('发送失败: $error'),
/// );
/// sessionBridge.attach(webCtrl);
///
/// CollovWebView(
///   channels: [...sessionBridge.channels],
/// )
///
/// // 发送消息
/// sessionBridge.dispatchMessage('你好');
/// sessionBridge.sendImage(file);
/// ```
class SessionBridge extends WebBridge {
  SessionBridge({
    this.onMessageSent,
    this.onMessageError,
  }) : super(tag: 'SessionBridge');

  /// 消息发送成功回调
  final void Function(String text)? onMessageSent;

  /// 消息发送失败回调
  final void Function(String error)? onMessageError;

  @override
  void onMessage(String type, Map<String, dynamic> data) {
    switch (type) {
      case 'messageSent':
        final text = data['text'] as String? ?? '';
        Log.d('[SessionBridge] Message sent: $text');
        onMessageSent?.call(text);
      case 'messageError':
        final error = data['error'] as String? ?? 'Unknown error';
        Log.d('[SessionBridge] Message error: $error');
        onMessageError?.call(error);
    }
  }

  // ─── Flutter → JS 方法 ─────────────────────────────────────────────────────

  /// 发送文本消息到后端
  ///
  /// JS 端的 `dispatchMessage(text)` 会 POST 到 `/collov/session/dispatch_message`
  void dispatchMessage(String text) {
    if (text.trim().isEmpty) return;
    callJs('dispatchMessage', [text]);
  }

  /// 发送图片到 WebView
  void sendImage(File file) {
    callJs('receiveInput', ['gallery', file.path]);
  }

  /// 发送工作空间图片路径到 WebView
  void sendWorkspaceImage(String path) {
    callJs('receiveInput', ['gallery', path]);
  }

  /// 显示指定 section
  void showSection(String id) {
    callJs('showSection', [id]);
  }

  /// 折叠指定 section
  void collapseSection(String id) {
    callJs('collapseSection', [id]);
  }

  /// 切换 section 折叠状态
  void toggleSection(String id) {
    callJs('toggleSection', [id]);
  }

  /// 更新 todo 状态
  ///
  /// [state] 可以是 `'active'` | `'completed'`
  void updateTodoState(int index, String state, [String? substepText]) {
    callJs('updateTodoState', [index, state, substepText ?? '']);
  }

  /// 滚动 WebView 到底部
  void scrollToBottom() {
    runJavaScript('window.scrollTo({top: document.body.scrollHeight, behavior: "smooth"})');
  }
}
