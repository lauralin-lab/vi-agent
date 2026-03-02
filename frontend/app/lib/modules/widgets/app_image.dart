import 'dart:io';
import 'dart:math';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:octo_image/octo_image.dart';
import 'package:shimmer/shimmer.dart';

import '../../app.dart';

/// 应用图片加载组件
///
/// 支持：占位、圆角、指定解码大小、缓存网络图片
class AppImage extends StatefulWidget {
  /// 图片加载组件构造
  /// 详细注释跳转到成员变量
  const AppImage({
    super.key,
    required this.image,
    this.fit = BoxFit.scaleDown,
    this.alignment = Alignment.center,
    this.fadeIn,
    this.fadeOut,
    this.distractor = false,
    this.shimmer = false,
    this.placeholder,
    this.color,
    this.colorBlendMode,
    this.cacheScale,
    this.cacheWidth,
    this.cacheHeight,
    this.borderRadius,
    this.isBorder,
    this.borderColor,
    this.borderWidth,
    this.width,
    this.height,
    this.errorWidget,
    this.textOnShimmer = false,
    this.errorPadding = const EdgeInsets.all(8),
  }) : assert(
          placeholder == null || !distractor,
          '参数 `distractor` 和 `placeholder` 不能同时使用',
        );

  /// 显示网络图片
  /// 详细注释跳转到成员变量
  AppImage.network(
    String url, {
    super.key,
    this.fit = BoxFit.scaleDown,
    this.alignment = Alignment.center,
    this.fadeIn,
    this.fadeOut,
    this.distractor = false,
    this.shimmer = false,
    this.placeholder,
    this.color,
    this.colorBlendMode,
    this.cacheScale,
    this.cacheWidth,
    this.cacheHeight,
    this.borderRadius,
    this.isBorder,
    this.borderColor,
    this.borderWidth,
    this.width,
    this.height,
    this.errorWidget,
    this.textOnShimmer = false,
    this.errorPadding = const EdgeInsets.all(8),
    String? cacheKey,
    BaseCacheManager? cacheManager,
  })  : assert(
          placeholder == null || !distractor,
          '参数 `distractor` 和 `placeholder` 不能同时使用',
        ),
        image = CachedNetworkImageProvider(
          url,
          cacheKey: cacheKey,
          cacheManager: cacheManager,
        );

  /// 显示网络图片，但是会优先查找本地资产
  /// 详细注释跳转到成员变量
  AppImage.cached(
    String url, {
    super.key,
    this.fit = BoxFit.scaleDown,
    this.alignment = Alignment.center,
    this.fadeIn,
    this.fadeOut,
    this.distractor = false,
    this.shimmer = false,
    this.placeholder,
    this.color,
    this.colorBlendMode,
    this.cacheScale,
    this.cacheWidth,
    this.cacheHeight,
    this.borderRadius,
    this.isBorder,
    this.borderColor,
    this.borderWidth,
    this.width,
    this.height,
    this.errorWidget,
    this.textOnShimmer = false,
    this.errorPadding = const EdgeInsets.all(8),
    BaseCacheManager? cacheManager,
  })  : assert(
          placeholder == null || !distractor,
          '参数 `distractor` 和 `placeholder` 不能同时使用',
        ),
        image = App().assetsCachedPool.tryGetImageProvider(
              url,
              cacheManager: cacheManager,
            );

  /// 显示 Asset 图片资源
  /// 详细注释跳转到成员变量
  AppImage.asset(
    String assetName, {
    super.key,
    this.fit = BoxFit.scaleDown,
    this.alignment = Alignment.center,
    this.fadeIn,
    this.fadeOut,
    this.distractor = false,
    this.shimmer = false,
    this.placeholder,
    this.color,
    this.colorBlendMode,
    this.cacheScale,
    this.cacheWidth,
    this.cacheHeight,
    this.borderRadius,
    this.isBorder,
    this.borderColor,
    this.borderWidth,
    this.width,
    this.height,
    this.errorWidget,
    this.textOnShimmer = false,
    this.errorPadding = const EdgeInsets.all(8),
    AssetBundle? bundle,
    String? package,
  })  : assert(
          placeholder == null || !distractor,
          '参数 `distractor` 和 `placeholder` 不能同时使用',
        ),
        image = AssetImage(assetName, bundle: bundle, package: package);

  /// 显示本地文件图片
  /// 详细注释跳转到成员变量
  AppImage.file(
    File file, {
    super.key,
    this.fit = BoxFit.scaleDown,
    this.alignment = Alignment.center,
    this.fadeIn,
    this.fadeOut,
    this.distractor = false,
    this.shimmer = false,
    this.placeholder,
    this.color,
    this.colorBlendMode,
    this.cacheScale,
    this.cacheWidth,
    this.cacheHeight,
    this.borderRadius,
    this.isBorder,
    this.borderColor,
    this.borderWidth,
    this.width,
    this.height,
    this.errorWidget,
    this.textOnShimmer = false,
    this.errorPadding = const EdgeInsets.all(8),
  })  : assert(
          placeholder == null || !distractor,
          '参数 `distractor` 和 `placeholder` 不能同时使用',
        ),
        image = FileImage(file);

  /// 图片
  final ImageProvider? image;

  /// 约束模式
  final BoxFit fit;

  /// 对齐模式
  final Alignment alignment;

  /// 淡入动画持续时间，默认 200 毫秒
  final Duration? fadeIn;

  /// 淡出动画持续时间
  final Duration? fadeOut;

  /// 启用加载效果
  final bool distractor;

  /// 加载效果使用微光
  final bool shimmer;

  /// 预加载显示部件
  final WidgetBuilder? placeholder;

  /// 错误时显示部件
  final Widget Function(BuildContext context, VoidCallback reload)? errorWidget;

  /// 混合颜色
  final Color? color;

  /// 混合颜色模式，默认为 `srcIn`
  final BlendMode? colorBlendMode;

  /// 基于屏幕宽度的解码缩放比
  final double? cacheScale;

  /// 解码宽度
  final double? cacheWidth;

  /// 解码高度
  final double? cacheHeight;

  /// 显示宽度
  final double? width;

  /// 显示高度
  final double? height;

  /// 圆角
  final BorderRadiusGeometry? borderRadius;

  /// 边框
  final bool? isBorder;

  final Color? borderColor;

  final double? borderWidth;

  /// 微光效果下，显示 collov 图标
  final bool textOnShimmer;

  /// 错误时显示的边距
  final EdgeInsets? errorPadding;

  @override
  State<AppImage> createState() => _AppImageState();
}

class _AppImageState extends State<AppImage> {
  ImageProvider? _dstImage;
  ImageProvider? _srcImage;

  @override
  void didChangeDependencies() {
    _updateImage();
    super.didChangeDependencies();
  }

  @override
  void didUpdateWidget(AppImage oldWidget) {
    _updateImage(oldWidget);
    super.didUpdateWidget(oldWidget);
  }

  /// 更新图片
  void _updateImage([AppImage? oldWidget, bool force = false]) {
    if (!force && widget.image == _srcImage && widget.cacheScale == oldWidget?.cacheScale) {
      return;
    }

    _srcImage = widget.image;
    _dstImage = _addResize(context, _srcImage);
  }

  @override
  Widget build(BuildContext context) {
    assert(_dstImage != null);

    Widget child = OctoImage(
      image: _dstImage!,
      fit: widget.fit,
      width: widget.width,
      height: widget.height,
      color: widget.color,
      colorBlendMode: widget.colorBlendMode,
      alignment: widget.alignment,
      fadeInDuration: widget.fadeIn ?? const Duration(milliseconds: 200),
      fadeOutDuration: widget.fadeOut,
      placeholderBuilder: _placeholderBuilder,
      errorBuilder: _errorBuilder,
    );

    if (widget.borderRadius != null) {
      child = ClipRRect(borderRadius: widget.borderRadius!, child: child);
    }

    if (widget.isBorder != null) {
      child = DecoratedBox(
        position: DecorationPosition.foreground,
        decoration: BoxDecoration(
          borderRadius: widget.borderRadius,
          border: Border.all(
            color: widget.borderColor ?? const Color(0xFF2E2F35).withAlpha(044),
            width: widget.borderWidth ?? 1 / MediaQuery.of(context).devicePixelRatio,
          ),
        ),
        child: child,
      );
    }
    return child;
  }

  /// 对图片进行加载采样
  ImageProvider? _addResize(BuildContext context, ImageProvider? image) {
    // 为空直接返回
    if (image == null) return image;

    // 判断是否需要处理
    if (widget.cacheScale == null && widget.cacheWidth == null && widget.cacheHeight == null) {
      return image;
    }

    final mq = MediaQuery.of(context);
    int? cacheWidth;
    int? cacheHeight;
    if (widget.cacheScale != null) {
      final Size screenSize = mq.size * mq.devicePixelRatio * widget.cacheScale!;
      cacheWidth = screenSize.width.round();
    } else {
      if (widget.cacheWidth != null) {
        cacheWidth = (widget.cacheWidth! * mq.devicePixelRatio).toInt();
      }
      if (widget.cacheHeight != null) {
        cacheHeight = (widget.cacheHeight! * mq.devicePixelRatio).toInt();
      }
    }

    return ResizeImage(image, width: cacheWidth, height: cacheHeight);
  }

  /// 占位构建器
  OctoPlaceholderBuilder? get _placeholderBuilder {
    return widget.distractor || widget.placeholder != null
        ? (context) => widget.distractor && widget.shimmer
            ? widget.textOnShimmer
                ? LayoutBuilder(
                    builder: (c, cc) => Shimmer.fromColors(
                      baseColor: Colors.black12,
                      highlightColor: Colors.black26,
                      child: Padding(
                        padding: EdgeInsets.symmetric(
                          horizontal: cc.maxWidth * 0.2,
                          vertical: cc.maxHeight * 0.2,
                        ),
                        child: Image.asset('assets/images/ic_logo.webp', color: Colors.white),
                      ),
                    ),
                  )
                : Shimmer.fromColors(
                    baseColor: Colors.black12,
                    highlightColor: Colors.black26,
                    child: Container(color: Colors.white),
                  )
            : widget.placeholder?.call(context) ?? const SizedBox.shrink()
        : null;
  }

  /// 错误构建器
  Widget _errorBuilder(
    BuildContext context,
    Object error,
    StackTrace? stackTrace,
  ) {
    return Container(
      padding: widget.errorPadding,
      alignment: Alignment.center,
      child: widget.errorWidget != null
          ? widget.errorWidget!.call(context, _updateFormError)
          : LayoutBuilder(builder: (_, constraints) {
              final biggest = constraints.biggest;
              final size = min(biggest.width, biggest.height);
              if (size < 16) return const SizedBox();
              return Icon(
                Icons.image_not_supported_outlined,
                color: Colors.grey,
                size: min(size, 32),
              );
            }),
    );
  }

  /// 更新
  void _updateFormError() {
    if (!mounted) return;
    _dstImage?.evict();
    _updateImage(null, true);
    setState(() {});
  }
}

/// 图片显示，在发生错误时会驱逐错误图片（使其在下一次时尝试加载）
class AppImageWithOnErrorEvict extends StatefulWidget {
  const AppImageWithOnErrorEvict.network(
    this.url, {
    super.key,
    this.fit = BoxFit.scaleDown,
    this.alignment = Alignment.center,
    this.distractor = false,
    this.shimmer = false,
    this.cacheScale,
  });

  /// 图片容纳方式
  final BoxFit fit;

  /// 基于屏幕宽度的解码缩放比
  final double? cacheScale;

  /// 微光效果
  final bool shimmer;

  /// 启用加载
  final bool distractor;

  /// 图片位置
  final Alignment alignment;

  /// 图片路径
  final String url;

  @override
  State<StatefulWidget> createState() => _AppImageWithOnErrorEvictState();
}

class _AppImageWithOnErrorEvictState extends State<AppImageWithOnErrorEvict> {
  final GlobalKey<_AppImageState> _key = GlobalKey();

  bool _evictOnError = false;

  @override
  void didUpdateWidget(covariant AppImageWithOnErrorEvict oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.url == widget.url) return;
    _evictOnError = false;
  }

  @override
  Widget build(BuildContext context) {
    return AppImage.network(
      widget.url,
      key: _key,
      fit: widget.fit,
      alignment: widget.alignment,
      distractor: widget.distractor,
      shimmer: widget.shimmer,
      textOnShimmer: true,
      cacheScale: widget.cacheScale,
      errorWidget: (context, call) => LayoutBuilder(builder: (_, constraints) {
        if (!_evictOnError) {
          _evictOnError = true;
          _key.currentState?._dstImage?.evict();
        }
        final biggest = constraints.biggest;
        final size = min(biggest.width, biggest.height);
        if (size < 16) return const SizedBox();
        return Icon(
          Icons.image_not_supported_outlined,
          color: Colors.white10,
          size: min(size, 32),
        );
      }),
    );
  }
}
