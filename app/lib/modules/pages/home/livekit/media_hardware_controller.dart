import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:livekit_client/livekit_client.dart';
import 'package:rive_rolls_collection/common.dart';

import '../../../../service/hardware/hard_ware_initializer.dart';
import '../provider/main_provider.dart';
import '../widget/camera_action_button.dart';
import 'live_kit_room_service.dart';

/// 硬件控制（camera / mic 操作分发）
class MediaHardwareController {
  final Ref ref;
  final LiveKitRoomService roomService;

  MediaHardwareController(this.ref, this.roomService);

  Room get _room => roomService.room;

  /// 相机操作事件分发
  Future<void> onActionEvent(CameraActionType type) async {
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

  /// 拍照 - 保存到本地（上传链路由外部处理）
  Future<void> takePhoto() async {
    final savePath = await HardWareInitializer.instance.takePhoto();
    if (savePath == null || savePath.isEmpty) return;
    logi('[MediaHW] takePhoto: saved to $savePath');
    ref.read(captureImageProvider.notifier).add(savePath);
  }

  /// 切换摄像头
  Future<void> toggleCamera() async {
    final isFront = ref.read(onSwitchCameraProvider);

    final result = await HardWareInitializer.instance.toggleCamera(!isFront, roomService.isConnected);
    if (result) {
      ref.read(onSwitchCameraProvider.notifier).state = !isFront;
    }
  }

  /// 切换静音模式
  Future<void> toggleMute() async {
    final isMute = ref.read(muteProvider);
    _room.localParticipant?.setMicrophoneEnabled(isMute);
    ref.read(muteProvider.notifier).state = !isMute;
  }

  /// 连接成功后同步 mic 状态（静音时关闭采集，未静音时开启）
  void syncMicState() {
    final isMute = ref.read(muteProvider);
    _room.localParticipant?.setMicrophoneEnabled(!isMute);
  }
}
