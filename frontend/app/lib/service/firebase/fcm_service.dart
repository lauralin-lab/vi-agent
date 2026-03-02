import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:rive_rolls_collection/logging/logger.dart';

/// 后台消息处理
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  logi('[FCM] 后台收到消息: ${message.messageId}');
  logi('[FCM] data: ${message.data}');
}

/// Firebase Cloud Messaging 消息接收服务
class FCMService {
  const FCMService._();

  /// 初始化 FCM 消息监听
  static Future<void> initialize() async {
    // 注册后台消息处理
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

    // iOS 前台通知展示选项（显示横幅、角标、声音）
    if (Platform.isIOS) {
      await FirebaseMessaging.instance.setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );
    }

    // 前台消息监听
    FirebaseMessaging.onMessage.listen(_onForegroundMessage);

    // 用户点击通知打开应用（后台 → 前台）
    FirebaseMessaging.onMessageOpenedApp.listen(_onMessageOpenedApp);

    // 冷启动：应用从关闭状态被通知打开
    final initialMessage = await FirebaseMessaging.instance.getInitialMessage();
    if (initialMessage != null) {
      _onMessageOpenedApp(initialMessage);
    }

    logi('[FCM] 消息监听已注册');
  }

  /// 前台收到消息
  static void _onForegroundMessage(RemoteMessage message) {
    logi('[FCM] 前台收到消息: ${message.messageId}');
    logi('[FCM] title: ${message.notification?.title}');
    logi('[FCM] body: ${message.notification?.body}');
    logi('[FCM] data: ${message.data}');

    // TODO: 根据业务需求处理前台消息
    // 例如：显示 Toast、更新未读数、刷新列表等
  }

  /// 用户点击通知打开应用
  static void _onMessageOpenedApp(RemoteMessage message) {
    logi('[FCM] 用户点击通知: ${message.messageId}');
    logi('[FCM] data: ${message.data}');

    // TODO: 根据 message.data 中的路由信息跳转到对应页面
    // 示例：
    // final route = message.data['route'];
    // if (route != null) {
    //   App().router.push(route);
    // }
  }
}
