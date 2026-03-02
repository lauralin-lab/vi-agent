import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:octo_image/octo_image.dart';
import 'package:photo_manager/photo_manager.dart';
import 'package:photo_manager_image_provider/photo_manager_image_provider.dart' hide AssetEntityImage;

import '../../common/extension/ui_ext.dart';

/// 用于列表大面积加载 [AssetEntity] 图片，解决 IO 密集的问题
class AssetEntityImagePlus extends StatefulWidget {
  const AssetEntityImagePlus({
    super.key,
    required this.providers,
    required this.entity,
    this.borderRadius,
    this.fit = BoxFit.cover,
    this.placeholderBuilder,
  });

  /// 需要加载的图片
  final AssetEntity entity;

  /// 边缘效果
  final BorderRadius? borderRadius;

  /// 图片展示样式
  final BoxFit fit;

  /// 内存管理器
  final AssetEntityImageProviders providers;

  /// 占位符
  final WidgetBuilder? placeholderBuilder;

  @override
  State<StatefulWidget> createState() => _AssetEntityImagePlusState();
}

/// 数据绑定
class AssetEntityImageProviders {
  AssetEntityImageProviders({this.isOriginal = false}) : _providers = {} {
    _thumbnailSize = UIExt.absPhysicalSize.width > 960 ? 240 : 200;
  }

  /// 是否加载原始图
  final bool isOriginal;

  /// 缩略图大小
  late final int _thumbnailSize;

  /// 缓存表
  final Map<AssetEntity, _AssetEntityImageProvider> _providers;

  /// 锁定图片
  AssetEntityImageProvider lock(AssetEntity entity) {
    final p = _providers.putIfAbsent(
      entity,
      () => _AssetEntityImageProvider(
        AssetEntityImageProvider(
          entity,
          isOriginal: isOriginal,
          thumbnailSize: ThumbnailSize.square(_thumbnailSize),
        ),
      ),
    );
    p.ref++;
    return p.provider;
  }

  /// 解锁
  void unlock(AssetEntity entity) {
    final p = _providers[entity];
    if (p == null) return;
    p.ref = math.max(0, p.ref - 1);
  }

  /// 压缩内存
  /// 可以在需要跳转页面，但是所属页面不释放时调用
  void compress() {
    _providers.removeWhere((key, value) {
      if (value.ref > 0) return false;
      value.provider.evict();
      return true;
    });
  }

  /// 销毁
  void dispose() {
    for (final e in _providers.entries) {
      e.value.provider.evict();
    }
    _providers.clear();
  }
}

class _AssetEntityImagePlusState extends State<AssetEntityImagePlus> {
  _AssetEntityImagePlusState();

  /// [AssetEntity]
  AssetEntity? entity;

  /// [缩略图提供者]
  AssetEntityImageProvider? provider;

  @override
  void initState() {
    super.initState();
    _load(widget.entity);
  }

  @override
  void dispose() {
    if (provider != null) widget.providers.unlock(provider!.entity);
    provider = null;
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant AssetEntityImagePlus oldWidget) {
    super.didUpdateWidget(oldWidget);
    _load(widget.entity);
  }

  @override
  Widget build(BuildContext context) {
    Widget child = OctoImage(
      image: provider!,
      fit: widget.fit,
      fadeInDuration: const Duration(milliseconds: 200),
      placeholderBuilder: widget.placeholderBuilder,
      errorBuilder: (c, _, __) => const DecoratedBox(
        decoration: BoxDecoration(color: Color(0xFF1A1B1D)),
        child: Icon(
          Icons.image_not_supported_outlined,
          color: Colors.white12,
          size: 32,
        ),
      ),
    );
    if (widget.borderRadius != null) {
      child = ClipRRect(borderRadius: widget.borderRadius!, child: child);
    }
    return child;
  }

  /// 尝试加载
  void _load(AssetEntity entity) {
    if (!mounted) return;
    if (this.entity != null && this.entity != entity) return;
    if (provider != null) widget.providers.unlock(provider!.entity);
    provider = widget.providers.lock(entity);
  }
}

/// 资源提供器
class _AssetEntityImageProvider {
  /// 资源
  final AssetEntityImageProvider provider;

  /// 引用计数
  int ref = 0;

  _AssetEntityImageProvider(this.provider);
}
