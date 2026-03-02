import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path/path.dart' as p;
import 'package:rive_rolls_collection/misc/initializer.dart';

import '../extension/file_ext.dart';
import '../utils/image_crop.dart';
import '../utils/sys_utils.dart';

/// 杂项初始化器
class MiscInitializer extends Initializer {
  const MiscInitializer(super.type);

  @override
  Future onInit() async {
    _fixSystemUI();
    _initImageCache();
    _cleanPickerPhotoCache();
  }

  /// 解决系统底部导航栏无法沉浸问题
  void _fixSystemUI() {
    if (Platform.isAndroid) {
      SystemUiOverlayStyle systemUiOverlayStyle = const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: Colors.transparent,
      );
      SystemChrome.setSystemUIOverlayStyle(systemUiOverlayStyle);
    }

    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  }

  /// 设置图片缓存最大大小
  void _initImageCache() {
    if (Platform.isIOS) {
      PaintingBinding.instance.imageCache.maximumSize = 128 << 20; // 128 MB
      return;
    }

    // 非 Android 系统
    if (!Platform.isAndroid) return;

    // 获取物理内存
    final memory = getAndroidTotalPhysicalMemory();
    if (memory < 0) return; // 获取错误，使用默认值

    final mib = memory ~/ (1024 * 1024);
    int sizeBytes;
    // 大于 9000M，由于保留原因一般为 10G 以上内存手机
    if (mib >= 9000) {
      sizeBytes = 128 << 20; // 128 MB
    } else if (mib >= 6000 || mib <= 0) {
      return; // 100M 保持默认值
    } else if (mib >= 5000) {
      sizeBytes = 72 << 20; // 72 MiB
    } else if (mib >= 3600) {
      sizeBytes = 64 << 20; // 64 MiB
    } else {
      sizeBytes = 48 << 20; // 48 MiB
    }
    PaintingBinding.instance.imageCache.maximumSize = sizeBytes;
  }

  /// 清理相册选择工具用于缓存的图片
  ///
  /// 删除名称规则为 `cache_时间戳.xxx` 的图片
  Future<void> _cleanPickerPhotoCache() async {
    final dir = PickerExt.pickerDirectory;
    final now = DateTime.timestamp().millisecondsSinceEpoch - 30000;

    if (!await dir.exists()) return;
    await for (final fe in dir.list()) {
      // 这里只处理文件
      if (fe is! File) continue;

      final name = p.basenameWithoutExtension(fe.path);
      if (!name.startsWith('cache_')) continue;
      final timestamp = int.tryParse(name.substring(6));
      if (timestamp == null || timestamp > now) continue;
      await fe.deleteIgnore();
    }
  }
}
