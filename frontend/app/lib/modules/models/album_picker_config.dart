import 'dart:collection';
import 'dart:convert';
import 'dart:io';

import 'package:convert/convert.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:json_annotation/json_annotation.dart';
import 'package:path/path.dart' as p;
import 'package:photo_manager/photo_manager.dart';
import 'package:rive_rolls_collection/logging/logger.dart';

import '../../app.dart';
import '../../common/extension/file_ext.dart';
import '../../common/io/paths.dart';

part 'album_picker_config.g.dart';

const int _kCurVer = 1;

/// 用于相册选取页面配置
@JsonSerializable(genericArgumentFactories: true)
class AlbumPickerConfig<T extends AbsAlbumPickerItem> {
  AlbumPickerConfig(
    this.version,
    this.recentItems,
    this.localCache,
    this.assetCache,
  );

  /// 数据版本
  @JsonKey(name: 'ver', defaultValue: _kCurVer)
  final int version;

  /// 最近的视频、图片记录，仅保存编号
  /// 按照时间倒序排列
  @JsonKey(name: 'ri', defaultValue: [])
  final List<String> recentItems;

  /// 本地保存媒体文件
  @JsonKey(name: 'lc', defaultValue: {})
  final Map<String, T> localCache;

  /// [AssetEntity] 本地文件缓存文件路径缓存
  @JsonKey(name: 'ac', defaultValue: {})
  final Map<String, String> assetCache;

  /// 添加最近媒体
  /// 如果超过 12 条就删除底部记录
  /// 如果存在此记录，则放到队列顶部
  Future<void> addRecent(String id, String filePath) async {
    recentItems.remove(id);
    recentItems.insert(0, id);
    final oldFilePath = assetCache[id];
    // 删除旧缓存
    if (oldFilePath != null && oldFilePath != filePath) {
      await _cleanAssetEntityCache(id, oldFilePath);
    }
    // 尝试加入新的缓存
    if (_isInternalCacheFile(filePath)) {
      assetCache[id] = filePath;
    }
    while (recentItems.length > 12) {
      final last = recentItems.removeLast();
      await _clean(last);
    }
  }

  /// 添加最近媒体
  /// 如果超过 8 条就删除底部记录
  /// 如果存在此记录，则放到队列顶部
  Future<void> addLocalRecent(T item) async {
    recentItems.remove(item.id);
    recentItems.insert(0, item.id);
    localCache[item.id] = (item);
    while (recentItems.length > 8) {
      final last = recentItems.removeLast();
      await _clean(last);
    }
  }

  /// 获取最近的 4 条记录
  /// [sync] 表示删除失效数据，并写入配置
  Future<List<AssetEntity>> loadRecent([bool sync = false]) async {
    final assets = <AssetEntity>[];
    final removed = HashSet<String>();
    for (var i = 0; i < recentItems.length; i++) {
      final id = recentItems[i];
      try {
        final asset = id.startsWith(kPickerItemPrefix) ? localCache[id]?.toAssetEntity() : await AssetEntity.fromId(id);
        if (asset == null) {
          removed.add(id);
          continue;
        }
        assets.add(asset);
        if (assets.length == 4) break;
      } catch (ex) {
        logw(ex);
      }
    }

    if (removed.isNotEmpty && sync) {
      recentItems.removeWhere((e) => removed.contains(e));
      for (final e in removed) {
        await _clean(e);
      }
      await writeToLocal();
    }
    return assets;
  }

  /// 如果不在最近列表中则尝试删除文件
  Future<void> removeFileIfNotContainsRecent(String id, String filePath) {
    // 自定义文件
    if (id.startsWith(kPickerItemPrefix)) {
      // 存在列表中，不删除
      if (localCache.containsKey(id)) return Future.value();

      // 不是内部缓存文件，不删除
      if (!_isInternalCacheFile(filePath)) return Future.value();
      return File(filePath).deleteIgnore();
    }

    // 来自于 AssetEntity
    final cachePath = assetCache[id];
    if (cachePath == null || filePath != cachePath) {
      return _cleanAssetEntityCache(id, filePath);
    }
    return Future.value();
  }

  /// 读取配置
  static Future<AlbumPickerConfig<E>> readFromLocal<E extends AbsAlbumPickerItem>() async {
    AlbumPickerConfig<E>? configs;
    final storage = App().storage;
    try {
      final key = _storeKey<E>();
      configs = await storage.read<AlbumPickerConfig<E>>(
        key,
        decoder: AlbumPickerConfig.fromJson,
      );
    } catch (ex) {
      loge(ex);
    }
    return configs ?? AlbumPickerConfig<E>(_kCurVer, [], {}, {});
  }

  /// 写入配置
  Future<void> writeToLocal() {
    final key = _storeKey<T>();
    return App().storage.write(key, this);
  }

  /// 获取保存所用编号
  static String _storeKey<T>() {
    final type = T;
    if (type == VPickerItem) return 'VideoPickerConfig';
    if (type == IPickerItem) return 'ImagePickerConfig';
    throw UnimplementedError();
  }

  /// 获取保存所用函数
  static T Function(dynamic) _fromJsonForType<T>() {
    final type = T;
    if (type == VPickerItem) {
      return VPickerItem.fromJson as T Function(dynamic);
    }
    if (type == IPickerItem) {
      return IPickerItem.fromJson as T Function(dynamic);
    }
    throw UnimplementedError();
  }

  /// 清理数据
  Future<void> _clean(String id) async {
    if (!id.startsWith(kPickerItemPrefix)) {
      final value = assetCache.remove(id);
      if (value == null) return;
      await _cleanAssetEntityCache(id, value);
    } else {
      final value = localCache.remove(id);
      value?.clean();
    }
  }

  /// 清理来自 [AssetEntity] 的缓存
  static Future<void> _cleanAssetEntityCache(String id, String filePath) {
    if (id.startsWith(kPickerItemPrefix)) return Future.value();
    if (!_isInternalCacheFile(filePath)) return Future.value();
    return File(filePath).deleteIgnore();
  }

  /// 判断 [AssetEntity] 的原始文件是否为内部缓存文件
  /// 判断依据：https://github.com/fluttercandies/flutter_photo_manager/blob/main/README-ZH.md#%E7%BC%93%E5%AD%98%E6%9C%BA%E5%88%B6
  static bool _isInternalCacheFile(String filePath) {
    if (Platform.isIOS) return true;
    final absolutePath = File(filePath).absolute.path;
    return absolutePath.startsWith(Paths.temporaryDirectory.absolute.path) ||
        absolutePath.startsWith(Paths.fileDirectory.absolute.path);
  }

  factory AlbumPickerConfig.fromJson(dynamic json) {
    return _$AlbumPickerConfigFromJson(json, _fromJsonForType<T>());
  }

  Map<String, dynamic> toJson() {
    return _$AlbumPickerConfigToJson(this, (v) => v.toJson());
  }

  @override
  String toString() {
    return 'AlbumPickerConfig{'
        'version: $version, '
        'recentItems: $recentItems, '
        'localCache: $localCache, '
        'assetCache: $assetCache'
        '}';
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////

/// 编号前缀
const String kPickerItemPrefix = "<~@VPI@~>";

/// 模版编号前缀
const String kTemplateItemPrefix = "<~@TPL@~>";

/// 基本存储数据
abstract class AbsAlbumPickerItem {
  const AbsAlbumPickerItem(this.id, this.width, this.height, this.name);

  const AbsAlbumPickerItem._({
    required this.id,
    required this.width,
    required this.height,
    required this.name,
  });

  /// 编号
  @JsonKey(name: 'i', defaultValue: '')
  final String id;

  /// 视频、图片宽度
  @JsonKey(name: 'w', defaultValue: 0)
  final int width;

  /// 视频、图片高度
  @JsonKey(name: 'h', defaultValue: 0)
  final int height;

  /// 视频、图片保存路径
  @JsonKey(name: 'n', defaultValue: '')
  final String name;

  /// 文件距离
  String get path => p.join(Paths.importsDirectory.path, name);

  /// 转换为 [AssetEntity]
  AssetEntity toAssetEntity();

  /// 序列化
  Map<String, dynamic> toJson();

  /// 清理缓存文件
  @protected
  Future<void> clean();

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is AbsAlbumPickerItem && runtimeType == other.runtimeType && id == other.id;

  @override
  int get hashCode => id.hashCode;
}

////////////////////////////////////////////////////////////////////////////////////////////////////

/// 用于保存视频实现
@JsonSerializable()
class VPickerItem extends AbsAlbumPickerItem {
  const VPickerItem(
    super.id,
    super.width,
    super.height,
    this.duration,
    this.thumbnailName,
    super.name,
  );

  VPickerItem.create({
    required this.duration,
    required super.width,
    required super.height,
    required this.thumbnailName,
    required super.name,
  }) : super._(id: kPickerItemPrefix + hex.encode(sha1.convert(utf8.encode(name)).bytes));

  /// 视频持续时间，毫秒
  @JsonKey(name: 'd', defaultValue: 0)
  final int duration;

  /// 缩略图名称
  @JsonKey(name: 't', defaultValue: '')
  final String thumbnailName;

  /// 缩略图路径
  String get thumbnailPath {
    return p.join(Paths.importsDirectory.path, thumbnailName);
  }

  /// 转换为 [AssetEntity]
  @override
  AssetEntity toAssetEntity() {
    return AssetEntity(
      id: id,
      typeInt: AssetType.video.index,
      width: width,
      height: height,
      duration: duration ~/ 1000,
      relativePath: path,
    );
  }

  factory VPickerItem.fromJson(dynamic json) => _$VPickerItemFromJson(json);

  @override
  Map<String, dynamic> toJson() => _$VPickerItemToJson(this);

  @override
  Future<void> clean() async {
    await File(path).deleteIgnore();
    await File(thumbnailPath).deleteIgnore();
  }

  @override
  String toString() {
    return 'VPickerItem{'
        'id: $id, '
        'duration: $duration, '
        'width: $width, '
        'height: $height, '
        'thumbnail: $thumbnailPath'
        'path: $path'
        '}';
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////

/// 用于保存图片实现
@JsonSerializable()
class IPickerItem extends AbsAlbumPickerItem {
  const IPickerItem(
    super.id,
    super.width,
    super.height,
    super.name,
  );

  IPickerItem.create({
    required super.width,
    required super.height,
    required super.name,
  }) : super._(id: kPickerItemPrefix + hex.encode(sha1.convert(utf8.encode(name)).bytes));

  /// 转换为 [AssetEntity]
  @override
  AssetEntity toAssetEntity() {
    return AssetEntity(
      id: id,
      typeInt: AssetType.image.index,
      width: width,
      height: height,
      relativePath: path,
    );
  }

  factory IPickerItem.fromJson(dynamic json) => _$IPickerItemFromJson(json);

  @override
  Map<String, dynamic> toJson() => _$IPickerItemToJson(this);

  @override
  Future<void> clean() {
    return File(path).deleteIgnore();
  }

  @override
  String toString() {
    return 'IPickerItem{id: $id, width: $width, height: $height, path: $path}';
  }
}
