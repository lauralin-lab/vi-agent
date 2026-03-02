import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'app_webview.dart';

/// 全屏 WebView 页面
///
/// 包含完整 toolbar（后退、前进、刷新、分享、关闭），
/// 内部使用 [AppWebView] 显示网页内容。
class FullscreenWebViewPage extends StatefulWidget {
  final String url;

  const FullscreenWebViewPage({super.key, required this.url});

  /// 以全屏模式打开（带顺滑动画）
  static Future<void> open(BuildContext context, String url) {
    return Navigator.of(context).push(
      PageRouteBuilder(
        opaque: false,
        pageBuilder: (context, animation, secondaryAnimation) => FullscreenWebViewPage(url: url),
        transitionsBuilder: (context, animation, secondaryAnimation, child) {
          final curved = CurvedAnimation(
            parent: animation,
            curve: Curves.easeOutCubic,
          );
          return FadeTransition(
            opacity: curved,
            child: ScaleTransition(
              scale: Tween<double>(begin: 0.92, end: 1.0).animate(curved),
              child: child,
            ),
          );
        },
        transitionDuration: const Duration(milliseconds: 350),
        reverseTransitionDuration: const Duration(milliseconds: 280),
      ),
    );
  }

  @override
  State<FullscreenWebViewPage> createState() => _FullscreenWebViewPageState();
}

class _FullscreenWebViewPageState extends State<FullscreenWebViewPage> {
  late final WebViewController _controller;
  bool _isLoaded = false;
  bool _canGoBack = false;
  bool _canGoForward = false;
  String _currentUrl = '';
  double _loadingProgress = 0;

  @override
  void initState() {
    super.initState();
    _currentUrl = widget.url;
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (progress) {
            if (mounted) setState(() => _loadingProgress = progress / 100.0);
          },
          onPageStarted: (_) {
            if (mounted) setState(() => _isLoaded = false);
          },
          onPageFinished: (url) async {
            if (!mounted) return;
            final back = await _controller.canGoBack();
            final forward = await _controller.canGoForward();
            setState(() {
              _isLoaded = true;
              _canGoBack = back;
              _canGoForward = forward;
              _currentUrl = url;
            });
          },
        ),
      )
      ..loadRequest(Uri.parse(widget.url));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        titleSpacing: 0,
        leading: IconButton(
          icon: const Icon(Icons.close, color: Colors.black87, size: 22),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              Uri.tryParse(_currentUrl)?.host ?? _currentUrl,
              style: const TextStyle(
                fontSize: 14,
                color: Colors.black87,
                fontWeight: FontWeight.w500,
              ),
              overflow: TextOverflow.ellipsis,
            ),
            Text(
              _currentUrl,
              style: const TextStyle(
                fontSize: 11,
                color: Colors.black38,
                fontWeight: FontWeight.w400,
              ),
              overflow: TextOverflow.ellipsis,
              maxLines: 1,
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: Icon(
              Icons.arrow_back_ios_new,
              size: 18,
              color: _canGoBack ? Colors.black87 : Colors.black26,
            ),
            onPressed: _canGoBack ? () => _controller.goBack() : null,
          ),
          IconButton(
            icon: Icon(
              Icons.arrow_forward_ios,
              size: 18,
              color: _canGoForward ? Colors.black87 : Colors.black26,
            ),
            onPressed: _canGoForward ? () => _controller.goForward() : null,
          ),
          IconButton(
            icon: const Icon(Icons.refresh, size: 20, color: Colors.black87),
            onPressed: () => _controller.reload(),
          ),
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert, size: 20, color: Colors.black87),
            onSelected: (value) async {
              switch (value) {
                case 'share':
                  await SharePlus.instance.share(ShareParams(uri: Uri.parse(_currentUrl)));
                  break;
                case 'open':
                  final uri = Uri.parse(_currentUrl);
                  if (await canLaunchUrl(uri)) {
                    launchUrl(uri, mode: LaunchMode.externalApplication);
                  }
                  break;
              }
            },
            itemBuilder: (_) => [
              const PopupMenuItem(value: 'share', child: Text('Share')),
              const PopupMenuItem(value: 'open', child: Text('Open in Browser')),
            ],
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(2),
          child: AnimatedOpacity(
            opacity: _isLoaded ? 0.0 : 1.0,
            duration: const Duration(milliseconds: 200),
            child: LinearProgressIndicator(
              value: _loadingProgress,
              backgroundColor: Colors.grey[200],
              valueColor: const AlwaysStoppedAnimation<Color>(Colors.black87),
              minHeight: 2,
            ),
          ),
        ),
      ),
      body: AppWebView(
        url: _currentUrl,
        height: double.infinity,
        showFullscreenButton: false,
      ),
    );
  }
}
