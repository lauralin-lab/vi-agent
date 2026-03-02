import 'dart:io';

import 'package:flutter/services.dart';
import 'package:path/path.dart' as p;

import '../../../common/io/paths.dart';
import '../../models/album_picker_config.dart';
import 'album_picker.dart';

/// 本地参数模版
class AssetPhotoTemplate {
  const AssetPhotoTemplate({
    required this.id,
    required this.image,
    required this.width,
    required this.height,
    required this.preview,
  });

  /// 视频模版
  static const normal = <AssetPhotoTemplate>[t01, t03, t02, t04];

  static const AssetPhotoTemplate t01 = AssetPhotoTemplate(
    id: 2025062401,
    width: 1280,
    height: 1600,
    image: 'assets/images/img_template_01.jpg',
    preview: 'assets/images/img_template_thumbnail_01.webp',
  );

  static const AssetPhotoTemplate t02 = AssetPhotoTemplate(
    id: 2025062402,
    width: 1536,
    height: 1024,
    image: 'assets/images/img_template_02.jpg',
    preview: 'assets/images/img_template_thumbnail_02.webp',
  );

  static const AssetPhotoTemplate t03 = AssetPhotoTemplate(
    id: 2025061303,
    width: 1280,
    height: 1600,
    image: 'assets/images/img_template_03.jpg',
    preview: 'assets/images/img_template_thumbnail_03.webp',
  );

  static const AssetPhotoTemplate t04 = AssetPhotoTemplate(
    id: 2025061304,
    width: 1536,
    height: 1024,
    image: 'assets/images/img_template_04.jpg',
    preview: 'assets/images/img_template_thumbnail_04.webp',
  );

  /// 编号
  final int id;

  /// 封面
  final String image;

  /// 预览图
  final String preview;

  /// 图片高度
  final int width;

  /// 图片宽度
  final int height;

  /// 将模版转换为 [ImageMeta]
  Future<ImageMeta> toImageMeta() => _toImageMeta();

  /// 将模版转换为 [ImageMeta]
  Future<ImageMeta> _toImageMeta() async {
    final file = await _load();
    return ImageMeta(file: file, width: width, height: height, assetId: '$kTemplateItemPrefix$id');
  }

  /// 加载图片
  Future<File> _load() async {
    final parent = Paths.buildDirectory;
    final prefix = 'template_$id';
    final file = File(p.join(parent.path, "$prefix.jpg"));
    final temp = File(p.join(parent.path, "$prefix.jpg.tmp"));
    if (await file.exists()) return file;
    if (!await parent.exists()) {
      await parent.create(recursive: true);
    }
    final bytes = await rootBundle.load(image);
    await temp.writeAsBytes(bytes.buffer.asUint8List());
    await temp.rename(file.path);
    return file;
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AssetPhotoTemplate &&
          runtimeType == other.runtimeType &&
          id == other.id &&
          image == other.image &&
          preview == other.preview;

  @override
  int get hashCode => Object.hash(id, image, preview);

  @override
  String toString() {
    return 'AssetsVideoTemplate{id: $id, image: $image, preview: $preview, width: $width, height: $height, }';
  }
}
