import 'dart:io';

/// 图片上传状态模型
class PendingImage {
  final File file;
  String? workspacePath;
  bool isUploading;
  String? error;

  PendingImage({
    required this.file,
    this.workspacePath,
    this.isUploading = false,
    this.error,
  });

  bool get isSuccess => workspacePath != null;
  bool get hasError => error != null;
}
