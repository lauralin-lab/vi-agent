import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../utils/log_utils.dart';

/// Mock 规则
class MockRule {
  MockRule({
    required this.id,
    required this.pathPattern,
    this.method,
    this.statusCode = 200,
    this.responseBody = '{}',
    this.delay = Duration.zero,
    this.enabled = true,
  });

  /// 规则 ID
  final String id;

  /// 匹配路径（支持前缀匹配，如 `/collov/livekit` 匹配 `/collov/livekit/token`）
  final String pathPattern;

  /// 限制 HTTP 方法（null 表示匹配所有方法）
  final String? method;

  /// 返回的 HTTP 状态码
  final int statusCode;

  /// 返回的 JSON 响应体
  final String responseBody;

  /// 模拟延迟
  final Duration delay;

  /// 是否启用
  bool enabled;

  /// 匹配请求
  bool matches(RequestOptions options) {
    if (!enabled) return false;

    // 方法匹配
    if (method != null && method!.toUpperCase() != options.method.toUpperCase()) {
      return false;
    }

    // 路径匹配（支持前缀匹配）
    final path = options.path;
    final uri = options.uri.path;
    return path.contains(pathPattern) || uri.contains(pathPattern);
  }

  /// 序列化
  Map<String, dynamic> toJson() => {
    'id': id,
    'pathPattern': pathPattern,
    'method': method,
    'statusCode': statusCode,
    'responseBody': responseBody,
    'delay': delay.inMilliseconds,
    'enabled': enabled,
  };

  /// 反序列化
  factory MockRule.fromJson(Map<String, dynamic> json) => MockRule(
    id: json['id'] as String,
    pathPattern: json['pathPattern'] as String,
    method: json['method'] as String?,
    statusCode: json['statusCode'] as int? ?? 200,
    responseBody: json['responseBody'] as String? ?? '{}',
    delay: Duration(milliseconds: json['delay'] as int? ?? 0),
    enabled: json['enabled'] as bool? ?? true,
  );

  /// 复制
  MockRule copyWith({
    String? id,
    String? pathPattern,
    String? method,
    int? statusCode,
    String? responseBody,
    Duration? delay,
    bool? enabled,
  }) => MockRule(
    id: id ?? this.id,
    pathPattern: pathPattern ?? this.pathPattern,
    method: method ?? this.method,
    statusCode: statusCode ?? this.statusCode,
    responseBody: responseBody ?? this.responseBody,
    delay: delay ?? this.delay,
    enabled: enabled ?? this.enabled,
  );
}

/// Mock 数据存储仓库（全局单例）
class MockStore extends ChangeNotifier {
  MockStore._();

  static final MockStore instance = MockStore._();

  /// 所有 Mock 规则
  final List<MockRule> _rules = [];

  /// 是否全局开启 Mock
  bool _globalEnabled = false;

  /// 只读规则列表
  List<MockRule> get rules => List.unmodifiable(_rules);

  /// 全局开关
  bool get globalEnabled => _globalEnabled;

  set globalEnabled(bool value) {
    _globalEnabled = value;
    notifyListeners();
  }

  /// 添加规则
  void addRule(MockRule rule) {
    _rules.add(rule);
    notifyListeners();
  }

  /// 更新规则
  void updateRule(String id, MockRule rule) {
    final index = _rules.indexWhere((r) => r.id == id);
    if (index != -1) {
      _rules[index] = rule;
      notifyListeners();
    }
  }

  /// 删除规则
  void removeRule(String id) {
    _rules.removeWhere((r) => r.id == id);
    notifyListeners();
  }

  /// 切换规则启用状态
  void toggleRule(String id) {
    final index = _rules.indexWhere((r) => r.id == id);
    if (index != -1) {
      _rules[index].enabled = !_rules[index].enabled;
      notifyListeners();
    }
  }

  /// 查找匹配的规则
  MockRule? findMatch(RequestOptions options) {
    if (!_globalEnabled) return null;
    for (final rule in _rules) {
      if (rule.matches(options)) return rule;
    }
    return null;
  }

  /// 序列化所有规则
  String serialize() {
    return jsonEncode({
      'globalEnabled': _globalEnabled,
      'rules': _rules.map((r) => r.toJson()).toList(),
    });
  }

  /// 反序列化并载入规则
  void deserialize(String data) {
    try {
      final json = jsonDecode(data) as Map<String, dynamic>;
      _globalEnabled = json['globalEnabled'] as bool? ?? false;
      _rules
        ..clear()
        ..addAll(
          (json['rules'] as List<dynamic>).map((e) => MockRule.fromJson(e as Map<String, dynamic>)).toList(),
        );
      notifyListeners();
    } catch (_) {
      // 数据损坏，忽略
    }
  }
}

/// Dio Mock 拦截器
class MockInterceptor extends Interceptor {
  MockInterceptor([MockStore? store]) : _store = store ?? MockStore.instance;

  final MockStore _store;

  @override
  Future<void> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final rule = _store.findMatch(options);
    if (rule == null) {
      return handler.next(options);
    }

    // 模拟延迟
    if (rule.delay > Duration.zero) {
      await Future<void>.delayed(rule.delay);
    }

    // 解析 response body
    dynamic data;
    try {
      data = jsonDecode(rule.responseBody);
    } catch (_) {
      data = rule.responseBody;
    }

    Log.d('[MockInterceptor] 🎭 拦截 ${options.method} ${options.path} → ${rule.statusCode}');

    if (rule.statusCode >= 200 && rule.statusCode < 300) {
      return handler.resolve(
        Response(
          requestOptions: options,
          statusCode: rule.statusCode,
          data: data,
        ),
      );
    } else {
      return handler.reject(
        DioException(
          requestOptions: options,
          response: Response(
            requestOptions: options,
            statusCode: rule.statusCode,
            data: data,
          ),
          type: DioExceptionType.badResponse,
        ),
      );
    }
  }
}
