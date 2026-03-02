import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:convert/convert.dart' show hex;
import 'package:crypto/crypto.dart' as crypto;
import 'package:device_id/device_id.dart';
import 'package:rive_rolls_collection/logging/logger.dart';
import 'package:rive_rolls_collection/misc/initializer.dart';

import '../../app.dart';
import '../../configs/constans.dart';

/// 设备编号兼容
base class DeviceIdCompat {
  /// 请勿直接初始化使用，请在 App 中获取实例设备编号
  DeviceIdCompat._();

  /// 初始化
  static Future _init(void Function(String) setFunc) async {
    // 从缓存中恢复
    final cachedDeviceId = App().preferences.deviceId;
    if (cachedDeviceId != null && cachedDeviceId.isNotEmpty) {
      setFunc(cachedDeviceId);
      if (isDebugMode) logd('Load cached device id: $cachedDeviceId');
      return;
    }

    // 生成设备ID
    final id = await _generateDeviceId();
    setFunc(id);
    await App().preferences.setDeviceId(id);
    if (isDebugMode) logd('Save device id: $id');
  }

  /// 生成设备ID
  static Future<String> _generateDeviceId() async {
    String? deviceId = await DeviceId.getDeviceId(androidFirstUseDrmId: true);

    // 随机设备编号
    if (deviceId == null || deviceId.isEmpty) {
      final fakeDeviceId = _generateRandomDeviceId();
      deviceId = fakeDeviceId;
    }

    // 这里判断 Android 是否为 DRM ID，将 hex 字符串序列化为 bytes
    if (Platform.isAndroid && deviceId.length > 16) {
      try {
        // 这里不允许直接将字符串进行信息摘要，而是将其变成字节数组，避免更多的信息熵损失
        final bytes = hex.decode(deviceId);
        final md5Str = crypto.md5.convert(bytes).toString();
        deviceId = md5Str.substring(8, 8 + 16);
      } catch (_) {
        // 防止 HEX 字符串被注入
        deviceId = _generateRandomDeviceId();
      }
    }

    return deviceId;
  }

  /// 随机生成指定长度的16进制字符串
  static String _generateRandomDeviceId([int length = 16]) {
    final random = Random();
    const availableChars = 'abcdef1234567890';
    return List.generate(
      length,
      (index) => availableChars[random.nextInt(availableChars.length)],
    ).join();
  }
}

/// 设备标识初始化工具
class DeviceIdInitializer extends Initializer {
  const DeviceIdInitializer(super.type, this.setDeviceId);

  final void Function(String) setDeviceId;

  @override
  Future onInit() => DeviceIdCompat._init(setDeviceId);
}
