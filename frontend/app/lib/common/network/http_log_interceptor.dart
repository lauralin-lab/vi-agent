import 'dart:convert';
import 'package:dio/dio.dart';
import '../utils/log_utils.dart';

/// Dio HTTP 请求日志拦截器
///
/// 打印完整的 HTTP 请求和响应信息
/// 在 debug 模式和内部版本下生效
class HttpLogInterceptor extends Interceptor {
  static const String _tag = 'HTTP';

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final buf = StringBuffer()
      ..writeln('═══ REQUEST ═══════════════════════════════')
      ..writeln('${options.method} ${options.uri}')
      ..writeln('Headers: ${_prettyJson(options.headers)}');
    if (options.queryParameters.isNotEmpty) {
      buf.writeln('Query: ${_prettyJson(options.queryParameters)}');
    }
    if (options.data != null) {
      buf.writeln('Body: ${_formatData(options.data)}');
    }
    buf.write('════════════════════════════════════════════');
    Log.d(buf.toString(), tag: _tag);
    handler.next(options);
  }

  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    final buf = StringBuffer()
      ..writeln('═══ RESPONSE ══════════════════════════════')
      ..writeln('${response.statusCode} ${response.requestOptions.uri}')
      ..writeln('Data: ${_formatData(response.data)}')
      ..write('════════════════════════════════════════════');
    Log.d(buf.toString(), tag: _tag);
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final buf = StringBuffer()
      ..writeln('═══ ERROR ═════════════════════════════════')
      ..writeln('${err.type} ${err.requestOptions.uri}')
      ..writeln('Message: ${err.message}');
    if (err.response != null) {
      buf.writeln('Status: ${err.response?.statusCode}');
      buf.writeln('Data: ${_formatData(err.response?.data)}');
    }
    buf.write('════════════════════════════════════════════');
    Log.e(buf.toString(), tag: _tag);
    handler.next(err);
  }

  String _formatData(dynamic data) {
    if (data == null) return 'null';
    if (data is FormData) {
      final buffer = StringBuffer('[FormData]\n');
      for (final field in data.fields) {
        buffer.writeln('  ${field.key}: ${field.value}');
      }
      for (final file in data.files) {
        buffer.writeln('  ${file.key}: [File] ${file.value.filename}');
      }
      return buffer.toString();
    }
    return _prettyJson(data);
  }

  String _prettyJson(dynamic data) {
    try {
      if (data is String) {
        final decoded = json.decode(data);
        return const JsonEncoder.withIndent('  ').convert(decoded);
      } else if (data is Map || data is List) {
        return const JsonEncoder.withIndent('  ').convert(data);
      }
      return data.toString();
    } catch (_) {
      return data.toString();
    }
  }
}
