import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fluttertoast/fluttertoast.dart';
import 'package:rive_rolls_collection/logging/logger.dart';
import 'package:talker_riverpod_logger/talker_riverpod_logger_observer.dart';
import 'app.dart';
import 'configs/constans.dart';
import 'configs/envs.dart';
import 'modules/style/app_theme.dart';
import 'package:shake/shake.dart';
import 'modules/pages/dev/dev_tools_page.dart';

/// 启动应用
Future<void> bootstrap(ServerEnv serverEnv) async {
  final binding = WidgetsFlutterBinding.ensureInitialized();

  // 禁止旋转
  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);

  // 保持显示 Splash
  binding.deferFirstFrame();

  // 执行初始化
  await App.init(ServerEnv.production);

  runApp(const AppScopedView());

  // 显示第一帧
  binding.allowFirstFrame();
}

////////////////////////////////////////////////////////////////////////////////////////////////////

class AppScopedView extends StatefulWidget {
  const AppScopedView({super.key});

  @override
  State<StatefulWidget> createState() => AppScopedViewState();
}

class AppScopedViewState extends State<AppScopedView> with AppScopedProvider, WidgetsBindingObserver {
  AppScopedViewState();

  ShakeDetector? _shakeDetector;
  bool _isDevToolsShowing = false;

  // 监听生命周期变化
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);
    if (state == AppLifecycleState.resumed) {
      // 可以在这里做你需要的操作，例如重新初始化某些服务或网络请求
      // PermissionUtil().startPrivacyProtection();
    }
  }

  @override
  void initState() {
    super.initState();
    // 监听应用生命周期的变化
    WidgetsBinding.instance.addObserver(this);

    // 初始化摇一摇唤起开发者工具
    if (kEnableDebugTools || isDebugMode) {
      _shakeDetector = ShakeDetector.autoStart(
        onPhoneShake: (_) => _showDevTools(),
      );
    }
  }

  Future<void> _showDevTools() async {
    if (_isDevToolsShowing) return;

    final context = App().currentContext;
    if (context == null || !context.mounted) return;

    _isDevToolsShowing = true;
    try {
      await DevToolsPage.show(context);
    } finally {
      _isDevToolsShowing = false;
    }
  }

  @override
  void dispose() {
    _shakeDetector?.stopListening();
    // 移除生命周期监听器
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final child = MaterialApp.router(
      theme: _currentTheme,
      debugShowCheckedModeBanner: false,
      routerConfig: App().router,
      builder: _buildRootRouter,
      checkerboardOffscreenLayers: false,
      checkerboardRasterCacheImages: false,
    );

    return AppScoped._(
      provider: this,
      child: ProviderScope(
        observers: isDebugMode ? [TalkerRiverpodObserver(talker: TalkerLogging.talker)] : null,
        child: child,
      ),
    );
  }

  /// 添加顶部弹出 Toast
  Widget _buildRootRouter(BuildContext context, Widget? child) {
    final entry = OverlayEntry(
      builder: (context) {
        FToast().init(context); // 初始化全局通知
        return child ?? const SizedBox.expand();
      },
    );
    return Overlay(initialEntries: [entry]);
  }
}

/// 应用作用域
class AppScoped extends InheritedWidget {
  const AppScoped._({required this.provider, required super.child});

  /// 顶级 [AppScopedProvider]
  final AppScopedProvider provider;

  /// 获取顶级 [AppScopedProvider]
  static AppScopedProvider of(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<AppScoped>()!.provider;
  }

  @override
  bool updateShouldNotify(AppScoped old) => provider != old.provider;
}

////////////////////////////////////////////////////////////////////////////////////////////////////

mixin AppScopedProvider {
  /// 当前主题
  ThemeData get currentTheme => _currentTheme;

  ///#region 私有变量

  /// 当前主题
  late final ThemeData _currentTheme = AppTheme.createTheme();

  ///#endregion
}
