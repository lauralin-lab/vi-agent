import 'package:dio/dio.dart';

/// 应用上层异常
class AppException implements Exception {
  const AppException({this.error, this.stackTrace});

  /// 错误
  final Object? error;

  /// 当前堆栈
  final StackTrace? stackTrace;

  /// 错误消息
  String get message => '$runtimeName{error: $error}';

  /// 运行时名称
  String get runtimeName => "AppException";

  @override
  String toString() => message;
}

/// 服务器异常
class ServerException extends AppException {
  const ServerException({
    super.error,
    super.stackTrace,
    this.code,
  });

  /// 服务器错误代码
  final int? code;

  /// 是否为超时导致
  bool get isTimeout =>
      error is DioException && (error as DioException).type.index <= DioExceptionType.receiveTimeout.index;

  /// 是否为连接错误
  bool get isConnectErr =>
      error is DioException &&
      ((error as DioException).type == DioExceptionType.connectionError ||
          (error as DioException).type == DioExceptionType.unknown ||
          (error as DioException).type == DioExceptionType.badCertificate);

  /// 是否是服务端错误
  bool get isServerErr => error is DioException && (error as DioException).type == DioExceptionType.badResponse;

  @override
  String get message => '$code: ${super.message}';

  @override
  String get runtimeName => "ServerException";
}

/// 非法状态异常
class IllegalStateException extends AppException {
  const IllegalStateException({super.error, super.stackTrace});

  @override
  String get runtimeName => "IllegalStateException";
}

/// 因用户导致的异常
class UserException extends AppException {
  const UserException({super.error, super.stackTrace});

  @override
  String get runtimeName => "UserException";
}

/// 取消异常
class CancelException extends UserException {
  const CancelException({super.error, super.stackTrace});

  @override
  String get runtimeName => "CancelException";
}
