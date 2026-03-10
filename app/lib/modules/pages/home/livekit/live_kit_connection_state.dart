import 'package:flutter/material.dart';

import '../../../../common/extension/ui_ext.dart';

/// LiveKit 连接状态枚举
enum LiveKitConnectionState {
  /// 初始态
  idle,

  /// 等待前置条件（camera + auth）
  waitingPrerequisites,

  /// 正在连接房间
  connecting,

  /// 房间连接成功，等待判断 Gateway
  connected,

  /// 失败
  failed;

  /// 可连接状态
  bool get ready => this == LiveKitConnectionState.idle || this == LiveKitConnectionState.waitingPrerequisites;

  /// liveKit连接
  bool get isConnected => this == LiveKitConnectionState.connected;

  /// 获取状态Title
  String getTitle() {
    return switch (this) {
      LiveKitConnectionState.connected => "LIVE",
      LiveKitConnectionState.failed => "OFFLINE",
      _ => 'LINKING',
    };
  }

  /// Widget图标
  Widget getIcon() {
    return switch (this) {
      LiveKitConnectionState.connected => Icon(Icons.wifi, color: Colors.white, size: 14.dpx),
      LiveKitConnectionState.failed => Icon(Icons.wifi_off, color: Colors.white, size: 14.dpx),
      _ => SizedBox(
        width: 10.dpx,
        height: 10.dpx,
        child: CircularProgressIndicator(color: Colors.white.withValues(alpha: 0.6), strokeWidth: 2.dpx),
      ),
    };
  }
}
