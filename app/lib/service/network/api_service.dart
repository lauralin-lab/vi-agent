import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:dio/dio.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:rive_rolls_collection/common.dart';
import '../../app.dart';
import '../../common/network/dio.dart';
import '../../common/network/dio_plus.dart';
import '../../configs/constans.dart';
import '../../modules/models/gcs_sign_model.dart';
import '../../modules/models/nano_claw_rep.dart';
import '../../modules/models/room_info.dart';
import '../../modules/models/user_profile.dart';

/// SSE 事件模型
class SseEvent {
  final String event;
  final String data;

  const SseEvent({required this.event, required this.data});

  @override
  String toString() => 'SseEvent(event: $event, data: $data)';
}

base class ApiService {
  const ApiService._();

  //////////////////////////////////////////////////////////////////////////////
  ///#region SSE 事件流
  /// 连接 SSE 事件流
  ///
  /// 对应前端 `useRealtimeEvents` hook: `GET /api/users/events?vi_user_id={uuid}`
  /// 返回解析后的 [SseEvent] 流，调用方负责重连和生命周期管理。
  static Stream<SseEvent> connectSSE(String viUserId) async* {
    final response = await appDio.get<ResponseBody>(
      '/users/events',
      queryParameters: {'vi_user_id': viUserId},
      options: Options(
        responseType: ResponseType.stream,
        headers: {'Accept': 'text/event-stream', 'Cache-Control': 'no-cache'},
        // SSE 是长连接，不设超时
        receiveTimeout: Duration.zero,
      ),
    );

    final stream = response.data!.stream;
    String buffer = '';
    String currentEvent = 'message';
    String currentData = '';

    await for (final chunk in stream) {
      buffer += utf8.decode(chunk);

      // 按行拆分，SSE 以 \n\n 分隔事件
      while (buffer.contains('\n')) {
        final lineEnd = buffer.indexOf('\n');
        final line = buffer.substring(0, lineEnd).trimRight();
        buffer = buffer.substring(lineEnd + 1);

        if (line.isEmpty) {
          // 空行 = 事件结束，发射
          if (currentData.isNotEmpty) {
            yield SseEvent(event: currentEvent, data: currentData);
          }
          currentEvent = 'message';
          currentData = '';
        } else if (line.startsWith('event:')) {
          currentEvent = line.substring(6).trim();
        } else if (line.startsWith('data:')) {
          currentData = line.substring(5).trim();
        }
        // 忽略 id:, retry:, 注释 (:) 等
      }
    }
  }

  ///#endregion
  ///////////////////////////////////////////////////////////////////////////////
  /// region LiveKit---Session相关
  static Future<RoomInfo> requestRoomInfo({RetryPolicy retryPolicy = RetryPolicy.defaultInAppRetry}) async {
    final resp = await appDio.postPlus(
      '/livekit/token',
      data: {},
      plusOptions: DioPlusOptions(retryPolicy: retryPolicy),
    );

    return RoomInfo.fromJson(resp.data);
  }

  /// 上传文件使用GCS --- 支持多图上传
  static Future<List<String>> uploadFiles(List<String> filePaths, {String? ext}) async {
    final futures = filePaths.map((path) async {
      try {
        // 文件
        final file = File(path);
        final bytes = await file.readAsBytes();
        final fileExt = ext ?? path.split('.').last.toLowerCase();
        // 获取签名信息
        final signInfo = await getUploadFileSignature(ext: fileExt, size: bytes.length);
        final uploadDio = Dio();
        // 重试机制
        const maxRetries = 3;
        for (int attempt = 0; attempt < maxRetries; attempt++) {
          try {
            await uploadDio.put(
              signInfo.presignedUrl,
              data: Stream.fromIterable([bytes]),
              options: Options(
                headers: {
                  'Content-Type': signInfo.contentType,
                  'Content-Length': bytes.length,
                },
                sendTimeout: const Duration(seconds: 60),
                receiveTimeout: const Duration(seconds: 30),
              ),
            );
            return signInfo.publicUrl;
          } on DioException {
            if (attempt == maxRetries - 1) rethrow;
            await Future.delayed(Duration(seconds: 1 << attempt));
          }
        }
        throw StateError('Upload failed after $maxRetries attempts');
      } catch (e) {
        loge('[S3] Upload failed for $path: $e');
        return null;
      }
    }).toList();

    final results = await Future.wait(futures);
    return results.whereType<String>().toList();
  }

  /// 获取上传文件的签名
  static Future<GcsSignModel> getUploadFileSignature({String ext = 'jpg', int size = 0}) async {
    final resp = await appDio.getPlus(
      '/upload/presign',
      queryParameters: {'ext': ext, 'size': size},
      plusOptions: DioPlusOptions(retryPolicy: RetryPolicy.defaultInAppRetry),
    );
    return GcsSignModel.fromJson(resp.data as Map<String, dynamic>);
  }

  /// 派发任务执行NanoClaw
  static Future<NanoClawRep> sendNanoClaw({
    required String prompt,
    List<String>? mediaUrls,
    String? sessionId,
    String? skillSlug,
    String priority = 'thorough',
    Map<String, dynamic>? skillParams,
  }) async {
    Map<String, dynamic> params = {
      'prompt': prompt,
      'priority': priority,
      if (mediaUrls != null && mediaUrls.isNotEmpty) 'media_urls': mediaUrls,
      if (sessionId != null) 'session_id': sessionId,
      if (skillSlug != null) 'skill_slug': skillSlug,
      if (skillParams != null) 'params': skillParams,
    };
    final resp = await appDio.post('/users/exec', data: params);

    return NanoClawRep.fromJson(resp.data as Map<String, dynamic>);
  }

  ///#endregion
  //////////////////////////////////////////////////////////////////////////////
  ///#region 用户相关

  /// 创建用户
  static Future<String?> postUserCreate(String idToken, String packageName, {CancelToken? cancelToken}) async {
    final op = Options(headers: {"id-token": idToken, "package-name": packageName});

    final resp = await appDio.postPlus(
      '/auth/firebase',
      cancelToken: cancelToken,
      options: op,
      plusOptions: DioPlusOptions(
        retryPolicy: const RetryPolicy.retry(
          count: 3,
          initDelay: Duration(seconds: 2),
          increment: Duration(seconds: 1),
        ),
      ),
    );

    if (resp.data is String) {
      final uuid = resp.data as String;
      return uuid.length >= 16 ? uuid : null;
    }

    if (resp.data is Map<String, dynamic>) {
      final map = resp.data as Map<String, dynamic>;
      final uuid = map['vi_user_id'] ?? map['user_id'];
      return uuid is String ? uuid : null;
    }
    return null;
  }

  /// 获取用户信息
  static Future<UserProfile> getUserProfile({CancelToken? cancelToken}) async {
    final resp = await appDio.get('/auth/me', cancelToken: cancelToken);
    final map = resp.data as Map<String, dynamic>;
    return UserProfile.fromJson(map);
  }

  ///#endregion
  //////////////////////////////////////////////////////////////////////////////
  ///#region 信息收集

  /// 上报信息,本接口会消耗的错误，请使用返回结果判断是否上报成功
  static Future<bool> reportInfo() async {
    if (!App().auth.logged) return false;
    try {
      final app = App();
      final timezone = DateTime.now().timeZoneOffset.inMinutes;

      final idfv = await _tryOr(() async => (await DeviceInfoPlugin().iosInfo).identifierForVendor);
      final fcmToken = await _tryOr(FirebaseMessaging.instance.getToken);

      final params = {'device_id': app.deviceId, 'timezone': timezone};
      _tryAdd(params, 'device_token', fcmToken);
      _tryAdd(params, 'idfv', idfv);
      // _tryAdd(params, 'timezone', timezone);
      _tryAdd(params, 'version', app.version);

      await appDio.postPlus(
        '/devices',
        data: params,
        plusOptions: DioPlusOptions(retryPolicy: const RetryPolicy.retry(count: 2)),
      );

      return true;
    } catch (ex, st) {
      loge(ex, stackTrace: isDebugMode ? st : null);
      return false;
    }
  }

  ///#endregion
  //////////////////////////////////////////////////////////////////////////////

  /// 忽略错误执行
  static void _tryAdd<T>(Map<String, Object?> params, String key, T? value) {
    if (value == null) return;
    if (value is String && value.isEmpty) return;
    if (value is num && value.isNaN) return;
    params[key] = value;
  }

  /// 如果保存返回 `null`，否则依次从 [func] 或 [or] 中获取
  static FutureOr<T?> _tryOr<T>(FutureOr<T?> Function() func, {T? Function()? or}) async {
    T? result;

    // 从函数中获取结果
    try {
      result = await func();
    } catch (_) {
      // who care?
    }

    // 备用函数中获取
    if (result == null && or != null) {
      try {
        result = or();
      } catch (_) {
        // who care?
      }
    }

    return result;
  }
}
