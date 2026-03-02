part of 'album_picker.dart';

/// 默认的圆角
const kDefaultBorderRadius = BorderRadius.all(Radius.circular(8));
const kDefaultBackgroundColor = Color(0xFF555048);
const kTitleHeight = 36.0;
const kManagerHeight = 80.0;

extension _UI on _AlbumPickerState {
  /// 构建主体
  Widget buildBody(BuildContext context) {
    final mq = MediaQuery.of(context);
    Widget child;

    // 加载过程中
    if (_load < 1) {
      child = Align(
        alignment: Alignment.center,
        child: context.buildCircularLoading(),
      );
    } else {
      final isLimited = _status.isLimited;
      child = Stack(
        fit: StackFit.expand,
        children: [
          buildAppBar(context, mq),
          // 显示当前相册
          Positioned.fill(
            top: kToolbarHeight,
            child: _status.isGranted || isLimited ? buildMainLayout(context, mq) : _buildNoPermission(context),
          ),

          // 显示图库
          Positioned.fill(
            top: kToolbarHeight,
            child: Consumer(
              builder: (context, ref, _) {
                final galleryMode = ref.watch(_galleryMode);
                return AnimatedSwitcher(
                  duration: const Duration(milliseconds: 200),
                  child: galleryMode ? buildGallery(context) : const SizedBox.shrink(key: ValueKey(false)),
                );
              },
            ),
          ),

          // 有限权限时显示
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: isLimited ? _buildLimitedManageLayout(context, mq) : const SizedBox.shrink(),
          ),
        ],
      );
    }

    child = Material(
      color: Colors.white,
      borderRadius: BorderRadius.all(Radius.circular(36.dpx)),
      child: MediaPickerState<MediaPickerController>(state: this, child: child),
    );

    return buildSheetWrap(context, mq, child);
  }

  /// 顶栏
  Widget buildAppBar(BuildContext context, MediaQueryData mq) {
    Widget child = Consumer(
      builder: (context, ref, _) {
        final galleryMode = ref.watch(_galleryMode);
        return Stack(
          fit: StackFit.expand,
          alignment: Alignment.center,
          children: [
            Positioned(
              left: 16.dpx,
              child: InkWell(
                onTap: _onBackClick,
                child: AppImage.asset(
                  'assets/images/ic_gallery_back.webp',
                  width: 28.dpx,
                  height: 28.dpx,
                ),
              ),
            ),
            Center(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    galleryMode ? "Gallery" : "Add Photo",
                    style: TextStyle(
                      fontSize: 16.dpx,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );

    return Positioned(top: 0, left: 0, right: 0, height: kToolbarHeight, child: child);
  }

  /// 构建图库选择
  Widget buildGallery(BuildContext context) {
    if (_load < 2) {
      return Align(alignment: Alignment.center, child: context.buildCircularLoading());
    }
    Widget child = GridView.builder(
      itemCount: _collections.length,
      gridDelegate: context.galleryGridDelegate,
      padding: EdgeInsets.fromLTRB(12, 12, 12, MediaQuery.of(context).padding.bottom + 16),
      itemBuilder: buildGalleryItem,
    );
    return Material(
      key: const ValueKey(true),
      color: AppTheme.secondaryColor,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Positioned.fill(child: child),
          context.buildLine(),
        ],
      ),
    );
  }

  /// 构建图库个体
  Widget buildGalleryItem(BuildContext context, int index) {
    return Consumer(
      builder: (context, ref, _) {
        final item = _collections[index];
        final entity = item.assets.firstOrNull;
        final count = item.watchCount(ref);
        final child = Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AspectRatio(
              aspectRatio: 1.0,
              child: entity == null ? null : context.buildAssetEntityImage(entityImageProviders, entity),
            ),
            const MaxGap(16),
            Text(
              item.name,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppTheme.onPrimaryColor),
            ),
            Text(
              count < 0 ? "" : count.toString(),
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.primaryColor),
            ),
          ],
        );

        return InkWell(
          child: child,
          onTap: () => _onGalleryItemClick(ref, index),
        );
      },
    );
  }

  /// 构建完整版本的布局（无权限限制）
  Widget buildMainLayout(BuildContext context, MediaQueryData mq) {
    final isGranted = _status.isGranted;
    return ClipRRect(
      borderRadius: BorderRadius.vertical(bottom: Radius.circular(36.dpx)),
      child: NestedScrollView(
        controller: scrollController,
        physics: const ClampingScrollPhysics(),
        headerSliverBuilder: (context, innerBoxIsScrolled) => [
          SliverToBoxAdapter(child: _Offset(onChanged: (o) => _onOffsetChanged(o, true))),
          PinnedHeaderSliver(child: SizedBox(height: 2.dpx,),),
          SliverToBoxAdapter(child: _Offset(onChanged: (o) => _onOffsetChanged(o, false))),
        ],
        body: Consumer(
          builder: (context, ref, _) => LazyIndexedStack(
            index: ref.watch(_currentIndex),
            count: _collections.length,
            sizing: StackFit.expand,
            builder: (_, i) => _Collection(
              loader: _collections[i],
              showAlbum: i == 0 && !isGranted,
              extraBottom: isGranted ? 12 : kManagerHeight,
            ),
          ),
        ),
      ),
    );
  }

  /// 构建手柄
  Widget buildSheetWrap(BuildContext context, MediaQueryData mq, Widget child) {
    final height = context.isTablet ? math.min(mq.size.height * 0.75, 800.0) : mq.size.height - mq.padding.top - 74.dpx;
    child = Align(
      alignment: Alignment.bottomCenter,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          minHeight: height,
          maxHeight: height,
          maxWidth: 560,
        ),
        child: child,
      ),
    );

    child = SlideTransition(
      position: animController.drive(
        Tween(
          begin: const Offset(0, 1),
          end: Offset.zero,
        ),
      ),
      child: child,
    );

    child = Listener(
      onPointerDown: _onPointerDown,
      onPointerMove: _onPointerMove,
      onPointerUp: _onPointerUp,
      onPointerCancel: _onPointerCancel,
      child: child,
    );

    return PopScope(
      onPopInvokedWithResult: _onPopInvoked,
      child: Padding(
        padding: EdgeInsets.only(bottom: 20.dpx, left: 8.dpx, right: 8.dpx),
        child: child,
      ),
    );
  }

  /// 优先权限布局
  Widget _buildLimitedManageLayout(BuildContext context, MediaQueryData mq) {
    return Container(
      height: kManagerHeight + mq.padding.bottom,
      padding: EdgeInsets.fromLTRB(18, 0, 18, mq.padding.bottom),
      decoration: BoxDecoration(
        color: const Color(0xFF555048),
        borderRadius: BorderRadius.all(Radius.circular(36.dpx)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.max,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          const Expanded(
            child: Text(
              "Allow us to access album to choose from your photos",
              style: TextStyle(color: AppTheme.surfaceColor, fontWeight: FontWeight.w500),
            ),
          ),
          const Gap(8),
          AppButton.label(
            label: "Manager",
            height: 42,
            fontSize: 14,
            icon: "assets/images/ic_limited.webp",
            iconColor: AppTheme.primaryColor,
            bgColor: AppTheme.surfaceColor,
            textColor: AppTheme.secondaryColor,
            fontWeight: FontWeight.w600,
            onPressed: _onLimitPermissionClick,
            padding: const EdgeInsets.symmetric(horizontal: 16),
          ),
        ],
      ),
    );
  }

  /// 无权限显示
  Widget _buildNoPermission(BuildContext context) {
    return Align(
      alignment: const Alignment(0.0, -0.2),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 320),
            child: const Text(
              'Allow Access to Photos',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
                fontSize: 18,
                letterSpacing: 0.5,
              ),
            ),
          ),
          const Gap(10),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 320),
            child: const Text(
              'Allow Access to Photos',
              style: TextStyle(
                color: Color(0xFFB6B6C9),
                fontWeight: FontWeight.w500,
                fontSize: 12,
                letterSpacing: 0.5,
              ),
              textAlign: TextAlign.center,
            ),
          ),
          const Gap(18),
          GestureDetector(
            onTap: _onNoPermissionClick,
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 30),
              decoration: const BoxDecoration(
                color: AppTheme.primaryColor,
                borderRadius: BorderRadius.all(ui.Radius.circular(12)),
              ),
              child: const Text(
                'Go to Settings',
                style: TextStyle(
                  color: AppTheme.onPrimaryColor,
                  fontWeight: FontWeight.w700,
                  fontSize: 15,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

////////////////////////////////////////////////////////////////////////////////

/// 图集页
class _Collection extends StatefulWidget {
  const _Collection({
    required this.loader,
    this.showAlbum = false,
    this.extraBottom = 0,
  });

  /// 当前图集
  final _AssetsLoader loader;

  /// 是否显示外部图片选择按钮
  final bool showAlbum;

  /// 额外的底部高度
  final double extraBottom;

  @override
  _CollectionState createState() => _CollectionState();
}

class _CollectionState extends State<_Collection> {
  _CollectionState();

  /// 滚动控制器
  ScrollController? _scrollController;

  /// 加载下一页的阈值
  double distance = 360;

  @override
  void initState() {
    super.initState();
    _init();
  }

  @override
  void dispose() {
    _scrollController?.removeListener(_listener);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final loader = widget.loader;
    distance = mq.size.height * 1.25;

    // 为空时显示提示
    if (loader.end && loader.assets.isEmpty && !widget.showAlbum) {
      return context.buildEmpty();
    }

    final scrollController = PrimaryScrollController.of(context);
    if (scrollController != _scrollController) {
      _scrollController?.removeListener(_listener);
      _scrollController = scrollController;
      _scrollController?.addListener(_listener);
    }

    return GridView.builder(
      controller: scrollController,
      physics: const ClampingScrollPhysics(),
      padding: EdgeInsets.fromLTRB(0, 0, 0, mq.padding.bottom + widget.extraBottom),
      itemCount: loader.assets.length + (widget.showAlbum ? 1 : 0),
      gridDelegate: context.gridDelegate,
      itemBuilder: _buildItem,
    );
  }

  /// 构建单元
  Widget _buildItem(BuildContext context, int index) {
    final state = MediaPickerState.of(context);

    if (widget.showAlbum && index == 0) {
      return _ItemForTool(
        type: _ItemType.limited,
        icon: 'assets/images/ic_album_outline.webp',
        onTap: state._onItemTap,
      );
    }

    if (widget.showAlbum) index--;

    return _ItemForAssetEntity(
      providers: state.entityImageProviders,
      entity: widget.loader.assets[index],
      onTap: state._onItemTap,
      pickerController: state,
    );
  }

  /// 初始化
  Future<void> _init() async {
    if (widget.loader.index >= 0) return;
    await widget.loader.next();
    if (!mounted) return;
    setState(() {});
  }

  /// 滑动监听，用于加载下一页
  void _listener() {
    final position = _scrollController?.position;
    if (position == null) return;
    if (position.pixels < 0) {
      widget.loader.offset = position.pixels;
    }
    if (position.maxScrollExtent - position.pixels > distance) return;
    if (!widget.loader.canLoadNext) return;
    _loadNextPage();
  }

  /// 加载下一个页面
  Future<void> _loadNextPage() async {
    final update = await widget.loader.next();
    if (!update || !mounted) return;
    setState(() {});
  }
}

////////////////////////////////////////////////////////////////////////////////

/// 单元的元素类型
enum _ItemType {
  /// 点击相机按钮
  camera,

  /// 点击图库按钮
  album,

  /// 有限权限下在处理
  limited,

  /// 用户相册内容
  entity,

  /// 模版
  template,
}

/// 单元附加的数据
class _ItemData<T> {
  /// 构造
  const _ItemData(this.type, this.data);

  /// 类型
  final _ItemType type;

  /// 数据
  final T data;
}

typedef _OnItemTap = void Function(_ItemData type);

////////////////////////////////////////////////////////////////////////////////

class _ItemForAssetEntity extends StatelessWidget {
  const _ItemForAssetEntity({
    required this.providers,
    required this.entity,
    this.onTap,
    this.borderRadius = false,
    required this.pickerController,
  });

  /// 主控制器
  final CommonMediaPickerController pickerController;

  /// 加载数据
  final AssetEntity entity;

  /// 点击事件
  final _OnItemTap? onTap;

  /// [AssetEntity] 缩略图资源处理器
  final AssetEntityImageProviders providers;

  /// 是否显示圆角
  final bool borderRadius;

  @override
  Widget build(BuildContext context) {
    final passed = ImageCheckResult.checkImage(
      width: entity.width,
      height: entity.height,
      minSize: pickerController.minImageSize,
      maxSize: pickerController.maxImageSize,
    ).isPassed;

    Widget child = Stack(
      fit: StackFit.expand,
      children: [
        context.buildAssetEntityImage(providers, entity, borderRadius),
        if (entity.type == AssetType.video)
          Positioned(right: 8.dpx, bottom: 8.dpx, child: context.buildVideoTime(entity.duration)),
        context.buildButton(
          onTap: () => onTap?.call(_ItemData(_ItemType.entity, entity)),
          borderRadius: borderRadius,
          child: const SizedBox.expand(),
        ),
      ],
    );

    // 不符合要求的视频置灰
    if (!passed) child = Opacity(opacity: 0.3, child: child);

    return child;
  }
}

////////////////////////////////////////////////////////////////////////////////

class _ItemForTool extends StatelessWidget {
  const _ItemForTool({
    required this.type,
    required this.icon,
    this.onTap,
  });

  /// 加载数据
  final _ItemType type;

  ///  图标
  final String icon;

  /// 点击事件
  final _OnItemTap? onTap;

  @override
  Widget build(BuildContext context) {
    Widget child = Center(child: AppImage.asset(icon, height: 48));
    return context.buildButton(
      onTap: () => onTap?.call(_ItemData(type, type)),
      color: kDefaultBackgroundColor,
      child: child,
      borderRadius: false,
    );
  }
}

////////////////////////////////////////////////////////////////////////////////

class _ItemForTemplate extends StatelessWidget {
  const _ItemForTemplate({
    required this.template,
    this.onTap,
    this.borderRadius = false,
  });

  /// 加载数据
  final AssetPhotoTemplate template;

  /// 点击事件
  final _OnItemTap? onTap;

  /// 是否显示圆角
  final bool borderRadius;

  @override
  Widget build(BuildContext context) {
    final br = borderRadius ? kDefaultBorderRadius : null;
    return Stack(
      fit: StackFit.expand,
      children: [
        context.buildItemImage(AssetImage(template.preview), br),
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          child: Container(
            decoration: const BoxDecoration(
              borderRadius: BorderRadius.vertical(bottom: Radius.circular(8)),
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0x00000000), Color(0xCC000000)],
              ),
            ),
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Center(
              child: Text(
                'Demo',
                style: TextStyle(fontSize: 11.dpx, color: Colors.white, fontWeight: FontWeight.w500),
              ),
            ),
          ),
        ),
        context.buildButton(
          onTap: () => onTap?.call(_ItemData(_ItemType.template, template)),
          borderRadius: borderRadius,
          child: const SizedBox.expand(),
        ),
      ],
    );
  }
}

////////////////////////////////////////////////////////////////////////////////

class _Offset extends StatefulWidget {
  const _Offset({required this.onChanged});

  /// 变化监听
  final void Function(Offset? offset) onChanged;

  @override
  State<StatefulWidget> createState() => _OffsetState();
}

class _OffsetState extends State<_Offset> {
  _OffsetState();

  /// 原始偏移
  Offset? _offset;

  @override
  Widget build(BuildContext context) {
    SchedulerBinding.instance.addPostFrameCallback(onPostCall);
    return const SizedBox.shrink();
  }

  void onPostCall(_) {
    if (!mounted) return;
    final offset = (context.findRenderObject() as RenderBox?)?.localToGlobal(Offset.zero);
    if (offset == _offset) return;

    _offset = offset;
    widget.onChanged(offset);
  }
}

////////////////////////////////////////////////////////////////////////////////

extension _PermissionlessAlbumPickerUI on _PermissionlessAlbumPickerState {
  /// 构建主体
  Widget buildBody(BuildContext context) {
    Widget child = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Gap(12.dpx),
        buildAppBar(context),
        Gap(22.dpx),
        Text(
          'Allow us to access your album',
          style: TextStyle(
            fontSize: 14.dpx,
            fontWeight: FontWeight.w500,
          ),
        ),
        Gap(22.dpx),
        IntrinsicWidth(
          child: InkWell(
            onTap: PhotoManager.openSetting,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 14),
              decoration: const BoxDecoration(
                color: Colors.black,
                borderRadius: BorderRadius.all(Radius.circular(8)),
              ),
              child: Row(
                children: [
                  AppImage.asset(
                    'assets/images/ic_limited.webp',
                    width: 13,
                    height: 13,
                  ),
                  const Gap(4),
                  Text(
                    'Manage',
                    style: TextStyle(color: Colors.white, fontSize: 12.dpx),
                  ),
                ],
              ),
            ),
          ),
        ),
        Gap(MediaQuery.of(context).padding.bottom + 20.dpx),
      ],
    );

    if (context.isTablet) {
      child = ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480, minWidth: 480),
        child: child,
      );
    }

    return Align(
      alignment: Alignment.bottomCenter,
      child: Material(
        color: Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
        child: MediaPickerState<CommonMediaPickerController<PermissionlessAlbumPicker>>(
          state: this,
          child: child,
        ),
      ),
    );
  }

  /// 顶栏
  Widget buildAppBar(BuildContext context) {
    Widget child = Stack(
      fit: StackFit.expand,
      alignment: Alignment.center,
      children: [
        Positioned(
          left: 16.dpx,
          child: InkWell(
            onTap: Navigator.of(context).pop,
            child: AppImage.asset(
              'assets/images/ic_gallery_back.webp',
              width: 28.dpx,
              height: 28.dpx,
            ),
          ),
        ),
        Center(
          child: Text(
            "Add Photo",
            style: TextStyle(fontSize: 16.dpx, fontWeight: FontWeight.w500),
          ),
        ),
      ],
    );

    return SizedBox(height: kToolbarHeight, child: child);
  }
}
