import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../common/utils/log_utils.dart';
import '../../../../service/session/stream/session_stream_service.dart';

//////////////////////////////////////////////////////////////////////////////
// Session Stream 状态
//////////////////////////////////////////////////////////////////////////////

/// 单条可显示的消息
class SessionMessage {
  final String role; // 'user' | 'assistant'
  final String text;
  final DateTime timestamp;

  const SessionMessage({
    required this.role,
    required this.text,
    required this.timestamp,
  });

  bool get isUser => role == 'user';
  bool get isAssistant => role == 'assistant';
}

/// Session Stream 状态
class SessionStreamState {
  /// 历史消息（来自 history 帧）
  final List<SessionMessage> messages;

  /// 正在流式生成的文本（来自 delta 帧，累积拼接）
  final String streamingText;

  /// 是否正在流式输出
  final bool isStreaming;

  /// SSE 是否已连接
  final bool isConnected;

  /// 错误信息
  final String? error;

  const SessionStreamState({
    this.messages = const [],
    this.streamingText = '',
    this.isStreaming = false,
    this.isConnected = false,
    this.error,
  });

  SessionStreamState copyWith({
    List<SessionMessage>? messages,
    String? streamingText,
    bool? isStreaming,
    bool? isConnected,
    String? error,
  }) {
    return SessionStreamState(
      messages: messages ?? this.messages,
      streamingText: streamingText ?? this.streamingText,
      isStreaming: isStreaming ?? this.isStreaming,
      isConnected: isConnected ?? this.isConnected,
      error: error,
    );
  }

  /// 所有消息 + 正在流式生成的消息（合并后用于 UI 展示）
  List<SessionMessage> get allMessages {
    if (streamingText.isEmpty) return messages;
    return [
      ...messages,
      SessionMessage(
        role: 'assistant',
        text: streamingText,
        timestamp: DateTime.now(),
      ),
    ];
  }
}

//////////////////////////////////////////////////////////////////////////////
// Session Stream Notifier
//////////////////////////////////////////////////////////////////////////////

class SessionStreamNotifier extends StateNotifier<SessionStreamState> {
  SessionStreamNotifier(this._sessionKey) : super(const SessionStreamState()) {
    _service = SessionStreamService();
    _connect();
  }

  final String _sessionKey;
  late final SessionStreamService _service;
  StreamSubscription<SessionStreamEvent>? _eventSub;
  StreamSubscription<bool>? _connectionSub;

  /// 连接 SSE
  void _connect() {
    // 监听连接状态
    _connectionSub = _service.connectionState.listen((connected) {
      if (mounted) {
        state = state.copyWith(isConnected: connected);
      }
    });

    // 监听事件流
    _eventSub = _service.events.listen(_handleEvent);

    // 发起连接
    _service.connect(_sessionKey);
  }

  /// 处理 SSE 事件
  void _handleEvent(SessionStreamEvent event) {
    if (!mounted) return;

    switch (event.type) {
      case SessionStreamEventType.history:
        _handleHistory(event);
      case SessionStreamEventType.delta:
        _handleDelta(event);
      case SessionStreamEventType.final_:
        _handleFinal(event);
    }
  }

  /// 处理 history 帧：解析完整历史消息
  void _handleHistory(SessionStreamEvent event) {
    final rawMessages = event.messages;
    final parsed = <SessionMessage>[];

    for (final raw in rawMessages) {
      if (raw is! Map<String, dynamic>) continue;
      final type = raw['type'] as String? ?? '';
      if (type != 'message') continue;

      final msg = raw['message'] as Map<String, dynamic>?;
      if (msg == null) continue;

      final displayRole = raw['displayRole'] as String? ?? msg['role'] as String? ?? '';
      if (displayRole != 'user' && displayRole != 'assistant') continue;

      // 提取文本
      final content = msg['content'];
      String text = '';
      if (content is String) {
        text = content;
      } else if (content is List) {
        text = content
            .whereType<Map<String, dynamic>>()
            .where((c) => c['type'] == 'text')
            .map((c) => c['text'] as String? ?? '')
            .join('\n');
      }
      if (text.isEmpty) continue;

      // 解析时间戳
      final ts = raw['timestamp'];
      DateTime timestamp;
      if (ts is int) {
        timestamp = DateTime.fromMillisecondsSinceEpoch(ts);
      } else if (ts is String) {
        timestamp = DateTime.tryParse(ts) ?? DateTime.now();
      } else {
        timestamp = DateTime.now();
      }

      parsed.add(SessionMessage(role: displayRole, text: text, timestamp: timestamp));
    }

    Log.d('[SessionStream] history: ${parsed.length} messages');
    state = state.copyWith(messages: parsed);
  }

  /// 处理 delta 帧：累积流式文本
  void _handleDelta(SessionStreamEvent event) {
    state = state.copyWith(
      streamingText: state.streamingText + event.text,
      isStreaming: true,
    );
  }

  /// 处理 final 帧：将累积的流式文本转为正式消息
  void _handleFinal(SessionStreamEvent event) {
    if (state.streamingText.isNotEmpty) {
      final newMessage = SessionMessage(
        role: 'assistant',
        text: state.streamingText,
        timestamp: DateTime.now(),
      );
      state = state.copyWith(
        messages: [...state.messages, newMessage],
        streamingText: '',
        isStreaming: false,
      );
    } else {
      state = state.copyWith(isStreaming: false);
    }
  }

  /// 手动重连
  void reconnect() {
    _service.connect(_sessionKey);
  }

  @override
  void dispose() {
    _eventSub?.cancel();
    _connectionSub?.cancel();
    _service.dispose();
    super.dispose();
  }
}

//////////////////////////////////////////////////////////////////////////////
// Providers
//////////////////////////////////////////////////////////////////////////////

/// Session Stream Provider — 按 sessionKey 自动连接 SSE
///
/// 使用方式:
/// ```dart
/// final streamState = ref.watch(sessionStreamProvider(session.key));
/// ```
final sessionStreamProvider = StateNotifierProvider.autoDispose
    .family<SessionStreamNotifier, SessionStreamState, String>(
      (ref, sessionKey) {
        final notifier = SessionStreamNotifier(sessionKey);
        ref.onDispose(() => notifier.dispose());
        return notifier;
      },
    );

/// 便捷 Provider: 所有可展示消息（历史 + 正在流式生成的）
final sessionMessagesProvider = Provider.autoDispose.family<List<SessionMessage>, String>(
  (ref, sessionKey) {
    return ref.watch(sessionStreamProvider(sessionKey)).allMessages;
  },
);

/// 便捷 Provider: 是否正在流式输出
final sessionIsStreamingProvider = Provider.autoDispose.family<bool, String>(
  (ref, sessionKey) {
    return ref.watch(sessionStreamProvider(sessionKey)).isStreaming;
  },
);

/// 便捷 Provider: SSE 连接状态
final sessionIsConnectedProvider = Provider.autoDispose.family<bool, String>(
  (ref, sessionKey) {
    return ref.watch(sessionStreamProvider(sessionKey)).isConnected;
  },
);
