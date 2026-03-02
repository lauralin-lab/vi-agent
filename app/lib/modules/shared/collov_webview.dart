import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

// ─────────────────────────────────────────────────────────────────────────────
// JSB Channel 定义
// ─────────────────────────────────────────────────────────────────────────────

/// JS → Flutter 消息回调
typedef JsBridgeHandler = void Function(String message);

/// 注册一个 JavaScriptChannel 的描述
class JsBridgeChannel {
  /// Channel 名称（JS 端通过 `{name}.postMessage(msg)` 调用）
  final String name;

  /// Flutter 端收到消息时的回调
  final JsBridgeHandler onMessage;

  const JsBridgeChannel({required this.name, required this.onMessage});
}

// ─────────────────────────────────────────────────────────────────────────────
// CollovWebView
// ─────────────────────────────────────────────────────────────────────────────

/// 通用自定义 WebView 组件
///
/// 功能:
/// - 加载 HTML 字符串或 URL
/// - 注册多个 JS → Flutter 桥（[JsBridgeChannel]）
/// - 提供 [CollovWebViewController] 用于 Flutter → JS 调用
///   - `callJs('fnName', [arg1, arg2])` — 类型安全的函数调用
///   - `runJavaScript('raw js')` — 执行原始 JS
///   - `evaluateJs('expr')` — 执行 JS 并获取返回值
///   - `injectJs('code')` — 注入 JS 代码段
///   - 页面未 ready 时自动排队，ready 后批量执行
/// - 支持导航拦截、页面生命周期回调
/// - 可选 SSL 容错（开发环境）
///
/// ```dart
/// final _ctrl = CollovWebViewController();
///
/// CollovWebView(
///   controller: _ctrl,
///   htmlContent: kSessionHtml,
///   backgroundColor: const Color(0xFF0A0A0A),
///   channels: [
///     JsBridgeChannel(name: 'FlutterScroll', onMessage: (msg) { ... }),
///   ],
///   onPageFinished: (url) { ... },
/// )
///
/// // Flutter → JS
/// _ctrl.callJs('showSection', ['todos']);
/// ```
class CollovWebView extends StatefulWidget {
  /// 外部控制器，用于 Flutter → JS 调用
  final CollovWebViewController? controller;

  /// 加载 HTML 字符串（与 [url] 二选一）
  final String? htmlContent;

  /// 加载 URL（与 [htmlContent] 二选一）
  final String? url;

  /// 背景色
  final Color backgroundColor;

  /// JS → Flutter 桥列表
  final List<JsBridgeChannel> channels;

  /// 页面加载完成回调
  final ValueChanged<String>? onPageFinished;

  /// 页面开始加载回调
  final ValueChanged<String>? onPageStarted;

  /// 加载进度回调 (0-100)
  final ValueChanged<int>? onProgress;

  /// 导航请求拦截（返回 true 允许, false 拦截）
  final bool Function(NavigationRequest)? onNavigationRequest;

  /// 加载错误回调
  final void Function(WebResourceError)? onWebResourceError;

  /// 自定义错误 Widget 构建器，接收一个 onRetry 回调用于重试
  final Widget Function(VoidCallback onRetry)? errorWidgetBuilder;

  /// 接受自签名证书（开发环境）
  final bool allowSelfSignedCert;

  /// 是否启用 JS（默认开启）
  final bool enableJavaScript;

  /// WebView 的 UserAgent
  final String? userAgent;

  /// 是否允许双指缩放（默认允许）
  final bool enableZoom;

  const CollovWebView({
    super.key,
    this.controller,
    this.htmlContent,
    this.url,
    this.backgroundColor = const Color(0xFF0A0A0A),
    this.channels = const [],
    this.onPageFinished,
    this.onPageStarted,
    this.onProgress,
    this.onNavigationRequest,
    this.onWebResourceError,
    this.errorWidgetBuilder,
    this.allowSelfSignedCert = false,
    this.enableJavaScript = true,
    this.userAgent,
    this.enableZoom = true,
  }) : assert(
         htmlContent != null || url != null,
         'Either htmlContent or url must be provided',
       );

  @override
  State<CollovWebView> createState() => _CollovWebViewState();
}

class _CollovWebViewState extends State<CollovWebView> {
  late final WebViewController _webCtrl;
  WebResourceError? _lastError;

  @override
  void initState() {
    super.initState();
    _webCtrl = _buildController();

    // 绑定外部控制器
    widget.controller?._attach(_webCtrl);

    // 加载内容
    if (widget.htmlContent != null) {
      _webCtrl.loadHtmlString(widget.htmlContent!);
    } else if (widget.url != null) {
      _webCtrl.loadRequest(Uri.parse(widget.url!));
    }
  }

  @override
  void dispose() {
    widget.controller?._detach();
    super.dispose();
  }

  WebViewController _buildController() {
    final ctrl = WebViewController()
      ..setJavaScriptMode(
        widget.enableJavaScript ? JavaScriptMode.unrestricted : JavaScriptMode.disabled,
      )
      ..setBackgroundColor(widget.backgroundColor)
      ..enableZoom(widget.enableZoom);

    // 注册 JS → Flutter channels
    for (final channel in widget.channels) {
      ctrl.addJavaScriptChannel(
        channel.name,
        onMessageReceived: (msg) => channel.onMessage(msg.message),
      );
    }

    // 导航代理 — 同时处理外部回调和内部 controller ready 状态
    ctrl.setNavigationDelegate(
      NavigationDelegate(
        onPageStarted: (url) {
          // 新页面开始加载时重置 ready 状态和错误状态
          if (mounted) setState(() => _lastError = null);
          widget.controller?._onPageStarted();
          widget.onPageStarted?.call(url);
        },
        onPageFinished: (url) {
          // 标记 ready，执行排队的 JS 调用
          widget.controller?._onPageFinished();
          widget.onPageFinished?.call(url);
        },
        onProgress: widget.onProgress,
        onNavigationRequest: widget.onNavigationRequest != null
            ? (req) => widget.onNavigationRequest!(req) ? NavigationDecision.navigate : NavigationDecision.prevent
            : null,
        onWebResourceError: (error) {
          if (mounted) setState(() => _lastError = error);
          widget.onWebResourceError?.call(error);
        },
        onHttpAuthRequest: (_) {},
        onSslAuthError: widget.allowSelfSignedCert ? (challenge) => challenge.proceed() : null,
      ),
    );

    // UserAgent
    if (widget.userAgent != null) {
      ctrl.setUserAgent(widget.userAgent);
    }

    return ctrl;
  }

  void _onRetry() {
    setState(() => _lastError = null);
    _webCtrl.reload();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        WebViewWidget(controller: _webCtrl),
        if (_lastError != null && widget.errorWidgetBuilder != null)
          Positioned.fill(child: widget.errorWidgetBuilder!(_onRetry)),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CollovWebViewController — Flutter → JS 控制器
// ─────────────────────────────────────────────────────────────────────────────

/// 控制器，提供 Flutter → JS 方向的调用能力
///
/// 在 State.initState 前创建，传给 [CollovWebView.controller]，
/// 之后即可在任意时机调用 [callJs] / [evaluateJs] / [injectJs]。
///
/// 页面未 ready 时调用会自动排队，页面加载完成后批量执行。
class CollovWebViewController {
  WebViewController? _inner;
  bool _pageReady = false;
  final List<_PendingCall> _pendingCalls = [];

  /// 当前是否已附着到 WebView
  bool get isAttached => _inner != null;

  /// 页面是否已加载完毕
  bool get isPageReady => _pageReady;

  void _attach(WebViewController ctrl) {
    _inner = ctrl;
  }

  void _detach() {
    _inner = null;
    _pageReady = false;
    _pendingCalls.clear();
  }

  void _onPageStarted() {
    _pageReady = false;
  }

  void _onPageFinished() {
    _pageReady = true;
    _flushPending();
  }

  /// 调用 JS 函数（类型安全，自动编码参数）
  ///
  /// ```dart
  /// ctrl.callJs('showSection', ['todos']);
  /// ctrl.callJs('updateTodoState', [0, 'active', 'Analyzing...']);
  /// ctrl.callJs('toggleSection', ['caught']);
  /// ```
  void callJs(String functionName, [List<Object?> args = const []]) {
    final encodedArgs = args.map(_encodeJsArg).join(', ');
    final script = '$functionName($encodedArgs)';
    runJavaScript(script);
  }

  /// 执行任意 JS 代码（无返回值）
  ///
  /// 页面未 ready 时自动排队。
  void runJavaScript(String script) {
    if (_inner != null && _pageReady) {
      _inner!.runJavaScript(script);
    } else {
      _pendingCalls.add(_PendingCall(script, false));
    }
  }

  /// 执行 JS 表达式并返回结果
  ///
  /// 页面未 ready 时自动排队，ready 后按序执行。
  Future<Object> evaluateJs(String script) async {
    if (_inner != null && _pageReady) {
      return _inner!.runJavaScriptReturningResult(script);
    }
    final completer = Completer<Object>();
    _pendingCalls.add(_PendingCall(script, true, completer: completer));
    return completer.future;
  }

  /// 注入 JS 代码段（定义函数、变量等）
  ///
  /// 等价于 [runJavaScript]，语义更明确。
  void injectJs(String script) {
    runJavaScript(script);
  }

  /// 重新加载当前页面
  void reload() {
    _pageReady = false;
    _inner?.reload();
  }

  /// 加载新的 HTML 内容
  void loadHtml(String html) {
    _pageReady = false;
    _inner?.loadHtmlString(html);
  }

  /// 加载新的 URL
  void loadUrl(String url) {
    _pageReady = false;
    _inner?.loadRequest(Uri.parse(url));
  }

  // ── 内部 ──

  void _flushPending() {
    if (_inner == null) return;
    final pending = List.of(_pendingCalls);
    _pendingCalls.clear();
    for (final call in pending) {
      if (call.needsResult && call.completer != null) {
        _inner!
            .runJavaScriptReturningResult(call.script)
            .then(
              call.completer!.complete,
              onError: call.completer!.completeError,
            );
      } else {
        _inner!.runJavaScript(call.script);
      }
    }
  }

  /// 将 Dart 值编码为 JS 字面量
  static String _encodeJsArg(Object? value) {
    if (value == null) return 'null';
    if (value is num) return value.toString();
    if (value is bool) return value.toString();
    return jsonEncode(value.toString());
  }
}

class _PendingCall {
  final String script;
  final bool needsResult;
  final Completer<Object>? completer;

  _PendingCall(this.script, this.needsResult, {this.completer});
}
