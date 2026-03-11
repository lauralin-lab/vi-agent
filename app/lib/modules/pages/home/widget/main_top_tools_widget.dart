import 'dart:async';
import 'dart:collection';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:rive_rolls_collection/common.dart';
import '../../../../common/extension/ui_ext.dart';
import '../../../widgets/app_image.dart';
import '../../../widgets/typewriter_text.dart';
import '../livekit/live_kit_controller.dart';
import '../provider/main_provider.dart';
import 'camera_action_button.dart';
import 'connection_state_widgets.dart';

class MainTopToolsWidget extends ConsumerStatefulWidget {
  const MainTopToolsWidget({
    super.key,
    this.onAction,
  });

  /// Action callback
  final ValueChanged<CameraActionType>? onAction;

  @override
  ConsumerState createState() => _MainTopToolsWidgetState();
}

class _MainTopToolsWidgetState extends ConsumerState<MainTopToolsWidget> {
  /// TypewriterText controllers（只创建一次，避免 rebuild 重播动画）
  late TypewriterTextController _typewriterTextController;

  /// 待显示的消息队列
  final Queue<String> _pendingMessages = Queue<String>();

  /// 当前是否正在打字动画中
  bool _isAnimating = false;

  /// 用于给 TypewriterText 提供唯一 key，controller 切换时强制重建 State
  int _typewriterKey = 0;

  /// Agent 消息流订阅
  StreamSubscription<String>? _agentSubscription;

  @override
  void initState() {
    super.initState();

    // 初始化介绍语，等待真实消息到来时会被替换
    final introBuf = SampleTextBuffer(
      "Hi! I'm your AI camera assistant. Point me at anything and I'll tell you all about it.",
    );
    introBuf.markEof();
    _typewriterTextController = TypewriterTextController(text: introBuf, speed: 20);

    // 订阅 Agent 消息流
    _agentSubscription = ref.read(liveKitControllerProvider).agentRecorder.stream.listen((message) {
      _pendingMessages.add(message);
      if (!_isAnimating) {
        _startNextMessage();
      }
    });
  }

  /// 从队列中取出下一条消息并开始打字动画
  void _startNextMessage() {
    if (_pendingMessages.isEmpty) {
      _isAnimating = false;
      return;
    }
    _isAnimating = true;
    final message = _pendingMessages.removeFirst();
    final buf = SampleTextBuffer(message);
    // 消息已完整接收，标记 eof 让动画知道何时结束
    buf.markEof();
    setState(() {
      _typewriterKey++;
      _typewriterTextController = TypewriterTextController(text: buf, speed: 20);
    });
  }

  @override
  void dispose() {
    _agentSubscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: 12.dpx),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _leftTools(context),
              _middleTools(context),
              _rightTools(context),
            ],
          ),
          Gap(12.dpx),
          _buildAgentOutput(context),
        ],
      ),
    );
  }

  /// 左部工具
  Widget _leftTools(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        CameraActionsButton(
          size: CameraActionsButtonSize.medium,
          onTap: () => widget.onAction?.call(CameraActionType.back),
          child: Icon(Icons.arrow_back, color: Colors.white, size: 16.dpx),
        ),
      ],
    );
  }

  /// 中间LiveKit状态
  Widget _middleTools(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.all(Radius.circular(26.dpx)),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 18.dpx, sigmaY: 18.dpx),
        child: Container(
          padding: EdgeInsets.symmetric(horizontal: 12.dpx),
          height: 26.dpx,
          decoration: BoxDecoration(
            color: const Color(0x59000000),
            borderRadius: BorderRadius.all(Radius.circular(26.dpx)),
            border: Border.all(color: const Color(0x14FFFFFF), width: 1.dpx),
          ),
          child: Consumer(
            builder: (context, ref, _) {
              final connectStatus = ref.watch(connectionStatusProvider);
              return AnimatedSwitcher(
                duration: 300.ms,
                child: Row(
                  key: ValueKey(connectStatus),
                  children: [
                    connectStatus.icon,
                    Gap(8.dpx),
                    Text(
                      connectStatus.statusText,
                      style: TextStyle(
                        color: connectStatus.titleColor,
                        fontSize: 11.dpx,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  /// 右部工具
  Widget _rightTools(BuildContext context) {
    return Row(
      children: [
        CameraActionsButton(
          size: CameraActionsButtonSize.medium,
          onTap: () => widget.onAction?.call(CameraActionType.toggleCamera),
          child: AppImage.asset(
            'assets/images/ic_camera_switch.webp',
            width: 16.dpx,
            height: 16.dpx,
          ),
        ),
      ],
    );
  }

  /// AI输出框
  Widget _buildAgentOutput(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(16.dpx),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 20.dpx, sigmaY: 20.dpx),
        child: Container(
          padding: EdgeInsets.symmetric(horizontal: 16.dpx, vertical: 12.dpx),
          width: double.infinity,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16.dpx),
            gradient: const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0x59000000), Color(0x8C000000)],
            ),
            border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Consumer(
                builder: (context, ref, _) {
                  final connectStatus = ref.watch(connectionStatusProvider);
                  return Row(
                    children: [
                      connectStatus.dot,
                      Gap(4.dpx),
                      connectStatus.aiTitle,
                    ],
                  );
                },
              ),
              Gap(10.dpx),
              TypewriterText(
                key: ValueKey(_typewriterKey),
                controller: _typewriterTextController,
                onEnded: _startNextMessage,
                builder: (text) => Text(
                  text,
                  style: TextStyle(color: Colors.white, fontSize: 12.dpx),
                  maxLines: 5,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
