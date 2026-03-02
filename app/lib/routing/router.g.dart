// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'router.dart';

// **************************************************************************
// GoRouterGenerator
// **************************************************************************

List<RouteBase> get $appRoutes => [
  $loginRoute,
  $homeRoute,
  $centerRoute,
  $guidanceRoute,
  $sessionRoute,
  $threadRoute,
  $sessionDetailRoute,
  $memoryRoute,
  $editMemoryRoute,
];

RouteBase get $loginRoute => GoRouteData.$route(
  path: '/login',
  name: '/login',

  factory: $LoginRouteExtension._fromState,
);

extension $LoginRouteExtension on LoginRoute {
  static LoginRoute _fromState(GoRouterState state) => const LoginRoute();

  String get location => GoRouteData.$location('/login');

  void go(BuildContext context) => context.go(location);

  Future<T?> push<T>(BuildContext context) => context.push<T>(location);

  void pushReplacement(BuildContext context) =>
      context.pushReplacement(location);

  void replace(BuildContext context) => context.replace(location);
}

RouteBase get $homeRoute => GoRouteData.$route(
  path: '/',
  name: '/',

  factory: $HomeRouteExtension._fromState,
);

extension $HomeRouteExtension on HomeRoute {
  static HomeRoute _fromState(GoRouterState state) => const HomeRoute();

  String get location => GoRouteData.$location('/');

  void go(BuildContext context) => context.go(location);

  Future<T?> push<T>(BuildContext context) => context.push<T>(location);

  void pushReplacement(BuildContext context) =>
      context.pushReplacement(location);

  void replace(BuildContext context) => context.replace(location);
}

RouteBase get $centerRoute => GoRouteData.$route(
  path: '/center',
  name: '/center',

  factory: $CenterRouteExtension._fromState,
);

extension $CenterRouteExtension on CenterRoute {
  static CenterRoute _fromState(GoRouterState state) => const CenterRoute();

  String get location => GoRouteData.$location('/center');

  void go(BuildContext context) => context.go(location);

  Future<T?> push<T>(BuildContext context) => context.push<T>(location);

  void pushReplacement(BuildContext context) =>
      context.pushReplacement(location);

  void replace(BuildContext context) => context.replace(location);
}

RouteBase get $guidanceRoute => GoRouteData.$route(
  path: '/guidance',
  name: '/guidance',

  factory: $GuidanceRouteExtension._fromState,
);

extension $GuidanceRouteExtension on GuidanceRoute {
  static GuidanceRoute _fromState(GoRouterState state) => const GuidanceRoute();

  String get location => GoRouteData.$location('/guidance');

  void go(BuildContext context) => context.go(location);

  Future<T?> push<T>(BuildContext context) => context.push<T>(location);

  void pushReplacement(BuildContext context) =>
      context.pushReplacement(location);

  void replace(BuildContext context) => context.replace(location);
}

RouteBase get $sessionRoute => GoRouteData.$route(
  path: '/session',
  name: '/session',

  factory: $SessionRouteExtension._fromState,
);

extension $SessionRouteExtension on SessionRoute {
  static SessionRoute _fromState(GoRouterState state) =>
      SessionRoute(state.extra as SessionRouteExtra);

  String get location => GoRouteData.$location('/session');

  void go(BuildContext context) => context.go(location, extra: $extra);

  Future<T?> push<T>(BuildContext context) =>
      context.push<T>(location, extra: $extra);

  void pushReplacement(BuildContext context) =>
      context.pushReplacement(location, extra: $extra);

  void replace(BuildContext context) =>
      context.replace(location, extra: $extra);
}

RouteBase get $threadRoute => GoRouteData.$route(
  path: '/threads',
  name: '/threads',

  factory: $ThreadRouteExtension._fromState,
);

extension $ThreadRouteExtension on ThreadRoute {
  static ThreadRoute _fromState(GoRouterState state) => const ThreadRoute();

  String get location => GoRouteData.$location('/threads');

  void go(BuildContext context) => context.go(location);

  Future<T?> push<T>(BuildContext context) => context.push<T>(location);

  void pushReplacement(BuildContext context) =>
      context.pushReplacement(location);

  void replace(BuildContext context) => context.replace(location);
}

RouteBase get $sessionDetailRoute => GoRouteData.$route(
  path: '/detailSession/:sessionKey',
  name: '/detailSession/:sessionKey',

  factory: $SessionDetailRouteExtension._fromState,
);

extension $SessionDetailRouteExtension on SessionDetailRoute {
  static SessionDetailRoute _fromState(GoRouterState state) =>
      SessionDetailRoute(sessionKey: state.pathParameters['sessionKey']!);

  String get location => GoRouteData.$location(
    '/detailSession/${Uri.encodeComponent(sessionKey)}',
  );

  void go(BuildContext context) => context.go(location);

  Future<T?> push<T>(BuildContext context) => context.push<T>(location);

  void pushReplacement(BuildContext context) =>
      context.pushReplacement(location);

  void replace(BuildContext context) => context.replace(location);
}

RouteBase get $memoryRoute => GoRouteData.$route(
  path: '/memory',
  name: '/memory',

  factory: $MemoryRouteExtension._fromState,
);

extension $MemoryRouteExtension on MemoryRoute {
  static MemoryRoute _fromState(GoRouterState state) => const MemoryRoute();

  String get location => GoRouteData.$location('/memory');

  void go(BuildContext context) => context.go(location);

  Future<T?> push<T>(BuildContext context) => context.push<T>(location);

  void pushReplacement(BuildContext context) =>
      context.pushReplacement(location);

  void replace(BuildContext context) => context.replace(location);
}

RouteBase get $editMemoryRoute => GoRouteData.$route(
  path: '/editMemory',
  name: '/editMemory',

  factory: $EditMemoryRouteExtension._fromState,
);

extension $EditMemoryRouteExtension on EditMemoryRoute {
  static EditMemoryRoute _fromState(GoRouterState state) =>
      const EditMemoryRoute();

  String get location => GoRouteData.$location('/editMemory');

  void go(BuildContext context) => context.go(location);

  Future<T?> push<T>(BuildContext context) => context.push<T>(location);

  void pushReplacement(BuildContext context) =>
      context.pushReplacement(location);

  void replace(BuildContext context) => context.replace(location);
}
