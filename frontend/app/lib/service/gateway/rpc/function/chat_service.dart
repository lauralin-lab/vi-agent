import 'dart:async';

import '../../../../../common/network/gateway_client.dart';
import '../gateway_models.dart';

/// Chat 服务层
///
/// 封装 Chat 相关的业务逻辑，底层使用 GatewayClient
class ChatService {
  ChatService(this._client) {
    _subscribeEvents();
  }

  final GatewayClient _client;

  /// Chat 事件流控制器
  final StreamController<ChatEvent> _chatEventController = StreamController<ChatEvent>.broadcast();

  /// 事件订阅
  StreamSubscription<EventFrame>? _eventSubscription;

  /// Chat 事件流
  Stream<ChatEvent> get chatEvents => _chatEventController.stream;

  /// 是否已连接
  bool get isConnected => _client.isConnected;

  /// 默认 Session Key
  String get defaultSessionKey => _client.defaultSessionKey;

  /// 订阅 Gateway 事件
  void _subscribeEvents() {
    _eventSubscription = _client.events.listen((event) {
      if (event.event == 'chat' && event.payload != null) {
        final chatEvent = ChatEvent.fromJson(event.payload as Map<String, dynamic>);
        _chatEventController.add(chatEvent);
      }
    });
  }

  //////////////////////////////////////////////////////////////////////////////
  // Chat 方法
  //////////////////////////////////////////////////////////////////////////////

  /// 获取聊天历史
  Future<List<ChatMessage>> getHistory({
    String? sessionKey,
    int? limit,
  }) async {
    final params = ChatHistoryParams(
      sessionKey: sessionKey ?? defaultSessionKey,
      limit: limit,
    );
    final result = await _client.request<Map<String, dynamic>>('chat.history', params.toJson());
    return (result['messages'] as List).cast<Map<String, dynamic>>().map(ChatMessage.fromJson).toList();
  }

  /// 发送聊天消息
  ///
  /// 返回 runId，通过 [chatEvents] 流接收响应
  Future<String> send({
    required String message,
    String? sessionKey,
    String? thinking,
    List<dynamic>? attachments,
    int? timeoutMs,
  }) async {
    final params = ChatSendParams(
      sessionKey: sessionKey ?? defaultSessionKey,
      message: message,
      thinking: thinking,
      attachments: attachments,
      timeoutMs: timeoutMs,
      idempotencyKey: _client.generateId(),
    );

    final result = await _client.request<Map<String, dynamic>>('chat.send', params.toJson());
    return result['runId'] as String? ?? '';
  }

  /// 中止聊天请求
  Future<void> abort({
    String? sessionKey,
    String? runId,
  }) async {
    final params = ChatAbortParams(
      sessionKey: sessionKey ?? defaultSessionKey,
      runId: runId,
    );
    await _client.request<Map<String, dynamic>>('chat.abort', params.toJson());
  }

  /// 释放资源
  void dispose() {
    _eventSubscription?.cancel();
    _chatEventController.close();
  }
}

//////////////////////////////////////////////////////////////////////////////
// Gateway 消息模型
//////////////////////////////////////////////////////////////////////////////

/// 消息内容项
class MessageContentItem {
  final String type;
  final String? text;
  final String? textSignature;

  MessageContentItem({
    required this.type,
    this.text,
    this.textSignature,
  });

  factory MessageContentItem.fromJson(Map<String, dynamic> json) {
    return MessageContentItem(
      type: json['type'] as String? ?? 'text',
      text: json['text'] as String?,
      textSignature: json['textSignature'] as String?,
    );
  }
}

/// API 使用统计
class MessageUsage {
  final int input;
  final int output;
  final int cacheRead;
  final int cacheWrite;
  final int totalTokens;

  MessageUsage({
    this.input = 0,
    this.output = 0,
    this.cacheRead = 0,
    this.cacheWrite = 0,
    this.totalTokens = 0,
  });

  factory MessageUsage.fromJson(Map<String, dynamic> json) {
    return MessageUsage(
      input: json['input'] as int? ?? 0,
      output: json['output'] as int? ?? 0,
      cacheRead: json['cacheRead'] as int? ?? 0,
      cacheWrite: json['cacheWrite'] as int? ?? 0,
      totalTokens: json['totalTokens'] as int? ?? 0,
    );
  }
}

/// Gateway 消息模型（API 层）
class ChatMessage {
  final String role;
  final List<MessageContentItem> content;
  final DateTime timestamp;
  final String? api;
  final String? provider;
  final String? model;
  final MessageUsage? usage;
  final String? stopReason;

  ChatMessage({
    required this.role,
    required this.content,
    required this.timestamp,
    this.api,
    this.provider,
    this.model,
    this.usage,
    this.stopReason,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    // 解析 content 数组
    final contentList =
        (json['content'] as List?)?.map((e) => MessageContentItem.fromJson(e as Map<String, dynamic>)).toList() ?? [];

    // 解析时间戳（毫秒）
    final timestampMs = json['timestamp'] as int? ?? 0;

    return ChatMessage(
      role: json['role'] as String? ?? 'unknown',
      content: contentList,
      timestamp: DateTime.fromMillisecondsSinceEpoch(timestampMs),
      api: json['api'] as String?,
      provider: json['provider'] as String?,
      model: json['model'] as String?,
      usage: json['usage'] != null ? MessageUsage.fromJson(json['usage'] as Map<String, dynamic>) : null,
      stopReason: json['stopReason'] as String?,
    );
  }

  /// 获取纯文本内容
  String get textContent {
    return content.where((c) => c.type == 'text' && c.text != null).map((c) => c.text!).join('\n');
  }

  /// 是否为用户消息
  bool get isUser => role == 'user';

  /// 是否为助手消息
  bool get isAssistant => role == 'assistant';
}
