part of 'router.dart';

/// 包装 [AdaptiveTransitionPage]
/// 默认使用的页面跳转
abstract class AppGoRouteData extends GoRouteData {
  const AppGoRouteData({
    this.transition = AdaptiveTransitionType.fade,
    this.fullscreenDialog = false,
    this.opaque = true,
  });

  /// 页面转场效果
  final AdaptiveTransitionType transition;

  /// 是否为全屏对话框样式
  final bool fullscreenDialog;

  /// 页面是否为不透明
  final bool opaque;

  @override
  Page<void> buildPage(BuildContext context, GoRouterState state) {
    return AdaptiveTransitionPage(
      key: state.pageKey,
      child: buildPageWidget(context, state),
      type: transition,
      fullscreenDialog: fullscreenDialog,
      opaque: opaque,
      name: state.name,
    );
  }

  /// 构建页面内布局
  Widget buildPageWidget(BuildContext context, GoRouterState state);
}

/// 包装 [AdaptiveTransitionPage] 和 [AdaptiveTransitionDialogPage]
/// 目的是根据屏幕尺寸自动决定显示页面还是对话框
abstract class AppAdaptiveGoRouteData extends GoRouteData {
  const AppAdaptiveGoRouteData({
    this.config = const AdaptiveRouteConfig(),
    this.opaque = true,
  });

  /// 相关配置
  final AdaptiveRouteConfig config;

  /// 页面是否为不透明
  final bool opaque;

  @override
  Page<void> buildPage(BuildContext context, GoRouterState state) {
    final size = MediaQuery.of(context).size;
    final minSize = math.min(size.width, size.height);
    // 小屏幕
    if (minSize < 540) {
      return AdaptiveTransitionPage(
        key: state.pageKey,
        name: state.name,
        child: buildPageWidget(context, state, false),
        type: config.transition,
        opaque: opaque,
      );
    }
    return AdaptiveTransitionDialogPage(
      key: state.pageKey,
      name: state.name,
      barrierColor: config.barrierColor,
      barrierDismissible: config.barrierDismissible,
      transition: config.dialogTransition,
      builder: (context) => DialogLite(
        constraints: config.constraintsBuilder(context, size),
        backgroundColor: config.backgroundColor,
        shape: config.shape,
        clipBehavior: config.clipBehavior,
        child: buildPageWidget(context, state, true),
      ),
    );
  }

  /// 构建页面内布局
  Widget buildPageWidget(BuildContext context, GoRouterState state, bool isDialog);
}

/// 自适应页面配置
class AdaptiveRouteConfig {
  /// 构造函数
  const AdaptiveRouteConfig({
    this.transition = AdaptiveTransitionType.bottomToTop,
    this.dialogTransition = AdaptiveDialogTransitionType.floatUpWithBlur,
    this.barrierColor,
    this.barrierDismissible = false,
    this.constraintsBuilder = _defaultConstraintsBuilder,
    this.shape,
    this.backgroundColor,
    this.clipBehavior = Clip.none,
  });

  /// 页面转场动画类型
  final AdaptiveTransitionType transition;

  /// 对话框转场动画类型（仅对话框模式）
  final AdaptiveDialogTransitionType dialogTransition;

  /// 外部背景颜色（仅对话框模式）
  final Color? barrierColor;

  /// 外部背景点击关闭（仅对话框模式）
  final bool barrierDismissible;

  /// 对话框布局大小约束（仅对话框模式）
  final BoxConstraints Function(BuildContext, Size) constraintsBuilder;

  /// 对话框样式（仅对话框模式）
  final ShapeBorder? shape;

  /// 背景颜色（仅对话框模式）
  final Color? backgroundColor;

  /// 剪裁（仅对话框模式）
  final Clip clipBehavior;

  static BoxConstraints _defaultConstraintsBuilder(BuildContext c, Size size) {
    return const BoxConstraints(minWidth: 360, maxWidth: 360);
  }
}

/// 处理自适应页面在对话框形式下的大小
BoxConstraints createDialogConstraints(double width, double maxHeight) {
  return BoxConstraints(minWidth: width, maxWidth: width, maxHeight: maxHeight);
}
