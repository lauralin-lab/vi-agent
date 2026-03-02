import 'package:dio/dio.dart';

import '../../app.dart';

/// 应用 http 拦截器
class AppInterceptor extends InterceptorsWrapper {
  AppInterceptor([this.requireIdToken = true]);

  final bool requireIdToken;

  @override
  Future<void> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {

    final app = App();
    final appVer = '${app.version}+${app.buildNumber}'; // 应用版本
    final locale = App().currentLocale(); // 获取语言
    final user = app.auth.currentAuth.user;

    options.headers["package-name"] = app.packageName;
    options.headers["app-version"] = appVer;
    options.headers["accept-language"] = locale.toString();

    if (requireIdToken && user != null && options.headers["id-token"] == null) {
      // final start = DateTime.now().millisecondsSinceEpoch;
      var idToken = await user.getIdToken();
      idToken ??= await user.getIdToken(true);
      if (idToken != null) {
        options.headers["id-token"] = idToken;
      }
      // final end = DateTime.now().millisecondsSinceEpoch;
      // loge('获取 IdToken：${end - start} 毫秒');
    }

    handler.next(options);
  }
}
