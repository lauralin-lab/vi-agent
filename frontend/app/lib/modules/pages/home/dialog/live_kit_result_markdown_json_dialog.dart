import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../common/extension/ui_ext.dart';
import '../../../models/live_kit_show_result_model.dart';
import '../../../widgets/adaptive_transition_page.dart';
import '../model/agent_output_state.dart';
import '../provider/main_provider.dart';

class LiveKitResultMarkdownJsonDialog extends ConsumerStatefulWidget {
  const LiveKitResultMarkdownJsonDialog._({required this.markdownOrJson, required this.type});

  /// markdown or json 内容
  final String markdownOrJson;

  /// 类型
  final LiveKitShowResultType type;

  static Future<void> show(
    BuildContext context, {
    required String markdownOrJson,
    required LiveKitShowResultType type,
  }) async {
    await showAdaptiveTransitionDialog(
      context: context,
      barrierDismissible: true,
      barrierColor: Colors.transparent,
      builder: (context) => LiveKitResultMarkdownJsonDialog._(
        markdownOrJson: markdownOrJson,
        type: type,
      ),
      transition: AdaptiveDialogTransitionType.fastFade,
      routeSettings: const RouteSettings(name: 'LiveKitResultMarkdownJsonDialog'),
    );
  }

  @override
  ConsumerState createState() => _LiveKitResultMarkdownJsonDialogState();
}

class _LiveKitResultMarkdownJsonDialogState extends ConsumerState<LiveKitResultMarkdownJsonDialog> {
  /// 显示内容
  late String _displayText = widget.markdownOrJson;

  /// 类型
  late LiveKitShowResultType _type = widget.type;

  /// 监听流
  ProviderSubscription? _subscription;

  @override
  void initState() {
    super.initState();

    _subscription = ref.listenManual<({String content, LiveKitShowResultType type})?>(
      agentOutputProvider.select((s) => s is AgentOutputMarkdownJson ? (content: s.content, type: s.type) : null),
      (_, next) {
        if (next == null) return;
        _displayText = next.content;
        _type = next.type;
        setState(() {});
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
          bottom: 30.dpx,
          child: Container(
            width: double.infinity,
            constraints: BoxConstraints(maxHeight: 350.dpx),
            padding: EdgeInsets.all(8.dpx),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.all(Radius.circular(20.dpx))),
            child: _type.isMarkdown
                ? Markdown(
                    physics: const ClampingScrollPhysics(),
                    data: _displayText,
                    styleSheet: MarkdownStyleSheet(
                      p: TextStyle(color: Colors.black87, fontSize: 14.dpx),
                    ),
                  )
                : SingleChildScrollView(
                    physics: const ClampingScrollPhysics(),
                    child: Text(
                      _displayText,
                      style: TextStyle(color: Colors.black87, fontSize: 14.dpx),
                    ),
                  ),
          ),
        ),
      ],
    );
  }
}
