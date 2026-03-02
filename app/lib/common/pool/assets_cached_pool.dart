import 'dart:async';
import 'dart:collection';
import 'dart:convert';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:rive_rolls_collection/misc/initializer.dart';

import '../extension/bytes_ext.dart';

/// 资源缓存池
class AssetsCachedPool {
  AssetsCachedPool();

  /// 缓存
  final _cached = HashSet<String>();

  /// 加载
  Future<void> _load() async {
    final manifest = await AssetManifest.loadFromAssetBundle(rootBundle);
    for (final asset in manifest.listAssets()) {
      if (!asset.startsWith('assets/caches/')) continue;
      _cached.add(asset);
    }
  }

  /// 尝试获取缓存图片的 [ImageProvider]
  /// 如果有返回 [AssetImage]，否则返回 [CachedNetworkImageProvider]
  ImageProvider<Object> tryGetImageProvider(String url, {BaseCacheManager? cacheManager}) {
    final cacheKey = tryGetCache(url, ".webp");
    if (cacheKey != null) return AssetImage(cacheKey);
    return CachedNetworkImageProvider(url, cacheManager: cacheManager);
  }

  /// 尝试获取缓存
  String? tryGetCache(String url, String ext) {
    final key = sha1.convert(utf8.encode(url)).bytes.toBase32String();

    final cacheKey = 'assets/caches/$key';
    if (_cached.contains(cacheKey)) return cacheKey;

    final cacheKeyWithExt = 'assets/caches/$key$ext';
    if (_cached.contains(cacheKeyWithExt)) return cacheKeyWithExt;

    return null;
  }
}

/// 资产缓存初始化工具
class AssetsCachedPoolInitializer extends Initializer {
  const AssetsCachedPoolInitializer(super.type, this.pool);

  /// 池
  final AssetsCachedPool pool;

  @override
  Future onInit() => pool._load();
}
