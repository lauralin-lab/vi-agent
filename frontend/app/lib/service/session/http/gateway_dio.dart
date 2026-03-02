import 'package:dio/dio.dart';

import '../../../common/network/http_log_interceptor.dart';
import '../../../common/network/mock_interceptor.dart';
import '../../../configs/constans.dart';
import '../../gateway/rpc/gateway_models.dart';
import '../config.dart';

/// Gateway HTTP 专用 Dio 实例
/// 基于 Gateway WebSocket URL 转换为 HTTP base URL
final gatewayDio = _createGatewayDio();

Dio _createGatewayDio() {
  final baseUrl = SessionConfig.baseUrl;

  final options = BaseOptions(
    baseUrl: baseUrl,
    connectTimeout: const Duration(seconds: 20),
    receiveTimeout: const Duration(seconds: 30),
    contentType: Headers.jsonContentType,
    headers: {
      'Authorization': 'Bearer $kGatewayAuthToken',
    },
  );

  final interceptors = <Interceptor>[
    if (kEnableDebugTools) MockInterceptor(),
    HttpLogInterceptor(),
  ];

  return Dio(options)..interceptors.addAll(interceptors);
}
