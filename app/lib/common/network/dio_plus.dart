import 'package:dio/dio.dart';
import 'package:dio_cache_interceptor/dio_cache_interceptor.dart' as dio;
import 'package:http_cache_file_store/http_cache_file_store.dart';

import '../exception/exceptions.dart';
import '../io/paths.dart';


/// 附加参数扩展
class DioPlusOptions {
  /// 设置超时重试次数，当发生以下超时时会触发重试，
  /// [DioExceptionType.sendTimeout]、[DioExceptionType.connectTimeout]、
  /// [DioExceptionType.receiveTimeout]
  ///
  /// 默认: [RetryPolicy.noRetry]，不重试。
  final RetryPolicy retryPolicy;

  /// 缓存策略，缓存策略仅对 `GET` 请求有效，不作用于 `POST`、`DELETE` 等操作，
  ///
  /// 默认: [CachePolicy.noCache]，如果服务器响应头存在 `Cache-Control` 则遵从服务器策略。
  final CachePolicy cachePolicy;

  /// 初始化
  DioPlusOptions({
    this.retryPolicy = const RetryPolicy.noRetry(),
    this.cachePolicy = const CachePolicy.noCache(),
  });
}

/// 重试策略
class RetryPolicy {
  /// 重试次数。
  ///
  /// 默认: `0`，不重试。为负数时，无限重试。
  final int count;

  /// 重试等待初始间隔，[initDelay] 与 [increment] 的和不得低于 [_minDelay] 秒。
  final Duration initDelay;

  /// 每次重试增量
  /// 重试等待实际时间为第 n 次重试间隔为 n * increment + initDelay，n 从 0 开始
  final Duration increment;

  /// 支付场景 API  默认重试机制
  static const defaultInAppRetry = RetryPolicy.retry(count: 2, initDelay: Duration(seconds: 1));

  /// 绘制、提交场景 API  默认重试机制
  static const defaultCommitRetry = RetryPolicy.retry(count: 2, initDelay: Duration(seconds: 3));

  /// 不重试
  const RetryPolicy.noRetry()
      : count = 0,
        initDelay = Duration.zero,
        increment = Duration.zero;

  /// 初始化
  const RetryPolicy(
      this.count, {
        this.initDelay = const Duration(seconds: 3),
        this.increment = Duration.zero,
      });

  /// 初始化
  const RetryPolicy.retry({
    this.count = 2,
    this.initDelay = const Duration(seconds: 3),
    this.increment = Duration.zero,
  });

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! RetryPolicy) return false;
    if (runtimeType != other.runtimeType) return false;
    if (count == 0 && other.count == 0) return true;
    return count == other.count && initDelay == other.initDelay && increment == other.increment;
  }

  @override
  int get hashCode => Object.hash(count, initDelay, increment);
}

/// 缓存模式
enum CacheMode {
  /// 不启用缓存
  noCache,

  /// 每次都请求服务端最新的数据，根据策略决定是否缓存，
  /// 如果请求失败，缓存可用，未过期，则使用缓存
  refresh,

  /// 如果可用，未过期，则使用缓存
  cache,
}

/// 缓存策略
class CachePolicy {
  /// 缓存模式，受 [force] 影响
  final CacheMode mode;

  /// 最大缓存生命周期，单位秒。
  /// 仅在缓存策略生效时有效。
  final int maxAge;

  /// 此选项关闭时，如果服务器响应头存在 `Cache-Control` 则遵从服务器策略。
  /// 该选项会覆盖服务器对缓存的控制策略
  final bool force;

  /// 是否允许存储在磁盘中，否则存储在内存中，目前不开放此选项赋值
  final bool store;

  /// 不缓存缓存策略
  const CachePolicy.noCache({this.force = false})
      : mode = CacheMode.noCache,
        maxAge = 0,
        store = false;

  /// 缓存缓存策略
  const CachePolicy.cache({
    required this.mode,
    this.force = false,
    this.maxAge = 3600,
  })  : store = true,
        assert(maxAge > 0 && mode != CacheMode.noCache);

  /// 构造
  const CachePolicy({
    required this.mode,
    this.maxAge = 3600,
    this.force = false,
  })  : store = mode != CacheMode.noCache,
        assert((maxAge > 0 && mode != CacheMode.noCache) || (maxAge == 0 && mode == CacheMode.noCache));

  /// 创建拦截器
  static Interceptor createInterceptor() {
    return dio.DioCacheInterceptor(options: _defaultCacheOptions);
  }

  /// 默认缓存拦截器参数
  static dio.CacheOptions get _defaultCacheOptions {
    _default ??= dio.CacheOptions(
      policy: dio.CachePolicy.noCache,
      hitCacheOnErrorCodes: const [401, 405], // 不命中 401、405
      store: FileCacheStore(Paths.dioCacheDirectory.path),
      allowPostMethod: false, //  不允许缓存 POST 接口
    );
    return _default!;
  }

  /// 置放到参数中
  void _intoOptions(Options ops) {
    ops.extra ??= {};

    final cacheOps = _defaultCacheOptions;
    Map<String, dynamic> extra;

    switch (mode) {
      case CacheMode.refresh:
        extra = cacheOps
            .copyWith(
          policy: force ? dio.CachePolicy.refreshForceCache : dio.CachePolicy.refresh,
          maxStale: maxAge == 0 ? null : Duration(seconds: maxAge),
        )
            .toExtra();
        break;

      case CacheMode.cache:
        extra = cacheOps
            .copyWith(
          policy: force ? dio.CachePolicy.forceCache : dio.CachePolicy.request,
          maxStale: maxAge == 0 ? null : Duration(seconds: maxAge),
        )
            .toExtra();
        break;

      case CacheMode.noCache:
        extra = cacheOps.toExtra();
        break;
    }

    return ops.extra!.addAll(extra);
  }

  ///#region 内部属性

  static dio.CacheOptions? _default;

///#endregion
}

extension DioExt on Dio {
  /// 发送 post 请求
  Future<Response<T>> postPlus<T>(
      String path, {
        Object? data,
        Map<String, dynamic>? queryParameters,
        Options? options,
        DioPlusOptions? plusOptions,
        CancelToken? cancelToken,
        ProgressCallback? onSendProgress,
        ProgressCallback? onReceiveProgress,
      }) {
    options ??= Options();
    final po = _inject(options, plusOptions, 'POST');
    return _tryRetryRequest(
      po.retryPolicy,
      path,
      data: data,
      queryParameters: queryParameters,
      options: options,
      cancelToken: cancelToken,
    );
  }

  /// 发送 get 请求
  Future<Response<T>> getPlus<T>(
      String path, {
        Object? data,
        Map<String, dynamic>? queryParameters,
        Options? options,
        DioPlusOptions? plusOptions,
        CancelToken? cancelToken,
      }) {
    options ??= Options();
    final po = _inject(options, plusOptions, 'GET');
    return _tryRetryRequest(
      po.retryPolicy,
      path,
      data: data,
      queryParameters: queryParameters,
      options: options,
      cancelToken: cancelToken,
    );
  }

  /// 发送 delete 请求
  Future<Response<T>> deletePlus<T>(
      String path, {
        Object? data,
        Map<String, dynamic>? queryParameters,
        Options? options,
        DioPlusOptions? plusOptions,
        CancelToken? cancelToken,
      }) {
    options ??= Options();
    final po = _inject(options, plusOptions, 'DELETE');
    return _tryRetryRequest(
      po.retryPolicy,
      path,
      data: data,
      queryParameters: queryParameters,
      options: options,
      cancelToken: cancelToken,
    );
  }

  /// 发送 put 请求
  Future<Response<T>> putPlus<T>(
      String path, {
        Object? data,
        Map<String, dynamic>? queryParameters,
        Options? options,
        DioPlusOptions? plusOptions,
        CancelToken? cancelToken,
      }) {
    options ??= Options();
    final po = _inject(options, plusOptions, 'PUT');
    return _tryRetryRequest(
      po.retryPolicy,
      path,
      data: data,
      queryParameters: queryParameters,
      options: options,
      cancelToken: cancelToken,
    );
  }

  /// 注入参数
  static DioPlusOptions _inject(Options options, DioPlusOptions? plusOptions, String method) {
    plusOptions ??= DioPlusOptions();
    options.extra ??= <String, dynamic>{};
    options.method = method;
    plusOptions.cachePolicy._intoOptions(options);
    return plusOptions;
  }

  /// 引入重试机制
  Future<Response<T>> _tryRetryRequest<T>(
      RetryPolicy policy,
      String path, {
        Object? data,
        Map<String, dynamic>? queryParameters,
        Options? options,
        CancelToken? cancelToken,
        ProgressCallback? onSendProgress,
        ProgressCallback? onReceiveProgress,
      }) async {
    if (policy.count == 0) {
      return request(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
        cancelToken: cancelToken,
      );
    }
    int num = -1;
    int retryCount = policy.count < 0 ? -2 : policy.count;
    while (retryCount != -1) {
      try {
        return await request(
          path,
          data: data,
          queryParameters: queryParameters,
          options: options,
          cancelToken: cancelToken,
          onSendProgress: onSendProgress,
          onReceiveProgress: onReceiveProgress,
        );
      } on DioException catch (err) {
        if (cancelToken?.isCancelled == true) rethrow;

        if (err.type == DioExceptionType.sendTimeout ||
            err.type == DioExceptionType.connectionTimeout ||
            err.type == DioExceptionType.receiveTimeout ||
            err.type == DioExceptionType.connectionError) {
          if (retryCount >= 0) retryCount--;
          if (retryCount == -1) rethrow;

          num++;
          await Future.delayed(policy.initDelay + policy.increment * num);
          if (cancelToken?.isCancelled == true) rethrow;
          continue;
        }
        rethrow;
      }
    }

    throw const IllegalStateException();
  }
}
