import 'package:livekit_client/livekit_client.dart';
import 'package:rive_rolls_collection/common.dart';

import '../../../../app.dart';
import '../../../../common/utils/log_utils.dart';
import '../../../../service/hardware/hard_ware_initializer.dart';
import '../../../../service/network/api_service.dart';
import '../../../widgets/custom_notify_widget.dart';
import 'live_kit_config.dart';

/// 房间连接生命周期管理
class LiveKitRoomService {
  /// LiveKit Room
  late final Room room = Room(roomOptions: roomOptions);

  /// 添加标识 --- 内部判断
  bool _isConnecting = false;

  /// 房间是否连接成功
  bool get isConnected => room.connectionState == ConnectionState.connected;

  /// 连接房间（单次尝试，重试由上层控制器负责）
  Future<void> connect() async {
    // 存在连接
    if (room.connectionState == ConnectionState.connected ||
        room.connectionState == ConnectionState.reconnecting ||
        room.connectionState == ConnectionState.connecting) {
      return;
    }

    // 检查是否登录
    if (!App().auth.logged || App().auth.currentAuth.self == null) {
      logw('Connect Skipped: Not logged in');
      return;
    }

    // 检查音视频流初始化完成
    if (!HardWareInitializer.instance.isInit) {
      logw('Connect Skipped: Hardware not ready');
      return;
    }

    if (_isConnecting) return;

    _isConnecting = true;

    try {
      await room.prepareConnection('', '');
      await room.connect(
        '',//App().auth.liveKitUrl,
        '',//App().auth.liveKitToken,
        fastConnectOptions: FastConnectOptions(
          microphone: TrackOption(track: HardWareInitializer.instance.audioTrack!),
          camera: TrackOption(track: HardWareInitializer.instance.videoTrack!),
        ),
      );
    } catch (e) {
      Log.d('Connect Room Error: $e');
      rethrow;
    } finally {
      _isConnecting = false;
    }
  }

  /// 释放资源
  Future<void> dispose() async {
    await room.disconnect();
    room.dispose();
  }
}
