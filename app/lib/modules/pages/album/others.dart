part of 'album_picker.dart';

class _ImagePicker extends _Picker<ImageMeta, IPickerItem> {
  _ImagePicker(this.minSize, this.maxSize, this.imagePostChecker);

  /// 最小尺寸
  final int minSize;

  /// 最大尺寸
  final int maxSize;

  /// 图片元数据检查器
  final ImagePostChecker? imagePostChecker;

  @override
  Future<ImageMeta?> fromEntity(AssetEntity entity) async {
    final meta = await _pickFromAssetEntity(entity);

    // 检查是否通过自定义检查器
    if (meta != null && !(await imagePostChecker?.call(meta) ?? true)) {
      await removeFileIfNotContainsRecent(entity.id, meta.file);
      return null;
    }

    if (meta != null) addRecent(entity.id, meta.file);
    return meta;
  }

  @override
  Future<ImageMeta?> fromExternal(bool fromCamera) async {
    if (fromCamera) {
      final status = await Permission.camera.status;
      if (status.isPermanentlyDenied) {
        await openAppSettings();
        return null;
      }
    }
    final file = await ImagePicker().pickMedia();

    // 用户取消选择
    if (file == null) return null;

    // 图片地址
    String path = file.path;
    // 视频地址
    File? videoFile;

    final mediaType = parseMediaType(file);
    if (mediaType == MediaType.video) {
      videoFile = await PickerExt.thumbnailVideo(path);
      path = videoFile.path;
    }

    ImageMeta? meta = await _fromFilePath(File(path), null, videoFile);

    final checkRet = ImageCheckResult.checkImage(
      width: meta.width,
      height: meta.height,
      minSize: minSize,
      maxSize: maxSize,
    );

    // 清理文件
    Future<void> clean(ImageMeta meta) async {
      await meta.file.deleteIgnore();
      // 删除空文件夹
      if (Platform.isAndroid) {
        try {
          final oldParent = meta.file.parent;
          if (await oldParent.list().isEmpty) {
            oldParent.delete();
          }
        } catch (ex) {
          logw(ex);
        }
      }
    }

    // 检查是否通过内置检查器
    if (!checkRet.isPassed) {
      checkRet.showTips(minSize, maxSize);
      await clean(meta);
      return null;
    }

    // 检查是否通过自定义检查器
    if (!(await imagePostChecker?.call(meta) ?? true)) {
      await clean(meta);
      return null;
    }

    final (history, ok) = await _createHistoryFromMeta(meta);
    if (history != null) {
      meta = meta.copyWith(file: File(history.path), assetId: history.id);
      addLocalRecent(history);
    } else if (!ok) {
      meta = null;
    }

    return meta;
  }

  /// 从相册中选择媒体
  Future<ImageMeta?> _pickFromAssetEntity(AssetEntity entity) async {
    final checkRet = ImageCheckResult.checkImage(
      width: entity.width,
      height: entity.height,
      minSize: minSize,
      maxSize: maxSize,
    );

    if (!checkRet.isPassed) {
      checkRet.showTips(minSize, maxSize);
      return null;
    }

    // 这里表示内部存储文件
    if (entity.id.startsWith(kPickerItemPrefix)) {
      return await _fromFilePath(File(entity.relativePath!), entity.id, null);
    }
    final newValue = await entity.obtainForNewProperties();
    File? file;
    File? videoFile;
    file = await newValue?.loadFile();

    /// 视频额外处理
    if (newValue?.type == AssetType.video) {
      videoFile = file;
      file = await PickerExt.thumbnailVideo(file?.path ?? '');
    }

    if (file == null) {
      notifyMessage('Photo not found.');
      return null;
    }

    return await _fromFilePath(file, entity.id, videoFile, duration: newValue?.duration ?? 0);
  }

  /// 创建一条历史记录，第二个值表示是否继续后续操作
  Future<(IPickerItem?, bool)> _createHistoryFromMeta(ImageMeta m) async {
    final path = m.file.absolute.path;
    final tryMove =
        (Platform.isAndroid &&
            (path.startsWith(Paths.temporaryDirectory.absolute.path) ||
                path.startsWith(Paths.fileDirectory.absolute.path))) ||
        (Platform.isIOS);

    if (!tryMove) return (null, true);

    // 检查目标文件夹
    final parent = Paths.importsDirectory;
    if (!await parent.exists()) await parent.create(recursive: true);

    final baseName = p.basename(path);
    final np = File(p.join(parent.path, baseName)).absolute;

    // 尝试移动文件，如果没有权限则会失败
    try {
      await File(path).rename(np.path);
    } catch (ex) {
      return (null, true);
    }

    // 删除空文件夹
    if (Platform.isAndroid) {
      try {
        final oldParent = m.file.parent;
        if (await oldParent.list().isEmpty) {
          oldParent.delete();
        }
      } catch (ex) {
        logw(ex);
      }
    }

    return (
      IPickerItem.create(width: m.width, height: m.height, name: baseName),
      true,
    );
  }

  /// 从文件生成图片元信息
  Future<ImageMeta> _fromFilePath(File file, String? assetId, File? videoFile, {int duration = 0}) async {
    final buffer = await ui.ImmutableBuffer.fromFilePath(file.path);
    final descriptor = await ui.ImageDescriptor.encoded(buffer);
    final result = ImageMeta(
      file: file,
      width: descriptor.width,
      height: descriptor.height,
      assetId: assetId,
      videoFile: videoFile,
      duration: duration,
    );
    descriptor.dispose();
    return result;
  }

  /// 判断图片视频
  MediaType parseMediaType(XFile file) {
    final mime = lookupMimeType(file.path) ?? '';
    if (mime.startsWith('video/')) return MediaType.video;
    return MediaType.image;
  }
}

/// 图片检查结果
enum ImageCheckResult {
  /// 符合要求
  passed,

  /// 图片尺寸太小
  sizeTooSmall,

  /// 图片尺寸太大
  sizeTooLarge;

  /// 图片有效
  bool get isPassed => this == passed;

  /// 返回提示消息，如果返回为空，则表示是否符合要求
  String? getTipsMessage(BuildContext context, int minSize, int maxSize) {
    return switch (this) {
      passed => null,
      sizeTooSmall => 'The shortest edge of the image not be less than $minSize.',
      sizeTooLarge => 'The longest edge of the image should not be more than $maxSize',
    };
  }

  /// 显示提示消息
  void showTips(int minSize, int maxSize, [BuildContext? context]) {
    final msg = getTipsMessage(
      context ?? App().currentContext!,
      minSize,
      maxSize,
    );
    if (msg == null) return;
    notifyMessage(msg);
  }

  /// 检查图片大小
  static ImageCheckResult checkImage({
    required int width,
    required int height,
    required int minSize,
    required int maxSize,
  }) {
    if (math.min(width, height) < minSize) {
      return ImageCheckResult.sizeTooSmall;
    }

    if (math.max(width, height) > maxSize) {
      return ImageCheckResult.sizeTooLarge;
    }

    return ImageCheckResult.passed;
  }
}

extension _UIExt on BuildContext {
  /// 网格布局默认代理
  SliverGridDelegate get gridDelegate {
    return SliverGridDelegateWithFixedCrossAxisCount(
      crossAxisCount: isTablet ? 4 : 3,
      mainAxisSpacing: 2.dpx,
      crossAxisSpacing: 2.dpx,
    );
  }

  /// 网格布局最近使用媒体文件代理
  SliverGridDelegate get prevGridDelegate {
    return const SliverGridDelegateWithFixedCrossAxisCount(
      crossAxisCount: 4,
      mainAxisSpacing: 8,
      crossAxisSpacing: 8,
    );
  }

  /// 网格布局默认代理
  SliverGridDelegate get galleryGridDelegate {
    return GallerySliverGridDelegate(
      crossAxisCount: isTablet ? 3 : 2,
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
    );
  }

  /// 构建项目的图片组件
  Widget buildItemImage(ImageProvider image, BorderRadius? borderRadius) {
    return AppImage(
      image: image,
      fit: BoxFit.cover,
      borderRadius: borderRadius,
      placeholder: placeholderBuilder,
    );
  }

  /// 构建 [AssetEntity] 图片
  Widget buildAssetEntityImage(
    AssetEntityImageProviders providers,
    AssetEntity entity, [
    bool borderRadius = true,
  ]) {
    final br = borderRadius ? kDefaultBorderRadius : null;
    if (entity.id.startsWith(kPickerItemPrefix)) {
      var path = entity.relativePath!;
      return buildItemImage(FileImage(File(path)), br);
    }
    return AssetEntityImagePlus(
      providers: providers,
      entity: entity,
      fit: BoxFit.cover,
      borderRadius: br,
      placeholderBuilder: placeholderBuilder,
    );
  }

  /// 构建分割线
  Widget buildLine() {
    return Positioned(
      height: 1.px,
      left: 0,
      right: 0,
      top: 0,
      child: const DecoratedBox(decoration: BoxDecoration(color: Color(0xFF59524D))),
    );
  }

  /// 构建按钮
  Widget buildButton({
    required Widget child,
    VoidCallback? onTap,
    Color? color,
    bool borderRadius = true,
  }) {
    return Material(
      color: color,
      borderRadius: color == null || !borderRadius ? null : kDefaultBorderRadius,
      type: color == null ? MaterialType.transparency : MaterialType.canvas,
      child: InkWell(
        onTap: onTap,
        borderRadius: borderRadius ? kDefaultBorderRadius : null,
        child: Center(child: child),
      ),
    );
  }

  /// 占位视图
  static Widget placeholderBuilder(BuildContext context) {
    return const DecoratedBox(
      decoration: BoxDecoration(color: Color(0xFF1A1B1D)),
    );
  }

  /// 构建为空值效果
  Widget buildEmpty() {
    return const Center(
      child: Text(
        "Empty",
        style: TextStyle(color: Color(0xFFCCCCCC), fontSize: 16),
      ),
    );
  }

  /// 构建视频的时间
  Widget buildVideoTime(int seconds) {
    return Text(
      TimeUtils.formatDuration(seconds),
      style: TextStyle(color: Colors.white, fontSize: 12.dpx),
    );
  }
}

class GallerySliverGridDelegate extends SliverGridDelegate {
  const GallerySliverGridDelegate({
    required this.crossAxisCount,
    this.mainAxisSpacing = 0.0,
    this.crossAxisSpacing = 0.0,
  }) : assert(crossAxisCount > 0),
       assert(mainAxisSpacing >= 0),
       assert(crossAxisSpacing >= 0);

  final int crossAxisCount;
  final double mainAxisSpacing;
  final double crossAxisSpacing;

  bool _debugAssertIsValid() {
    assert(crossAxisCount > 0);
    assert(mainAxisSpacing >= 0.0);
    assert(crossAxisSpacing >= 0.0);
    return true;
  }

  @override
  SliverGridLayout getLayout(SliverConstraints constraints) {
    assert(_debugAssertIsValid());
    final usableCrossAxisExtent = math.max(0.0, constraints.crossAxisExtent - crossAxisSpacing * (crossAxisCount - 1));
    final childCrossAxisExtent = usableCrossAxisExtent / crossAxisCount;
    final childMainAxisExtent = childCrossAxisExtent + 48;
    return SliverGridRegularTileLayout(
      crossAxisCount: crossAxisCount,
      mainAxisStride: childMainAxisExtent + mainAxisSpacing,
      crossAxisStride: childCrossAxisExtent + crossAxisSpacing,
      childMainAxisExtent: childMainAxisExtent,
      childCrossAxisExtent: childCrossAxisExtent,
      reverseCrossAxis: axisDirectionIsReversed(constraints.crossAxisDirection),
    );
  }

  @override
  bool shouldRelayout(GallerySliverGridDelegate oldDelegate) {
    return oldDelegate.crossAxisCount != crossAxisCount ||
        oldDelegate.mainAxisSpacing != mainAxisSpacing ||
        oldDelegate.crossAxisSpacing != crossAxisSpacing;
  }
}

enum MediaType { image, video }
