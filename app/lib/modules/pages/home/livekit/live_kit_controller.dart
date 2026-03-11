import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:livekit_client/livekit_client.dart';
import 'package:rive_rolls_collection/common.dart';

import '../../../../app.dart';
import '../../../../service/global_provider.dart';
import '../../../../service/network/api_service.dart';
import '../../../models/live_kit_action_model.dart';
import '../../../models/room_info.dart';
import '../provider/main_provider.dart';
import '../widget/camera_action_button.dart';
import 'live_kit_connection_state.dart';
import 'live_kit_room_service.dart';
import 'media_hardware_controller.dart';

/// liveKit 控制器定义
final liveKitControllerProvider = Provider<LiveKitController>(
  (ref) => LiveKitController(ref),
  name: 'liveKitControllerProvider',
);

/// LiveKitController — Facade 层
///
/// 职责：
///   1. 状态机：idle → waitingPrerequisites → connecting → connected / failed（可重试）
///   2. 前置条件监听（camera + auth）→ 自动触发连接
///   3. Room 事件处理（断线重连 + agent 消息解析）
///   4. 硬件操作委派给 MediaHardwareController
class LiveKitController {
  final Ref ref;

  LiveKitController(this.ref);

  /// Agent 回复消息流（broadcast，允许多个监听者）
  final StreamController<String> agentRecorder = StreamController<String>.broadcast();

  /// SSE 事件流（broadcast，允许多个监听者）
  final StreamController<SseEvent> sseEventStream = StreamController<SseEvent>.broadcast();

  /// 当前连接状态（内部同步读取，UI 通过 connectionStatusProvider 异步消费）
  LiveKitConnectionState _state = LiveKitConnectionState.idle;

  LiveKitConnectionState get state => _state;

  /// 缓存的房间信息（只获取一次，断线重连复用）
  RoomInfo? _roomInfo;

  /// 连接重入保护
  bool _isConnecting = false;

  /// Room 事件订阅取消函数
  CancelListenFunc? _cancelRoomListen;

  /// SSE 订阅与重连状态
  StreamSubscription<SseEvent>? _sseSubscription;
  Timer? _sseReconnectTimer;
  int _sseReconnectAttempt = 0;
  bool _sseConnected = false;

  /// 子模块
  late final LiveKitRoomService _roomService = LiveKitRoomService();
  late final MediaHardwareController _mediaController = MediaHardwareController(ref, _roomService);

  /// 房间是否连接成功
  bool get isConnected => _roomService.isConnected;

  /// SSE 是否连接
  bool get isSseConnected => _sseConnected;

  // ---------------------------------------------------------------------------
  // 生命周期
  // ---------------------------------------------------------------------------

  /// 初始化
  void init() {
    _listenRoomEvents();

    // 初始状态：等待前置条件
    _transitionTo(LiveKitConnectionState.waitingPrerequisites);
    _listenPrerequisites();
  }

  /// 释放资源
  Future<void> dispose() async {
    _cancelRoomListen?.call();
    _cancelRoomListen = null;
    _disposeSse();
    await _roomService.dispose();
    await agentRecorder.close();
    await sseEventStream.close();
  }

  // ---------------------------------------------------------------------------
  // 前置条件
  // ---------------------------------------------------------------------------

  /// 监听前置条件
  void _listenPrerequisites() {
    // camera 初始化
    ref.listen(onInitCameraProvider, (_, next) {
      if (next.value == true) {
        _evaluateState();
      }
    });

    // auth 状态监听 → 成功获取 token，失败则标记 failed
    ref.listen(onAuthChangedProvider, (_, next) {
      next.when(
        data: (authInfo) {
          if (!authInfo.logged) {
            // Firebase 认证失败或用户未登录
            loge('[LiveKit] Auth not logged in, marking failed');
            _transitionTo(LiveKitConnectionState.failed);
            return;
          }
          if (authInfo.self != null) {
            // 认证成功 + 用户信息已加载 → 获取房间 token + 启动 SSE
            _fetchRoomInfoIfNeeded();
            _connectSseIfNeeded(authInfo.self!.uuid);
          }
        },
        error: (err, _) {
          loge('[LiveKit] Auth provider error: $err');
          _transitionTo(LiveKitConnectionState.failed);
        },
        loading: () {
          // 仍在加载，不做任何操作
        },
      );
    });

    // 监听用户查询失败（userCompleter 异常完成时标记 failed）
    App().auth.userCompleter.future.then((_) {
      // 用户查询成功，不需要额外处理（auth stream 会发出带 self 的 AuthInfo）
    }).catchError((err) {
      loge('[LiveKit] User query failed: $err');
      _transitionTo(LiveKitConnectionState.failed);
    });
  }

  /// 获取房间信息（只获取一次，缓存复用）
  Future<void> _fetchRoomInfoIfNeeded() async {
    if (_roomInfo != null) {
      _evaluateState();
      return;
    }
    try {
      _roomInfo = await ApiService.requestRoomInfo();
      _evaluateState();
    } catch (e) {
      _transitionTo(LiveKitConnectionState.failed);
      loge('[LiveKit] Failed to fetch RoomInfo: $e');
    }
  }

  // ---------------------------------------------------------------------------
  // 状态机
  // ---------------------------------------------------------------------------

  /// 状态机核心：根据当前 state + 条件决定下一步
  Future<void> _evaluateState() async {
    if (_state.canAttemptConnect && _roomInfo != null) {
      await _tryConnect();
    }
  }

  /// 尝试连接房间（带重入保护）
  Future<void> _tryConnect() async {
    if (_isConnecting || _state.isConnected) return;
    _isConnecting = true;
    _transitionTo(LiveKitConnectionState.connecting);

    try {
      await _roomService.connect(_roomInfo!);
      if (isConnected) {
        _transitionTo(LiveKitConnectionState.connected);
        _mediaController.syncMicState();
      } else {
        _transitionTo(LiveKitConnectionState.waitingPrerequisites);
      }
    } catch (ex) {
      loge('[LiveKit] Connect error: $ex');
      _transitionTo(LiveKitConnectionState.failed);
    } finally {
      _isConnecting = false;
    }
  }

  /// 状态转换
  void _transitionTo(LiveKitConnectionState newState) {
    if (_state == newState) return;
    _state = newState;
    Future.microtask(() {
      ref.read(connectionStatusProvider.notifier).state = newState;
    });
  }

  // ---------------------------------------------------------------------------
  // Room 事件（直接监听，无回调间接层）
  // ---------------------------------------------------------------------------

  /// 开始监听 Room 事件
  void _listenRoomEvents() {
    _cancelRoomListen?.call();
    _cancelRoomListen = _roomService.room.events.listen(_onRoomEvent);
  }

  /// Room 事件分发
  void _onRoomEvent(dynamic event) {
    if (event is DataReceivedEvent) {
      _handleDataReceived(event);
    } else if (event is RoomReconnectedEvent) {
      logi('[LiveKit] Room reconnected');
      _transitionTo(LiveKitConnectionState.connected);
    } else if (event is RoomDisconnectedEvent) {
      logi('[LiveKit] Room disconnected');
      _transitionTo(LiveKitConnectionState.waitingPrerequisites);
      _evaluateState();
    }
  }

  /// 解析 Agent 数据消息
  void _handleDataReceived(DataReceivedEvent event) {
    final rawMessage = utf8.decode(event.data);
    try {
      final action = LiveKitActionModel.fromXml(rawMessage);
      if (action.tag == LiveKitActionTag.transcript &&
          action.type == LiveKitActionType.agent &&
          action.content.isNotEmpty) {
        agentRecorder.add(action.content);
      }
    } catch (e) {
      loge('[LiveKit] XML parse failed: $e');
    }
  }

  // ---------------------------------------------------------------------------
  // 公开 API
  // ---------------------------------------------------------------------------

  /// 相机操作事件分发
  Future<void> onActionEvent(CameraActionType type) async {
    await _mediaController.onActionEvent(type);
  }

  /// 设置麦克风采集状态
  void setMicrophoneEnabled(bool enabled) {
    _roomService.room.localParticipant?.setMicrophoneEnabled(enabled);
  }

  // ---------------------------------------------------------------------------
  // SSE 事件流（参考前端 useRealtimeEvents）
  // ---------------------------------------------------------------------------

  /// 启动 SSE（仅在未连接时触发）
  void _connectSseIfNeeded(String viUserId) {
    if (_sseConnected || _sseSubscription != null) return;
    _startSse(viUserId);
  }

  /// 连接 SSE 并监听事件
  void _startSse(String viUserId) {
    _sseSubscription?.cancel();
    _sseReconnectTimer?.cancel();

    _sseSubscription = ApiService.connectSSE(viUserId).listen(
      (event) {
        if (!_sseConnected) {
          _sseConnected = true;
          _sseReconnectAttempt = 0;
          logi('[SSE] Connected');
        }
        // heartbeat 不转发
        if (event.event == 'heartbeat') return;
        sseEventStream.add(event);
      },
      onError: (err) {
        loge('[SSE] Error: $err');
        _sseConnected = false;
        _sseSubscription = null;
        _scheduleSseReconnect(viUserId);
      },
      onDone: () {
        logi('[SSE] Connection closed');
        _sseConnected = false;
        _sseSubscription = null;
        _scheduleSseReconnect(viUserId);
      },
      cancelOnError: true,
    );
  }

  /// 指数退避重连（与前端一致，最大 30 秒）
  void _scheduleSseReconnect(String viUserId) {
    _sseReconnectTimer?.cancel();
    final delay = Duration(
      milliseconds: (1000 * (1 << _sseReconnectAttempt)).clamp(1000, 30000),
    );
    logi('[SSE] Reconnecting in ${delay.inSeconds}s (attempt: $_sseReconnectAttempt)');
    _sseReconnectTimer = Timer(delay, () {
      _sseReconnectAttempt++;
      _startSse(viUserId);
    });
  }

  /// 关闭 SSE 连接
  void _disposeSse() {
    _sseSubscription?.cancel();
    _sseSubscription = null;
    _sseReconnectTimer?.cancel();
    _sseReconnectTimer = null;
    _sseConnected = false;
  }
}
