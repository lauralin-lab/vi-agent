import 'dart:io';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:rive_rolls_collection/logging/logger.dart';

class PermissionUtil {
  /// 获取当前权限状态
  Future<(Permission, PermissionStatus)> requestPermissionState() async {
    final permission = await _chosePermission();
    return (permission, await permission.status);
  }

  /// 限制权限管理按钮点击事件
  Future<PermissionStatus> requestPermission(Permission permission) async {
    var status = await permission.status;
    if (status.isGranted) return status;
    if (status.isPermanentlyDenied) {
      await openAppSettings();
      return PermissionStatus.denied;
    }
    return await permission.request();
  }

  /// 选择需要的权限
  Future<Permission> _chosePermission() async {
    if (Platform.isAndroid) {
      try {
        final sdkInt = (await DeviceInfoPlugin().androidInfo).version.sdkInt;
        if (sdkInt <= 32) return Permission.storage;
      } catch (ex) {
        loge(ex);
      }
    }
    return Permission.photos;
  }
}
