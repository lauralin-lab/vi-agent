import 'package:flutter/material.dart' hide ConnectionState;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:livekit_client/livekit_client.dart';
import 'package:rive_rolls_collection/common.dart';

import '../../../../service/hardware/hard_ware_initializer.dart';
import '../../../../service/network/api_service.dart';

import '../../../widgets/custom_notify_widget.dart';
import '../provider/main_provider.dart';
import '../widget/camera_action_button.dart';
import 'live_kit_room_service.dart';

/// 硬件控制
class MediaHardwareController {
  final Ref ref;
  final LiveKitRoomService roomService;

  MediaHardwareController(this.ref, this.roomService);

  Room get _room => roomService.room;

  /// 相机操作事件分发
  Future<void> onActionEvent(BuildContext context, CameraActionType type) async {
    switch (type) {
      case CameraActionType.capture:
        takePhoto();
        break;
      case CameraActionType.mute:
        toggleMute();
        break;
      case CameraActionType.toggleCamera:
        toggleCamera();
        break;
      case CameraActionType.flash:
        break;
      default:
        break;
    }
  }

  /// 拍照 - 上传 - 发送给GateWay（整条链路异步，不阻塞 UI）
  Future<void> takePhoto() async {
    logi('[MediaHW] takePhoto: capturing...');
    final savePath = await HardWareInitializer.instance.takePhoto();
    if (savePath == null || savePath.isEmpty) {
      logw('[MediaHW] takePhoto: empty path returned');
      return;
    }
    logi('[MediaHW] takePhoto: saved to $savePath');
    ref.read(captureImageProvider.notifier).add(savePath);

    // 上传 + 发送（fire-and-forget）
    uploadAndSendToGateWay(savePath);
  }

  /// 上传文件并发送给 GateWay（fire-and-forget，不阻塞调用方）
  void uploadAndSendToGateWay(String filePath) {
    _uploadAndSend(filePath);
  }

  /// 上传 + 发送链路
  Future<void> _uploadAndSend(String filePath) async {
    final connState = ref.read(connectionStatusProvider);
    if (!connState.isConnected) {
      logi('[MediaHW] _uploadAndSend skipped: state=$connState, gateway not ready');
      return;
    }
    try {
      logi('[MediaHW] uploading: $filePath');
      final url = await ApiService.uploadSingleFile(filePath);
      logi('[MediaHW] uploaded url=$url');

      final message = 'I uploaded an image to workspace:$url';
      await ApiService.sendMessageToGateWay(message);
      logi('[MediaHW] sendMessageToGateWay success');
    } catch (e) {
      customCenterNotify('upload image failed');
      loge('[MediaHW] uploadAndSend error: $e');
    }
  }

  /// 切换摄像头
  Future<void> toggleCamera() async {
    final isFront = ref.read(onSwitchCameraProvider);
    logi('[MediaHW] toggleCamera: ${isFront ? "front→back" : "back→front"}, roomConnected=${roomService.isConnected}');
    final result = await HardWareInitializer.instance.toggleCamera(!isFront, roomService.isConnected);
    if (result) {
      logi('[MediaHW] toggleCamera: success');
      ref.read(onSwitchCameraProvider.notifier).state = !isFront;
    } else {
      logw('[MediaHW] toggleCamera: failed');
    }
  }

  /// 切换静音模式
  Future<void> toggleMute() async {
    final isMute = ref.read(muteProvider);
    logi('[MediaHW] toggleMute: ${isMute ? "muted→unmuted" : "unmuted→muted"}');
    _room.localParticipant?.setMicrophoneEnabled(!isMute);
    ref.read(muteProvider.notifier).state = !isMute;
  }

  /// 连接成功后同步 mic 状态（静音时关闭采集，未静音时开启）
  void syncMicState() {
    final isMute = ref.read(muteProvider);
    logi('[MediaHW] syncMicState: isMute=$isMute');
    _room.localParticipant?.setMicrophoneEnabled(!isMute);
  }
}
