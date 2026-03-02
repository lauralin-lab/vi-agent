import 'dart:io';
import 'dart:ui' as ui;

import 'package:sfml/sfml.dart';

export 'package:rive_rolls_collection/extension/image_ext.dart';

/// 图片扩展
extension ImageExt2 on ui.Image {
  /// 保存图片为 jpg
  Future<bool> saveToJpg(File file, {int quality = 85}) {
    return stbWriteJpg(this, file.absolute.path, quality: quality);
  }

  /// 保存图片为 PNG
  ///
  /// 大图绝大多数情况下远快于官方的 [Image.toByteData]
  Future<bool> saveToPng(File file) {
    return stbWritePng(this, file.absolute.path);
  }
}
