import 'dart:convert';
import '../../../app.dart';
import 'function/chat_service.dart';

/// Protocol Version
const int kGatewayProtocolVersion = 3;

String get kGatewayUrl => '';//'ws://${App().auth.currentVps?.ip ?? ''}:18789';

String get kGatewayAuthToken => '';//App().auth.gateWayToken;

String get kGatewayWorkspaceUrl => '';//App().auth.workSpaceUrl;

//////////////////////////////////////////////////////////////////////////////
// 消息帧类型
//////////////////////////////////////////////////////////////////////////////

/// 请求帧 - Client → Server
class RequestFrame {
  final String type = 'req';
  final String id;
  final String method;
  final Map<String, dynamic>? params;

  RequestFrame({
    required this.id,
    required this.method,
    this.params,
  });

  Map<String, dynamic> toJson() => {
    'type': type,
    'id': id,
    'method': method,
    if (params != null) 'params': params,
  };

  String toJsonString() => jsonEncode(toJson());
}

/// 响应帧 - Server → Client
class ResponseFrame {
  final String type = 'res';
  final String id;
  final bool ok;
  final dynamic payload;
  final ErrorShape? error;

  ResponseFrame({
    required this.id,
    required this.ok,
    this.payload,
    this.error,
  });

  factory ResponseFrame.fromJson(Map<String, dynamic> json) {
    return ResponseFrame(
      id: json['id'] as String,
      ok: json['ok'] as bool,
      payload: json['payload'],
      error: json['error'] != null ? ErrorShape.fromJson(json['error']) : null,
    );
  }
}

/// 事件帧 - Server → Client
class EventFrame {
  final String type = 'event';
  final String event;
  final dynamic payload;
  final int? seq;
  final StateVersion? stateVersion;

  EventFrame({
    required this.event,
    this.payload,
    this.seq,
    this.stateVersion,
  });

  factory EventFrame.fromJson(Map<String, dynamic> json) {
    return EventFrame(
      event: json['event'] as String,
      payload: json['payload'],
      seq: json['seq'] as int?,
      stateVersion: json['stateVersion'] != null ? StateVersion.fromJson(json['stateVersion']) : null,
    );
  }
}

//////////////////////////////////////////////////////////////////////////////
// 错误处理
//////////////////////////////////////////////////////////////////////////////

class ErrorShape {
  final String code;
  final String message;
  final bool? retryable;

  ErrorShape({
    required this.code,
    required this.message,
    this.retryable,
  });

  factory ErrorShape.fromJson(Map<String, dynamic> json) {
    return ErrorShape(
      code: json['code'] as String? ?? 'UNKNOWN',
      message: json['message'] as String? ?? 'Unknown error',
      retryable: json['retryable'] as bool?,
    );
  }
}

//////////////////////////////////////////////////////////////////////////////
// 连接握手
//////////////////////////////////////////////////////////////////////////////

/// 连接参数
class ConnectParams {
  final int minProtocol;
  final int maxProtocol;
  final ClientInfo client;
  final List<String>? caps;
  final String? locale;
  final AuthInfo? auth;

  ConnectParams({
    this.minProtocol = kGatewayProtocolVersion,
    this.maxProtocol = kGatewayProtocolVersion,
    required this.client,
    this.caps,
    this.locale,
    this.auth,
  });

  Map<String, dynamic> toJson() => {
    'minProtocol': minProtocol,
    'maxProtocol': maxProtocol,
    'client': client.toJson(),
    if (caps != null) 'caps': caps,
    if (locale != null) 'locale': locale,
    if (auth != null) 'auth': auth!.toJson(),
  };
}

class ClientInfo {
  final String id;
  final String? displayName;
  final String version;
  final String platform;
  final String mode;
  final String? instanceId;
  final String? deviceFamily;
  final String? modelIdentifier;

  ClientInfo({
    required this.id,
    this.displayName,
    required this.version,
    required this.platform,
    this.mode = 'ui',
    this.instanceId,
    this.deviceFamily,
    this.modelIdentifier,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    if (displayName != null) 'displayName': displayName,
    'version': version,
    'platform': platform,
    'mode': mode,
    if (instanceId != null) 'instanceId': instanceId,
    if (deviceFamily != null) 'deviceFamily': deviceFamily,
    if (modelIdentifier != null) 'modelIdentifier': modelIdentifier,
  };
}

class AuthInfo {
  final String? token;

  AuthInfo({this.token});

  Map<String, dynamic> toJson() => {
    if (token != null) 'token': token,
  };
}

/// 握手成功响应
class HelloOk {
  final int protocol;
  final ServerInfo server;
  final Features features;
  final Snapshot snapshot;
  final Policy policy;

  HelloOk({
    required this.protocol,
    required this.server,
    required this.features,
    required this.snapshot,
    required this.policy,
  });

  factory HelloOk.fromJson(Map<String, dynamic> json) {
    return HelloOk(
      protocol: json['protocol'] as int,
      server: ServerInfo.fromJson(json['server']),
      features: Features.fromJson(json['features']),
      snapshot: Snapshot.fromJson(json['snapshot']),
      policy: Policy.fromJson(json['policy']),
    );
  }
}

class ServerInfo {
  final String version;
  final String? commit;
  final String? host;
  final String connId;

  ServerInfo({
    required this.version,
    this.commit,
    this.host,
    required this.connId,
  });

  factory ServerInfo.fromJson(Map<String, dynamic> json) {
    return ServerInfo(
      version: json['version'] as String,
      commit: json['commit'] as String?,
      host: json['host'] as String?,
      connId: json['connId'] as String,
    );
  }
}

class Features {
  final List<String> methods;
  final List<String> events;

  Features({required this.methods, required this.events});

  factory Features.fromJson(Map<String, dynamic> json) {
    return Features(
      methods: List<String>.from(json['methods'] ?? []),
      events: List<String>.from(json['events'] ?? []),
    );
  }
}

class Snapshot {
  final List<PresenceEntry> presence;
  final StateVersion stateVersion;
  final int uptimeMs;
  final SessionDefaults? sessionDefaults;

  Snapshot({
    required this.presence,
    required this.stateVersion,
    required this.uptimeMs,
    this.sessionDefaults,
  });

  factory Snapshot.fromJson(Map<String, dynamic> json) {
    return Snapshot(
      presence: (json['presence'] as List?)?.map((e) => PresenceEntry.fromJson(e)).toList() ?? [],
      stateVersion: StateVersion.fromJson(json['stateVersion'] ?? {}),
      uptimeMs: json['uptimeMs'] as int? ?? 0,
      sessionDefaults: json['sessionDefaults'] != null ? SessionDefaults.fromJson(json['sessionDefaults']) : null,
    );
  }
}

class PresenceEntry {
  final String? host;
  final String? platform;
  final String? mode;
  final int ts;

  PresenceEntry({this.host, this.platform, this.mode, required this.ts});

  factory PresenceEntry.fromJson(Map<String, dynamic> json) {
    return PresenceEntry(
      host: json['host'] as String?,
      platform: json['platform'] as String?,
      mode: json['mode'] as String?,
      ts: json['ts'] as int? ?? 0,
    );
  }
}

class StateVersion {
  final int presence;
  final int health;

  StateVersion({required this.presence, required this.health});

  factory StateVersion.fromJson(Map<String, dynamic> json) {
    return StateVersion(
      presence: json['presence'] as int? ?? 0,
      health: json['health'] as int? ?? 0,
    );
  }
}

class SessionDefaults {
  final String? defaultAgentId;
  final String? mainKey;
  final String? mainSessionKey;

  SessionDefaults({this.defaultAgentId, this.mainKey, this.mainSessionKey});

  factory SessionDefaults.fromJson(Map<String, dynamic> json) {
    return SessionDefaults(
      defaultAgentId: json['defaultAgentId'] as String?,
      mainKey: json['mainKey'] as String?,
      mainSessionKey: json['mainSessionKey'] as String?,
    );
  }
}

class Policy {
  final int maxPayload;
  final int maxBufferedBytes;
  final int tickIntervalMs;

  Policy({
    required this.maxPayload,
    required this.maxBufferedBytes,
    required this.tickIntervalMs,
  });

  factory Policy.fromJson(Map<String, dynamic> json) {
    return Policy(
      maxPayload: json['maxPayload'] as int? ?? 25 * 1024 * 1024,
      maxBufferedBytes: json['maxBufferedBytes'] as int? ?? 0,
      tickIntervalMs: json['tickIntervalMs'] as int? ?? 30000,
    );
  }
}

//////////////////////////////////////////////////////////////////////////////
// Chat 相关模型
//////////////////////////////////////////////////////////////////////////////

/// chat.history 参数
class ChatHistoryParams {
  final String sessionKey;
  final int? limit;

  ChatHistoryParams({required this.sessionKey, this.limit});

  Map<String, dynamic> toJson() => {
    'sessionKey': sessionKey,
    if (limit != null) 'limit': limit,
  };
}

/// chat.send 参数
class ChatSendParams {
  final String sessionKey;
  final String message;
  final String? thinking;
  final bool? deliver;
  final List<dynamic>? attachments;
  final int? timeoutMs;
  final String idempotencyKey;

  ChatSendParams({
    required this.sessionKey,
    required this.message,
    this.thinking,
    this.deliver,
    this.attachments,
    this.timeoutMs,
    required this.idempotencyKey,
  });

  Map<String, dynamic> toJson() => {
    'sessionKey': sessionKey,
    'message': message,
    if (thinking != null) 'thinking': thinking,
    if (deliver != null) 'deliver': deliver,
    if (attachments != null) 'attachments': attachments,
    if (timeoutMs != null) 'timeoutMs': timeoutMs,
    'idempotencyKey': idempotencyKey,
  };
}

/// chat.abort 参数
class ChatAbortParams {
  final String sessionKey;
  final String? runId;

  ChatAbortParams({required this.sessionKey, this.runId});

  Map<String, dynamic> toJson() => {
    'sessionKey': sessionKey,
    if (runId != null) 'runId': runId,
  };
}

/// Chat 事件
class ChatEvent {
  final String runId;
  final String sessionKey;
  final int seq;
  final String state; // "delta" | "final" | "aborted" | "error"
  final List<ChatMessage>? message;
  final String? errorMessage;
  final dynamic usage;
  final String? stopReason;

  ChatEvent({
    required this.runId,
    required this.sessionKey,
    required this.seq,
    required this.state,
    this.message,
    this.errorMessage,
    this.usage,
    this.stopReason,
  });

  factory ChatEvent.fromJson(Map<String, dynamic> json) {
    return ChatEvent(
      runId: json['runId'] as String? ?? '',
      sessionKey: json['sessionKey'] as String? ?? '',
      seq: json['seq'] as int? ?? 0,
      state: json['state'] as String? ?? 'delta',
      message: json['message'] != null ? [ChatMessage.fromJson(json['message'] as Map<String, dynamic>)] : null,
      errorMessage: json['errorMessage'] as String?,
      usage: json['usage'],
      stopReason: json['stopReason'] as String?,
    );
  }

  bool get isDelta => state == 'delta';
  bool get isFinal => state == 'final';
  bool get isAborted => state == 'aborted';
  bool get isError => state == 'error';
  bool get isComplete => isFinal || isAborted || isError;
}
