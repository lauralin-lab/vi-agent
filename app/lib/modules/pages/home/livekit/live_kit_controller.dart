import 'dart:async';

import 'package:flutter/material.dart' hide ConnectionState;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:rive_rolls_collection/common.dart';
import '../../../../service/global_provider.dart';
import '../../../../service/network/api_service.dart';
import '../../../models/room_info.dart';
import '../provider/main_provider.dart';
import '../widget/camera_action_button.dart';
import 'live_kit_connection_state.dart';
import 'live_kit_room_service.dart';
import 'live_kit_rpc_handler.dart';
import 'media_hardware_controller.dart';
import 'room_event_handler.dart';
export 'live_kit_rpc_handler.dart';

/// liveKit 控制器定义
final liveKitControllerProvider = Provider<LiveKitController>(
  (ref) => LiveKitController(ref),
  name: 'liveKitControllerProvider',
);

/// LiveKitController — Facade 层
class LiveKitController {
  final Ref ref;

  LiveKitController(this.ref);

  /// Agent 回复消息流（broadcast，允许多个监听者）
  final StreamController<String> agentRecorder = StreamController<String>.broadcast();

  /// 当前连接状态
  LiveKitConnectionState _state = LiveKitConnectionState.idle;

  LiveKitConnectionState get state => _state;

  /// 缓存的房间信息（只获取一次，断线重连复用）
  RoomInfo? _roomInfo;

  /// 子模块
  late final LiveKitRoomService _roomService = LiveKitRoomService();
  late final MediaHardwareController _mediaController = MediaHardwareController(ref, _roomService);
  late final LiveKitRpcHandler _rpcHandler = LiveKitRpcHandler(ref, _roomService, _mediaController);
  late final RoomEventHandler _eventHandler = RoomEventHandler(ref, _roomService, agentRecorder);

  /// 房间是否连接成功
  bool get isConnected => _roomService.isConnected;

  /// 初始化
  void init() {
    // 注册断线、重连回调
    _registerRoomCallbacks();

    // 监听房间事件
    _eventHandler.listen();
    // 注册Rpc
    _rpcHandler.registerServerRpc();

    // liveKit 状态变更
    _transitionTo(LiveKitConnectionState.idle);
    _listenPrerequisites();
  }

  /// 注册 room 回调
  void _registerRoomCallbacks() {
    _eventHandler.onReconnected = () {
      logi('[LiveKitController] Room reconnected');
      _transitionTo(LiveKitConnectionState.connected);
    };
    _eventHandler.onDisconnected = () {
      logi('[LiveKitController] Room disconnected');
      _transitionTo(LiveKitConnectionState.waitingPrerequisites);
      _evaluateState();
    };
  }

  /// 释放资源
  Future<void> dispose() async {
    _eventHandler.dispose();
    await _roomService.dispose();
    await agentRecorder.close();
  }

  /// 监听前置条件
  void _listenPrerequisites() {
    // camera 初始化
    ref.listen(onInitCameraProvider, (_, next) {
      if (next.value == true) {
        _evaluateState();
      }
    });

    // auth 就绪 → 获取 token（仅一次）
    ref.listen(onAuthChangedProvider, (_, next) {
      final resp = next.maybeWhen(data: (value) => value, orElse: () => null);
      if (resp != null && resp.self != null) {
        _fetchRoomInfoIfNeeded();
      }
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
      loge('[LiveKitController] Failed to fetch RoomInfo: $e');
    }
  }

  /// 状态机核心：根据当前 state + 条件决定下一步
  Future<void> _evaluateState() async {
    switch (_state) {
      case LiveKitConnectionState.idle:
      case LiveKitConnectionState.waitingPrerequisites:
        if (_roomInfo != null) {
          await _tryConnect();
        }
      default:
        break;
    }
  }

  /// 尝试连接房间
  Future<void> _tryConnect() async {
    if (_state.isConnected) return;

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
      loge('[LiveKitController] Connect error: $ex');
      _transitionTo(LiveKitConnectionState.failed);
    }
  }

  /// 状态转换
  void _transitionTo(LiveKitConnectionState newState) {
    if (_state == newState) return;
    _state = newState;
    // 用 microTask 延迟，避免在 initState/build 阶段同步修改 provider
    Future.microtask(() {
      ref.read(connectionStatusProvider.notifier).state = newState;
    });
  }

  /// 相机操作事件分发
  Future<void> onActionEvent(BuildContext context, CameraActionType type) async {
    await _mediaController.onActionEvent(context, type);
  }

  /// 设置麦克风采集状态
  void setMicrophoneEnabled(bool enabled) {
    _roomService.room.localParticipant?.setMicrophoneEnabled(enabled);
  }

  /// 上传文件并发送给 GateWay
  void uploadAndSendToGateWay(String filePath) {
    _mediaController.uploadAndSendToGateWay(filePath);
  }

  /// 请求 Action Card
  void requestActionCard() {
    logi('[LiveKitController] requestActionCard');
    _rpcHandler.app2ServerRpc(App2ServerRpcType.requestActionCard, '{}');
  }
}
