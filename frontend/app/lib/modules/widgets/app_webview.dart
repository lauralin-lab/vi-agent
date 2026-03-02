import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'app_fullscreen_webview.dart';

/// 可复用的内嵌 WebView 组件
///
/// 默认以圆角卡片形式展示网页内容，右上角带放大按钮可进入全屏模式。
/// 可通过 [height] 自定义高度（默认 300）。
class AppWebView extends StatefulWidget {
  /// 要加载的 URL
  final String url;

  /// 内嵌模式的高度，默认 300
  final double height;

  /// 是否显示右上角的全屏放大按钮，默认 true
  final bool showFullscreenButton;

  const AppWebView({
    super.key,
    required this.url,
    this.height = 300,
    this.showFullscreenButton = true,
  });

  @override
  State<AppWebView> createState() => _AppWebViewState();
}

class _AppWebViewState extends State<AppWebView> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..loadRequest(Uri.parse(widget.url));
  }

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: SizedBox(
        width: double.infinity,
        height: widget.height,
        child: Stack(
          children: [
            Positioned.fill(
              child: WebViewWidget(controller: _controller),
            ),
            if (widget.showFullscreenButton)
              Positioned(
                top: 4,
                right: 4,
                child: GestureDetector(
                  onTap: () => FullscreenWebViewPage.open(context, widget.url),
                  child: Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.45),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Icon(
                      Icons.fullscreen,
                      color: Colors.white,
                      size: 18,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
