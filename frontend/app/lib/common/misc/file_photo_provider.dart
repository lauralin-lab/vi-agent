import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';

import '../../configs/constans.dart';

/// 用来用户载入编辑的图片，此加载器会限制图片尺寸
final class FilePhotoProvider extends ImageProvider<FilePhotoProvider> {
  const FilePhotoProvider(this.file);

  /// 文件
  final File file;

  @override
  Future<FilePhotoProvider> obtainKey(ImageConfiguration configuration) {
    return SynchronousFuture<FilePhotoProvider>(this);
  }

  @override
  @protected
  ImageStreamCompleter loadImage(
    FilePhotoProvider key,
    ImageDecoderCallback decode,
  ) {
    return MultiFrameImageStreamCompleter(
      codec: _loadImageAsync(key, decode),
      scale: 1.0,
      debugLabel: key.file.path,
      informationCollector: () => <DiagnosticsNode>[
        ErrorDescription('Path: ${file.path}'),
      ],
    );
  }

  /// 加载图片，并限制图片大小
  Future<ui.Codec> _loadImageAsync(
    FilePhotoProvider key,
    ImageDecoderCallback decode,
  ) async {
    assert(key == this);
    final int lengthInBytes = await file.length();
    if (lengthInBytes == 0) {
      PaintingBinding.instance.imageCache.evict(key);
      throw StateError('$file is empty and cannot be loaded as an image.');
    }
    return decode(
      await ui.ImmutableBuffer.fromFilePath(file.path),
      getTargetSize: loadPhotoTargetImageSize,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is FilePhotoProvider && file.absolute.path == other.file.absolute.path;

  @override
  int get hashCode => file.absolute.path.hashCode;
}

/// 限制最大尺寸
ui.TargetImageSize loadPhotoTargetImageSize(int w, int h) {
  const max = maxPhotoSize;
  if (w >= h && w > max) return const ui.TargetImageSize(width: max);
  if (h >= w && h > max) return const ui.TargetImageSize(height: max);
  return const ui.TargetImageSize();
}
