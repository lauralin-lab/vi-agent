import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../modules/models/action_card_model.dart';
import '../livekit/live_kit_connection_state.dart';

/// LiveKit 连接状态
final connectionStatusProvider = StateProvider<LiveKitConnectionState>(
  (ref) => LiveKitConnectionState.idle,
  name: 'connectionStatusProvider',
);

/// mute 是否静音 --- 默认为false
final muteProvider = StateProvider.autoDispose<bool>(
  (ref) => false,
  name: 'muteProvider',
);

/// 切换摄像头----false、默认为后摄像头
final onSwitchCameraProvider = StateProvider.autoDispose<bool>(
  (ref) => false,
  name: 'onSwitchCameraProvider',
);

/// Action Card 数据（RPC 下发，含 title + options）
final actionCardProvider = StateProvider<ActionCardModel?>(
  (ref) => null,
  name: 'actionCardProvider',
);

/// 当前拍照的图片
final captureImageProvider = NotifierProvider.autoDispose<CaptureImagesNotifier, List<String>>(
  CaptureImagesNotifier.new,
);

///---------------------------------------stateNotifier-------------------------------------///
/// 当前拍照图片列表的 Notifier
class CaptureImagesNotifier extends AutoDisposeNotifier<List<String>> {
  @override
  List<String> build() => [];

  void add(String path) {
    state = [...state, path];
  }

  void remove(int index) {
    state = [...state]..removeAt(index);
  }

  void clear() {
    state = [];
  }
}
