import 'dart:async';

import '../../../common/network/gateway_client.dart';
import 'gateway_models.dart';
import 'function/chat_service.dart';
import 'function/session_service.dart';

/// Gateway 统一服务层
///
/// 整合 Chat 和 Session 服务，提供统一接口和回调
class GatewayService {
  GatewayService(this._client) {
    _chatService = ChatService(_client);
    _sessionService = SessionService(_client);
    _subscribeEvents();
  }

  final GatewayClient _client;
  late final ChatService _chatService;
  late final SessionService _sessionService;

  /// 事件订阅
  StreamSubscription<EventFrame>? _eventSubscription;

  //////////////////////////////////////////////////////////////////////////////
  // 回调配置
  //////////////////////////////////////////////////////////////////////////////

  /// 连接状态变化回调
  void Function(bool isConnected)? onConnectionChanged;

  /// Chat 事件回调
  void Function(ChatEvent event)? onChatEvent;

  /// 错误回调
  void Function(Object error)? onError;

  //////////////////////////////////////////////////////////////////////////////
  // 属性访问
  //////////////////////////////////////////////////////////////////////////////

  /// 是否已连接
  bool get isConnected => _client.isConnected;

  /// 默认 Session Key
  String get defaultSessionKey => _client.defaultSessionKey;

  /// Chat 事件流（用于 StreamBuilder）
  Stream<ChatEvent> get chatEvents => _chatService.chatEvents;

  //////////////////////////////////////////////////////////////////////////////
  // 连接管理
  //////////////////////////////////////////////////////////////////////////////

  /// 连接 Gateway
  Future<HelloOk?> connect() async {
    try {
      final helloOk = await _client.connect();
      onConnectionChanged?.call(true);
      return helloOk;
    } catch (e) {
      onConnectionChanged?.call(false);
      onError?.call(e);
      rethrow;
    }
  }

  /// 断开 Gateway
  Future<void> disconnect() async {
    await _client.disconnect();
    onConnectionChanged?.call(false);
  }

  //////////////////////////////////////////////////////////////////////////////
  // Chat 方法
  //////////////////////////////////////////////////////////////////////////////

  /// 获取聊天历史
  Future<List<dynamic>> getChatHistory({
    String? sessionKey,
    int? limit,
  }) async {
    try {
      return await _chatService.getHistory(
        sessionKey: sessionKey,
        limit: limit,
      );
    } catch (e) {
      onError?.call(e);
      rethrow;
    }
  }

  /// 发送聊天消息
  ///
  /// 返回 runId，通过 [chatEvents] 或 [onChatEvent] 回调接收响应
  Future<String> sendMessage({
    required String message,
    String? sessionKey,
    String? thinking,
    List<dynamic>? attachments,
    int? timeoutMs,
  }) async {
    try {
      return await _chatService.send(
        message: message,
        sessionKey: sessionKey,
        thinking: thinking,
        attachments: attachments,
        timeoutMs: timeoutMs,
      );
    } catch (e) {
      onError?.call(e);
      rethrow;
    }
  }

  /// 中止聊天请求
  Future<void> abortChat({
    String? sessionKey,
    String? runId,
  }) async {
    try {
      await _chatService.abort(sessionKey: sessionKey, runId: runId);
    } catch (e) {
      onError?.call(e);
      rethrow;
    }
  }

  //////////////////////////////////////////////////////////////////////////////
  // Session 方法
  //////////////////////////////////////////////////////////////////////////////

  /// 列出所有会话
  Future<List<SessionInfo>> listSessions() async {
    try {
      return await _sessionService.list();
    } catch (e) {
      onError?.call(e);
      rethrow;
    }
  }

  /// 预览会话内容
  Future<SessionPreview> previewSession({required String sessionKey}) async {
    try {
      return await _sessionService.preview(sessionKey: sessionKey);
    } catch (e) {
      onError?.call(e);
      rethrow;
    }
  }

  /// 解析会话
  Future<SessionResolve> resolveSession({required String sessionKey}) async {
    try {
      return await _sessionService.resolve(sessionKey: sessionKey);
    } catch (e) {
      onError?.call(e);
      rethrow;
    }
  }

  /// 更新会话
  Future<void> patchSession({
    required String sessionKey,
    String? name,
    String? agentId,
    Map<String, dynamic>? metadata,
  }) async {
    try {
      await _sessionService.patch(
        sessionKey: sessionKey,
        label: name,
      );
    } catch (e) {
      onError?.call(e);
      rethrow;
    }
  }

  /// 重置会话
  Future<void> resetSession({required String sessionKey}) async {
    try {
      await _sessionService.reset(sessionKey: sessionKey);
    } catch (e) {
      onError?.call(e);
      rethrow;
    }
  }

  /// 删除会话
  Future<void> deleteSession({required String sessionKey}) async {
    try {
      await _sessionService.delete(sessionKey: sessionKey);
    } catch (e) {
      onError?.call(e);
      rethrow;
    }
  }

  /// 压缩会话
  Future<void> compactSession({required String sessionKey}) async {
    try {
      await _sessionService.compact(sessionKey: sessionKey);
    } catch (e) {
      onError?.call(e);
      rethrow;
    }
  }

  //////////////////////////////////////////////////////////////////////////////
  // 内部方法
  //////////////////////////////////////////////////////////////////////////////

  /// 订阅 Gateway 事件
  void _subscribeEvents() {
    // 监听 Chat 事件并触发回调
    _chatService.chatEvents.listen((event) {
      onChatEvent?.call(event);
    });
  }

  /// 释放资源
  void dispose() {
    _eventSubscription?.cancel();
    _chatService.dispose();
  }
}
