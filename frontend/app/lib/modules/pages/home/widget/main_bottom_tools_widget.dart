import 'dart:async';
import 'dart:collection';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:rive_rolls_collection/common.dart';
import '../../../../app.dart';
import '../../../../common/extension/ui_ext.dart';
import '../../../widgets/app_image.dart';
import '../../../widgets/typewriter_text.dart';
import '../livekit/live_kit_controller.dart';
import '../provider/main_provider.dart';
import 'camera_action_button.dart';

class MainBottomToolsWidget extends ConsumerStatefulWidget {
  const MainBottomToolsWidget({
    super.key,
    this.onAction,
    required this.promptTF,
    required this.promptFocusNode,
  });

  /// Action callback
  final ValueChanged<CameraActionType>? onAction;

  /// PromptTF
  final TextEditingController promptTF;

  /// PromptFocus
  final FocusNode promptFocusNode;

  @override
  ConsumerState<MainBottomToolsWidget> createState() => _MainBottomToolsWidgetState();
}

class _MainBottomToolsWidgetState extends ConsumerState<MainBottomToolsWidget> {
  /// 是否输入模式
  bool _inputMode = false;

  /// 拖动坐标
  double _dragOffset = 0.0;

  /// TypewriterText controllers（只创建一次，避免 rebuild 重播动画）
  late final TypewriterTextController _beforeController;

  /// LiveKit 连接后的打印机控制器（消息切换时重建）
  late TypewriterTextController _afterController;

  /// 待显示的消息队列
  final Queue<String> _pendingMessages = Queue<String>();

  /// 当前是否正在打字动画中
  bool _isAnimating = false;

  /// 用于给 TypewriterText 提供唯一 key，controller 切换时强制重建 State
  int _afterControllerVersion = 0;

  /// Agent 消息流订阅
  StreamSubscription<String>? _agentSubscription;

  @override
  void initState() {
    super.initState();
    _beforeController = TypewriterTextController(
      text: SampleTextBuffer('Capture and pass to my deep brain. I can directly do something for you'),
      speed: 20,
    );

    // 初始化介绍语，等待真实消息到来时会被替换
    final introBuf = SampleTextBuffer(
      "Hi! I'm your AI camera assistant. Point me at anything and I'll tell you all about it.",
    );
    introBuf.markEof();
    _afterController = TypewriterTextController(text: introBuf, speed: 20);

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
      _afterControllerVersion++;
      _afterController = TypewriterTextController(text: buf, speed: 20);
    });
  }

  @override
  void dispose() {
    _agentSubscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        AnimatedSwitcher(
          duration: 300.ms,
          layoutBuilder: (currentChild, previousChildren) {
            return Stack(
              alignment: Alignment.bottomCenter,
              children: [
                ...previousChildren,
                if (currentChild != null) currentChild,
              ],
            );
          },
          child: _inputMode ? _buildInput(context) : _buildTypeWriterWindows(context),
        ),
        Gap(18.dpx),
        _buildCameraTools(context),
      ],
    );
  }

  /// 输出框
  Widget _buildTypeWriterWindows(BuildContext context) {
    return Consumer(
      builder: (context, ref, _) {
        final connectStatus = ref.watch(connectionStatusProvider);
        return GestureDetector(
          key: const ValueKey('normal'),
          onHorizontalDragUpdate: (details) {
            if (!connectStatus.isConnected) return;
            setState(() {
              _dragOffset = (_dragOffset + details.delta.dx).clamp(-120.0, 0.0);
            });
          },
          onHorizontalDragEnd: (details) {
            if (!connectStatus.isConnected) return;
            setState(() {
              if (_dragOffset < -60) {
                _inputMode = true;
                widget.onAction?.call(CameraActionType.requestActionCard);
              }
              _dragOffset = 0.0;
            });
          },
          child: Transform.translate(
            offset: Offset(_dragOffset, 0),
            child: Opacity(
              opacity: (1.0 + (_dragOffset / 240.0)).clamp(0.5, 1.0),
              child: _buildFrostedPanel(
                child: AnimatedSwitcher(
                  duration: 300.ms,
                  child: connectStatus.isConnected
                      ? _buildLiveKitConnectAfter(context)
                      : _buildLiveKitConnectBefore(context),
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  /// LiveKit连接前
  Widget _buildLiveKitConnectBefore(BuildContext context) {
    return Column(
      key: const ValueKey('before'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TypewriterText(
          controller: _beforeController,
          builder: (text) => Text(
            text,
            style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 12.dpx),
          ),
        ),
        Gap(10.dpx),
        Row(
          children: [
            Icon(Icons.lightbulb, color: Colors.yellowAccent, size: 9.dpx),
            Gap(4.dpx),
            Text(
              'Or say / type what you want',
              style: TextStyle(color: Colors.white.withValues(alpha: 0.4), fontSize: 10.dpx),
            ),
          ],
        ),
        Gap(8.dpx),
        Row(
          children: [
            const Spacer(),
            context.buildCameraBtnLayer(
              onTap: () => widget.onAction?.call(CameraActionType.capture),
              size: const Size(100, 32),
              child: Center(
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      'Snap First',
                      style: TextStyle(color: Colors.white, fontSize: 10.dpx),
                    ),
                    Gap(6.dpx),
                    Icon(Icons.arrow_forward_ios, color: Colors.white.withValues(alpha: 0.4), size: 9.dpx),
                  ],
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  /// LiveKit连接后
  Widget _buildLiveKitConnectAfter(BuildContext context) {
    return Column(
      key: const ValueKey('after'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.remove_red_eye_sharp, size: 12.dpx, color: Colors.white.withValues(alpha: 0.2)),
            Gap(4.dpx),
            Text(
              'AI VIEWING...',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.4),
                fontSize: 10.dpx,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
        Gap(10.dpx),
        TypewriterText(
          key: ValueKey(_afterControllerVersion),
          controller: _afterController,
          onEnded: _startNextMessage,
          builder: (text) => Text(
            text,
            style: TextStyle(color: Colors.white, fontSize: 12.dpx),
            maxLines: 5,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        Gap(10.dpx),
        Row(
          children: [
            Text(
              'Not right？Swipe left',
              style: TextStyle(color: Colors.white.withValues(alpha: 0.2), fontSize: 8.dpx),
            ),
            Gap(2.dpx),
            Icon(Icons.arrow_back, color: Colors.white.withValues(alpha: 0.2), size: 8.dpx),
            const Spacer(),
            context.buildCameraBtnLayer(
              size: const Size(100, 32),
              onTap: () => widget.onAction?.call(CameraActionType.preChat),
              child: Center(
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      'Deep Dive',
                      style: TextStyle(color: Colors.white, fontSize: 10.dpx),
                    ),
                    Gap(6.dpx),
                    Icon(Icons.arrow_forward_ios, color: Colors.white.withValues(alpha: 0.8), size: 9.dpx),
                  ],
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  /// 拍照按钮工具栏
  Widget _buildCameraTools(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(left: 60.dpx, bottom: App().safeBottom, right: 60.dpx),
      child: Row(
        children: [
          Expanded(
            child: Align(
              alignment: Alignment.centerLeft,
              child: Consumer(
                builder: (context, ref, _) {
                  final isMute = ref.watch(muteProvider);
                  return CameraActionsButton(
                    size: CameraActionsButtonSize.regular,
                    onTap: () => widget.onAction?.call(CameraActionType.mute),
                    child: AppImage.asset(
                      isMute ? 'assets/images/ic_mic_closed.webp' : 'assets/images/ic_mic_open.webp',
                      width: 22.dpx,
                      height: 22.dpx,
                    ),
                  );
                },
              ),
            ),
          ),
          CameraActionsButton(
            size: CameraActionsButtonSize.large,
            onTap: () => widget.onAction?.call(CameraActionType.capture),
            border: Border.all(color: Colors.white.withValues(alpha: 0.4), width: 3.dpx),
            child: Container(
              margin: EdgeInsets.all(2.dpx),
              decoration: const BoxDecoration(shape: BoxShape.circle, color: Colors.white),
            ),
          ),
          const Expanded(child: SizedBox.shrink()),
        ],
      ),
    );
  }

  /// 输入框模式
  Widget _buildInput(BuildContext context) {
    return _buildFrostedPanel(
      key: const ValueKey('input'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Consumer(
                builder: (context, ref, _) {
                  final actionCard = ref.watch(actionCardProvider);
                  final title = actionCard?.title ?? 'What would you like instead?';
                  return Text(
                    title,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.5),
                      fontSize: 11.dpx,
                      fontWeight: FontWeight.w500,
                    ),
                  );
                },
              ),
              GestureDetector(
                onTap: () {
                  widget.promptTF.clear();
                  setState(() => _inputMode = false);
                },
                child: Container(
                  padding: EdgeInsets.all(4.dpx),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white.withValues(alpha: 0.1),
                  ),
                  child: AppImage.asset(
                    'assets/images/ic_close_small.webp',
                    width: 10.dpx,
                    height: 10.dpx,
                  ),
                ),
              ),
            ],
          ),
          Gap(12.dpx),
          Consumer(
            builder: (context, ref, _) {
              final options = ref.watch(actionCardProvider)?.options ?? [];
              if (options.isEmpty) return const SizedBox.shrink();
              return Wrap(
                spacing: 6.dpx,
                runSpacing: 6.dpx,
                children: options
                    .map(
                      (label) => _buildTag(
                        label,
                        onTap: () {
                          widget.promptTF.text = label;
                          widget.onAction?.call(CameraActionType.preChat);
                        },
                      ),
                    )
                    .toList(),
              );
            },
          ),
          Gap(12.dpx),
          Row(
            children: [
              Expanded(
                child: Container(
                  height: 32.dpx,
                  padding: EdgeInsets.symmetric(horizontal: 12.dpx),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.05),
                    borderRadius: BorderRadius.circular(16.dpx),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                  ),
                  child: Center(
                    child: TextField(
                      controller: widget.promptTF,
                      focusNode: widget.promptFocusNode,
                      textAlignVertical: TextAlignVertical.center,
                      style: TextStyle(color: Colors.white70, fontSize: 12.dpx, height: 1.0),
                      cursorHeight: 12.dpx,
                      cursorColor: Colors.white.withValues(alpha: 0.6),
                      decoration: InputDecoration(
                        hintText: "Or tell me what you want...",
                        hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.25), fontSize: 12.dpx),
                        border: InputBorder.none,
                        isCollapsed: true,
                      ),
                    ),
                  ),
                ),
              ),
              Gap(6.dpx),
              InkWell(
                onTap: () => widget.onAction?.call(CameraActionType.preChat),
                child: Container(
                  width: 32.dpx,
                  height: 32.dpx,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.09),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    Icons.chevron_right,
                    color: Colors.white.withValues(alpha: 0.5),
                    size: 18.dpx,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildTag(String label, {VoidCallback? onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: EdgeInsets.symmetric(horizontal: 12.dpx, vertical: 6.dpx),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(20.dpx),
          border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: Colors.white70,
            fontSize: 10.dpx,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
    );
  }

  /// 毛玻璃卡片容器
  Widget _buildFrostedPanel({Key? key, required Widget child}) {
    return Padding(
      key: key,
      padding: EdgeInsets.symmetric(horizontal: 20.dpx),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20.dpx),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 18.dpx, sigmaY: 18.dpx),
          child: Container(
            padding: EdgeInsets.all(12.dpx),
            width: double.infinity,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20.dpx),
              border: Border.all(color: Colors.white.withValues(alpha: 0.2), width: 1.dpx),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.2),
                  offset: const Offset(0, -1),
                  blurStyle: BlurStyle.inner,
                ),
              ],
            ),
            child: child,
          ),
        ),
      ),
    );
  }
}
