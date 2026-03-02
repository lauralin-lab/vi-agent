import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:livekit_client/livekit_client.dart';
import 'package:rive_rolls_collection/common.dart';

import '../../../models/action_card_model.dart';
import '../provider/main_provider.dart';
import 'live_kit_room_service.dart';
import 'media_hardware_controller.dart';

/// RPC 注册 & 发送
class LiveKitRpcHandler {
  final Ref ref;
  final LiveKitRoomService roomService;
  final MediaHardwareController mediaController;

  LiveKitRpcHandler(
    this.ref,
    this.roomService,
    this.mediaController,
  );

  Room get _room => roomService.room;

  /// 注册Server2App Rpc
  Future<void> registerServerRpc() async {
    logi('[RpcHandler] Registering server RPC methods...');

    // 拍照
    _room.registerRpcMethod('rpcB2FTakePhoto', (data) async {
      logi('[RpcHandler] ← rpcB2FTakePhoto received');
      try {
        await mediaController.takePhoto();
        logi('[RpcHandler] → rpcB2FTakePhoto: success');
        return '{"success": true, "message": "处理完成"}';
      } catch (e) {
        loge('[RpcHandler] → rpcB2FTakePhoto error: $e');
        return '{"success": false, "message": "$e"}';
      }
    });

    _room.registerRpcMethod('rpcB2FShowActionCard', (data) async {
      logi('[RpcHandler] ← rpcB2FShowActionCard received: ${data.payload}');

      try {
        final payload = jsonDecode(data.payload) as Map<String, dynamic>;
        final model = ActionCardModel.fromJson(payload);
        logi('[RpcHandler] parsed actionCard: title=${model.title}, options=${model.options}');

        ref.read(actionCardProvider.notifier).state = model;

        logi('[RpcHandler] → rpcB2FShowActionCard: success');
        return '{"success": true, "message": "处理完成"}';
      } catch (e) {
        loge('[RpcHandler] → rpcB2FShowActionCard error: $e');
        return '{"success": false, "message": "$e"}';
      }
    });

    logi('[RpcHandler] All server RPC methods registered');
  }

  /// App2Sever Rpc
  Future<void> app2ServerRpc(App2ServerRpcType type, String payload) async {
    String? pId = '';
    for (var p in _room.remoteParticipants.values) {
      if (p.identity.startsWith('agent-')) {
        pId = p.identity;
      }
    }
    if (pId == null || pId.isEmpty) {
      logw('[RpcHandler] app2ServerRpc: no agent found! participants=${_room.remoteParticipants.keys.toList()}');
      return;
    } else {
      logi('[RpcHandler] → app2ServerRpc: method=${type.method}, agent=$pId, payloadLen=${payload.length}');
    }
    await _room.localParticipant?.performRpc(
      PerformRpcParams(
        destinationIdentity: pId!,
        method: type.method,
        payload: jsonEncode({"text": payload}),
      ),
    );
    logi('[RpcHandler] → app2ServerRpc sent');
  }
}

/// App2Server Rpc 类型
enum App2ServerRpcType {
  /// 发送消息
  sendMessage._(method: 'rpcF2BSendMessage'),

  /// 请求actionCard
  requestActionCard._(method: 'rpcF2BRequestAction');

  const App2ServerRpcType._({required this.method});

  /// 方法名字
  final String method;
}
