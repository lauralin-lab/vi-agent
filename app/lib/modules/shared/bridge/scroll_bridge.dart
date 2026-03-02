import '../collov_webview.dart';

/// 滚动监听桥 — 监听 WebView 内的滚动位置
///
/// JS 端通过 `FlutterScroll.postMessage('1'/'0')` 通知滚动状态
///
/// ```dart
/// final scrollBridge = ScrollBridge(onScrollChanged: (scrolled) {
///   setState(() => _scrolledDown = scrolled);
/// });
///
/// CollovWebView(
///   channels: [...scrollBridge.channels],
/// )
/// ```
class ScrollBridge {
  ScrollBridge({required this.onScrollChanged});

  /// 滚动状态变化回调 (true = 已滚动, false = 顶部)
  final void Function(bool scrolled) onScrollChanged;

  bool _scrolled = false;

  /// 当前是否已滚动
  bool get isScrolled => _scrolled;

  /// 返回需要注册的 JS channel
  List<JsBridgeChannel> get channels => [
        JsBridgeChannel(
          name: 'FlutterScroll',
          onMessage: (msg) {
            final scrolled = msg == '1';
            if (scrolled != _scrolled) {
              _scrolled = scrolled;
              onScrollChanged(scrolled);
            }
          },
        ),
      ];
}
