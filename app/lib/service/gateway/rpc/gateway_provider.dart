import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../common/network/gateway_client.dart';
import '../../../common/utils/log_utils.dart';
import 'gateway_models.dart';
import 'gateway_service.dart';
import 'function/chat_service.dart';
import 'function/session_service.dart';

//////////////////////////////////////////////////////////////////////////////
// Gateway 连接状态
//////////////////////////////////////////////////////////////////////////////

/// Gateway 连接状态
class GatewayState {
  final bool isConnected;
  final bool isConnecting;
  final String? error;

  const GatewayState({
    this.isConnected = false,
    this.isConnecting = false,
    this.error,
  });

  GatewayState copyWith({
    bool? isConnected,
    bool? isConnecting,
    String? error,
  }) {
    return GatewayState(
      isConnected: isConnected ?? this.isConnected,
      isConnecting: isConnecting ?? this.isConnecting,
      error: error,
    );
  }
}

/// Gateway 状态管理器
class GatewayStateNotifier extends StateNotifier<GatewayState> {
  GatewayStateNotifier(this._client) : super(const GatewayState()) {
    // 自动连接
    connect();
  }

  final GatewayClient _client;
  Completer<void>? _connectionCompleter;

  /// 等待连接就绪
  Future<void> get whenConnected async {
    if (state.isConnected) return;

    // 如果正在连接，等待当前连接完成
    if (_connectionCompleter != null && !_connectionCompleter!.isCompleted) {
      return _connectionCompleter!.future;
    }

    // 否则触发重连
    await connect();
  }

  /// 连接 Gateway
  Future<HelloOk?> connect() async {
    if (state.isConnected) return null;
    if (state.isConnecting) {
      await _connectionCompleter?.future;
      return null;
    }

    state = state.copyWith(isConnecting: true, error: null);
    _connectionCompleter = Completer<void>();

    try {
      final helloOk = await _client.connect();
      state = state.copyWith(isConnected: true, isConnecting: false);
      _connectionCompleter?.complete();
      Log.d('[GatewayStateNotifier] Connected: ${helloOk.server.version}');
      return helloOk;
    } catch (e) {
      state = state.copyWith(isConnected: false, isConnecting: false, error: e.toString());
      _connectionCompleter?.completeError(e);
      Log.d('[GatewayStateNotifier] Connect failed: $e');
      rethrow;
    }
  }

  /// 断开 Gateway
  Future<void> disconnect() async {
    await _client.disconnect();
    state = state.copyWith(isConnected: false);
    Log.d('[GatewayStateNotifier] Disconnected');
  }
}

//////////////////////////////////////////////////////////////////////////////
// Providers
//////////////////////////////////////////////////////////////////////////////

/// Gateway 客户端 Provider（网络层）
final gatewayClientProvider = Provider<GatewayClient>((ref) {
  final client = GatewayClient();
  ref.onDispose(() => client.disconnect());
  return client;
});

/// Gateway 连接状态 Provider
final gatewayStateProvider = StateNotifierProvider<GatewayStateNotifier, GatewayState>((ref) {
  final client = ref.watch(gatewayClientProvider);
  return GatewayStateNotifier(client);
});

/// Gateway 统一服务 Provider（兼容旧代码）
final gatewayServiceProvider = Provider<GatewayService>((ref) {
  final client = ref.watch(gatewayClientProvider);
  final service = GatewayService(client);
  ref.onDispose(() => service.dispose());
  return service;
});

/// Chat 服务 Provider
final chatServiceProvider = Provider<ChatService>((ref) {
  final client = ref.watch(gatewayClientProvider);
  final service = ChatService(client);
  ref.onDispose(() => service.dispose());
  return service;
});

/// Session 服务 Provider
final sessionServiceProvider = Provider<SessionService>((ref) {
  final client = ref.watch(gatewayClientProvider);
  return SessionService(client);
});

/// Chat 事件流 Provider
final chatEventsProvider = StreamProvider<ChatEvent>((ref) {
  final chatService = ref.watch(chatServiceProvider);
  return chatService.chatEvents;
});

/// 默认 Session Key Provider
final defaultSessionKeyProvider = Provider<String>((ref) {
  final client = ref.watch(gatewayClientProvider);
  return client.defaultSessionKey;
});

//////////////////////////////////////////////////////////////////////////////
// Gateway API 便捷方法
//////////////////////////////////////////////////////////////////////////////

/// Gateway API Provider - 封装所有 API 调用
class GatewayAPI {
  GatewayAPI(this._ref);

  final Ref _ref;

  GatewayStateNotifier get _state => _ref.read(gatewayStateProvider.notifier);
  ChatService get _chat => _ref.read(chatServiceProvider);
  SessionService get _session => _ref.read(sessionServiceProvider);

  /// 等待连接就绪
  Future<void> get whenConnected => _state.whenConnected;

  /// 获取聊天历史
  Future<List<ChatMessage>> getChatHistory({String? sessionKey, int? limit}) async {
    await whenConnected;
    return _chat.getHistory(sessionKey: sessionKey, limit: limit);
  }

  /// 发送聊天消息
  Future<String> sendMessage({
    required String message,
    String? sessionKey,
    String? thinking,
    List<dynamic>? attachments,
    int? timeoutMs,
  }) async {
    await whenConnected;
    return _chat.send(
      message: message,
      sessionKey: sessionKey,
      thinking: thinking,
      attachments: attachments,
      timeoutMs: timeoutMs,
    );
  }

  /// 中止聊天
  Future<void> abortChat({String? sessionKey, String? runId}) async {
    await whenConnected;
    await _chat.abort(sessionKey: sessionKey, runId: runId);
  }

  /// 列出所有会话
  Future<List<SessionInfo>> listSessions() async {
    await whenConnected;
    return _session.list();
  }

  /// 预览会话
  Future<SessionPreview> previewSession({required String sessionKey}) async {
    await whenConnected;
    return _session.preview(sessionKey: sessionKey);
  }

  /// 解析会话
  Future<SessionResolve> resolveSession({required String sessionKey}) async {
    await whenConnected;
    return _session.resolve(sessionKey: sessionKey);
  }

  /// 更新会话
  Future<void> patchSession({
    required String sessionKey,
    String? name,
  }) async {
    await whenConnected;
    await _session.patch(sessionKey: sessionKey, label: name);
  }

  /// 重置会话
  Future<void> resetSession({required String sessionKey}) async {
    await whenConnected;
    await _session.reset(sessionKey: sessionKey);
  }

  /// 删除会话
  Future<void> deleteSession({required String sessionKey}) async {
    await whenConnected;
    await _session.delete(sessionKey: sessionKey);
  }

  /// 创建新会话 - 自动生成 new-{随机数} 名称
  Future<void> newSession({String? name}) async {
    await whenConnected;
    final sessionName = name ?? 'new-${DateTime.now().millisecondsSinceEpoch % 100000}';
    await _session.patch(sessionKey: 'agent:main:$sessionName', label: sessionName);
  }

  /// 重命名会话
  Future<void> renameSession({required String sessionKey, required String label}) async {
    await whenConnected;
    await _session.patch(sessionKey: sessionKey, label: label);
  }
}

/// Gateway API Provider
final gatewayAPIProvider = Provider<GatewayAPI>((ref) {
  return GatewayAPI(ref);
});
