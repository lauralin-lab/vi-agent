import 'dart:io';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:rive_rolls_collection/logging/logger.dart';
import '../../app.dart';
import '../../configs/constans.dart';
import '../../modules/pages/album/album_picker.dart';
import '../../modules/widgets/loading_dialog.dart';
import '../extension/user_help_type.dart';
import 'image_crop.dart';

class PhotoUtils {
  Future<PhotoPickerArgs?> pickerPhoto(
    BuildContext context,
  ) async {
    VoidCallback? dismiss;

    var (permission, status) = await _requestPermissionState();
    if (!context.mounted) return null;

    // 请求权限
    if (!status.isGranted && UserHelpType.accessMediaTip.enable) {
      UserHelpType.accessMediaTip.enable = false;
      // 禁止对话框，直接获取权限
      status = await _requestPermission(permission);
    }

    if (!context.mounted) return null;
    File file;
    File? videoFile;
    int duration = 0;
    if (status.isGranted || status.isLimited) {
      // 成功拉起相册界面(自定义相册)
      final meta = await AlbumPicker.pickImage(context);
      HapticFeedback.lightImpact();
      if (meta == null) return null;
      file = meta.file;
      videoFile = meta.videoFile;
      duration = meta.duration;
    } else {
      final meta = await PermissionlessAlbumPicker.pickImage(context);
      HapticFeedback.lightImpact();
      if (meta == null) return null;
      file = meta.file;
      videoFile = meta.videoFile;
    }

    if (!context.mounted) return null;

    try {
      dismiss = LoadingDialog.show(context);
      final (current, image) = await PickerExt.filter(file);
      final args = PhotoPickerArgs(
        current,
        PhotoArgs(width: image.width, height: image.height),
        videoFile: videoFile,
        duration: duration,
      );
      image.dispose();
      if (!context.mounted) return null;
      logi("选择图片信息：$args");
      return args;
    } catch (e, st) {
      logw(e, stackTrace: isDebugMode ? st : null);
      return null;
    } finally {
      dismiss?.call();
    }
  }
}

/// 首次启动时请求权限
Future<void> requestPermissionForFirstStartup() async {
  if (!App().preferences.firstStartup) return;
  if (!Platform.isAndroid) return;
  var (permission, status) = await _requestPermissionState();
  if (status.isGranted) return;
  await _requestPermission(permission);
}

/// 限制权限管理按钮点击事件
Future<PermissionStatus> _requestPermission(Permission permission) async {
  var status = await permission.status;
  if (status.isGranted) return status;
  if (status.isPermanentlyDenied) {
    await openAppSettings();
    return PermissionStatus.denied;
  }
  return await permission.request();
}

/// 获取当前权限状态
Future<(Permission, PermissionStatus)> _requestPermissionState() async {
  final permission = await _chosePermission();
  return (permission, await permission.status);
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