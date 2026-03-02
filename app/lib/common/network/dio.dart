import 'package:dio/dio.dart';

import '../../app.dart';
import '../../configs/constans.dart';
import 'http_log_interceptor.dart';
import 'interceptors.dart';
import 'mock_interceptor.dart';

/// 针对本应用的Dio网络请求实例，针对服务端添加必要的通用参数
final appDio = _createAppDio();

/// 通用Dio实例
final dio = _createDio();

/// 创建用于应用 API 的 DIO
Dio _createAppDio() {
  final options = BaseOptions(
    baseUrl: App().serverEnv.host,
    connectTimeout: const Duration(seconds: 20),
    contentType: Headers.jsonContentType,
  );
  final interceptors = <Interceptor>[
    if (kEnableDebugTools) MockInterceptor(),
    AppInterceptor(),
    HttpLogInterceptor(), // HTTP 请求日志
  ];
  return Dio(options)..interceptors.addAll(interceptors);
}

/// 创建用于非 API 的 DIO
Dio _createDio() {
  final options = BaseOptions(
    baseUrl: App().auth.gateWayUrl, //'https://sega-grams-tampa-msie.trycloudflare.com'
    connectTimeout: const Duration(seconds: 20),
    contentType: Headers.jsonContentType,
  );
  final interceptors = <Interceptor>[
    if (kEnableDebugTools) MockInterceptor(),
    AppInterceptor(),
    HttpLogInterceptor(), // HTTP 请求日志
  ];
  return Dio(options)..interceptors.addAll(interceptors);
}
