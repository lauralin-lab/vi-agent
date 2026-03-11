import 'dart:async';
import 'dart:io';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:rive_rolls_collection/common.dart';
import '../../app.dart';
import '../../common/network/dio.dart';
import '../../common/network/dio_plus.dart';
import '../../configs/constans.dart';
import '../../modules/models/room_info.dart';
import '../../modules/models/upload_file_model.dart';
import '../../modules/models/user_profile.dart';

base class ApiService {
  const ApiService._();

  ///////////////////////////////////////////////////////////////////////////////
  /// region LiveKit相关
  /// 获取房间Token和Url
  static Future<RoomInfo> requestRoomInfo({
    RetryPolicy retryPolicy = RetryPolicy.defaultInAppRetry,
  }) async {
    final resp = await appDio.postPlus(
      '/livekit/token',
      data: {},
      plusOptions: DioPlusOptions(retryPolicy: retryPolicy),
    );

    return RoomInfo.fromJson(resp.data);
  }

  /// GateWay拉进房间
  static Future<void> gateWayJoinRequest({required String roomName}) async {
    // 配置跳过 SSL 验证
    (dio.httpClientAdapter as IOHttpClientAdapter).createHttpClient = () {
      return HttpClient()..badCertificateCallback = (cert, host, port) => true;
    };

    final params = {"roomName": roomName};
    await dio.post('/collov/livekit/gateway/join', data: params);
  }

  /// 上传图片文件文件
  static Future<List<String>> uploadFiles(List<String> filePaths) async {
    final formData = FormData.fromMap({
      'files': filePaths.map((path) => MultipartFile.fromFileSync(path)).toList(),
    });

    final resp = await dio.post('/collov/upload_files', data: formData);

    final uploadModel = UploadFileModel.fromJson(resp.data);

    return uploadModel.files?.map((file) => file.url ?? '').toList() ?? [];
  }

  /// 上传单个文件
  static Future<String> uploadSingleFile(String filePath) async {
    final formData = FormData.fromMap({
      'files': [MultipartFile.fromFileSync(filePath)],
    });

    final resp = await dio.post('/collov/upload_file', data: formData);

    final uploadModel = UploadFileModel.fromJson(resp.data);
    final url = uploadModel.file?.url ?? '';
    return url;
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
