import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;
import 'package:rive_rolls_collection/algorithm/size_int.dart';
import 'package:rive_rolls_collection/logging/logger.dart';
import 'package:rive_rolls_video_trimmer/video_trimmer.dart';

import '../extension/image_ext.dart';
import '../io/paths.dart';
import '../misc/file_photo_provider.dart';

/// 图片参数信息
final class PhotoArgs {
  const PhotoArgs({required this.width, required this.height});

  /// 图片宽度
  final int width;

  /// 图片高度
  final int height;

  /// 图片大小
  SizeInt get size => SizeInt(width, height);

  /// 图片宽高比
  double get aspectRatio => size.aspectRatio;

  /// 转换参数
  PhotoArgs copyWithSize(int width, int height) => PhotoArgs(width: width, height: height);

  static Map<String, dynamic> encodeToRoute(PhotoArgs self) {
    return {'width': self.width, 'height': self.height};
  }

  static PhotoArgs decodeFromRoute(Map<String, dynamic> route) {
    return PhotoArgs(width: route['width'], height: route['height']);
  }
}

/// 图片选取参数
class PhotoPickerArgs {
  const PhotoPickerArgs(this.file, this.args, {this.videoFile, this.duration = 0});

  /// 图片文件路径
  final File file;

  /// 扩展参数
  final PhotoArgs args;

  /// 视频路径
  final File? videoFile;

  /// 视频时长
  final int duration;

  PhotoPickerArgs withArgs(PhotoArgs args) => PhotoPickerArgs(file, args);

  @override
  String toString() => 'PhotoPickerArgs{file: $file, extra: $args, videoFile:$videoFile, duration:$duration}';
}

/// 后处理结果
class PickerPostProcessorResult<T> {
  const PickerPostProcessorResult(this.pop, this.result);

  /// 是否需要关闭图片选取页面
  final bool pop;

  /// 执行返回时的结果
  final T? result;

  @override
  String toString() => 'PickerPostProcessorResult{pop: $pop, result: $result}';
}

////////////////////////////////////////////////////////////////////////////////

final class PickerExt {
  const PickerExt._();

  /// 保存文件夹
  static Directory get pickerDirectory {
    return Directory(p.join(Paths.temporaryDirectory.absolute.path, ".picker"));
  }

  /// 创建一个缓存文件路径
  static File newCachedFile([String ext = ".jpg", DateTime? dt]) {
    final now = (dt ?? DateTime.timestamp()).millisecondsSinceEpoch;
    return File(p.join(pickerDirectory.path, "cache_$now$ext"));
  }

  /// 保存图片
  static Future<bool> saveToJpg(File file, ui.Image image) async {
    if (!await file.parent.exists()) await file.parent.create(recursive: true);
    return image.saveToJpg(file, quality: 95);
  }

  /// 计算增强模式图片裁剪尺寸
  static int computeMaxSizeForEnhancer(SizeInt size) {
    if (size.width <= 960 && size.height <= 960) {
      return 960;
    } else if (size.width >= 2048 || size.height >= 2048) {
      return 2048;
    } else {
      return math.max((size.width ~/ 8) * 8, (size.height ~/ 8) * 8);
    }
  }

  /// 视频提前做缩略图
  static Future<File> thumbnailVideo(String path) async {
    final parent = pickerDirectory;
    if (!await parent.exists()) await parent.create(recursive: true);

    final now = DateTime.timestamp();
    final dst = newCachedFile("v.jpg", now).path;

    // 解决ios的视频
    String videoPathToUse = path;
    if (Platform.isIOS && !isVideoPath(path)) {
      final newPath = p.join(parent.path, '${now}v.mp4');
      videoPathToUse = await File(path).copy(newPath).then((f) => f.path);
    }

    await VideoThumbnail.sampleCreateThumbnailFile(
      videoPath: videoPathToUse,
      dstPath: dst,
      timeMs: 0,
    );

    return File(dst);
  }

  /// 判断是否是视频
  static bool isVideoPath(String path) {
    const videoExts = {'.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm', '.3gp', '.flv'};

    return videoExts.contains(p.extension(path).toLowerCase());
  }

  /// 过滤文件
  static Future<(File file, ui.Image)> filter(File file) async {
    final parent = pickerDirectory;
    final now = DateTime.timestamp();
    final tmp = newCachedFile(".jpg.tmp", now);
    final dst = newCachedFile(".jpg", now);

    final buffer = await ui.ImmutableBuffer.fromFilePath(file.path);
    final codec = await ui.instantiateImageCodecWithSize(
      buffer,
      getTargetSize: loadPhotoTargetImageSize,
    );

    var image = (await codec.getNextFrame()).image;

    codec.dispose();

    if (!await parent.exists()) {
      await parent.create(recursive: true);
    }

    image = await _postProcessorForBase(image);

    await image.saveToJpg(tmp, quality: 90);
    await tmp.rename(dst.path);

    final end = DateTime.timestamp().millisecondsSinceEpoch;
    if (kDebugMode) {
      final size = await dst.length();
      final start = now.millisecondsSinceEpoch;
      logd("图片 >> 尺寸：${image.width}x${image.height}，总花费时间：${end - start}毫秒，空间：${size ~/ 1024}KB。");
    }
    return (dst, image);
  }

  /// 执行检测，目前是兼容模式
  static Future<ui.Image> _postProcessorForBase(ui.Image photo) async {
    // 检查图片是否合法，是否满足图片对齐
    if (photo.sizeInt.validAlign()) {
      return photo;
    } else {
      final result = await photo.createAlignImage();
      photo.dispose();
      return result;
    }
  }

  /// 后处理时防止图片太大
  static Future<void> filterOnPostProcessor(String path, String dstPath) async {
    final buffer = await ui.ImmutableBuffer.fromFilePath(path);
    final codec = await ui.instantiateImageCodecWithSize(
      buffer,
      getTargetSize: (int w, int h) {
        const max = 4096;
        if (w >= h && w > max) return const ui.TargetImageSize(width: max);
        if (h >= w && h > max) return const ui.TargetImageSize(height: max);
        return const ui.TargetImageSize();
      },
    );
    var image = (await codec.getNextFrame()).image;
    codec.dispose();
    image = await _postProcessorForBase(image);
    await image.saveToJpg(File(dstPath), quality: image.width * image.height > 4000000 ? 85 : 90);
    image.dispose();
  }

  /// 新增后处理，返回图片的信息
  static Future<ui.Size> filterOnPostProcessorNew(String path, String dstPath) async {
    final buffer = await ui.ImmutableBuffer.fromFilePath(path);
    final codec = await ui.instantiateImageCodecWithSize(
      buffer,
      getTargetSize: (int w, int h) {
        const max = 4096;
        if (w >= h && w > max) return const ui.TargetImageSize(width: max);
        if (h >= w && h > max) return const ui.TargetImageSize(height: max);
        return const ui.TargetImageSize();
      },
    );
    var image = (await codec.getNextFrame()).image;
    codec.dispose();
    image = await _postProcessorForBase(image);
    await image.saveToJpg(File(dstPath), quality: image.width * image.height > 4000000 ? 85 : 90);

    /// 获取尺寸
    final size = ui.Size(
      image.width.toDouble(),
      image.height.toDouble(),
    );
    image.dispose();
    return size;
  }
}

extension ImageExtForPicker on ui.Image {
  /// 将图片大小对齐整数倍 8
  Future<ui.Image> createAlignImage() async {
    const int align = 8;
    if (width % align == 0 && height % align == 0) {
      return clone();
    }

    final alignW = (width ~/ align) * align;
    final alignH = (height ~/ align) * align;
    final srcW = alignW.toDouble();
    final srcH = alignH.toDouble();

    final pr = ui.PictureRecorder();
    final canvas = ui.Canvas(pr);
    canvas.drawImageRect(
      this,
      ui.Rect.fromLTWH((width - srcW) / 2, (height - srcH) / 2, srcW, srcH),
      ui.Rect.fromLTRB(0, 0, alignW * 1, alignH * 1),
      ui.Paint()..filterQuality = ui.FilterQuality.medium,
    );
    final picture = pr.endRecording();
    return picture.toImage(alignW, alignH);
  }
}

extension SizeIntExtForPicker on SizeInt {
  /// 判断是否对齐整数倍
  bool validAlign([int align = 8]) {
    if (isEmpty) return false;
    return width % align == 0 && height % align == 0;
  }
}
