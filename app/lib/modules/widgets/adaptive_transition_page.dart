import 'dart:io';
import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

part 'adaptive_transition_page.dialog.dart';

part 'adaptive_transition_page.hook.dart';

/// 自定义页面动画效果
enum AdaptiveTransitionType {
  /// 无动画
  none._(
    transitionDuration: Duration.zero,
    reverseTransitionDuration: Duration.zero,
  ),

  /// 渐隐渐现
  fade._(),

  /// 从顶部到底部
  topToBottom._(
    curve: Curves.easeInOutSine,
    additional: Offset(0.0, -1.0),
  ),

  /// 从底部升起
  bottomToTop._(
    curve: Curves.easeInOutSine,
    additional: Offset(0.0, 1.0),
  ),

  /// 从左到右滑动
  leftToRight._(
    additional: Offset(-1.0, 0.0),
    transitionDuration: Duration(milliseconds: 200),
    reverseTransitionDuration: Duration(milliseconds: 200),
  ),

  /// 从右到左滑动
  rightToLeft._(
    additional: Offset(1.0, 0.0),
    transitionDuration: Duration(milliseconds: 200),
    reverseTransitionDuration: Duration(milliseconds: 200),
  ),

  /// 展开动画 (scale + fade)
  scale._(
    curve: Curves.easeOutCubic,
    transitionDuration: Duration(milliseconds: 350),
    reverseTransitionDuration: Duration(milliseconds: 300),
    additional: 0.85, // 起始缩放比例
  ),

  /// 仅 Hero 动画（页面本身轻微淡入，让 Hero 有时间执行）
  heroOnly._(
    curve: Curves.easeInOut,
    transitionDuration: Duration(milliseconds: 350),
    reverseTransitionDuration: Duration(milliseconds: 300),
  );

  /// 缓动曲线
  final Curve curve;

  /// 页面切换时动画时长
  final Duration transitionDuration;

  /// 页面返回时动画时长
  final Duration reverseTransitionDuration;

  /// 附加控制参数
  final dynamic additional;

  /// 初始化枚举
  const AdaptiveTransitionType._({
    this.curve = Curves.linear,
    this.transitionDuration = const Duration(milliseconds: 300),
    this.reverseTransitionDuration = const Duration(milliseconds: 300),
    this.additional,
  });
}

/// 自定义页面跳转效果
class AdaptiveTransitionPage<T> extends Page<T> {
  const AdaptiveTransitionPage({
    required this.type,
    required this.child,
    this.maintainState = true,
    this.fullscreenDialog = false,
    this.opaque = true,
    this.barrierDismissible = false,
    this.barrierColor,
    this.barrierLabel,
    super.key,
    super.name,
    super.arguments,
    super.restorationId,
  });

  /// 页面内容
  final Widget child;

  /// 转场动效类型
  final AdaptiveTransitionType type;

  /// 是否维持主状态
  final bool maintainState;

  /// 将此页面设置为全屏对话框
  final bool fullscreenDialog;

  /// 转场完成后，路由是否遮挡了以前的路由，这将节省性能
  final bool opaque;

  /// 是否通过点击屏障关闭此页面
  final bool barrierDismissible;

  /// 屏障颜色
  final Color? barrierColor;

  /// 屏障标签
  final String? barrierLabel;

  @override
  Route<T> createRoute(BuildContext context) => _AdaptiveTransitionPageRoute(this);
}

class _AdaptiveTransitionPageRoute<T> extends PageRoute<T> {
  _AdaptiveTransitionPageRoute(AdaptiveTransitionPage<T> page) : super(settings: page);

  AdaptiveTransitionPage<T> get _page => settings as AdaptiveTransitionPage<T>;

  @override
  bool get barrierDismissible => _page.barrierDismissible;

  @override
  Color? get barrierColor => _page.barrierColor;

  @override
  String? get barrierLabel => _page.barrierLabel;

  @override
  Duration get transitionDuration => _page.type.transitionDuration;

  @override
  Duration get reverseTransitionDuration => _page.type.reverseTransitionDuration;

  @override
  bool get maintainState => _page.maintainState;

  @override
  bool get fullscreenDialog => _page.fullscreenDialog;

  @override
  bool get opaque => _page.opaque;

  // 判断方向是LTR、如阿拉伯UI是RTL
  bool isLTR(context) {
    return Directionality.of(context) != TextDirection.rtl;
  }

  // 判断动画为fade或者rtl的允许侧滑
  late bool isFadeOrRTL = _page.type == AdaptiveTransitionType.fade || _page.type == AdaptiveTransitionType.rightToLeft;

  @override
  Widget buildPage(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
  ) {
    return Semantics(scopesRoute: true, explicitChildNodes: true, child: _page.child);
  }

  @override
  Widget buildTransitions(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    if (Platform.isIOS && !fullscreenDialog && isFadeOrRTL && isLTR(context)) {
      child = _CupertinoBackGestureDetector<T>(
        enabledCallback: () => popGestureEnabled,
        onStartPopGesture: () => _startPopGesture(),
        child: child,
      );
    }

    final type = _page.type;
    switch (type) {
      case AdaptiveTransitionType.none:
        return child;
      case AdaptiveTransitionType.fade:
        final tween = CurveTween(curve: type.curve);
        return FadeTransition(opacity: animation.drive(tween), child: child);
      case AdaptiveTransitionType.topToBottom:
      case AdaptiveTransitionType.bottomToTop:
      case AdaptiveTransitionType.leftToRight:
      case AdaptiveTransitionType.rightToLeft:
        final tween = Tween(
          begin: type.additional as Offset,
          end: Offset.zero,
        ).chain(CurveTween(curve: type.curve));
        return SlideTransition(position: animation.drive(tween), child: child);
      case AdaptiveTransitionType.scale:
        // 展开动画: 缩放 + 淡入
        final scaleTween = Tween(
          begin: type.additional as double,
          end: 1.0,
        ).chain(CurveTween(curve: type.curve));
        final fadeTween = Tween(
          begin: 0.0,
          end: 1.0,
        ).chain(CurveTween(curve: type.curve));
        return FadeTransition(
          opacity: animation.drive(fadeTween),
          child: ScaleTransition(
            scale: animation.drive(scaleTween),
            child: child,
          ),
        );
      case AdaptiveTransitionType.heroOnly:
        // 仅 Hero 动画：页面轻微淡入，不干扰 Hero 过渡效果
        final fadeTween = Tween(
          begin: 0.0,
          end: 1.0,
        ).chain(CurveTween(curve: type.curve));
        return FadeTransition(
          opacity: animation.drive(fadeTween),
          child: child,
        );
    }
  }

  _CupertinoBackGestureController<T> _startPopGesture() {
    return _CupertinoBackGestureController<T>(
      navigator: navigator!,
      getIsCurrent: () => isCurrent,
      getIsActive: () => isActive,
      controller: controller!,
    );
  }
}
