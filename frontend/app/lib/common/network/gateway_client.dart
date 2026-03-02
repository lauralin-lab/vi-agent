import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:uuid/uuid.dart';

import '../utils/log_utils.dart';
import '../../service/gateway/rpc/gateway_models.dart';

/// 日志标签
const _kTag = 'Gateway';

/// OpenClaw Gateway WebSocket 客户端
///
/// 纯网络层 - 只负责 WebSocket 连接管理和 RPC 协议
class GatewayClient {
  /// 私有构造函数
  GatewayClient._internal();

  /// 单例实例
  static final GatewayClient _instance = GatewayClient._internal();

  /// 获取单例
  factory GatewayClient() => _instance;

  /// WebSocket URL（动态获取，确保始终使用最新值）
  String get wsUrl => kGatewayUrl;

  /// 认证 Token（动态获取）
  String? get authToken => kGatewayAuthToken;

  /// WebSocket 连接
  WebSocket? _socket;

  /// 请求等待队列
  final Map<String, Completer<ResponseFrame>> _pendingRequests = {};

  /// 事件流控制器
  final StreamController<EventFrame> _eventController = StreamController<EventFrame>.broadcast();

  /// 连接状态
  bool _isConnected = false;
  bool get isConnected => _isConnected;

  /// Hello 响应
  HelloOk? _helloOk;
  HelloOk? get helloOk => _helloOk;

  /// 默认 Session Key
  String get defaultSessionKey => _helloOk?.snapshot.sessionDefaults?.mainSessionKey ?? 'main';

  /// UUID 生成器
  final _uuid = const Uuid();

  /// 事件流（用于上层服务订阅）
  Stream<EventFrame> get events => _eventController.stream;

  /// 手动断开标志
  bool _isManuallyDisconnected = false;

  /// 重连定时器
  Timer? _reconnectTimer;

  /// 重试次数
  int _retryCount = 0;

  //////////////////////////////////////////////////////////////////////////////
  // 连接管理
  //////////////////////////////////////////////////////////////////////////////

  /// 建立连接
  Future<HelloOk> connect() async {
    // 重置手动断开标志
    _isManuallyDisconnected = false;

    if (_isConnected) {
      return _helloOk!;
    }

    try {
      Log.i('Connecting to $wsUrl (retry: $_retryCount)', tag: _kTag);
      _socket = await WebSocket.connect(wsUrl);
      Log.i('WebSocket connected', tag: _kTag);

      // 连接成功，重置重试计数
      _retryCount = 0;
      _reconnectTimer?.cancel();

      // 监听消息
      _socket!.listen(
        _onMessage,
        onError: _onError,
        onDone: _onDone,
      );

      // 等待挑战事件（最多 750ms）
      await Future.delayed(const Duration(milliseconds: 750));

      // 确定客户端 ID
      // 注意：使用通用的 gateway-client ID，platform 字段用于区分平台
      const clientId = 'gateway-client';

      // 发送 connect 请求
      final connectParams = ConnectParams(
        client: ClientInfo(
          id: clientId,
          version: '1.0.0',
          platform: Platform.operatingSystem,
          mode: 'ui',
        ),
        locale: Platform.localeName,
        auth: authToken != null ? AuthInfo(token: authToken) : null,
      );

      Log.d('Connect params: ${connectParams.toJson()}', tag: _kTag);

      final response = await request<Map<String, dynamic>>(
        'connect',
        connectParams.toJson(),
      );

      _helloOk = HelloOk.fromJson(response);
      _isConnected = true;

      Log.i(
        'Connected! Server: ${_helloOk!.server.version}, ConnId: ${_helloOk!.server.connId}',
        tag: _kTag,
      );
      Log.d('Default session key: $defaultSessionKey', tag: _kTag);

      return _helloOk!;
    } catch (e) {
      Log.e('Connection failed: $e', tag: _kTag, error: e);
      _isConnected = false;

      // 连接失败立即尝试重连
      _scheduleReconnect();
      rethrow;
    }
  }

  /// 断开连接
  Future<void> disconnect() async {
    _isManuallyDisconnected = true;
    _reconnectTimer?.cancel();

    _isConnected = false;
    _helloOk = null;
    await _socket?.close();
    _socket = null;
    _pendingRequests.clear();
    Log.i('Disconnected', tag: _kTag);
  }

  /// 释放资源
  void dispose() {
    disconnect();
    _eventController.close();
  }

  /// 调度重连
  void _scheduleReconnect() {
    if (_isManuallyDisconnected || _isConnected) return;

    final delaySeconds = _retryCount < 5 ? 3 : 10; // 简单策略：前5次3秒，之后10秒
    // 或者使用指数退避： pow(2, min(_retryCount, 6))

    _retryCount++;
    Log.w('Connection lost/failed. Scheduling reconnect in ${delaySeconds}s (attempt $_retryCount)', tag: _kTag);

    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(Duration(seconds: delaySeconds), () async {
      if (!_isManuallyDisconnected && !_isConnected) {
        try {
          await connect();
        } catch (e) {
          // connect 内部会处理错误并重新调度，这里只需捕获避免崩溃
          Log.e('Auto-reconnect failed', tag: _kTag, error: e);
        }
      }
    });
  }

  //////////////////////////////////////////////////////////////////////////////
  // RPC 请求
  //////////////////////////////////////////////////////////////////////////////

  /// 发送 RPC 请求
  Future<T> request<T>(String method, Map<String, dynamic>? params) async {
    if (_socket == null) {
      throw StateError('WebSocket not connected');
    }

    final id = _uuid.v4();
    final frame = RequestFrame(id: id, method: method, params: params);

    final completer = Completer<ResponseFrame>();
    _pendingRequests[id] = completer;

    Log.d('Request: $method (id: $id)', tag: _kTag);
    _socket!.add(frame.toJsonString());

    // 超时处理
    final response = await completer.future.timeout(
      const Duration(seconds: 30),
      onTimeout: () {
        _pendingRequests.remove(id);
        throw TimeoutException('Request timeout: $method');
      },
    );

    if (!response.ok) {
      throw GatewayException(
        code: response.error?.code ?? 'UNKNOWN',
        message: response.error?.message ?? 'Unknown error',
      );
    }

    return response.payload as T;
  }

  /// 生成唯一 ID
  String generateId() => _uuid.v4();

  //////////////////////////////////////////////////////////////////////////////
  // 消息处理
  //////////////////////////////////////////////////////////////////////////////

  void _onMessage(dynamic data) {
    try {
      final json = jsonDecode(data as String) as Map<String, dynamic>;
      final type = json['type'] as String?;

      switch (type) {
        case 'res':
          _handleResponse(json);
          break;
        case 'event':
          _handleEvent(json);
          break;
        default:
          Log.w('Unknown message type: $type', tag: _kTag);
      }
    } catch (e) {
      Log.e('Message parse error: $e', tag: _kTag, error: e);
    }
  }

  void _handleResponse(Map<String, dynamic> json) {
    final response = ResponseFrame.fromJson(json);
    final completer = _pendingRequests.remove(response.id);

    if (completer != null) {
      completer.complete(response);
    } else {
      Log.w('No pending request for id: ${response.id}', tag: _kTag);
    }
  }

  void _handleEvent(Map<String, dynamic> json) {
    final event = EventFrame.fromJson(json);
    Log.d('Event: ${event.event}', tag: _kTag);

    // 广播到事件流，由上层服务处理
    _eventController.add(event);

    // Gateway 层只处理连接相关事件
    switch (event.event) {
      case 'tick':
        Log.d('Tick: ${event.payload?['ts']}', tag: _kTag);
        break;
      case 'shutdown':
        Log.w('Server shutdown: ${event.payload?['reason']}', tag: _kTag);
        _isConnected = false;
        _scheduleReconnect(); // Server shutdown 也尝试重连（或根据策略）
        break;
    }
  }

  void _onError(dynamic error) {
    Log.e('WebSocket error: $error', tag: _kTag, error: error);
    _isConnected = false;
    _scheduleReconnect();
  }

  void _onDone() {
    Log.w('WebSocket closed', tag: _kTag);
    _isConnected = false;
    _scheduleReconnect();
  }
}

/// Gateway 异常
class GatewayException implements Exception {
  final String code;
  final String message;

  GatewayException({required this.code, required this.message});

  @override
  String toString() => 'GatewayException: [$code] $message';
}
