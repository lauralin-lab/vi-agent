import 'dart:async';
import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:livekit_client/livekit_client.dart';
import 'package:rive_rolls_collection/common.dart';

import '../../../../common/utils/log_utils.dart';
import '../../../models/live_kit_action_model.dart';
import 'live_kit_room_service.dart';

/// Room 事件监听 & Agent 状态处理
class RoomEventHandler {
  final Ref ref;
  final LiveKitRoomService roomService;

  /// Agent 回复消息流
  final StreamController<String> agentRecorder;

  /// Room 重连成功回调
  void Function()? onReconnected;

  /// Room 断线回调
  void Function()? onDisconnected;

  /// events.listen 返回的取消函数
  CancelListenFunc? _cancelListen;

  RoomEventHandler(this.ref, this.roomService, this.agentRecorder);

  Room get _room => roomService.room;

  /// 开始监听 Room 事件
  void listen() {
    _cancelListen?.call();
    _cancelListen = _room.events.listen(_onRoomListen);
  }

  /// 释放订阅
  void dispose() {
    _cancelListen?.call();
    _cancelListen = null;
  }

  /// 监听Room
  void _onRoomListen(event) {

    // 打印每个远程参与者
    _room.remoteParticipants.forEach((identity, participant) {
      Log.d('远程参与者: ${participant.identity}');
    });

    if (event is DataReceivedEvent) {
      final participant = event.participant;
      final rawMessage = utf8.decode(event.data);
      logd('[RoomEvent] DataReceived from=${participant?.identity ?? "unknown"}, rawLen=${rawMessage.length}');

      try {
        final actionMessage = LiveKitActionModel.fromXml(rawMessage);
        logd(
          '[RoomEvent] parsed: tag=${actionMessage.tag.name}, type=${actionMessage.type.name}, '
          'status=${actionMessage.status.name}, contentLen=${actionMessage.content.length}',
        );

        switch (actionMessage.tag) {
          case LiveKitActionTag.infoBar:
            break;
          case LiveKitActionTag.transcript:
            if (actionMessage.type == LiveKitActionType.agent) {
              if (actionMessage.content.isNotEmpty) {
                final c = actionMessage.content;
                agentRecorder.add(c);
              }
            }
            break;
          case LiveKitActionTag.taskState:
            break;
          case LiveKitActionTag.unknown:
            break;
        }
      } catch (e) {
        loge('[RoomEvent] XML parse failed: $e');
      }
    } else if (event is RoomReconnectedEvent) {
      onReconnected?.call();
    } else if (event is RoomDisconnectedEvent) {
      onDisconnected?.call();
    }
  }
}
