import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:rive_rolls_collection/io/app_storage.dart';
import 'package:rive_rolls_collection/misc/initializer.dart';
import 'common/extension/ui_ext.dart';
import 'common/io/paths.dart';
import 'common/io/preferences.dart';
import 'common/misc/device_id_compat.dart';
import 'common/misc/route_codec.dart';
import 'common/pool/assets_cached_pool.dart';
import 'configs/constans.dart';
import 'configs/envs.dart';
import 'routing/navigator_observer.dart';
import 'routing/router.dart';
import 'service/authentication.dart';
import 'service/firebase/firebase_initializer.dart';
import 'service/hardware/hard_ware_initializer.dart';

/// 应用实例（快捷方式）
App get app => App();

/// 应用入口
class App {
  ///#region 私有构造

  /// 私有的命名构造函数
  App._(this._serverEnv);

  ///#endregion

  //////////////////////////////////////////////////////////////////////////////////////////////////

  ///#region 单例模式

  /// 单例
  factory App() => _instance!;

  /// 服务器环境
  ServerEnv get serverEnv => _serverEnv;

  /// 设置服务器环境（仅供 DevTools 使用）
  set serverEnv(ServerEnv env) => _serverEnv = env;

  /// 设备编号
  String get deviceId => _deviceId!;

  /// Assets 资产缓存池
  AssetsCachedPool get assetsCachedPool => _assetsCachedPool;

  /// 存储池，用文件进行散落存储
  AppStorage get storage => _storage;

  /// 存储池，用文件进行散落存储（多用于缓存）
  AppStorage get cacheStorage => _cStorage;

  /// 各类设置
  Preferences get preferences => _preferences;

  /// 当前上下文
  BuildContext? get currentContext => _currentContext;

  /// 当前上下文
  BuildContext get context => _currentContext!;

  /// 包名
  String get packageName => _packageInfo.packageName;

  /// 版本
  String get version => _packageInfo.version;

  /// 版本号
  String get buildNumber => _packageInfo.buildNumber;

  /// 路由
  GoRouter get router => _router;

  /// 路由扩展编码器
  RouteCodec get routeCodec => _routeCodec;

  /// 路由监听
  RouteObserver<Route<dynamic>> get routeObserver => _routeObserver;

  /// 认证与登录
  Authentication get auth => _authentication;

  /// 顶部安全区
  double get safeTop => _safeTop;

  /// 底部安全区
  double get safeBottom => _safeBottom;

  ///#endregion

  //////////////////////////////////////////////////////////////////////////////////////////////////

  ///#region 单例模式
  /// 用于初始化的函数
  static Future<void> init(ServerEnv env) async {
    if (_instance != null) return;

    final app = App._(env);
    _instance = app;

    /// 执行初始化
    await InitializeType.runInit([
      // -----------------------------------------------------------------------
      const PathsInitializer(InitializeType.sequence),
      PreferencesInitializer(InitializeType.sequence, app.preferences),
      DeviceIdInitializer(InitializeType.sequence, app._setDeviceId),
      const _PackageInitializer(InitializeType.sequence),
      const FirebaseInitializer(InitializeType.sequence),
      // 后续服务依赖它必须串行
      // -----------------------------------------------------------------------
      AssetsCachedPoolInitializer(InitializeType.unimportant, app.assetsCachedPool),
      // -----------------------------------------------------------------------
      HardWareInitializer(InitializeType.unimportant), // 硬件初始化
    ]);
  }

  /// 获取当前语言
  Locale currentLocale() {
    final c = currentContext;
    final locale = c != null ? Localizations.maybeLocaleOf(c) : null;
    return locale ?? const Locale('en');
  }

  /// 当前上下文
  BuildContext? get _currentContext {
    return router.routerDelegate.navigatorKey.currentContext;
  }

  /// 设置设备编号
  void _setDeviceId(String id) => _deviceId = id;

  //////////////////////////////////////////////////////////////////////////////////////////////////

  ///#region 私有变量

  /// 实例
  static App? _instance;

  /// 服务器环境
  ServerEnv _serverEnv;

  /// 缓存池
  final AssetsCachedPool _assetsCachedPool = AssetsCachedPool();

  /// 设置持久化
  final Preferences _preferences = Preferences.$();

  /// 存储池
  late final AppStorage _storage = AppStorage(Paths.storageDirectory);

  /// 存储池
  late final AppStorage _cStorage = AppStorage(Paths.cacheStorageDirectory);

  /// 包信息
  late final PackageInfo _packageInfo;

  /// 应用导航监听
  final AppNavigatorObserver appNavigatorObserver = AppNavigatorObserver();
  final RouteObserver<Route<dynamic>> _routeObserver = RouteObserver();

  /// 认证与登录
  late final Authentication _authentication = Authentication.$();

  /// 路由扩展编码
  late final _router = GoRouter(
    debugLogDiagnostics: isDebugMode,
    routes: $appRoutes,
    initialLocation: preferences.hasLogin ? RouterPaths.home : RouterPaths.login,
    observers: [appNavigatorObserver, _routeObserver],
    redirect: _routerRedirect,
    extraCodec: routeCodec,
  );

  /// 路由扩展编码器
  late final _routeCodec = RouteCodec.$();

  /// 顶部安全区
  late final double _safeTop = UIExt.absSafeArea.top;

  /// 底部安全区域
  late final double _safeBottom = UIExt.absSafeArea.bottom;

  /// 设备编号
  String? _deviceId;
}

/// 全局路由重定向
FutureOr<String?> _routerRedirect(BuildContext context, GoRouterState state) {
  final location = state.matchedLocation;
  final isLoggedIn = App().auth.logged;
  final isOnLoginPage = location == RouterPaths.login;

  // 未登录 + 不在登录页 → 重定向到登录页
  if (!isLoggedIn && !isOnLoginPage) {
    return RouterPaths.login;
  }

  // 已登录 + 在登录页 → 重定向到首页
  if (isLoggedIn && isOnLoginPage) {
    return RouterPaths.home;
  }

  return null;
}


class _PackageInitializer extends Initializer {
  const _PackageInitializer(super.type);

  @override
  Future onInit() async {
    App()._packageInfo = await PackageInfo.fromPlatform();
  }
}
