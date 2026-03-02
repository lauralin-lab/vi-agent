import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart' hide ConnectionState;
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:livekit_client/livekit_client.dart';
import 'package:rive_rolls_collection/common.dart';
import '../../../app.dart';
import '../../../common/extension/tap_debounce_ext.dart';
import '../../../common/extension/ui_ext.dart';
import '../../../routing/router.dart';
import '../../../service/global_provider.dart';
import '../../../service/hardware/hard_ware_initializer.dart';
import 'dialog/live_kit_web_view_dialog.dart';
import 'livekit/live_kit_controller.dart';
import 'provider/main_provider.dart';
import 'widget/camera_action_button.dart';
import 'widget/camera_scan_widget.dart';
import 'widget/capture_widget.dart';
import 'widget/main_bottom_tools_widget.dart';
import 'widget/main_top_tools_widget.dart';

part 'main_page.ui.dart';

part '../../../depreciated/main_page.guidance.dart';

class MainPage extends ConsumerStatefulWidget {
  const MainPage({super.key});

  /// 引导页设置的静态标志，用于通知 MainPage 显示引导遮罩
  static bool showGuidanceOverlay = false;

  @override
  ConsumerState createState() => _MainPageState();
}

class _MainPageState extends ConsumerState<MainPage> {
  /// TextField 控制器
  final FocusNode _promptFocusNode = FocusNode();
  final TextEditingController _promptTF = TextEditingController();

  /// LiveKit Controller
  late final liveKitController = ref.read(liveKitControllerProvider);

  /// 扫描控制器
  final ScanningController _scanningController = ScanningController();

  @override
  void initState() {
    super.initState();
    // liveKit初始化
    _onInitLiveKit();
  }

  /// LiveKit
  void _onInitLiveKit() {
    liveKitController.init();
  }

  @override
  void dispose() {
    _promptFocusNode.dispose();
    _promptTF.dispose();
    liveKitController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final inInit = ref.watchOnInitCameraProvider();

    return _buildBody(context, inInit);
  }

  /// 相机操作回调
  void _onCameraAction(CameraActionType type) {
    if (!mounted) return;

    if (!GlobalClick.allowClick()) return;
    HapticFeedback.lightImpact();

    switch (type) {
      case CameraActionType.back:
        _jumpSessionPage();
        break;
      case CameraActionType.send:
        break;
      case CameraActionType.preChat:
        _jumpPreChatPage();
        break;
      case CameraActionType.requestActionCard:
        liveKitController.requestActionCard();
        break;
      default:
        liveKitController.onActionEvent(context, type);
        break;
    }
  }

  /// 跳转到Session列表
  Future<void> _jumpSessionPage() async {
    logi('[MainPage] jumpSessionPage: suspending media...');
    _promptFocusNode.unfocus();

    if (!mounted) return;

    /// push
    final navigator = Navigator.of(context);
    if (navigator.canPop()) {
      navigator.pop();
    } else {
      await const CenterRoute().push(context);
      // 是否子页面恢复
      logi('[MainPage] jumpPreChatPage: returned, resuming media...');
      // 重复播放动画
      _scanningController.play();
    }
  }

  /// 跳转到Chat页面
  Future<void> _jumpPreChatPage() async {
    logi('[MainPage] jumpPreChatPage: suspending media...');
    _promptFocusNode.unfocus();

    if (!mounted) return;

    /// 没有 capture 数据 → 取当前帧，走上传+发送链路
    var captureImages = ref.read(captureImageProvider);
    if (captureImages.isEmpty) {
      final savePath = await HardWareInitializer.instance.takePhoto();
      if (savePath != null && savePath.isNotEmpty) {
        ref.read(captureImageProvider.notifier).add(savePath);
        captureImages = ref.read(captureImageProvider);
        // 临时取帧需要走上传+发送（
        liveKitController.uploadAndSendToGateWay(savePath);
      }
    }

    // 拷贝一份传给路由，与 provider 状态解耦
    final imageSnapshot = List<String>.of(captureImages);
    // 清空
    ref.read(captureImageProvider.notifier).clear();
    _promptTF.clear();

    await SessionRoute(
      SessionRouteExtra(
        sessionKey: App().auth.sessionKey.isEmpty ? 'agent:main:main' : App().auth.sessionKey,
        prompt: _promptTF.text,
        imageUrls: imageSnapshot,
      ),
    ).push(context);
    // 是否子页面恢复
    logi('[MainPage] jumpPreChatPage: returned, resuming media...');
    // 重复播放动画
    _scanningController.play();
  }
}
