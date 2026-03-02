import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../app.dart';
import '../../../../common/extension/ui_ext.dart';
import '../../../widgets/adaptive_transition_page.dart';
import '../model/agent_output_state.dart';
import '../provider/main_provider.dart';

class AgentTalkOutPutTextDialog extends ConsumerStatefulWidget {
  const AgentTalkOutPutTextDialog._({required this.displayArr});

  /// 展示的内容
  final List<String> displayArr;

  static Future<void> show(
    BuildContext context, {
    required List<String> displayArr,
  }) async {
    final ref = ProviderScope.containerOf(context);
    await showAdaptiveTransitionDialog(
      context: context,
      barrierColor: Colors.transparent,
      barrierDismissible: true,
      builder: (context) => AgentTalkOutPutTextDialog._(displayArr: displayArr),
      transition: AdaptiveDialogTransitionType.fastFade,
      routeSettings: const RouteSettings(name: 'AgentTalkOutPutTextDialog'),
    );
  }

  @override
  ConsumerState createState() => _AgentTalkOutPutTextDialogState();
}

class _AgentTalkOutPutTextDialogState extends ConsumerState<AgentTalkOutPutTextDialog> {
  /// 监听流
  ProviderSubscription<List<String>>? _subscription;

  /// 展示的内容
  List<String> _displayArr = [];

  @override
  void initState() {
    super.initState();

    _displayArr = List.from(widget.displayArr);

    // 监听统一的 agentOutputProvider，提取文本数据
    _subscription = ref.listenManual(
      agentOutputProvider.select((s) => s is AgentOutputTalkText ? s.texts : <String>[]),
      (_, next) {
        if (next.isNotEmpty) {
          _displayArr = List.from(next);
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
      children: [
        Positioned(
          top: App().safeTop + 48.dpx,
          left: 8.dpx,
          right: 8.dpx,
          bottom: App().safeBottom,
          child: Align(
            alignment: Alignment.topCenter,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(6.dpx),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 36, sigmaY: 36),
                child: Container(
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.4),
                    borderRadius: BorderRadius.circular(6.dpx),
                  ),
                  child: ListView.builder(
                    padding: EdgeInsets.symmetric(horizontal: 10.dpx),
                    itemCount: _displayArr.length,
                    shrinkWrap: true,
                    reverse: true,
                    physics: const ClampingScrollPhysics(),
                    itemBuilder: (context, index) {
                      return Container(
                        padding: EdgeInsets.symmetric(vertical: 10.dpx),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              margin: EdgeInsets.only(top: 7.dpx),
                              width: 5.dpx,
                              height: 5.dpx,
                              decoration: const BoxDecoration(
                                color: Colors.white,
                                shape: BoxShape.circle,
                              ),
                            ),
                            SizedBox(width: 6.dpx),
                            Expanded(
                              child: Text(
                                _displayArr[_displayArr.length - index - 1],
                                style: TextStyle(fontSize: 12.dpx, height: 1.2.dpx, color: Colors.white),
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
