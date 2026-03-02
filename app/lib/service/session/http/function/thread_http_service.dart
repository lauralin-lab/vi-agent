import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../common/utils/log_utils.dart';
import '../gateway_dio.dart';

//////////////////////////////////////////////////////////////////////////////
// Models
//////////////////////////////////////////////////////////////////////////////

/// 会话列表项 (对应 GET /api/sessions 返回的 session)
class ThreadSession {
  final String filename;
  final String title;
  final DateTime timestamp;
  final String key;
  final List<String> files;

  const ThreadSession({
    required this.filename,
    required this.title,
    required this.timestamp,
    required this.key,
    required this.files,
  });

  factory ThreadSession.fromJson(Map<String, dynamic> json) {
    return ThreadSession(
      filename: json['filename'] as String? ?? '',
      title: json['title'] as String? ?? 'Untitled',
      timestamp: json['timestamp'] != null
          ? DateTime.tryParse(json['timestamp'].toString()) ?? DateTime.now()
          : DateTime.now(),
      key: json['key'] as String? ?? '',
      files: (json['files'] as List?)?.cast<String>() ?? [],
    );
  }
}

/// 线程消息内容 (对应 message 节点里的 { role, content })
class ThreadMessageContent {
  final String role;
  final dynamic content; // String 或 List<Map>

  const ThreadMessageContent({
    required this.role,
    required this.content,
  });

  factory ThreadMessageContent.fromJson(Map<String, dynamic> json) {
    return ThreadMessageContent(
      role: json['role'] as String? ?? '',
      content: json['content'],
    );
  }

  /// 提取纯文本内容
  String get textContent {
    if (content is String) return content as String;
    if (content is List) {
      return (content as List)
          .whereType<Map<String, dynamic>>()
          .where((c) => c['type'] == 'text')
          .map((c) => c['text'] as String? ?? '')
          .join('\n');
    }
    return '';
  }
}

/// 线程消息节点 (对应 GET /api/threads 返回的 messages 数组项)
class ThreadMessage {
  final String type;
  final ThreadMessageContent message;
  final DateTime timestamp;
  final String displayRole;

  const ThreadMessage({
    required this.type,
    required this.message,
    required this.timestamp,
    required this.displayRole,
  });

  factory ThreadMessage.fromJson(Map<String, dynamic> json) {
    return ThreadMessage(
      type: json['type'] as String? ?? '',
      message: ThreadMessageContent.fromJson(
        json['message'] as Map<String, dynamic>? ?? {},
      ),
      timestamp: json['timestamp'] != null
          ? DateTime.tryParse(json['timestamp'].toString()) ?? DateTime.now()
          : DateTime.now(),
      displayRole: json['displayRole'] as String? ?? json['message']?['role'] as String? ?? '',
    );
  }

  bool get isUser => displayRole == 'user';
  bool get isAssistant => displayRole == 'assistant';
  bool get isDisplayable => type == 'message' && (isUser || isAssistant);
}

/// 线程详情 (对应 GET /api/threads 返回的完整结构)
class ThreadDetail {
  final List<ThreadMessage> messages;

  const ThreadDetail({required this.messages});

  factory ThreadDetail.fromJson(Map<String, dynamic> json) {
    final rawMessages = json['messages'] as List? ?? [];
    return ThreadDetail(
      messages: rawMessages.whereType<Map<String, dynamic>>().map(ThreadMessage.fromJson).toList(),
    );
  }

  /// 只返回可显示的消息（user/assistant），按时间排序
  List<ThreadMessage> get visibleMessages =>
      messages.where((m) => m.isDisplayable).toList()..sort((a, b) => a.timestamp.compareTo(b.timestamp));
}

//////////////////////////////////////////////////////////////////////////////
// HTTP Service
//////////////////////////////////////////////////////////////////////////////

/// Thread HTTP Service - 通过 HTTP 接口获取会话和线程数据
class ThreadHttpService {
  const ThreadHttpService();

  /// 获取所有会话列表
  /// GET /api/sessions
  Future<List<ThreadSession>> getSessions() async {
    try {
      final resp = await gatewayDio.get('/api/sessions');
      final data = resp.data;

      if (data is List) {
        return data.whereType<Map<String, dynamic>>().map(ThreadSession.fromJson).toList();
      }

      return [];
    } catch (e) {
      Log.d('[ThreadHttpService] getSessions failed: $e');
      return [];
    }
  }

  /// 获取指定线程的消息详情
  /// GET /api/threads?file={filename}
  Future<ThreadDetail> getThread({required String filename}) async {
    try {
      final resp = await gatewayDio.get(
        '/api/threads',
        queryParameters: {'file': filename},
      );
      final data = resp.data;

      if (data is Map<String, dynamic>) {
        return ThreadDetail.fromJson(data);
      }

      return const ThreadDetail(messages: []);
    } catch (e) {
      Log.d('[ThreadHttpService] getThread($filename) failed: $e');
      return const ThreadDetail(messages: []);
    }
  }
}

//////////////////////////////////////////////////////////////////////////////
// Providers
//////////////////////////////////////////////////////////////////////////////

/// Thread HTTP Service Provider
final threadHttpServiceProvider = Provider<ThreadHttpService>((ref) {
  return const ThreadHttpService();
});

/// 会话列表 Provider
final threadSessionsProvider = FutureProvider<List<ThreadSession>>((ref) async {
  final service = ref.watch(threadHttpServiceProvider);
  return service.getSessions();
});

/// 线程详情 Provider (按 filename 索引)
final threadDetailProvider = FutureProvider.family<ThreadDetail, String>((ref, filename) async {
  final service = ref.watch(threadHttpServiceProvider);
  return service.getThread(filename: filename);
});
