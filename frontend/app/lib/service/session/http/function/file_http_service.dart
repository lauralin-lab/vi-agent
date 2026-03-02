import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../../../common/utils/log_utils.dart';
import '../../../gateway/rpc/gateway_models.dart';
import '../gateway_dio.dart';

/// Gateway 文件服务
///
/// 提供文件上传 (`/collov/upload`) 和预览 (`/collov/preview`) 功能
class FileHttpService {
  FileHttpService._();

  static final FileHttpService instance = FileHttpService._();

  /// 上传单个文件到 Gateway
  ///
  /// 返回 Gateway 端的文件路径 (来自响应的 `path` 字段)
  Future<UploadResult> uploadFile(File file) async {
    final fileName = file.path.split('/').last;

    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(
        file.path,
        filename: fileName,
      ),
    });

    try {
      final response = await gatewayDio.post(
        '/collov/upload_file',
        data: formData,
        options: Options(
          contentType: 'multipart/form-data',
          sendTimeout: const Duration(seconds: 60),
          receiveTimeout: const Duration(seconds: 60),
        ),
      );

      final responseData = response.data as Map<String, dynamic>;
      final data = responseData['file'] as Map<String, dynamic>;
      if (data['success'] == true) {
        return UploadResult(
          success: true,
          filename: data['filename'] as String? ?? fileName,
          path: data['path'] as String? ?? '',
          size: data['size'] as int? ?? 0,
          mimetype: data['mimetype'] as String? ?? '',
        );
      } else {
        return UploadResult(
          success: false,
          error: data['error'] as String? ?? 'Upload failed',
        );
      }
    } catch (e) {
      Log.d('[FileHttpService] Upload failed: $e');
      return UploadResult(success: false, error: e.toString());
    }
  }

  /// 构建 Gateway 工作空间 URL
  ///
  /// 通过 `/collov/workspace?path=path` 获取工作空间
  /// [path] 可以是完整服务端路径或文件名
  String buildWorkspaceUrl(String path) {
    final rawPath = path.replaceAll('workspace://', '');
    final workspaceUrl = '$kGatewayWorkspaceUrl?path=$rawPath';
    return workspaceUrl;
  }

  /// 获取 Gateway 认证 headers（用于图片加载）
  Map<String, String> get authHeaders {
    final auth = gatewayDio.options.headers['Authorization'];
    if (auth != null) {
      return {'Authorization': auth.toString()};
    }
    return {};
  }
}

/// 上传结果
class UploadResult {
  final bool success;
  final String? filename;
  final String? path;
  final int? size;
  final String? mimetype;
  final String? error;

  const UploadResult({
    required this.success,
    this.filename,
    this.path,
    this.size,
    this.mimetype,
    this.error,
  });
}
