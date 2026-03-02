import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:rive_rolls_collection/common.dart';

import '../../gateway/rpc/gateway_models.dart';
import '../config.dart';
import '../http/gateway_dio.dart';

/// SSE 事件帧类型
enum SessionStreamEventType { history, delta, final_ }

/// SSE 事件帧
class SessionStreamEvent {
  final SessionStreamEventType type;
  final String key;
  final Map<String, dynamic> raw;

  SessionStreamEvent({required this.type, required this.key, required this.raw});

  factory SessionStreamEvent.fromJson(Map<String, dynamic> json) {
    final typeStr = json['type'] as String? ?? '';
    final type = switch (typeStr) {
      'history' => SessionStreamEventType.history,
      'delta' => SessionStreamEventType.delta,
      'final' => SessionStreamEventType.final_,
      _ => SessionStreamEventType.delta,
    };
    return SessionStreamEvent(
      type: type,
      key: json['key'] as String? ?? json['sessionKey'] as String? ?? '',
      raw: json,
    );
  }

  /// history 帧: 完整消息列表
  List<dynamic> get messages => raw['messages'] as List<dynamic>? ?? [];

  /// history 帧: 最后修改时间
  int get lastModified => raw['lastModified'] as int? ?? 0;

  /// history 帧: sessionId
  String get sessionId => raw['sessionId'] as String? ?? '';

  /// delta 帧: 流式文本片段
  String get text => raw['text'] as String? ?? '';

  /// delta / final 帧: 时间戳
  int get timestamp => raw['timestamp'] as int? ?? 0;
}

/// Session SSE Stream 服务
///
/// 连接 `GET /api/session-stream?ke  y={sessionKey}` SSE 长连接，
/// 实时接收 agent session 事件（history / delta / final）。
class SessionStreamService {
  SessionStreamService();

  HttpClient? _httpClient;
  StreamSubscription<String>? _lineSubscription;
  Timer? _reconnectTimer;

  bool _disposed = false;
  bool _connected = false;
  String? _currentKey;

  /// 事件流
  final StreamController<SessionStreamEvent> _eventController = StreamController<SessionStreamEvent>.broadcast();

  /// 连接状态流
  final StreamController<bool> _connectionController = StreamController<bool>.broadcast();

  Stream<SessionStreamEvent> get events => _eventController.stream;
  Stream<bool> get connectionState => _connectionController.stream;
  bool get isConnected => _connected;

  /// 连接 SSE
  ///
  /// [sessionKey] 格式: `agent:{agentId}:livekit:{sanitized-room}`
  Future<void> connect(String sessionKey) async {
    if (_disposed) return;

    // 如果已连接同一个 key，不重复连接
    if (_connected && _currentKey == sessionKey) return;

    // 断开旧连接
    await _disconnect();
    _currentKey = sessionKey;

    try {
      _httpClient = HttpClient()..badCertificateCallback = (_, __, ___) => true;

      final baseUrl = SessionConfig.baseUrl;
      final encodedKey = Uri.encodeQueryComponent(sessionKey);
      final uri = Uri.parse('$baseUrl/api/session-stream?key=$encodedKey');

      final request = await _httpClient!.getUrl(uri);
      request.headers.set('Accept', 'text/event-stream');
      request.headers.set('Cache-Control', 'no-cache');

      final response = await request.close();

      if (response.statusCode != 200) {
        loge('SSE connect failed: ${response.statusCode}');
        _scheduleReconnect(sessionKey);
        return;
      }

      _setConnected(true);

      // SSE 协议: 每条消息以 `data: {json}\n\n` 或 `: heartbeat\n\n` 格式传输
      // 按行拆分，累积 data 字段，遇到空行时触发事件
      String dataAccumulator = '';

      _lineSubscription = response
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .listen(
            (line) {
              if (line.startsWith('data: ')) {
                dataAccumulator += line.substring(6);
              } else if (line.startsWith(':')) {
                // 心跳注释，忽略
              } else if (line.isEmpty && dataAccumulator.isNotEmpty) {
                // 空行 = 事件边界
                _handleEventData(dataAccumulator);
                dataAccumulator = '';
              }
            },
            onError: (error) {
              loge('SSE stream error: $error');
              _setConnected(false);
              if (!_disposed) _scheduleReconnect(sessionKey);
            },
            onDone: () {
              logd('SSE stream closed');
              _setConnected(false);
              if (!_disposed) _scheduleReconnect(sessionKey);
            },
          );
    } catch (e) {
      loge('SSE connect error: $e');
      _setConnected(false);
      if (!_disposed) _scheduleReconnect(sessionKey);
    }
  }

  /// 解析并分发事件
  void _handleEventData(String data) {
    try {
      final json = jsonDecode(data) as Map<String, dynamic>;
      final event = SessionStreamEvent.fromJson(json);
      _eventController.add(event);
    } catch (e) {
      loge('SSE parse error: $e, data: $data');
    }
  }

  /// 断开连接
  Future<void> disconnect() async {
    _currentKey = null;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    await _disconnect();
  }

  Future<void> _disconnect() async {
    _lineSubscription?.cancel();
    _lineSubscription = null;
    _httpClient?.close(force: true);
    _httpClient = null;
    _setConnected(false);
  }

  void _setConnected(bool value) {
    if (_connected == value) return;
    _connected = value;
    _connectionController.add(value);
  }

  /// 自动重连 (5秒后)
  void _scheduleReconnect(String sessionKey) {
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(seconds: 5), () {
      if (!_disposed && _currentKey == sessionKey) {
        logd('SSE reconnecting to $sessionKey ...');
        connect(sessionKey);
      }
    });
  }

  /// 释放资源
  void dispose() {
    _disposed = true;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    _lineSubscription?.cancel();
    _httpClient?.close(force: true);
    _eventController.close();
    _connectionController.close();
  }
}
