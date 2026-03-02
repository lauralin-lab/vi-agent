part of 'adaptive_transition_page.dart';

/// 自定义对话框动画效果
enum AdaptiveDialogTransitionType {
  /// 无动画
  none._(
    transitionDuration: Duration.zero,
  ),

  /// 渐隐渐现
  fade._(),

  /// 快速渐隐渐现
  fastFade._(
    transitionDuration: Duration(milliseconds: 200),
  ),

  /// 渐隐渐现，背景模糊
  heroWithBlur._(),

  /// 缩放
  scaleCenter._(
    curve: Curves.easeOutSine,
    additional: Alignment.center,
  ),

  /// 一个浮起的动画
  floatUp._(
    curve: Curves.easeInOutSine,
    additional: Offset(0.0, 0.02),
  ),

  /// 落下
  dropMenu._(
    curve: Curves.easeInOutSine,
    additional: Offset(0.0, -0.01),
  ),

  /// 一个浮起的动画，背景模糊
  floatUpWithBlur._(
    curve: Curves.easeInOutSine,
    additional: Offset(0.0, 0.02),
  ),

  /// 从底部升起
  bottomToTop._(
    curve: Curves.easeInOutSine,
    additional: Offset(0.0, 1.0),
  ),

  /// 从左侧向右
  leftToRight._(
    curve: Curves.easeInOutSine,
    additional: Offset(-1.0, 0.0),
  ),

  /// 从右向左
  rightToLeft._(
    curve: Curves.easeInOutSine,
    additional: Offset(1.0, 0.0),
  ),

  /// 从底部升起，背景模糊
  bottomToTopWithBlur._(
    curve: Curves.easeInOutSine,
    additional: Offset(0.0, 1.0),
  );

  /// 缓动曲线
  final Curve curve;

  /// 页面切换时动画时长
  final Duration transitionDuration;

  /// 附加控制参数
  final dynamic additional;

  /// 初始化枚举
  const AdaptiveDialogTransitionType._({
    this.curve = Curves.linear,
    this.transitionDuration = const Duration(milliseconds: 300),
    this.additional,
  });
}

/// 自定义对话框跳转效果
class AdaptiveTransitionDialogPage<T> extends Page<T> {
  final Offset? anchorPoint;
  final Color? barrierColor;
  final bool barrierDismissible;
  final String? barrierLabel;
  final bool useSafeArea;
  final CapturedThemes? themes;
  final WidgetBuilder builder;

  const AdaptiveTransitionDialogPage({
    required this.transition,
    required this.builder,
    this.anchorPoint,
    this.barrierColor = Colors.black54,
    this.barrierDismissible = true,
    this.barrierLabel,
    this.useSafeArea = true,
    this.themes,
    super.key,
    super.name,
    super.arguments,
    super.restorationId,
  });

  @override
  Route<T> createRoute(BuildContext context) => _DialogRoute<T>(
        context: context,
        settings: this,
        builder: builder,
        anchorPoint: anchorPoint,
        barrierColor: barrierColor,
        barrierDismissible: barrierDismissible,
        barrierLabel: barrierLabel,
        useSafeArea: useSafeArea,
        themes: themes,
        transition: transition,
      );

  final AdaptiveDialogTransitionType transition;
}

typedef _M = MaterialLocalizations;

class _DialogRoute<T> extends RawDialogRoute<T> {
  _DialogRoute({
    required BuildContext context,
    required WidgetBuilder builder,
    required AdaptiveDialogTransitionType transition,
    CapturedThemes? themes,
    super.barrierColor,
    super.barrierDismissible,
    this.barrierPassable = false,
    String? barrierLabel,
    bool useSafeArea = true,
    super.settings,
    super.anchorPoint,
  })  : _filter = switch (transition) {
          AdaptiveDialogTransitionType.bottomToTopWithBlur ||
          AdaptiveDialogTransitionType.floatUpWithBlur ||
          AdaptiveDialogTransitionType.heroWithBlur =>
            ImageFilter.blur(sigmaX: 12, sigmaY: 12),
          _ => null,
        },
        assert(!barrierPassable || !barrierDismissible),
        super(
          pageBuilder: (
            BuildContext context,
            Animation<double> animation,
            Animation<double> secondaryAnimation,
          ) {
            final pageChild = Builder(builder: builder);
            var dialog = themes?.wrap(pageChild) ?? pageChild;
            if (useSafeArea) dialog = SafeArea(child: dialog);
            return dialog;
          },
          barrierLabel: barrierLabel ?? _M.of(context).modalBarrierDismissLabel,
          transitionDuration: transition.transitionDuration,
          transitionBuilder: (c, animation, secondaryAnimation, child) =>
              _builder(transition, c, animation, secondaryAnimation, child),
        );

  static Widget _builder(
    AdaptiveDialogTransitionType type,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    switch (type) {
      // 无动画
      case AdaptiveDialogTransitionType.none:
        return child;

      // 渐隐渐现
      case AdaptiveDialogTransitionType.fade:
      case AdaptiveDialogTransitionType.fastFade:
        final tween = CurveTween(curve: type.curve);
        return FadeTransition(opacity: animation.drive(tween), child: child);

      // 渐隐渐现，包含转场动画和模糊
      case AdaptiveDialogTransitionType.heroWithBlur:
        final tween = CurveTween(curve: type.curve);
        return FadeTransition(opacity: animation.drive(tween), child: child);

      // 浮动
      case AdaptiveDialogTransitionType.floatUp:
        final tween = Tween(
          begin: type.additional as Offset,
          end: Offset.zero,
        ).chain(CurveTween(curve: type.curve));
        final opacityTween = CurveTween(curve: type.curve);
        return FadeTransition(
          opacity: animation.drive(opacityTween),
          child: SlideTransition(
            position: animation.drive(tween),
            child: child,
          ),
        );

      // 下拉菜单
      case AdaptiveDialogTransitionType.dropMenu:
        final tween = Tween(
          begin: type.additional as Offset,
          end: Offset.zero,
        ).chain(CurveTween(curve: type.curve));
        final opacityTween = CurveTween(curve: type.curve);
        return FadeTransition(
          opacity: animation.drive(opacityTween),
          child: SlideTransition(
            position: animation.drive(tween),
            child: child,
          ),
        );

      // 浮动与模糊
      case AdaptiveDialogTransitionType.floatUpWithBlur:
        final tween = Tween(
          begin: type.additional as Offset,
          end: Offset.zero,
        ).chain(CurveTween(curve: type.curve));
        final opacityTween = CurveTween(curve: type.curve);
        child = SlideTransition(position: animation.drive(tween), child: child);
        return FadeTransition(
          opacity: animation.drive(opacityTween),
          child: child,
        );

      // 中心缩放
      case AdaptiveDialogTransitionType.scaleCenter:
        final tween = CurveTween(curve: type.curve);
        return ScaleTransition(
          scale: animation.drive(tween),
          alignment: type.additional as Alignment,
          child: child,
        );

      // 从下到上
      case AdaptiveDialogTransitionType.bottomToTop:
      case AdaptiveDialogTransitionType.leftToRight:
      case AdaptiveDialogTransitionType.rightToLeft:
        final tween = Tween(
          begin: type.additional as Offset,
          end: Offset.zero,
        ).chain(CurveTween(curve: type.curve));
        return SlideTransition(position: animation.drive(tween), child: child);

      // 从下到上，包含模糊
      case AdaptiveDialogTransitionType.bottomToTopWithBlur:
        final tween = Tween(
          begin: type.additional as Offset,
          end: Offset.zero,
        ).chain(CurveTween(curve: type.curve));
        return SlideTransition(position: animation.drive(tween), child: child);
    }
  }

  @override
  ImageFilter? get filter => _filter;

  @override
  Widget buildModalBarrier() {
    final barrier = super.buildModalBarrier();
    return barrierPassable ? IgnorePointer(child: barrier) : barrier;
  }

  /// 滤镜覆盖实现
  final ImageFilter? _filter;

  /// 穿透屏障，如果为 `true`，[barrierDismissible] 必须为 `false`
  final bool barrierPassable;
}

/// 显示自适应对话框，[transition] 为显示、隐藏动画类型，
/// 因为是暗色系应用，如果使用模糊时 [barrierColor] 可以考虑设置为 `null`
Future<T?> showAdaptiveTransitionDialog<T extends Object?>({
  required BuildContext context,
  required WidgetBuilder builder,
  required AdaptiveDialogTransitionType transition,
  bool useSafeArea = false,
  bool barrierDismissible = false,
  String? barrierLabel,
  Color? barrierColor = Colors.black54,
  bool barrierPassable = false,
  bool useRootNavigator = true,
  RouteSettings? routeSettings,
  Offset? anchorPoint,
}) {
  final CapturedThemes themes = InheritedTheme.capture(
    from: context,
    to: Navigator.of(context, rootNavigator: useRootNavigator).context,
  );

  final route = transition == AdaptiveDialogTransitionType.heroWithBlur
      ? _HeroDialogRoute<T>(
          context: context,
          settings: routeSettings,
          builder: builder,
          anchorPoint: anchorPoint,
          barrierColor: barrierColor,
          barrierDismissible: barrierDismissible,
          barrierLabel: barrierLabel,
          barrierPassable: barrierPassable,
          useSafeArea: useSafeArea,
          transition: transition,
          themes: themes,
        )
      : _DialogRoute<T>(
          context: context,
          settings: routeSettings,
          builder: builder,
          anchorPoint: anchorPoint,
          barrierColor: barrierColor,
          barrierDismissible: barrierDismissible,
          barrierLabel: barrierLabel,
          barrierPassable: barrierPassable,
          useSafeArea: useSafeArea,
          transition: transition,
          themes: themes,
        );
  return Navigator.of(context, rootNavigator: useRootNavigator).push<T>(route);
}

/// 实现 [PageRoute] 满足 Hero 动画效果
class _HeroDialogRoute<T> extends _DialogRoute<T> with _PageRouteMixin<T> {
  _HeroDialogRoute({
    required super.context,
    required super.builder,
    required super.transition,
    super.themes,
    super.barrierColor,
    super.barrierDismissible,
    super.barrierPassable,
    super.barrierLabel,
    super.useSafeArea,
    super.settings,
    super.anchorPoint,
  });
}

mixin _PageRouteMixin<T> implements PageRoute<T> {
  @override
  bool get fullscreenDialog => false;
}
