import 'dart:async';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:rive_rolls_collection/common.dart';

import '../../../../app.dart';
import '../../../../common/extension/ui_ext.dart';
import '../../../widgets/adaptive_transition_page.dart';
import '../../../widgets/app_image.dart';
import '../model/agent_output_state.dart';
import '../provider/main_provider.dart';

class AgentThinkOutPutDialog extends ConsumerStatefulWidget {
  const AgentThinkOutPutDialog._({required this.agentOutput});

  /// Agent Thinking过程输出
  final String agentOutput;

  static Future<void> show(BuildContext context, {required String text}) async {
    await showAdaptiveTransitionDialog(
      context: context,
      barrierColor: Colors.transparent,
      builder: (context) => AgentThinkOutPutDialog._(
        agentOutput: text,
      ),
      transition: AdaptiveDialogTransitionType.fastFade,
      routeSettings: const RouteSettings(name: 'AgentThinkOutPutDialog'),
    );
  }

  @override
  ConsumerState createState() => _AgentThinkOutPutDialogState();
}

class _AgentThinkOutPutDialogState extends ConsumerState<AgentThinkOutPutDialog> {
  /// Agent Thinking过程输出
  final List<String> _agentOutput = [];

  /// 监听流
  ProviderSubscription<String>? _subscription;

  /// 控制底部显示的Provider
  final onBottomDialogShowDialog = StateProvider.autoDispose<bool>((ref) => false, name: 'onBottomDialogShowDialog');

  @override
  void initState() {
    super.initState();

    _agentOutput.add(widget.agentOutput);

    _subscription = ref.listenManual(
      agentOutputProvider.select((s) => s is AgentOutputThinking ? s.text : ''),
      (_, next) {
        if (next.isNotEmpty) {
          if (_agentOutput.length >= 3) {
            _agentOutput.removeAt(0);
          }
          _agentOutput.add(widget.agentOutput);
          if (!mounted) return;
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

  /// 修改底部显示状态
  void _onToggleBottomDialog() {
    final showed = ref.read(onBottomDialogShowDialog);
    ref.read(onBottomDialogShowDialog.notifier).state = !showed;
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: Stack(
        alignment: Alignment.bottomCenter,
        children: [
          Positioned.fill(
            child: InkWell(
              onTap: () {
                final showed = ref.read(onBottomDialogShowDialog);
                if (showed) return;
                _onToggleBottomDialog();
              },
              child: const SizedBox.shrink(),
            ),
          ),
          Container(
            width: double.infinity,
            height: 200.dpx,
            margin: EdgeInsets.only(bottom: App().safeBottom + 84.dpx, left: 10.dpx, right: 10.dpx),
            padding: EdgeInsets.symmetric(horizontal: 24.dpx, vertical: 20.dpx),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.all(Radius.circular(20.dpx)),
              gradient: const LinearGradient(
                colors: [Color(0xFFF5F5F5), Color(0xFFEEEFF1)],
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ...List.generate(_agentOutput.length, (index) {
                  return Column(
                    children: [_buildItem(index), Gap(10.dpx)],
                  );
                }),
                const Spacer(),
                RichText(
                  text: TextSpan(
                    style: TextStyle(fontSize: 12.dpx),
                    children: [
                      const TextSpan(
                        text: 'Task is running in the background\nYou can find it later on ',
                        style: TextStyle(
                          color: Colors.black,
                        ),
                      ),
                      WidgetSpan(
                        alignment: PlaceholderAlignment.baseline,
                        baseline: TextBaseline.alphabetic,
                        child: ShaderMask(
                          shaderCallback: (bounds) {
                            return const LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [Color(0xFF060B0F), Color(0xFF3F5563), Color(0xFF8C908F), Color(0xFF888C8B)],
                            ).createShader(bounds);
                          },
                          child: const Text(
                            'Home → Threads',
                            style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                              decoration: TextDecoration.underline,
                              decorationColor: Colors.white,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Consumer(
            builder: (context, ref, _) {
              final showed = ref.watch(onBottomDialogShowDialog);
              return Positioned(
                left: 8.dpx,
                right: 8.dpx,
                bottom: App().safeBottom,
                child: AnimatedSwitcher(
                  duration: 200.ms,
                  child: showed ? _buildConfirmDialog(context) : const SizedBox.shrink(key: ValueKey(false)),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  /// 构建Item
  Widget _buildItem(int index) {
    return Row(
      children: [
        if (index == _agentOutput.length - 1)
          context.buildCircularLoading(size: 11.dpx, strokeWidth: 2.dpx, color: Colors.black)
        else
          AppImage.asset(
            'assets/images/ic_flower.webp',
            width: 16.dpx,
            height: 16.dpx,
          ),
        Gap(10.dpx),
        Expanded(
          child: Text(
            _agentOutput[index],
            style: TextStyle(fontSize: 14.dpx, color: const Color(0xFF171819)),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }

  /// 底部二次确认弹框
  Widget _buildConfirmDialog(BuildContext context) {
    return Container(
      key: const ValueKey(true),
      width: double.infinity,
      padding: EdgeInsets.symmetric(horizontal: 20.dpx),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.all(Radius.circular(36.dpx)),
        gradient: const LinearGradient(
          colors: [Color(0xFFF5F5F5), Color(0xFFEEEFF1)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Gap(16.dpx),
          Text(
            'End current task?',
            style: TextStyle(fontWeight: FontWeight.w500, fontSize: 16.dpx),
          ),
          Gap(36.dpx),
          AppImage.asset(
            'assets/images/ic_end_task.webp',
            width: 100.dpx,
            height: 100.dpx,
            fit: BoxFit.cover,
          ),
          Gap(32.dpx),
          Text(
            'This task will continue running in the background. You can view progress and results anytime on Home.',
            style: TextStyle(fontSize: 12.dpx),
          ),
          Gap(22.dpx),
          Row(
            children: [
              Expanded(
                child: _buildBottomButton(
                  'View Task on Home',
                  onTap: () => Navigator.pop(context),
                ),
              ),
              Gap(10.dpx),
              Expanded(
                child: _buildBottomButton(
                  'Stay',
                  onTap: _onToggleBottomDialog,
                ),
              ),
            ],
          ),
          Gap(24.dpx),
        ],
      ),
    );
  }

  /// 底部按钮
  Widget _buildBottomButton(String content, {required VoidCallback onTap}) {
    return InkWell(
      onTap: onTap,
      child: Container(
        height: 44.dpx,
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.all(Radius.circular(20.dpx))),
        child: Center(
          child: Text(
            content,
            style: TextStyle(color: const Color(0xFF1A1B1E), fontWeight: FontWeight.w500, fontSize: 12.dpx),
          ),
        ),
      ),
    );
  }
}
