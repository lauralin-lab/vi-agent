import 'dart:convert';

import '../../../../service/gateway/rpc/function/chat_service.dart';

class ChatThread {
  final String threadId;
  final String title;
  final DateTime updatedAt;
  final String? sandboxId;
  final String? sandboxUrl;

  ChatThread({
    required this.threadId,
    required this.title,
    required this.updatedAt,
    this.sandboxId,
    this.sandboxUrl,
  });

  factory ChatThread.fromJson(Map<String, dynamic> json) {
    String? sbId;
    String? sbUrl;
    if (json['project'] != null && json['project']['sandbox'] != null) {
      sbId = json['project']['sandbox']['id'];
      sbUrl = json['project']['sandbox']['sandbox_url'];
    }
    return ChatThread(
      threadId: json['thread_id'],
      title: json['title'] ?? 'Untitled Chat',
      updatedAt: DateTime.parse(json['updated_at']),
      sandboxId: sbId,
      sandboxUrl: sbUrl,
    );
  }
}

class SessionMessage {
  final String messageId;
  final String type;
  final dynamic content;
  final dynamic metadata;
  final DateTime createdAt;

  SessionMessage({
    required this.messageId,
    required this.type,
    required this.content,
    required this.metadata,
    required this.createdAt,
  });

  factory SessionMessage.fromJson(Map<String, dynamic> json) {
    return SessionMessage(
      messageId: json['message_id'],
      type: json['type'],
      content: json['content'],
      metadata: json['metadata'] ?? {},
      createdAt: DateTime.parse(json['created_at']),
    );
  }

  /// 从 Gateway 层 ChatMessage 转换
  ///
  /// [SessionMessage] 是 API 返回的原始消息格式
  /// [SessionMessage] 是 UI 层使用的消息格式
  factory SessionMessage.fromChatMessage(ChatMessage msg) {
    // 提取文本内容
    final content = msg.content as List;
    final textContent = content
        .where((c) => c.type == 'text' && c.text != null)
        .map((c) => c.text as String)
        .join('\n');

    // 构建 metadata（保留 model/usage 等信息）
    final metadata = <String, dynamic>{
      'text_content': textContent,
      if (msg.model != null) 'model': msg.model,
      if (msg.provider != null) 'provider': msg.provider,
      if (msg.usage != null)
        'usage': {
          'input': msg.usage?.input ?? 0,
          'output': msg.usage?.output ?? 0,
          'totalTokens': msg.usage?.totalTokens ?? 0,
        },
      if (msg.stopReason != null) 'stopReason': msg.stopReason,
    };

    return SessionMessage(
      messageId: msg.timestamp.millisecondsSinceEpoch.toString(),
      type: msg.role,
      content: textContent,
      metadata: metadata,
      createdAt: msg.timestamp,
    );
  }

  bool get isUser => type == 'user';
  bool get isAssistant => type == 'assistant';

  /// 只有用户和AI消息才展示
  bool get isDisplayableType => isUser || isAssistant;

  Map<String, dynamic> toJson() => {
    'message_id': messageId,
    'type': type,
    'content': content,
    'metadata': metadata,
    'created_at': createdAt.toIso8601String(),
  };
}

class Attachment {
  final String path;
  final String? name;

  Attachment({required this.path, this.name});

  bool get isImage {
    final lower = path.toLowerCase();
    return lower.endsWith('.png') ||
        lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.gif') ||
        lower.endsWith('.webp') ||
        lower.endsWith('.bmp') ||
        lower.endsWith('.jfif') ||
        lower.endsWith('.svg');
  }

  bool get isExternal => path.startsWith('http');
}

class ParsedMessage {
  final String text;
  final List<Attachment> attachments;

  ParsedMessage({required this.text, required this.attachments});

  static final RegExp _uploadFileRegex = RegExp(
    r'\[Uploaded File:\s*(.*?)\]',
    caseSensitive: false,
  );

  /// 匹配 [file:path] 格式（HTTP 上传后嵌入的文件路径）
  static final RegExp _fileTagRegex = RegExp(
    r'\[file:(.*?)\]',
    caseSensitive: false,
  );

  factory ParsedMessage.fromSessionMessage(SessionMessage msg) {
    String text = "";
    List<Attachment> attachments = [];

    // 1. 获取原始文本 (用于提取嵌入的文件标记)
    String rawText = "";

    if (msg.isUser) {
      final content = _decode(msg.content);
      rawText = content['content']?.toString() ?? (msg.content is String ? msg.content : "");

      // 解析显式的 content.files
      if (content['files'] is List) {
        for (var f in content['files']) {
          if (f is Map) {
            attachments.add(
              Attachment(path: f['path'] ?? f['url'] ?? "", name: f['name']),
            );
          } else if (f is String) {
            attachments.add(Attachment(path: f));
          }
        }
      }
    } else {
      final meta = _decode(msg.metadata);
      rawText = meta['text_content']?.toString() ?? "";

      // 处理 tool_calls 里的显式附件
      if (meta['tool_calls'] is List) {
        for (var tc in meta['tool_calls']) {
          if (tc is! Map) continue;
          final args = _decode(tc['arguments']);
          if (rawText.isEmpty && args['text'] != null) rawText = args['text'];
          if (args['attachments'] is List) {
            for (var a in args['attachments']) {
              if (a is Map) {
                attachments.add(
                  Attachment(
                    path: a['path'] ?? a['url'] ?? "",
                    name: a['name'],
                  ),
                );
              } else if (a is String) {
                attachments.add(Attachment(path: a));
              }
            }
          }
        }
      }

      // 如果 metadata 为空，尝试从 content 解析
      if (rawText.isEmpty && attachments.isEmpty) {
        final content = _decode(msg.content);
        rawText = content['content']?.toString() ?? (msg.content is String ? msg.content : "");
      }
    }

    // 2. 从原始文本中提取 [Uploaded File: path] 和 [file:path]
    for (final regex in [_uploadFileRegex, _fileTagRegex]) {
      final matches = regex.allMatches(rawText);
      for (final match in matches) {
        final path = match.group(1);
        if (path != null && path.isNotEmpty) {
          if (!attachments.any((a) => a.path == path)) {
            attachments.add(Attachment(path: path));
          }
        }
      }
    }

    // 3. 准备展示文本：清理标记和工具标签
    text = rawText.replaceAll(_uploadFileRegex, '').replaceAll(_fileTagRegex, '').trim();
    if (!msg.isUser) {
      text = _cleanText(text);
    }

    return ParsedMessage(text: text, attachments: attachments);
  }

  /// 判断消息是否真正有可展示的内容
  bool get hasContent => text.isNotEmpty || attachments.isNotEmpty;

  static Map<String, dynamic> _decode(dynamic val) {
    if (val is Map) return Map<String, dynamic>.from(val);
    if (val is String && val.isNotEmpty) {
      try {
        final decoded = jsonDecode(val);
        if (decoded is Map) return Map<String, dynamic>.from(decoded);
      } catch (_) {}
    }
    return {};
  }

  static String _cleanText(String input) {
    return input
        .replaceAll(
          RegExp(
            r'<function_calls>[\s\S]*?<\/function_calls>',
            caseSensitive: false,
          ),
          '',
        )
        .replaceAll(
          RegExp(
            r'<[a-zA-Z0-9_\-]+[^>]*>[\s\S]*?<\/[a-zA-Z0-9_\-]+>|<[a-zA-Z0-9_\-]+[^>]*\/>',
          ),
          '',
        )
        .trim();
  }
}
