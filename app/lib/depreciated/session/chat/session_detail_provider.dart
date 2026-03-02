import 'dart:async';
import 'dart:io';

import '../../../common/utils/log_utils.dart';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../service/gateway/rpc/gateway_provider.dart';
import '../../../service/gateway/rpc/gateway_models.dart';
import '../../../modules/pages/home/model/media_model.dart';
import '../../../service/session/http/function/file_http_service.dart';
import 'model/chat_models_ui.dart';

//////////////////////////////////////////////////////////////////////////////
// Session Detail 状态
//////////////////////////////////////////////////////////////////////////////

/// Session Detail 页面状态
class SessionDetailState {
  final bool isInit;
  final List<SessionMessage> messages;
  final bool isSending;
  final String currentResponse;
  final List<MediaModel> pickedImages;

  const SessionDetailState({
    this.isInit = false,
    this.messages = const [],
    this.isSending = false,
    this.currentResponse = '',
    this.pickedImages = const [],
  });

  SessionDetailState copyWith({
    bool? isInit,
    List<SessionMessage>? messages,
    bool? isSending,
    String? currentResponse,
    List<MediaModel>? pickedImages,
  }) {
    return SessionDetailState(
      isInit: isInit ?? this.isInit,
      messages: messages ?? this.messages,
      isSending: isSending ?? this.isSending,
      currentResponse: currentResponse ?? this.currentResponse,
      pickedImages: pickedImages ?? this.pickedImages,
    );
  }
}

//////////////////////////////////////////////////////////////////////////////
// Session Detail StateNotifier
//////////////////////////////////////////////////////////////////////////////

/// Session Detail 状态管理器
class SessionDetailNotifier extends StateNotifier<SessionDetailState> {
  SessionDetailNotifier(this._ref, this.sessionKey) : super(const SessionDetailState()) {
    _init();
  }

  final Ref _ref;
  final String sessionKey;
  ProviderSubscription<AsyncValue<ChatEvent>>? _chatSubscription;

  GatewayAPI get _api => _ref.read(gatewayAPIProvider);

  /// 初始化 - 加载历史和监听事件
  void _init() {
    _listenChatEvents();
    // 延迟加载历史，等待转场动画完成后再执行，避免掉帧卡顿
    Future.delayed(const Duration(milliseconds: 350), () => loadHistory());
  }

  /// 监听 Chat 事件流
  void _listenChatEvents() {
    _chatSubscription = _ref.listen<AsyncValue<ChatEvent>>(
      chatEventsProvider,
      (previous, next) {
        next.whenData((chatEvent) {
          _handleChatEvent(chatEvent);
        });
      },
    );
  }

  /// 当前流式消息的 runId，用于跟踪同一轮对话
  String? _streamingRunId;

  /// 处理 Chat 事件
  void _handleChatEvent(ChatEvent chatEvent) {
    // 只处理当前 session 的事件，忽略其他 session 的事件
    if (chatEvent.sessionKey != sessionKey) return;

    Log.d('[SessionDetailNotifier] Chat event: ${chatEvent.state}');

    if (chatEvent.isDelta) {
      // 流式响应：累积文本，并实时更新消息列表中的最后一条 assistant 消息
      final messages = chatEvent.message;
      if (messages != null && messages.isNotEmpty) {
        // 累积 delta 文本
        String newResponse = state.currentResponse;
        for (final msg in messages) {
          newResponse = msg.textContent;
        }

        // 构建实时 streaming 消息
        final streamingMessage = SessionMessage(
          messageId: chatEvent.runId,
          type: 'assistant',
          content: newResponse,
          metadata: {},
          createdAt: DateTime.now(),
        );

        final updatedMessages = List<SessionMessage>.from(state.messages);
        if (_streamingRunId == chatEvent.runId && updatedMessages.isNotEmpty) {
          // 替换最后一条消息（上一次 delta 创建的）
          updatedMessages[updatedMessages.length - 1] = streamingMessage;
        } else {
          // 第一次收到这个 runId 的 delta，新增一条
          _streamingRunId = chatEvent.runId;
          updatedMessages.add(streamingMessage);
        }

        state = state.copyWith(
          currentResponse: newResponse,
          messages: updatedMessages,
        );
      }
    } else if (chatEvent.isFinal) {
      // 完成：用 final 事件中的完整内容替换流式消息
      final finalMessages = chatEvent.message;
      String finalContent = state.currentResponse;
      if (finalMessages != null && finalMessages.isNotEmpty) {
        // 优先使用 final 事件携带的完整文本
        finalContent = finalMessages.map((msg) => msg.textContent).join();
      }

      if (finalContent.isNotEmpty) {
        final finalMessage = SessionMessage(
          messageId: chatEvent.runId,
          type: 'assistant',
          content: finalContent,
          metadata: {},
          createdAt: DateTime.now(),
        );

        final updatedMessages = List<SessionMessage>.from(state.messages);
        if (_streamingRunId == chatEvent.runId && updatedMessages.isNotEmpty) {
          // 替换流式消息为最终版本
          updatedMessages[updatedMessages.length - 1] = finalMessage;
        } else {
          updatedMessages.add(finalMessage);
        }

        state = state.copyWith(
          messages: updatedMessages,
          currentResponse: '',
          isSending: false,
        );
      } else {
        state = state.copyWith(currentResponse: '', isSending: false);
      }
      _streamingRunId = null;
    } else if (chatEvent.isError) {
      Log.d('[SessionDetailNotifier] Chat error: ${chatEvent.errorMessage}');
      // 出错时移除未完成的流式消息
      if (_streamingRunId != null) {
        final updatedMessages = List<SessionMessage>.from(state.messages);
        if (updatedMessages.isNotEmpty && updatedMessages.last.messageId == _streamingRunId) {
          updatedMessages.removeLast();
        }
        _streamingRunId = null;
        state = state.copyWith(messages: updatedMessages, currentResponse: '', isSending: false);
      } else {
        state = state.copyWith(currentResponse: '', isSending: false);
      }
    }
  }

  /// 加载聊天历史
  Future<void> loadHistory() async {
    try {
      final history = await _api.getChatHistory(
        sessionKey: sessionKey,
        limit: 50,
      );

      Log.d('[SessionDetailNotifier] Loaded ${history.length} messages');

      // 过滤无需显示的历史消息
      final filteredHistory = history.where((msg) {
        if (msg.role == 'user' || msg.role == 'assistant') {
          if (msg.stopReason == 'toolUse') {
            return false;
          }
          return true;
        }
        return false;
      }).toList();

      // 转换 Gateway 消息格式到本地 SessionMessage
      final loadedMessages = filteredHistory.map((item) {
        return SessionMessage.fromChatMessage(item);
      }).toList();

      // 按时间正序排列
      loadedMessages.sort((a, b) => a.createdAt.compareTo(b.createdAt));

      state = state.copyWith(messages: loadedMessages, isInit: true);
    } catch (e) {
      Log.d('[SessionDetailNotifier] Load history failed: $e');
      state = state.copyWith(isInit: true);
    }
  }

  /// 发送消息
  Future<void> sendMessage(String message) async {
    final hasText = message.trim().isNotEmpty;
    final hasImages = state.pickedImages.isNotEmpty;

    if (!hasText && !hasImages) return;

    // 保存当前图片列表
    final pickedImagesCopy = List<MediaModel>.from(state.pickedImages);
    final imagePaths = pickedImagesCopy.map((e) => e.path).toList();

    // 添加用户消息到列表
    final userMessage = SessionMessage(
      messageId: DateTime.now().millisecondsSinceEpoch.toString(),
      type: 'user',
      content: message,
      metadata: {
        if (imagePaths.isNotEmpty) 'images': imagePaths,
      },
      createdAt: DateTime.now(),
    );

    state = state.copyWith(
      messages: [...state.messages, userMessage],
      isSending: true,
      currentResponse: '',
      pickedImages: [],
    );

    try {
      // 通过 HTTP 上传图片，收集服务端路径
      final fileTags = <String>[];
      if (pickedImagesCopy.isNotEmpty) {
        for (final media in pickedImagesCopy) {
          final file = File(media.path);

          // 检查文件大小不超过 10MB
          if (await file.length() > 10 * 1024 * 1024) {
            Log.d('[SessionDetailNotifier] File too large (>10MB): ${media.path}');
            continue;
          }

          final result = await FileHttpService.instance.uploadFile(file);
          if (result.success && result.path != null) {
            fileTags.add('[file:${result.path}]');
            Log.d('[SessionDetailNotifier] File uploaded: ${result.path}');
          } else {
            Log.d('[SessionDetailNotifier] Upload failed: ${result.error}');
          }
        }
      }

      // 图片标签放在消息最前面
      final finalMessage = fileTags.isNotEmpty ? '${fileTags.join('\n')}\n$message' : message;

      final runId = await _api.sendMessage(
        message: finalMessage,
        sessionKey: sessionKey,
      );
      Log.d('[SessionDetailNotifier] Chat sent, runId: $runId');
    } catch (e) {
      Log.d('[SessionDetailNotifier] Chat send failed: $e');
      state = state.copyWith(isSending: false);
    }
  }

  /// 添加图片
  void addImage(MediaModel media) {
    state = state.copyWith(pickedImages: [...state.pickedImages, media]);
  }

  /// 移除图片
  void removeImage(int index) {
    if (index >= 0 && index < state.pickedImages.length) {
      final newImages = List<MediaModel>.from(state.pickedImages)..removeAt(index);
      state = state.copyWith(pickedImages: newImages);
    }
  }

  @override
  void dispose() {
    _chatSubscription?.close();
    super.dispose();
  }
}

//////////////////////////////////////////////////////////////////////////////
// Providers
//////////////////////////////////////////////////////////////////////////////

/// Session Detail Provider - 使用 family 支持不同 session
final sessionDetailProvider = StateNotifierProvider.autoDispose
    .family<SessionDetailNotifier, SessionDetailState, String>((ref, sessionKey) {
      return SessionDetailNotifier(ref, sessionKey);
    });
