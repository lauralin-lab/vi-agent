import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_html/flutter_html.dart';

import '../../../../app.dart';
import '../../../../common/extension/ui_ext.dart';
import '../../../widgets/adaptive_transition_page.dart';
import '../model/agent_output_state.dart';
import '../provider/main_provider.dart';

class LiveKitResultHtmlDialog extends ConsumerStatefulWidget {
  const LiveKitResultHtmlDialog._({required this.htmlData});

  /// 样式
  final String htmlData;

  static Future<void> show(BuildContext context, String htmlData) async {
    await showAdaptiveTransitionDialog(
      context: context,
      barrierColor: Colors.transparent,
      barrierDismissible: true,
      builder: (context) => LiveKitResultHtmlDialog._(htmlData: htmlData),
      transition: AdaptiveDialogTransitionType.fastFade,
      routeSettings: const RouteSettings(name: 'LiveKitHtmlDialog'),
    );
  }

  @override
  ConsumerState createState() => _LiveKitResultHtmlDialogState();
}

class _LiveKitResultHtmlDialogState extends ConsumerState<LiveKitResultHtmlDialog> {
  /// 渲染内容
  String _htmlData = '';

  /// 监听流
  ProviderSubscription<String>? _subscription;

  @override
  void initState() {
    super.initState();

    _htmlData = widget.htmlData;

    // 监听统一的 agentOutputProvider，提取 HTML 数据
    _subscription = ref.listenManual(
      agentOutputProvider.select((s) => s is AgentOutputHtml ? s.html : ''),
      (_, next) {
        if (next.isNotEmpty) {
          _htmlData = next;
          setState(() {});
        }
      },
    );
  }

  @override
  void dispose() {
    _subscription?.close();
    _subscription = null;
    super.dispose();
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
            child: Container(
              width: double.infinity,
              height: 350.dpx,
              color: Colors.white,
              child: SingleChildScrollView(
                child: Html(data: _htmlData),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
