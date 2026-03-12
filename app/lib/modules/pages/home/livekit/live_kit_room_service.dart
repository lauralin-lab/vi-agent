import 'package:livekit_client/livekit_client.dart';
import 'package:rive_rolls_collection/common.dart';

import '../../../../common/utils/log_utils.dart';
import '../../../../service/hardware/hard_ware_initializer.dart';
import '../../../models/room_info.dart';
import 'live_kit_config.dart';

/// 房间连接生命周期管理
class LiveKitRoomService {
  /// LiveKit Room
  late final Room room = Room(roomOptions: roomOptions);

  /// 添加标识 --- 内部判断
  bool _isConnecting = false;

  /// 房间是否连接成功
  bool get isConnected => room.connectionState == ConnectionState.connected;

  /// 连接房间（RoomInfo 由外部传入，不再内部请求）
  Future<void> connect(RoomInfo roomInfo) async {
    if (room.connectionState == ConnectionState.connected ||
        room.connectionState == ConnectionState.reconnecting ||
        room.connectionState == ConnectionState.connecting) {
      return;
    }

    if (!HardWareInitializer.instance.isInit) {
      logw('Connect Skipped: Hardware not ready');
      return;
    }

    if (_isConnecting) return;

    _isConnecting = true;

    try {
      await room.prepareConnection(roomInfo.liveKitUrl, roomInfo.token);
      await room.connect(
        roomInfo.liveKitUrl,
        roomInfo.token,
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
