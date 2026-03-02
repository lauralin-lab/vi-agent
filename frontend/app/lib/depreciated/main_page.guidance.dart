part of '../modules/pages/home/main_page.dart';

/// 引导模式逻辑（解耦自 _MainPageState）
///
/// 职责：
/// - 判断是否进入引导模式
/// - 管理引导步骤（0=拍照提示，1=发送提示，2=网页，-1=完成）
/// - 引导模式拍照：使用预设图片 + 提示词
/// - 引导模式发送：弹出网页展示结果
/// - 引导结束：淡出背景、持久化标记
mixin _GuidanceMixin on ConsumerState<MainPage> {
  /// 引导模式开关（控制背景图片）
  bool _isGuidanceMode = false;

  /// 引导步骤：0 = 拍照提示, 1 = 发送提示, 2 = 网页, -1 = 已完成
  int _guidanceStep = -1;

  /// 引导背景淡出中
  bool _guidanceFading = false;

  /// 是否处于引导模式中
  bool get isGuidanceMode => _isGuidanceMode;

  /// 当前引导步骤
  int get guidanceStep => _guidanceStep;

  /// 是否正在淡出引导背景
  bool get guidanceFading => _guidanceFading;

  /// 是否显示引导遮罩
  bool get showGuidanceOverlay => _guidanceStep >= 0;

  // 子类需提供
  TextEditingController get _promptTF;
  FocusNode get _promptFocusNode;

  /// 引导模式初始化（在 initState 中调用）
  void initGuidance() {
    _isGuidanceMode = MainPage.showGuidanceOverlay;
    _guidanceStep = _isGuidanceMode ? 0 : -1;
    if (_isGuidanceMode) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        // ref.read(isTextInputModeProvider.notifier).state = true;
      });
    }
    // 消费后重置
    MainPage.showGuidanceOverlay = false;
  }

  /// 引导模式拍照 — 使用预设引导图片和提示词
  Future<void> handleGuidanceCapture() async {
    try {
      // 将 asset 图片拷贝到临时目录
      final byteData = await rootBundle.load('assets/images/ic_guide_pic.png');
      final tempDir = Directory.systemTemp;
      final tempFile = File('${tempDir.path}/guide_capture_${DateTime.now().millisecondsSinceEpoch}.png');
      await tempFile.writeAsBytes(byteData.buffer.asUint8List());

      // 设置图片
      // ref.read(galleryCaptureImageProvider.notifier).state = tempFile.path;
      // ref.read(pickFilePathProvider.notifier).state = [
      //   MediaModel(path: tempFile.path),
      // ];

      // 设置提示词
      _promptTF.text = 'Please help me track calories, macros, and assess the healthiness of this meal.';

      // 先隐藏当前气泡
      setState(() => _guidanceStep = -1);

      // 触发输入框 focus
      _promptFocusNode.requestFocus();

      // 等键盘弹出后再显示第二步气泡
      Future.delayed(const Duration(milliseconds: 1000), () {
        if (mounted) {
          setState(() => _guidanceStep = 1);
          // 重新请求 focus，防止 setState 导致键盘回落
          _promptFocusNode.requestFocus();
        }
      });
    } catch (e) {
      loge('Guidance capture failed: $e');
    }
  }

  /// 引导模式发送 — 弹出网页展示结果
  Future<void> handleGuidanceSend() async {
    setState(() => _guidanceStep = 2);
    _promptFocusNode.unfocus();
    await LiveKitWebViewDialog.show(
      context,
      'https://collov-agent-zero.s3.us-west-1.amazonaws.com/meal_detail.html',
    );
    endGuidance();
  }

  /// 结束引导
  void endGuidance() {
    App().preferences.setGuidanceShown();

    // 清空输入框和已选图片
    _promptTF.clear();
    // ref.read(pickFilePathProvider.notifier).state = [];

    // 先关闭引导气泡，触发背景图片淡出动画
    setState(() {
      _guidanceStep = -1;
      _guidanceFading = true;
    });

    // 动画结束后再移除背景图片组件
    Future.delayed(const Duration(milliseconds: 500), () {
      if (mounted) {
        setState(() {
          _isGuidanceMode = false;
          _guidanceFading = false;
        });
        // // 切回 audio 模式
        // ref.read(isTextInputModeProvider.notifier).state = false;
        // final controller = ref.read(liveKitControllerProvider);
        // if (controller.isConnected) {
        //   controller.setMicrophoneEnabled(true);
        // }
      }
    });
  }
}
