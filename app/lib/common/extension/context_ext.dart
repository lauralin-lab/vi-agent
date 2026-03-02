import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:rive_rolls_collection/logging/logger.dart';
import '../../app.dart';

/// BuildContext 扩展
extension BuildContextExt on BuildContext {
  /// 获取当前 [MediaQueryData]
  MediaQueryData get mediaQuery => MediaQuery.of(this);

  /// 设备像素比
  double get pixelRatio => MediaQuery.devicePixelRatioOf(this);

  /// 获取当前可呈现区域大小(逻辑像素)
  /// 需要确保上下文有效
  Size get screenSize => MediaQuery.sizeOf(this);

  /// 屏幕大小（物理像素）
  Size get screenSizePx => screenSize * pixelRatio;

  /// 获取当前可呈现区域宽度(逻辑像素)
  /// 需要确保上下文有效
  double get screenWidth => screenSize.width;

  /// 获取当前可呈现区域高度(逻辑像素)
  /// 需要确保上下文有效
  double get screenHeight => screenSize.height;

  /// 获取当前可呈现区域宽度(物理像素)
  /// 需要确保上下文有效
  double get screenWidthPx => screenSize.width * pixelRatio;

  /// 获取当前可呈现区域高度(物理像素)
  /// 需要确保上下文有效
  double get screenHeightPx => screenSize.height * pixelRatio;

  /// 安全区域
  EdgeInsets get safeArea => MediaQuery.of(this).padding;

  /// 可视安全区域（固定）
  EdgeInsets get viewSafeArea => MediaQuery.of(this).viewPadding;

  /// 获取当前路由页面名称（包含弹窗）
  String get currentRouterPageName => app.appNavigatorObserver.currentPageName;

  /// 获取当前路由页面名称（包含弹窗）
  Route<dynamic>? get currentRouterPage => app.appNavigatorObserver.currentPage;

  /// 是否为平板设备（大屏），包含折叠屏手机
  bool get isTablet {
    final size = MediaQuery.of(this).size;
    return math.min(size.width, size.height) >= 540;
  }

  /// 检查当前路由栈存在此页面（不包含弹框）
  bool containsPage(String pageName) {
    final config = GoRouter.of(this).routerDelegate.currentConfiguration;
    for (final route in config.matches) {
      if (route.matchedLocation != pageName) continue;
      return true;
    }
    return false;
  }

  /// 检查当前路由栈存在此页面 （包含弹窗）
  bool containsPage2(String pageName) {
    return app.appNavigatorObserver.containsPage(pageName);
  }

  /// 判断栈顶是否为当前页面 （不包含弹框）
  bool lastPage(String pageName) {
    final config = GoRouter.of(this).routerDelegate.currentConfiguration;
    logd('configs.matches.last.matchedLocation====${config.matches.last.matchedLocation}');
    if (config.matches.isNotEmpty && config.matches.last.matchedLocation == pageName) {
      return true;
    }
    return false;
  }

  /// 判断栈顶是否为当前页面 （包含弹框）
  bool lastPage2(String pageName) => currentRouterPageName == pageName;
}
