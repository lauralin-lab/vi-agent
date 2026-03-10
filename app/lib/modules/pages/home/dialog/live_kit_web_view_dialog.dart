import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:rive_rolls_collection/common.dart';
import 'package:url_launcher/url_launcher_string.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../../../app.dart';
import '../../../../common/extension/ui_ext.dart';
import '../../../style/app_theme.dart';
import '../../../widgets/adaptive_transition_page.dart';
import '../model/agent_output_state.dart';
import '../provider/main_provider.dart';

class LiveKitWebViewDialog extends ConsumerStatefulWidget {
  const LiveKitWebViewDialog._({required this.loadUrl});

  /// 加载的网址
  final String loadUrl;

  static Future<void> show(BuildContext context, String loadUrl) async {
    await showAdaptiveTransitionDialog(
      context: context,
      barrierColor: Colors.transparent,
      barrierDismissible: true,
      builder: (context) => LiveKitWebViewDialog._(loadUrl: loadUrl),
      transition: AdaptiveDialogTransitionType.fastFade,
      routeSettings: const RouteSettings(name: 'LiveKitWebViewDialog'),
    );
  }

  @override
  ConsumerState createState() => _LiveKitWebViewDialogState();
}

class _LiveKitWebViewDialogState extends ConsumerState<LiveKitWebViewDialog> {
  /// loadUrl
  String _loadUrl = '';

  /// 控制器
  final _webViewController = WebViewController();

  /// 网页是否加载完成
  var _isLoading = true;

  /// 域名
  String get _host => '';//App().auth.workSpaceUrl;

  /// 监听流
  ProviderSubscription<String>? _subscription;

  @override
  void dispose() {
    _subscription?.close();
    _subscription = null;
    super.dispose();
  }

  @override
  void initState() {
    final match = RegExp(r'<workspace>(.*?)</workspace>').firstMatch(widget.loadUrl);

    if (match != null) {
      final fileName = match.group(1);
      _loadUrl = '$_host$fileName';
      logi('[WebViewDialog] initState: workspace URL resolved → $_loadUrl');
    } else {
      _loadUrl = widget.loadUrl;
      logi('[WebViewDialog] initState: loading URL=$_loadUrl');
    }

    final navDelegate = NavigationDelegate(
      onPageFinished: _onPageLoadFinished,
      onNavigationRequest: _onNavigationRequest,
      onSslAuthError: (error) {
        logw('[WebViewDialog] SSL auth error, proceeding: $error');
        error.proceed();
      },
    );

    _webViewController
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(navDelegate)
      ..enableZoom(false);
    _webViewController.loadRequest(Uri.parse(_loadUrl));

    super.initState();

    // 监听统一的 agentOutputProvider，提取 URL 数据
    _subscription = ref.listenManual(
      agentOutputProvider.select((s) => s is AgentOutputWebView ? s.url : ''),
      (_, next) {
        if (next.isEmpty) return;
        final match = RegExp(r'<workspace>(.*?)</workspace>').firstMatch(next);
        if (match != null) {
          final fileName = match.group(1);
          _loadUrl = '$_host$fileName';
          logi('[WebViewDialog] agentOutput: workspace URL updated → $_loadUrl');
        } else {
          _loadUrl = widget.loadUrl;
          logi('[WebViewDialog] agentOutput: URL updated → $_loadUrl');
        }
        _reloadWebView(_loadUrl);
      },
    );
  }

  /// reloadUrl
  void _reloadWebView(String url) {
    logi('[WebViewDialog] reloadWebView: $url');
    _isLoading = true;
    setState(() {});
    _webViewController.loadRequest(Uri.parse(url));
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      alignment: Alignment.bottomCenter,
      children: [
        Positioned(
          left: 8.dpx,
          right: 8.dpx,
          bottom: App().safeBottom,
          child: ClipRRect(
            borderRadius: BorderRadius.all(Radius.circular(20.dpx)),
            child: SizedBox(
              width: double.infinity,
              height: 350.dpx,
              child: Stack(
                children: [
                  WebViewWidget(
                    controller: _webViewController,
                  ),
                  Visibility(
                    visible: _isLoading,
                    child: context.buildLoadingAnimation(
                      alignment: Alignment.center,
                      backgroundColor: AppTheme.surfaceColor,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  /// 处理请求
  FutureOr<NavigationDecision> _onNavigationRequest(NavigationRequest request) {
    // 支持基本的协议跳转
    final basicSchemeReg = RegExp(r'^(mailto:|tel:)', caseSensitive: false);
    if (basicSchemeReg.hasMatch(request.url)) {
      logi('[WebViewDialog] external scheme, launching: ${request.url}');
      launchUrlString(request.url);
      return NavigationDecision.prevent;
    }
    logd('[WebViewDialog] navigating to: ${request.url}');
    return NavigationDecision.navigate;
  }

  /// 当加载完成
  void _onPageLoadFinished(String? url) {
    logi('[WebViewDialog] page load finished: $url');
    setState(() => _isLoading = false);
  }
}
