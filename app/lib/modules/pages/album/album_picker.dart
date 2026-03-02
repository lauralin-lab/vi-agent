import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mime/mime.dart';
import 'package:path/path.dart' as p;
import 'package:permission_handler/permission_handler.dart';
import 'package:photo_manager/photo_manager.dart';
import 'package:rive_rolls_collection/logging/logger.dart';

import '../../../app.dart';
import '../../../common/extension/context_ext.dart';
import '../../../common/extension/file_ext.dart';
import '../../../common/extension/tap_debounce_ext.dart';
import '../../../common/extension/ui_ext.dart';
import '../../../common/extension/user_help_type.dart';
import '../../../common/io/paths.dart';
import '../../../common/utils/image_crop.dart';
import '../../../common/utils/time_utils.dart';
import '../../models/album_picker_config.dart';
import '../../style/app_theme.dart';
import '../../widgets/adaptive_transition_page.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_image.dart';
import '../../widgets/asset_entity_image_plus.dart';
import '../../widgets/custom_notify_widget.dart';
import '../../widgets/lazy_indexed_stack.dart';
import '../../widgets/loading_dialog.dart';
import 'access_media_tip_dialog.dart';
import 'asset_template.dart';

part 'controller.dart';

part 'others.dart';

part 'ui.dart';

/// 图片元数据检查器，如果返回 `false`，表示不符合要求
typedef ImagePostChecker = Future<bool> Function(ImageMeta);

/// 图片基本信息
class ImageMeta {
  ImageMeta({
    required this.file,
    required this.width,
    required this.height,
    required this.assetId,
    this.videoFile,
    this.duration = 0,
  });

  /// 图片文件
  final File file;

  /// 宽度
  final int width;

  /// 高度
  final int height;

  /// 内部资源编号
  final String? assetId;

  /// 视频文件
  final File? videoFile;

  /// 视频时长
  final int duration;

  /// 横纵比
  double get aspectRatio => width / height;

  ImageMeta copyWith({
    File? file,
    int? width,
    int? height,
    String? assetId,
    bool? isVideo,
    File? videoFile,
    int? duration,
  }) {
    return ImageMeta(
      file: file ?? this.file,
      width: width ?? this.width,
      height: height ?? this.height,
      assetId: assetId ?? this.assetId,
      videoFile: videoFile ?? this.videoFile,
      duration: duration ?? this.duration,
    );
  }

  @override
  String toString() {
    return 'ImageMeta{file: $file, width: $width, height: $height, assetId: $assetId, videoFile: $videoFile, duration: $duration}';
  }
}

/// 通用基类
abstract class CommonPicker extends ConsumerStatefulWidget {
  const CommonPicker({
    super.key,
    required this.minImageSize,
    required this.maxImageSize,
    required this.imagePostChecker,
    required this.templates,
  });

  /// 图片最小尺寸
  final int minImageSize;

  /// 图片最大尺寸
  final int maxImageSize;

  /// 图片元数据检查器
  final ImagePostChecker? imagePostChecker;

  /// 模版
  final List<AssetPhotoTemplate>? templates;
}

/// 分页页面个数
const int kPickerPageCount = 48;

/// 媒体选择页面
class AlbumPicker extends CommonPicker {
  /// 构造为底部弹出模式
  const AlbumPicker._({
    super.minImageSize = 0,
    super.maxImageSize = 65536,
    super.imagePostChecker,
    super.templates,
  });

  /// 显示图片选取对话框
  /// [minImageSize] 图片最小大小
  /// [maxImageSize] 图片最大大小
  /// [postChecker] 图片后处理
  /// [templates] 模版，必须大于等于 4 个
  static Future<ImageMeta?> pickImage(
    BuildContext context, {
    int minImageSize = 0,
    int maxImageSize = 65536,
    ImagePostChecker? postChecker,
    List<AssetPhotoTemplate>? templates = AssetPhotoTemplate.normal,
  }) async {
    assert(templates == null || templates.length >= 4);
    final result = await showAdaptiveTransitionDialog(
      context: context,
      barrierDismissible: true,
      barrierColor: Colors.transparent,
      transition: AdaptiveDialogTransitionType.fade,
      builder: (c) => AlbumPicker._(
        minImageSize: minImageSize,
        maxImageSize: maxImageSize,
        imagePostChecker: postChecker,
        templates: templates,
      ),
    );
    return result as ImageMeta?;
  }

  @override
  ConsumerState<AlbumPicker> createState() => _AlbumPickerState();
}

class _AlbumPickerState extends ConsumerState<AlbumPicker>
    with CommonMediaPickerController<AlbumPicker>, MediaPickerController, TickerProviderStateMixin<AlbumPicker> {
  _AlbumPickerState();

  /// 是否监听图库通知
  bool _listenGalleryChanged = false;

  @override
  void initState() {
    super.initState();
    scrollController = ScrollController();
    animController = AnimationController(
      duration: const Duration(milliseconds: 300),
      vsync: this,
    );
    animController.forward();
    _init();
  }

  @override
  void dispose() {
    animController.dispose();
    scrollController.dispose();
    entityImageProviders.dispose();
    _disposeListener();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => buildBody(context);

  @override
  Future<void> refresh() async {
    _load = 0;
    if (mounted) setState(() {});
    return load();
  }

  /// 初始化数据并尝试监听图库变化
  Future<void> _init() async {
    await load();

    if (!mounted || !context.mounted) return;

    if (_status.isGranted || _status.isLimited) {
      // 具备权限，监听图库
      _listenGalleryChanged = true;
      PhotoManager.addChangeCallback(_onGalleryChanged);
      await PhotoManager.startChangeNotify();
    } else {
      // 无权限首次弹出提示
      if (UserHelpType.accessMediaTip.enable) {
        UserHelpType.accessMediaTip.enable = false;
        final result = await AccessMediaTipDialog.show(context);
        if (result) await _onNoPermissionClick(true);
      }
    }
  }

  /// 销毁对图库的监听
  Future<void> _disposeListener() async {
    if (!_listenGalleryChanged) return;
    _listenGalleryChanged = false;
    PhotoManager.removeChangeCallback(_onGalleryChanged);
    await PhotoManager.stopChangeNotify();
  }

  /// 初始
  @override
  Future<void> load() async {
    _load = 0;
    _loadId++;
    // 获取 Android 版本
    if (Platform.isAndroid && _androidSdkInt <= 0) {
      try {
        _androidSdkInt = (await DeviceInfoPlugin().androidInfo).version.sdkInt;
      } catch (ex) {
        loge(ex);
      }
    }

    // 获取当前授权情况
    _status = await _chosePermission().status;

    _picker.internals.clear();
    _collections.clear();

    // 权限被拒绝
    if (!_status.isGranted && !_status.isLimited) {
      if (mounted) setState(() => _load = 2);
      return;
    }

    // 开始加载数据
    final recent = _RecentLoader(this);
    await recent.next();
    _collections.add(recent);
    await _picker.loadInternalRecent();

    if (!mounted) return;

    setState(() {
      _load = 1;
      ref.read(_currentIndex.notifier).state = 0;
    });

    // 分步式加载
    await _loadAlbumCollections(_loadId);
    if (!mounted) return;
    setState(() => _load = 2);
  }
}

/// 无权限图片选择器
class PermissionlessAlbumPicker extends CommonPicker {
  const PermissionlessAlbumPicker._({
    required super.templates,
    required super.minImageSize,
    required super.maxImageSize,
    required super.imagePostChecker,
  });

  /// 显示图片选取对话框
  /// [minImageSize] 图片最小大小
  /// [maxImageSize] 图片最大大小
  /// [templates] 模版，必须大于等于 4 个
  /// [postChecker] 图片后处理
  static Future<ImageMeta?> pickImage(
    BuildContext context, {
    int minImageSize = 0,
    int maxImageSize = 65536,
    ImagePostChecker? postChecker,
    List<AssetPhotoTemplate> templates = AssetPhotoTemplate.normal,
  }) async {
    assert(templates.length >= 4);
    final result = await showAdaptiveTransitionDialog(
      context: context,
      barrierDismissible: true,
      barrierColor: Colors.transparent,
      transition: AdaptiveDialogTransitionType.bottomToTop,
      builder: (c) => PermissionlessAlbumPicker._(
        templates: templates,
        minImageSize: minImageSize,
        maxImageSize: maxImageSize,
        imagePostChecker: postChecker,
      ),
    );
    return result as ImageMeta?;
  }

  @override
  ConsumerState<PermissionlessAlbumPicker> createState() => _PermissionlessAlbumPickerState();
}

class _PermissionlessAlbumPickerState extends ConsumerState<PermissionlessAlbumPicker>
    with CommonMediaPickerController<PermissionlessAlbumPicker> {
  _PermissionlessAlbumPickerState();

  @override
  void initState() {
    super.initState();
    _picker.loadInternalRecent().then((_) {
      if (!mounted) return;
      setState(() {});
    });
  }

  @override
  void dispose() {
    entityImageProviders.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => buildBody(context);
}
