import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../common/extension/ui_ext.dart';
import '../../../common/utils/photo_utils.dart';
import '../../../modules/pages/center/provider/thread_provider.dart';
import '../../../modules/pages/home/model/media_model.dart';
import '../../../modules/widgets/app_bar_blur.dart';
import 'session_detail_provider.dart';
import 'widget/message_bubble.dart';
import 'widget/typing_indicator_bubble.dart';

class SessionDetailPage extends ConsumerStatefulWidget {
  const SessionDetailPage({
    super.key,
    required this.sessionKey,
  });

  /// Session Key（从路由传入）
  final String sessionKey;

  @override
  ConsumerState<SessionDetailPage> createState() => _SessionDetailPageState();
}

class _SessionDetailPageState extends ConsumerState<SessionDetailPage> {
  /// 输入控制器
  final TextEditingController _inputController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final FocusNode _inputFocusNode = FocusNode();

  /// 是否是程序滚动（非用户滚动）
  bool _isProgrammaticScroll = false;

  /// Session Key
  String get _sessionKey => widget.sessionKey;

  @override
  void initState() {
    super.initState();
    // 监听输入框焦点变化
    _inputFocusNode.addListener(_onFocusChange);
  }

  @override
  void dispose() {
    _inputController.dispose();
    _scrollController.dispose();
    _inputFocusNode.removeListener(_onFocusChange);
    _inputFocusNode.dispose();
    super.dispose();
  }

  /// 输入框焦点变化回调
  void _onFocusChange() {
    if (_inputFocusNode.hasFocus) {
      // 获得焦点时，等待键盘弹出后滚动到底部
      _isProgrammaticScroll = true;
      Future.delayed(const Duration(milliseconds: 300), () {
        if (mounted) {
          _scrollToBottom();
          _isProgrammaticScroll = false;
        }
      });
    }
  }

  /// 选择图片
  Future<void> _pickImage() async {
    final result = await PhotoUtils().pickerPhoto(context);
    if (result != null && mounted) {
      ref
          .read(sessionDetailProvider(_sessionKey).notifier)
          .addImage(
            MediaModel(
              path: result.file.path,
              isVideo: result.videoFile != null,
              duration: result.duration,
              videoPath: result.videoFile?.path,
            ),
          );
    }
  }

  /// 发送消息
  void _sendMessage(String message) {
    if (message.trim().isEmpty) return;
    ref.read(sessionDetailProvider(_sessionKey).notifier).sendMessage(message);
    _inputController.clear();
    // 发送后保持键盘打开
    _inputFocusNode.requestFocus();
  }

  /// 滚动到底部（reverse 模式下滚动到 0）
  void _scrollToBottom({bool animate = true}) {
    if (_scrollController.hasClients) {
      if (animate) {
        _scrollController.animateTo(
          0, // reverse: true 时，0 是最新消息位置
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      } else {
        _scrollController.jumpTo(0);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(sessionDetailProvider(_sessionKey));

    return Scaffold(
      backgroundColor: const Color(0xFFF2F2F3),
      appBar: TransitionNavigationBar(
        title: ref.watch(threadListProvider.notifier).getThreadSessionByKey(_sessionKey)?.title ?? 'Chat',
      ),
      body: Column(
        children: [
          Expanded(
            child: Builder(
              builder: (context) {
                // 加载中时显示 loading，保留输入框
                if (!state.isInit) {
                  return const Center(
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.black54,
                    ),
                  );
                }
                return Stack(
                  children: [
                    _buildChatList(context, state),
                    // 底部渐变遮罩
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: 80,
                      child: IgnorePointer(
                        child: Container(
                          decoration: const BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [
                                Color(0x00F2F2F3),
                                Color(0xFFF2F2F3),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                    // 滚动到底部按钮
                    Positioned(
                      right: 26,
                      bottom: 46,
                      child: _buildScrollToBottomButton(),
                    ),
                  ],
                );
              },
            ),
          ),
          _buildInputBar(context, state),
        ],
      ),
    );
  }

  /// 构建聊天列表
  Widget _buildChatList(BuildContext context, SessionDetailState state) {
    final messages = state.messages;
    final isSending = state.isSending;
    // 仅在发送中且还没收到 delta 流式内容时显示 typing indicator
    final showTyping = isSending && state.currentResponse.isEmpty;
    final extraCount = showTyping ? 1 : 0;
    final totalCount = messages.length + extraCount;

    return ListView.builder(
      controller: _scrollController,
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.symmetric(vertical: 8),
      reverse: true, // 从底部开始加载，新消息自动出现在底部
      itemCount: totalCount,
      itemBuilder: (context, index) {
        // 默认底部间距
        double bottomOffset = 26;

        // reverse: true 时，index 0 是最底部
        // 正在发送时，index 0 显示 typing indicator
        if (showTyping && index == 0) {
          return Padding(
            padding: EdgeInsets.only(bottom: bottomOffset),
            child: const TypingIndicatorBubble(),
          );
        }

        final messageIndex = index - extraCount;
        final reversedIndex = messages.length - 1 - messageIndex;
        final msg = messages[reversedIndex];

        final bubble = MessageBubble(
          message: msg,
          onActionTap: (action) {
            _sendMessage(action);
          },
        );

        // 最后一条消息下方添加间距
        if (messageIndex == 0) {
          return Padding(
            padding: EdgeInsets.only(bottom: bottomOffset),
            child: bubble,
          );
        }
        return bubble;
      },
    );
  }

  /// 构建滚动到底部按钮
  Widget _buildScrollToBottomButton() {
    return AnimatedBuilder(
      animation: _scrollController,
      builder: (context, child) {
        // 当滚动位置大于 100 时显示按钮 (reverse 模式下，滚动位置增加表示向上滚动)
        final showButton = _scrollController.hasClients && _scrollController.offset > 100;

        return AnimatedOpacity(
          opacity: showButton ? 1.0 : 0.0,
          duration: const Duration(milliseconds: 200),
          child: IgnorePointer(
            ignoring: !showButton,
            child: GestureDetector(
              onTap: _scrollToBottom,
              child: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.1),
                      blurRadius: 8,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: const Icon(
                  Icons.keyboard_arrow_down,
                  color: Colors.black54,
                  size: 24,
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  /// 构建输入栏
  Widget _buildInputBar(BuildContext context, SessionDetailState state) {
    return Container(
      padding: EdgeInsets.fromLTRB(
        31,
        12,
        31,
        MediaQuery.of(context).padding.bottom + 40,
      ),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(28),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.06),
              blurRadius: 12,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // 已选图片预览
            if (state.pickedImages.isNotEmpty)
              Container(
                height: 60,
                margin: const EdgeInsets.only(top: 12, bottom: 8),
                child: ListView.builder(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  itemCount: state.pickedImages.length,
                  itemBuilder: (context, index) {
                    final item = state.pickedImages[index];
                    return Container(
                      margin: const EdgeInsets.only(right: 8),
                      child: Stack(
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(12),
                            child: Image.file(
                              File(item.path),
                              width: 54.dpx,
                              height: 54.dpx,
                              fit: BoxFit.cover,
                            ),
                          ),
                          Positioned(
                            top: 4,
                            right: 4,
                            child: GestureDetector(
                              onTap: () => ref.read(sessionDetailProvider(_sessionKey).notifier).removeImage(index),
                              child: Container(
                                width: 22,
                                height: 22,
                                decoration: BoxDecoration(
                                  color: Colors.black.withValues(alpha: 0.6),
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(
                                  Icons.close,
                                  color: Colors.white,
                                  size: 14,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
            // 输入行
            Row(
              children: [
                // 添加按钮
                const SizedBox(width: 12),
                GestureDetector(
                  onTap: _pickImage,
                  child: Container(
                    width: 28,
                    height: 28,
                    decoration: const BoxDecoration(
                      color: Color(0xFFE8E8E8),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.add,
                      color: Color(0xFF8E8E93),
                      size: 18,
                    ),
                  ),
                ),
                // 输入框
                Expanded(
                  child: Container(
                    constraints: const BoxConstraints(minHeight: 48),
                    child: TextField(
                      controller: _inputController,
                      focusNode: _inputFocusNode,
                      minLines: 1,
                      textInputAction: TextInputAction.newline,
                      keyboardType: TextInputType.multiline,
                      cursorHeight: 16,
                      cursorColor: Colors.black87,
                      style: const TextStyle(
                        color: Colors.black87,
                        fontSize: 16,
                        fontWeight: FontWeight.w400,
                      ),
                      decoration: const InputDecoration(
                        hintText: 'Ask Anything',
                        hintStyle: TextStyle(
                          color: Color(0xFF8E8E93),
                          fontSize: 16,
                          fontWeight: FontWeight.w400,
                        ),
                        border: InputBorder.none,
                        contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                      ),
                      onSubmitted: _sendMessage,
                    ),
                  ),
                ),

                // 发送按钮
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: GestureDetector(
                    onTap: () {
                      HapticFeedback.lightImpact();
                      _sendMessage(_inputController.text);
                    },
                    child: Container(
                      width: 32,
                      height: 32,
                      decoration: const BoxDecoration(
                        color: Colors.black,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.arrow_upward,
                        color: Colors.white,
                        size: 20,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
