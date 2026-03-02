part of 'album_picker.dart';

mixin CommonMediaPickerController<T extends CommonPicker> implements ConsumerState<T> {
  /// [AssetEntity] 缩略图加载管理器
  final entityImageProviders = AssetEntityImageProviders();

  /// 图片最小尺寸
  int get minImageSize => widget.minImageSize;

  /// 最大图片尺寸
  int get maxImageSize => widget.maxImageSize;

  /// 图片元数据检查器
  ImagePostChecker? get imagePostChecker => widget.imagePostChecker;

  ////////////////////////////////////////////////////////////////////////////////

  /// 点击子项
  Future<void> _onItemTap(_ItemData data) async {
    if (!GlobalClick.allowClick()) return;
    final cancel = LoadingDialog.show(context);
    ImageMeta? result;

    try {
      switch (data.type) {
        case _ItemType.camera:
        case _ItemType.album:
          result = await _picker.fromExternal(data.type == _ItemType.camera);
          break;

        case _ItemType.entity:
          result = await _picker.fromEntity(data.data as AssetEntity);
          break;

        case _ItemType.template:
          result = await (data.data as AssetPhotoTemplate).toImageMeta();
          break;

        case _ItemType.limited:
          if (this is MediaPickerController) {
            await (this as MediaPickerController)._onLimitedAddClick();
          }
          break;
      }
    } finally {
      cancel();
    }

    if (result == null || !mounted) return;
    Navigator.of(context).pop(result);
  }

  ////////////////////////////////////////////////////////////////////////////////

  /// 处理器
  late final _picker = _ImagePicker(minImageSize, maxImageSize, imagePostChecker);
}

mixin MediaPickerController on CommonMediaPickerController<AlbumPicker> {
  /// 动画控制器
  @protected
  late AnimationController animController;

  /// 滚动发生器
  @protected
  late ScrollController scrollController;

  /// 加载
  @protected
  Future<void> load();

  /// 刷新
  @protected
  Future<void> refresh();

  /// 顶部高度
  double get headerHeight => math.max(0, _headerEnd - _headerStart);

  /// 获取当前权限状态
  Future<PermissionStatus> requestPermissionState() {
    final permission = _chosePermission();
    return permission.status;
  }

  /// 跳转到指定图库
  void _onGalleryItemClick(WidgetRef ref, int index) {
    final prevIndex = ref.read(_currentIndex);
    if (prevIndex != index && index >= 0 && index < _collections.length) {
      ref.read(_currentIndex.notifier).state = index;
      final offset = headerHeight - kTitleHeight;
      setState(() => scrollController.jumpTo(index > 0 ? offset : 0));
    }
    ref.read(_galleryMode.notifier).state = false;
  }

  /// 返回按钮点击
  void _onBackClick() {
    if (!GlobalClick.allowClick()) return;
    final galleryMode = ref.read(_galleryMode);
    if (galleryMode) {
      ref.read(_galleryMode.notifier).state = false;
    } else {
      Navigator.of(context).pop();
    }
  }

  /// 偏移监听（无奈的实现）
  void _onOffsetChanged(Offset? offset, bool first) {
    if (offset == null) return;
    if (first) {
      _headerStart = offset.dy;
    } else {
      _headerEnd = offset.dy;
    }
  }

  /// 限制权限管理按钮点击事件
  Future<void> _onLimitPermissionClick() async {
    if (!GlobalClick.allowClick()) return;
    var status = await requestPermissionState();
    if (status.isGranted) {
      await refresh();
      return;
    }
    await PhotoManager.openSetting(); // 临时跳转到设置
  }

  /// 针对IOS limited限制添加相册资源到图库
  Future<void> _onLimitedAddClick() async {
    var status = await requestPermissionState();
    if (status.isGranted) {
      await refresh();
      return;
    }

    if (Platform.isIOS) {
      await PhotoManager.presentLimited();
      await refresh();
    } else {
      final permission = _chosePermission();
      status = await permission.request();
      if (status.isGranted || status.isLimited) {
        await refresh();
        return;
      }
    }
  }

  /// 限制权限管理按钮点击事件
  Future<void> _onNoPermissionClick([bool force = false]) async {
    if (!force && !GlobalClick.allowClick()) return;
    var status = await requestPermissionState();
    if (status.isGranted || status.isLimited) {
      await refresh();
      return;
    }
    if (status.isPermanentlyDenied) {
      await openAppSettings();
      return;
    }
    final permission = _chosePermission();
    status = await permission.request();
    if (status.isGranted || status.isLimited) {
      await refresh();
      return;
    }
  }

  /// 选择需要的权限
  Permission _chosePermission() {
    if (Platform.isAndroid && _androidSdkInt <= 32) {
      return Permission.storage;
    }
    return Permission.photos;
  }

  /// 加载图集
  Future<int> _loadAlbumCollections(int loadId) async {
    if (_status.isLimited) return 0;

    try {
      final list = await PhotoManager.getAssetPathList(
        type: RequestType.common,
        hasAll: false,
      );
      if (loadId != _loadId) return 0;
      for (final e in list) {
        if (e.name.isEmpty) continue;
        final loader = _AssetPathEntityLoader(e, this);
        _collections.add(loader);
        loader.next();
      }
      return _collections.length;
    } catch (ex) {
      loge(ex);
    }
    return 0;
  }

  /// 监听触摸按下
  void _onPointerDown(PointerDownEvent event) {
    if (animController.value < 0.999) return;
    _touchDown = 1;
  }

  /// 监听触摸滚动
  void _onPointerMove(PointerMoveEvent event) {
    if (_touchDown == 0) return;
    final delta = event.delta;
    final current = event.position;

    if (_touchDown == 1 && (!scrollController.hasClients || scrollController.offset <= 0)) {
      if (delta.dx.abs() > delta.dy.abs() * 0.8) {
        _touchDown = 0;
      } else if (delta.dy > 0) {
        _touchDown = 2;
        _touchDownOffset = Offset(current.dx, current.dy + delta.dy);
        _setAnimationState(current);
      }
      return;
    }

    if (_touchDown == 2 && delta.dy != 0) {
      _setAnimationState(current);
    }
  }

  /// 监听触摸抬起
  void _onPointerUp(PointerUpEvent event) {
    if (_touchDown == 0) return;
    _touchDown = 0;
    _onMoveEnd();
  }

  /// 监听触摸取消
  void _onPointerCancel(PointerCancelEvent event) {
    if (_touchDown == 0) return;
    _touchDown = 0;
    _onMoveEnd();
  }

  /// 设置当前动画状态
  void _setAnimationState(Offset current) {
    final height = context.size?.height ?? MediaQuery.of(context).size.height;
    final offset = current.dy - _touchDownOffset.dy;
    final value = (1.0 - offset / height).clamp(0.0, 1.0);
    final dValue = value - animController.value;
    if (dValue.abs() < 0.00000001) return;
    animController.value = value;

    if (value < 0.9999 && scrollController.hasClients && scrollController.offset != 0.0) {
      scrollController.position.setPixels(0);
    }
  }

  /// 移动结束，判断是否要关闭
  void _onMoveEnd() {
    if (animController.value > 0.9) {
      animController.forward();
    } else {
      Navigator.of(context).pop();
    }
  }

  /// 返回监听
  void _onPopInvoked(bool didPop, dynamic result) {
    if (!didPop) return;
    animController.reverse();
  }

  /// 监听图库变化
  void _onGalleryChanged(MethodCall value) {
    if (_load < 2 || !(_status.isLimited || _status.isGranted)) return;

    // 显示一个调试日志
    logd("on gallery changed");

    if (Platform.isAndroid) {
      final args = value.arguments as Map;
      final mediaTypeIndex = Platform.isAndroid ? args['mediaType'] : 0;
      if (mediaTypeIndex != AssetType.image.index) return;
    }

    // 刷新图库
    refresh();
  }

  //////////////////////////////////////////////////////////////////////////////

  /// 相册合集
  final List<_AssetsLoader> _collections = [];

  /// 权限状态
  PermissionStatus _status = PermissionStatus.denied;

  /// Android 系统版本，如果 iOS 为 0
  int _androidSdkInt = 0;

  /// 是否加载完成
  /// 0：没有初始化
  /// 1：基本初始化
  /// 2：完全初始化
  int _load = 0;

  /// 当前加载身份，如果身边不匹配请勿追加
  int _loadId = 0;

  /// 0 表示未触摸，1 表示已触摸，但未发生移动，2 表示开始移动
  int _touchDown = 0;

  /// 触摸时的坐标
  Offset _touchDownOffset = Offset.zero;

  /// 头部开始位置
  double _headerStart = 0;

  /// 头部结束位置
  double _headerEnd = 0;

  /// 当前选中的相册索引
  final _currentIndex = AutoDisposeStateProvider<int>((ref) => 0, name: 'galleryIndexProvider');

  /// 相册选择模式
  final _galleryMode = AutoDisposeStateProvider<bool>((ref) => false, name: 'galleryModeProvider');
}

////////////////////////////////////////////////////////////////////////////////

/// 共享状态
class MediaPickerState<T extends CommonMediaPickerController> extends InheritedWidget {
  const MediaPickerState({
    super.key,
    required this.state,
    required super.child,
  });

  /// 状态
  final T state;

  /// 获取状态
  static MediaPickerController of(BuildContext context) {
    final w = context.dependOnInheritedWidgetOfExactType<MediaPickerState<MediaPickerController>>()!;
    return w.state;
  }

  /// 获取状态
  static T ofAny<T extends CommonMediaPickerController>(BuildContext context) {
    final w = context.dependOnInheritedWidgetOfExactType<MediaPickerState<T>>()!;
    return w.state;
  }

  @override
  bool updateShouldNotify(covariant MediaPickerState<T> oldWidget) {
    return oldWidget.state != state;
  }
}

////////////////////////////////////////////////////////////////////////////////

final class _RecentLoader extends _AssetsLoader {
  _RecentLoader(super.controller);

  /// 返回标题
  @override
  String get name => "Recent";

  @override
  Future<List<AssetEntity>> loadNext(int index) {
    return PhotoManager.getAssetListPaged(
      page: index,
      pageCount: kPickerPageCount,
      type: RequestType.common,
    );
  }

  @override
  Future<int> loadCount() => PhotoManager.getAssetCount(type: RequestType.common);
}

class _AssetPathEntityLoader extends _AssetsLoader {
  _AssetPathEntityLoader(this.entity, super.controller);

  /// 数据集
  final AssetPathEntity entity;

  /// 返回标题
  @override
  String get name => entity.name;

  @override
  Future<List<AssetEntity>> loadNext(int index) {
    return entity.getAssetListPaged(
      page: index,
      size: kPickerPageCount,
    );
  }

  @override
  Future<int> loadCount() => entity.assetCountAsync;
}

////////////////////////////////////////////////////////////////////////////////

abstract class _AssetsLoader {
  _AssetsLoader(this.controller);

  /// 控制器
  @protected
  final MediaPickerController controller;

  /// 图集
  @protected
  final List<AssetEntity> assets = [];

  /// 总数
  final countProvider = AutoDisposeStateProvider<int>((ref) => -1);

  /// 是否加载中
  bool loading = false;

  /// 是否加载总数
  bool loadingCount = false;

  /// 是否已经遍历结束
  bool end = false;

  /// 页面索引，负数表示为开始加载
  int index = -1;

  /// 页面偏移
  double offset = 0;

  /// 允许加载下一页
  bool get canLoadNext => !end && !loading && index >= 0;

  /// 名称、标题
  String get name;

  /// 监听个数
  int watchCount(WidgetRef ref) {
    final count = ref.watch(countProvider);
    if (count < 0 && !loadingCount) {
      loadingCount = true;
      loadCount().then(
            (r) {
          loadingCount = false;
          if (!controller.mounted) return;
          controller.ref.read(countProvider.notifier).state = r;
        },
        onError: (_) => loadingCount = false,
      );
    }
    return count;
  }

  /// 清理复位
  void clear() {
    assets.clear();
    loading = false;
    end = false;
    index = -1;
    offset = 0;
  }

  /// 加载数量
  @protected
  Future<int> loadCount();

  /// 加载下一页
  @protected
  Future<List<AssetEntity>> loadNext(int index);

  /// 请求下一个最近页面，返回 `true` 表示需要更新 UI
  Future<bool> next() async {
    if (end || loading) return false;
    var size = 0;
    try {
      loading = true;

      while (!end && size < kPickerPageCount && controller.mounted) {
        final newIndex = math.max(index + 1, 0);
        final page = await loadNext(newIndex);
        size += page.length;

        // 被强制取消
        if (!loading || !controller.mounted) return false;

        if (page.isNotEmpty) assets.addAll(page);

        end = page.isEmpty;
        index = newIndex;
      }
    } finally {
      loading = false;
    }
    return controller.mounted;
  }
}

////////////////////////////////////////////////////////////////////////////////

abstract class _Picker<TOut, TConfig extends AbsAlbumPickerItem> {
  /// 内部配置
  @protected
  AlbumPickerConfig<TConfig>? config;

  /// 内部记录的最近视频或图片
  final List<AssetEntity> internals = [];

  /// 资源来自于外部
  Future<TOut?> fromExternal(bool fromCamera);

  /// 资源来自于自定义相册
  Future<TOut?> fromEntity(AssetEntity entity);

  /// 添加到历史记录
  Future<void> addRecent(String id, File file) async {
    final config = await requireConfig();
    await config.addRecent(id, file.absolute.path);
    await config.writeToLocal();
  }

  /// 添加到历史记录
  Future<void> addLocalRecent(TConfig item) async {
    final config = await requireConfig();
    await config.addLocalRecent(item);
    await config.writeToLocal();
  }

  /// 如果不在最近列表中则尝试删除文件
  @protected
  Future<void> removeFileIfNotContainsRecent(String id, File file) async {
    final config = await requireConfig();
    return config.removeFileIfNotContainsRecent(id, file.absolute.path);
  }

  /// 载入配置
  @protected
  Future<AlbumPickerConfig<TConfig>> requireConfig() async {
    return (config ??= await AlbumPickerConfig.readFromLocal<TConfig>());
  }

  /// 加载本地历史记录
  Future<void> loadInternalRecent() async {
    final config = await requireConfig();
    final current = await config.loadRecent(true);
    internals.clear();
    internals.addAll(current);
  }
}
