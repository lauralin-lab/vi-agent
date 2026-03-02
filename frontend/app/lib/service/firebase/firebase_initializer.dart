import 'dart:io';

import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:rive_rolls_collection/misc/initializer.dart';

import '../../app.dart';
import '../../configs/constans.dart';
import '../../configs/firebase_options.dart';
import '../network/api_service.dart';
import 'fcm_service.dart';

/// Firebase 初始化
class FirebaseInitializer extends Initializer {
  const FirebaseInitializer(super.type);

  @override
  Future onInit() async {
    // 初始化
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);

    // 启用分析上传
    await FirebaseAnalytics.instance.setConsent(
      adStorageConsentGranted: true,
      analyticsStorageConsentGranted: true,
      adUserDataConsentGranted: true,
      adPersonalizationSignalsConsentGranted: true,
    );

    // 开发模式下禁用崩溃收集
    FirebaseCrashlytics.instance.setCrashlyticsCollectionEnabled(!isDebugMode);

    // push权限
    _handleNotificationPermission();

    // FCM Token 刷新时主动上报
    FirebaseMessaging.instance.onTokenRefresh.listen((event) {
      ApiService.reportInfo();
    });

    // FCM 消息接收监听
    await FCMService.initialize();

    App().auth; // 初始化登录服务
  }

  /// 开启通知（请求通知权限） 请求并上报token
  Future<void> _handleNotificationPermission() async {
    PermissionStatus status;
    // 在iOS平台用开启通知时[Permission]无法准确的获取到最新的状态，使用Firebase请求
    if (Platform.isIOS) {
      var settings = await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      if (settings.authorizationStatus == AuthorizationStatus.authorized) {
        status = PermissionStatus.granted;
      } else {
        status = PermissionStatus.permanentlyDenied;
      }
    } else {
      status = await Permission.notification.request();
    }
  }
}
