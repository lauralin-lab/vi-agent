import 'dart:async';
import 'dart:io';

import 'package:path/path.dart' as path;
import 'package:path_provider/path_provider.dart';
import 'package:rive_rolls_collection/misc/initializer.dart';

/// 基本路径
class Paths {
  Paths._();

  /// 临时（缓存）目录
  static Directory? _sTemporaryDirectory;

  /// 文件保存目录
  static Directory? _sFileDirectory;

  /// 存档长期存储目录
  static Directory? _sStorageDirectory;

  /// 存档短期存储目录
  static Directory? _sCacheStorageDirectory;

  /// Dio 缓存目录
  static Directory? _sDioCacheDirectory;

  /// 用于作品下载归置陈列目录
  static Directory? _sGalleryDirectory;

  /// 上传临时目录
  static Directory? _sUploadDirectory;

  /// 图片保存路径
  static Directory? _sImagesDirectory;

  /// 临时用于构建的目录
  static Directory? _sBuildDirectory;

  /// 方案目录
  static Directory? _plansDirectory;

  /// 导入资源暂存目录
  static Directory? _sImportsDirectory;

  /// 用于保存拍照的目录
  static Directory? _tPhotosDirectory;

  /// 初始化
  static Future<void> _init() async {
    final tempDir = await getTemporaryDirectory();
    final fileDir = await getApplicationSupportDirectory();
    _sTemporaryDirectory = tempDir;
    _sFileDirectory = fileDir;
    _sStorageDirectory = Directory(path.join(fileDir.path, '.storage'));
    _plansDirectory = Directory(path.join(fileDir.path, '.plans'));
    _sGalleryDirectory = Directory(path.join(fileDir.path, '.gallery'));
    _sDioCacheDirectory = Directory(path.join(tempDir.path, '.dioCache'));
    _sCacheStorageDirectory = Directory(path.join(tempDir.path, '.storage'));
    _sUploadDirectory = Directory(path.join(tempDir.path, '.upload'));
    _sImagesDirectory = Directory(path.join(fileDir.path, '.images'));
    _sBuildDirectory = Directory(path.join(tempDir.path, '.build'));
    _sImportsDirectory = Directory(path.join(fileDir.path, '.imports'));
    _tPhotosDirectory = Directory(path.join(tempDir.path, '.takePhotos'));
  }

  /// 临时（缓存）文件夹
  static Directory get temporaryDirectory {
    if (_sTemporaryDirectory == null) throw Exception("Not init.");
    return _sTemporaryDirectory!;
  }

  /// 常规保存文件夹
  static Directory get fileDirectory {
    if (_sFileDirectory == null) throw Exception("Not init.");
    return _sFileDirectory!;
  }

  /// Dio 缓存文件夹
  static Directory get dioCacheDirectory {
    if (_sDioCacheDirectory == null) throw Exception("Not init.");
    return _sDioCacheDirectory!;
  }

  /// 存档长期存储文件夹
  static Directory get storageDirectory {
    if (_sStorageDirectory == null) throw Exception("Not init.");
    return _sStorageDirectory!;
  }

  /// 存档短期存储文件夹
  static Directory get cacheStorageDirectory {
    if (_sCacheStorageDirectory == null) throw Exception("Not init.");
    return _sCacheStorageDirectory!;
  }

  /// 用于作品下载归置陈列文件夹
  static Directory get galleryDirectory {
    if (_sGalleryDirectory == null) throw Exception("Not init.");
    return _sGalleryDirectory!;
  }

  /// 用于临时上传的缓存文件夹
  static Directory get uploadDirectory {
    if (_sUploadDirectory == null) throw Exception("Not init.");
    return _sUploadDirectory!;
  }

  /// 用于存储临时构建文件夹
  static Directory get buildDirectory {
    if (_sBuildDirectory == null) throw Exception("Not init.");
    return _sBuildDirectory!;
  }

  /// 图片长期存储文件夹
  static Directory get imagesDirectory {
    if (_sImagesDirectory == null) throw Exception("Not init.");
    return _sImagesDirectory!;
  }

  /// 方案长期存储文件夹
  static Directory get plansDirectory {
    if (_plansDirectory == null) throw Exception("Not init.");
    return _plansDirectory!;
  }

  /// 用于导入资源暂存文件夹
  static Directory get importsDirectory {
    if (_sImportsDirectory == null) throw Exception("Not init.");
    return _sImportsDirectory!;
  }

  /// 用于保存拍照的文件夹
  static Directory get takePhotosDirectory {
    if (_tPhotosDirectory == null) throw Exception("Not init.");
    return _tPhotosDirectory!;
  }
}

/// 路径初始化器
class PathsInitializer extends Initializer {
  const PathsInitializer(super.type);

  @override
  Future onInit() => Paths._init();
}
