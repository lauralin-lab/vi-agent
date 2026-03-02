import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../modules/pages/guidance/guidance_page.dart';
import '../modules/pages/center/center_page.dart';
import '../modules/pages/home_page.dart';
import '../modules/pages/login/login_page.dart';
import '../modules/pages/session/session_page.dart';
import '../modules/pages/memory/memory_page.dart';
import '../depreciated/session/main/section/memory/edit_memory_page.dart';
import '../depreciated/session/main/section/threads/all_threads_page.dart';
import '../depreciated/session/chat/session_detail_page.dart';
import '../modules/widgets/adaptive_transition_page.dart';
import '../modules/widgets/dialog_lite.dart';

part 'router.g.dart';

part 'router_data.dart';

/// 路由路径
final class RouterPaths {
  /// 首页
  static const home = '/';

  /// Center
  static const cneter = '/center';

  /// 引导页
  static const guidance = '/guidance';

  /// 会话
  static const session = '/session';

  /// All Threads
  static const threads = '/threads';

  /// session detail
  static const detailSession = '/detailSession/:sessionKey';

  /// Memory
  static const memory = '/memory';

  /// Edit Memory
  static const editMemory = '/editMemory';

  /// 登陆页
  static const login = '/login';
}

//////////////////////////////////////////////////////////////////////////////////////////////////
/// 使用 [TypedGoRoute] 注册路由时添加 [TypedGoRoute.name] ！！！
/// 使用 [TypedGoRoute] 注册路由时添加 [TypedGoRoute.name] ！！！
/// 使用 [TypedGoRoute] 注册路由时添加 [TypedGoRoute.name] ！！！

/// 登陆页
@TypedGoRoute<LoginRoute>(path: RouterPaths.login, name: RouterPaths.login)
class LoginRoute extends AppGoRouteData {
  const LoginRoute() : super(transition: AdaptiveTransitionType.bottomToTop);

  @override
  Widget buildPageWidget(BuildContext context, GoRouterState state) {
    return const LoginPage();
  }
}

///  首页
@TypedGoRoute<HomeRoute>(path: RouterPaths.home, name: RouterPaths.home)
class HomeRoute extends AppGoRouteData {
  const HomeRoute() : super(transition: AdaptiveTransitionType.fade);

  @override
  Widget buildPageWidget(BuildContext context, GoRouterState state) {
    return const HomePage();
  }
}

/// Center 页面
@TypedGoRoute<CenterRoute>(path: RouterPaths.cneter, name: RouterPaths.cneter)
class CenterRoute extends AppGoRouteData {
  const CenterRoute() : super(transition: AdaptiveTransitionType.fade);

  @override
  Widget buildPageWidget(BuildContext context, GoRouterState state) {
    return const CenterPage();
  }
}

/// 引导页
@TypedGoRoute<GuidanceRoute>(path: RouterPaths.guidance, name: RouterPaths.guidance)
class GuidanceRoute extends AppGoRouteData {
  const GuidanceRoute() : super(transition: AdaptiveTransitionType.fade);

  @override
  Widget buildPageWidget(BuildContext context, GoRouterState state) {
    return const GuidancePage();
  }
}

/// Session 路由参数
class SessionRouteExtra {
  final String sessionKey;
  final String? prompt;
  final List<String> imageUrls;

  const SessionRouteExtra({
    required this.sessionKey,
    this.prompt,
    this.imageUrls = const [],
  });
}

/// 会话
@TypedGoRoute<SessionRoute>(path: RouterPaths.session, name: RouterPaths.session)
class SessionRoute extends AppGoRouteData {
  const SessionRoute(this.$extra) : super(transition: AdaptiveTransitionType.rightToLeft);

  final SessionRouteExtra $extra;

  @override
  Widget buildPageWidget(BuildContext context, GoRouterState state) {
    return SessionPage(
      sessionKey: $extra.sessionKey,
      prompt: $extra.prompt,
      imageUrls: $extra.imageUrls,
    );
  }
}

/// 所有Threads
@TypedGoRoute<ThreadRoute>(path: RouterPaths.threads, name: RouterPaths.threads)
class ThreadRoute extends AppGoRouteData {
  const ThreadRoute() : super(transition: AdaptiveTransitionType.heroOnly);

  @override
  Widget buildPageWidget(BuildContext context, GoRouterState state) {
    return const AllThreadsPage();
  }
}

/// 会话详情
@TypedGoRoute<SessionDetailRoute>(path: RouterPaths.detailSession, name: RouterPaths.detailSession)
class SessionDetailRoute extends AppGoRouteData {
  const SessionDetailRoute({required this.sessionKey}) : super(transition: AdaptiveTransitionType.rightToLeft);

  /// Session Key（路径参数，始终可用）
  final String sessionKey;

  @override
  Widget buildPageWidget(BuildContext context, GoRouterState state) {
    return SessionDetailPage(sessionKey: sessionKey);
  }
}

/// Memory 页面
@TypedGoRoute<MemoryRoute>(path: RouterPaths.memory, name: RouterPaths.memory)
class MemoryRoute extends AppGoRouteData {
  const MemoryRoute() : super(transition: AdaptiveTransitionType.rightToLeft);

  @override
  Widget buildPageWidget(BuildContext context, GoRouterState state) {
    return const MemoryPage();
  }
}

/// Edit Memory 页面
@TypedGoRoute<EditMemoryRoute>(path: RouterPaths.editMemory, name: RouterPaths.editMemory)
class EditMemoryRoute extends AppGoRouteData {
  const EditMemoryRoute() : super(transition: AdaptiveTransitionType.rightToLeft);

  @override
  Widget buildPageWidget(BuildContext context, GoRouterState state) {
    return const EditMemoryPage();
  }
}
