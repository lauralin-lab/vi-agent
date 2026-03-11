import 'package:flutter/material.dart';

import '../../../../common/extension/ui_ext.dart';
import '../livekit/live_kit_connection_state.dart';

/// LiveKitConnectionState → UI 映射
///
/// 将连接状态的视觉表示从枚举中分离出来，遵循单一职责原则。
extension ConnectionStateUI on LiveKitConnectionState {
  /// 状态指示器图标
  Widget get icon {
    return switch (this) {
      LiveKitConnectionState.connected => Container(
        width: 8.dpx,
        height: 8.dpx,
        decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0xFF4ADE80)),
      ),
      LiveKitConnectionState.failed => Container(
        width: 8.dpx,
        height: 8.dpx,
        decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0x99F87171)),
      ),
      _ => SizedBox(
        width: 8.dpx,
        height: 8.dpx,
        child: CircularProgressIndicator(color: const Color(0xFF60A5FA), strokeWidth: 2.dpx),
      ),
    };
  }

  /// 状态文字
  String get statusText {
    return switch (this) {
      LiveKitConnectionState.connected => "LIVE",
      LiveKitConnectionState.failed => "OFFLINE",
      _ => 'CONNECTING',
    };
  }

  /// 标题颜色
  Color get titleColor {
    return switch (this) {
      LiveKitConnectionState.connected => Colors.green.withValues(alpha: 0.8),
      LiveKitConnectionState.failed => Colors.red.withValues(alpha: 0.6),
      _ => Colors.blue.withValues(alpha: 0.8),
    };
  }

  /// AI 标题
  Widget get aiTitle {
    return switch (this) {
      LiveKitConnectionState.connected => Text(
        "AI OBSERVATION",
        style: TextStyle(color: const Color(0x80FFFFFF), fontSize: 12.dpx, fontWeight: FontWeight.w600),
      ),
      LiveKitConnectionState.failed => Text(
        "AI OFFLINE",
        style: TextStyle(color: const Color(0xCCF87171), fontSize: 12.dpx, fontWeight: FontWeight.w600),
      ),
      _ => Text(
        "CONNECTING",
        style: TextStyle(color: const Color(0xCC60A5FA), fontSize: 12.dpx, fontWeight: FontWeight.w600),
      ),
    };
  }

  /// AI 状态圆点
  Widget get dot {
    return switch (this) {
      LiveKitConnectionState.connected => Container(
        width: 12.dpx,
        height: 12.dpx,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(width: 2, color: const Color(0x80FFFFFF)),
        ),
        child: Container(
          margin: EdgeInsets.all(2.dpx),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(width: 2, color: const Color(0x80FFFFFF)),
          ),
        ),
      ),
      LiveKitConnectionState.failed => Container(
        width: 8.dpx,
        height: 8.dpx,
        decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0xCCF87171)),
      ),
      _ => Container(
        width: 8.dpx,
        height: 8.dpx,
        decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0xCC60A5FA)),
      ),
    };
  }
}
