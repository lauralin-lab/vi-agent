import 'dart:async';
import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:livekit_client/livekit_client.dart';
import 'package:rive_rolls_collection/common.dart';

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
            logd('[RoomEvent] infoBar status=${actionMessage.status.name} (ignored)');
            break;
          case LiveKitActionTag.transcript:
            if (actionMessage.type == LiveKitActionType.agent) {
              if (actionMessage.content.isNotEmpty) {
                final c = actionMessage.content;
                final preview = c.length > 80 ? '${c.substring(0, 80)}...' : c;
                logi('[RoomEvent] transcript(agent): "$preview"');
                agentRecorder.add(c);
              }
            } else {
              logd('[RoomEvent] transcript(${actionMessage.type.name}): len=${actionMessage.content.length}');
            }
            break;
          case LiveKitActionTag.taskState:
            logd('[RoomEvent] taskState status=${actionMessage.status.name}, contentLen=${actionMessage.content.length}');
            break;
          case LiveKitActionTag.unknown:
            final rawPreview = rawMessage.length > 100 ? '${rawMessage.substring(0, 100)}...' : rawMessage;
            logw('[RoomEvent] unknown tag received: raw="$rawPreview"');
            break;
        }
      } catch (e) {
        final rawPreview = rawMessage.length > 100 ? '${rawMessage.substring(0, 100)}...' : rawMessage;
        loge('[RoomEvent] XML parse failed: $e, raw="$rawPreview"');
      }
    } else if (event is RoomReconnectedEvent) {
      logi('[RoomEvent] Room reconnected');
      onReconnected?.call();
    } else if (event is RoomDisconnectedEvent) {
      logi('[RoomEvent] Room disconnected: reason=${event.reason}');
      onDisconnected?.call();
    } else {
      logd('[RoomEvent] event=${event.runtimeType}, participants=${_room.remoteParticipants.length + 1}');
      _room.remoteParticipants.forEach((identity, participant) {
        logd('[RoomEvent]   remote: ${participant.identity}');
      });
    }
  }
}
