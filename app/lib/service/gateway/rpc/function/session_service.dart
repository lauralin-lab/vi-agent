import '../../../../../common/network/gateway_client.dart';

/// Session 服务层
///
/// 封装 Session 相关的业务逻辑，底层使用 GatewayClient
class SessionService {
  SessionService(this._client);

  final GatewayClient _client;

  /// 是否已连接
  bool get isConnected => _client.isConnected;

  //////////////////////////////////////////////////////////////////////////////
  // Session 方法
  //////////////////////////////////////////////////////////////////////////////

  /// 列出所有会话
  Future<List<SessionInfo>> list({
    bool includeGlobal = true,
    bool includeUnknown = true,
    int activeMinutes = 120,
    int limit = 120,
  }) async {
    final result = await _client.request<Map<String, dynamic>>('sessions.list', {
      'includeGlobal': includeGlobal,
      'includeUnknown': includeUnknown,
      'activeMinutes': activeMinutes,
      'limit': limit,
    });
    return (result['sessions'] as List).cast<Map<String, dynamic>>().map(SessionInfo.fromJson).toList();
  }

  /// 预览会话内容
  Future<SessionPreview> preview({required String sessionKey}) async {
    final result = await _client.request<Map<String, dynamic>>(
      'sessions.preview',
      {
        'keys': [sessionKey],
      },
    );
    return SessionPreview.fromJson(result);
  }

  /// 解析会话
  Future<SessionResolve> resolve({required String sessionKey}) async {
    final result = await _client.request<Map<String, dynamic>>(
      'sessions.resolve',
      {'key': sessionKey}, // ← sessionKey → key
    );
    return SessionResolve.fromJson(result);
  }

  /// 重置会话
  Future<void> reset({required String sessionKey}) async {
    await _client.request<Map<String, dynamic>>(
      'sessions.reset',
      {'key': sessionKey}, // ← sessionKey → key
    );
  }

  /// 删除会话
  Future<void> delete({required String sessionKey}) async {
    await _client.request<Map<String, dynamic>>(
      'sessions.delete',
      {'key': sessionKey}, // ← sessionKey → key
    );
  }

  /// 压缩会话
  Future<void> compact({required String sessionKey}) async {
    await _client.request<Map<String, dynamic>>(
      'sessions.compact',
      {'key': sessionKey}, // ← sessionKey → key
    );
  }

  /// 更新会话
  Future<void> patch({
    required String sessionKey,
    String? label,
  }) async {
    await _client.request<Map<String, dynamic>>(
      'sessions.patch',
      {
        'key': sessionKey,
        if (label != null) 'label': label,
      },
    );
  }
}

//////////////////////////////////////////////////////////////////////////////
// Session 数据模型
//////////////////////////////////////////////////////////////////////////////

/// 会话来源信息
class SessionOrigin {
  final String? provider;
  final String? surface;
  final String? chatType;

  SessionOrigin({this.provider, this.surface, this.chatType});

  factory SessionOrigin.fromJson(Map<String, dynamic> json) {
    return SessionOrigin(
      provider: json['provider'] as String?,
      surface: json['surface'] as String?,
      chatType: json['chatType'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
    if (provider != null) 'provider': provider,
    if (surface != null) 'surface': surface,
    if (chatType != null) 'chatType': chatType,
  };
}

/// 会话信息
class SessionInfo {
  final String key;
  final String? kind;
  final String? displayName;
  final String? channel;
  final String? chatType;
  final SessionOrigin? origin;
  final DateTime? updatedAt;
  final String? sessionId;
  final bool systemSent;
  final bool abortedLastRun;
  final int inputTokens;
  final int outputTokens;
  final int totalTokens;
  final String? modelProvider;
  final String? model;
  final int contextTokens;
  final Map<String, dynamic>? deliveryContext;
  final String? lastChannel;

  SessionInfo({
    required this.key,
    this.kind,
    this.displayName,
    this.channel,
    this.chatType,
    this.origin,
    this.updatedAt,
    this.sessionId,
    this.systemSent = false,
    this.abortedLastRun = false,
    this.inputTokens = 0,
    this.outputTokens = 0,
    this.totalTokens = 0,
    this.modelProvider,
    this.model,
    this.contextTokens = 0,
    this.deliveryContext,
    this.lastChannel,
  });

  /// 兼容旧字段名
  String get sessionKey => key;
  String? get name => displayName;
  DateTime? get lastActive => updatedAt;

  factory SessionInfo.fromJson(Map<String, dynamic> json) {
    return SessionInfo(
      key: json['key'] as String? ?? '',
      kind: json['kind'] as String?,
      displayName: json['displayName'] as String?,
      channel: json['channel'] as String?,
      chatType: json['chatType'] as String?,
      origin: json['origin'] != null ? SessionOrigin.fromJson(json['origin'] as Map<String, dynamic>) : null,
      updatedAt: json['updatedAt'] != null ? DateTime.fromMillisecondsSinceEpoch(json['updatedAt'] as int) : null,
      sessionId: json['sessionId'] as String?,
      systemSent: json['systemSent'] as bool? ?? false,
      abortedLastRun: json['abortedLastRun'] as bool? ?? false,
      inputTokens: json['inputTokens'] as int? ?? 0,
      outputTokens: json['outputTokens'] as int? ?? 0,
      totalTokens: json['totalTokens'] as int? ?? 0,
      modelProvider: json['modelProvider'] as String?,
      model: json['model'] as String?,
      contextTokens: json['contextTokens'] as int? ?? 0,
      deliveryContext: json['deliveryContext'] as Map<String, dynamic>?,
      lastChannel: json['lastChannel'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
    'key': key,
    if (kind != null) 'kind': kind,
    if (displayName != null) 'displayName': displayName,
    if (channel != null) 'channel': channel,
    if (chatType != null) 'chatType': chatType,
    if (origin != null) 'origin': origin!.toJson(),
    if (updatedAt != null) 'updatedAt': updatedAt!.millisecondsSinceEpoch,
    if (sessionId != null) 'sessionId': sessionId,
    'systemSent': systemSent,
    'abortedLastRun': abortedLastRun,
    'inputTokens': inputTokens,
    'outputTokens': outputTokens,
    'totalTokens': totalTokens,
    if (modelProvider != null) 'modelProvider': modelProvider,
    if (model != null) 'model': model,
    'contextTokens': contextTokens,
    if (deliveryContext != null) 'deliveryContext': deliveryContext,
    if (lastChannel != null) 'lastChannel': lastChannel,
  };
}

/// 会话预览
class SessionPreview {
  final String sessionKey;
  final List<dynamic> messages;
  final int totalMessages;

  SessionPreview({
    required this.sessionKey,
    required this.messages,
    required this.totalMessages,
  });

  factory SessionPreview.fromJson(Map<String, dynamic> json) {
    return SessionPreview(
      sessionKey: json['sessionKey'] as String? ?? '',
      messages: json['messages'] as List<dynamic>? ?? [],
      totalMessages: json['totalMessages'] as int? ?? 0,
    );
  }
}

/// 会话解析结果
class SessionResolve {
  final String sessionKey;
  final String? agentId;
  final String? name;
  final bool exists;

  SessionResolve({
    required this.sessionKey,
    this.agentId,
    this.name,
    required this.exists,
  });

  factory SessionResolve.fromJson(Map<String, dynamic> json) {
    return SessionResolve(
      sessionKey: json['sessionKey'] as String? ?? '',
      agentId: json['agentId'] as String?,
      name: json['name'] as String?,
      exists: json['exists'] as bool? ?? false,
    );
  }
}
