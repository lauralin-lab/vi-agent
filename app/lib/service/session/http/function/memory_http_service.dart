import 'package:flutter/foundation.dart';

import '../../../../common/utils/log_utils.dart';
import '../gateway_dio.dart';

//////////////////////////////////////////////////////////////////////////////
// Models
//////////////////////////////////////////////////////////////////////////////

/// Memory 数据 (对应 GET /api/memory 返回)
class MemoryData {
  final bool exists;
  final String content;
  final DateTime? lastModified;

  const MemoryData({
    required this.exists,
    required this.content,
    this.lastModified,
  });

  factory MemoryData.fromJson(Map<String, dynamic> json) {
    return MemoryData(
      exists: json['exists'] as bool? ?? false,
      content: json['content'] as String? ?? '',
      lastModified: json['lastModified'] != null ? DateTime.tryParse(json['lastModified'].toString()) : null,
    );
  }

  static const empty = MemoryData(exists: false, content: '');
}

/// Memory 保存结果 (对应 POST /api/memory 返回)
class MemorySaveResult {
  final bool success;
  final DateTime? lastModified;
  final String? error;

  const MemorySaveResult({
    required this.success,
    this.lastModified,
    this.error,
  });

  factory MemorySaveResult.fromJson(Map<String, dynamic> json) {
    return MemorySaveResult(
      success: json['success'] as bool? ?? false,
      lastModified: json['lastModified'] != null ? DateTime.tryParse(json['lastModified'].toString()) : null,
      error: json['error'] as String?,
    );
  }
}

//////////////////////////////////////////////////////////////////////////////
// HTTP Service
//////////////////////////////////////////////////////////////////////////////

/// Memory HTTP Service - 通过 HTTP 接口读写 Memory 数据
class MemoryHttpService {
  const MemoryHttpService();

  /// 获取 Memory 内容
  /// GET /api/memory
  Future<MemoryData> getMemory() async {
    try {
      final resp = await gatewayDio.get('/api/memory');
      final data = resp.data;

      if (data is Map<String, dynamic>) {
        return MemoryData.fromJson(data);
      }

      return MemoryData.empty;
    } catch (e) {
      Log.d('[MemoryHttpService] getMemory failed: $e');
      return MemoryData.empty;
    }
  }

  /// 保存 Memory 内容
  /// POST /api/memory
  Future<MemorySaveResult> saveMemory({required String content}) async {
    try {
      final resp = await gatewayDio.post(
        '/api/memory',
        data: {'content': content},
      );
      final data = resp.data;

      if (data is Map<String, dynamic>) {
        return MemorySaveResult.fromJson(data);
      }

      return const MemorySaveResult(success: false, error: 'Invalid response');
    } catch (e) {
      Log.d('[MemoryHttpService] saveMemory failed: $e');
      return MemorySaveResult(success: false, error: e.toString());
    }
  }
}
