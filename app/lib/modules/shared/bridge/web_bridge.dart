import 'dart:convert';

import '../../../common/utils/log_utils.dart';
import '../collov_webview.dart';

/// WebView JS 桥的基础类
///
/// 提供:
/// - JS → Flutter 回调注册 ([channels])
/// - Flutter → JS 调用能力 ([callJs] / [evaluateJs])
/// - JSON 消息解析 & 分发
///
/// 子类只需:
/// 1. 绑定 controller: `bridge.attach(webCtrl)`
/// 2. 重写 [onMessage] 处理自定义消息类型
/// 3. 添加业务方法 (如 `dispatchMessage`)
///
/// ```dart
/// class MyBridge extends WebBridge {
///   MyBridge() : super(tag: 'MyBridge');
///
///   @override
///   void onMessage(String type, Map<String, dynamic> data) {
///     if (type == 'hello') print(data['text']);
///   }
///
///   void doSomething() => callJs('doSomething', ['arg1']);
/// }
/// ```
abstract class WebBridge {
  WebBridge({required this.tag});

  /// 日志标签
  final String tag;

  /// 绑定的 WebView controller
  CollovWebViewController? _controller;

  /// 是否已绑定
  bool get isAttached => _controller != null;

  // ─── 生命周期 ───────────────────────────────────────────────────────────────

  /// 绑定到 WebView controller
  void attach(CollovWebViewController controller) {
    _controller = controller;
  }

  /// 解除绑定
  void detach() {
    _controller = null;
  }

  // ─── JS → Flutter channels ─────────────────────────────────────────────────

  /// 返回需要注册到 WebView 的所有 JS channels
  ///
  /// 子类可以 override 并调用 `super.channels` 来追加自定义 channel
  List<JsBridgeChannel> get channels => [
        JsBridgeChannel(
          name: 'FlutterBridge',
          onMessage: _handleRawMessage,
        ),
      ];

  /// 处理原始 JS 消息，解析 JSON 后分发到 [onMessage]
  void _handleRawMessage(String message) {
    try {
      final data = jsonDecode(message) as Map<String, dynamic>;
      final type = data['type'] as String? ?? '';
      onMessage(type, data);
    } catch (e) {
      Log.d('[$tag] Bridge message parse error: $e');
    }
  }

  /// 子类实现: 处理从 JS 端收到的结构化消息
  ///
  /// [type] 消息类型 (来自 JSON 的 `type` 字段)
  /// [data] 完整 JSON 数据
  void onMessage(String type, Map<String, dynamic> data);

  // ─── Flutter → JS ──────────────────────────────────────────────────────────

  /// 调用 JS 函数
  void callJs(String functionName, [List<Object?> args = const []]) {
    _controller?.callJs(functionName, args);
  }

  /// 执行 JS 表达式并获取返回值
  Future<Object>? evaluateJs(String script) {
    return _controller?.evaluateJs(script);
  }

  /// 执行任意 JS 代码
  void runJavaScript(String script) {
    _controller?.runJavaScript(script);
  }
}
