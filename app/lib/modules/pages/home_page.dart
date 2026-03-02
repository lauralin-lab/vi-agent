import 'dart:io';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../app.dart';
import '../../common/extension/context_ext.dart';
import '../../common/extension/drag_details_ext.dart';
import '../style/app_theme.dart';
import 'home/main_page.dart';

part 'home_page.ui.dart';
part 'home_page_gesture.dart';

class HomePage extends ConsumerStatefulWidget {
  const HomePage({super.key});

  @override
  ConsumerState<ConsumerStatefulWidget> createState() => _HomePageState();
}

mixin HomePageController on ConsumerState<HomePage> {
  /// 页面控制器
  final gestureMotion = HomeGestureMotion._();

  /// 底部栏尺寸
  late final bottomBarSize = HomePageScoped._bottomBarSize(context);

  /// 初始化
  void _init() {
    App().safeTop; // 请勿删除，用于预初始化
  }

  /// 销毁
  void _dispose() {
    gestureMotion.dispose();
  }

  /// 官方自带
  /// 针对iOS弹出appTrackingTransparency
  // Future<void> _requestPermissions() async {
  //   if (Platform.isIOS) {
  //     final status = await Permission.appTrackingTransparency.request();
  //     if (status == PermissionStatus.granted) {
  //       TapThirdEvent.instance.tapTrackAllow();
  //     }
  //   }
  // }
}

/// 应用作用域
class HomePageScoped extends InheritedWidget {
  const HomePageScoped._({required this.controller, required super.child});

  /// 主控制器
  final HomePageController controller;

  /// 尝试获取 [HomePageController]
  static HomePageController? maybeOf(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<HomePageScoped>()?.controller;
  }

  /// 获取 [HomePageController]
  static HomePageController of(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<HomePageScoped>()!.controller;
  }

  /// 获取主界面底部边距（包含状态栏）
  static double getMainPaddingBottom(BuildContext context) {
    final size = HomePageScoped.maybeOf(context)?.bottomBarSize ?? _bottomBarSize(context);
    return MediaQuery.of(context).padding.bottom + size;
  }

  /// 获取主界面底部边距（不包含状态栏）
  static double _bottomBarSize(BuildContext context) {
    return context.isTablet ? 60.0 : 52.0;
  }

  @override
  bool updateShouldNotify(covariant HomePageScoped old) => controller != old.controller;
}

class _HomePageState extends ConsumerState<HomePage> with HomePageController {
  _HomePageState();

  @override
  void initState() {
    super.initState();
    _init();
  }

  @override
  void dispose() {
    _dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // 脚手架
    Widget child = Scaffold(
      backgroundColor: AppTheme.surfaceColor,
      extendBody: true,
      extendBodyBehindAppBar: true,
      body: _buildBody(context),
    );

    // 包裹并传递上下文
    return HomePageScoped._(
      controller: this,
      child: AnnotatedRegion<SystemUiOverlayStyle>(
        value: const SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: Brightness.dark,
          statusBarBrightness: Brightness.light,
        ),
        child: child,
      ),
    );
  }
}
