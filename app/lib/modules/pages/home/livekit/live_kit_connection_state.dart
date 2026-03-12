/// LiveKit 连接状态枚举
///
/// 纯领域模型，不包含 UI 逻辑。UI 映射见 [main_top_tools_widget.dart]。
enum LiveKitConnectionState {
  /// 初始态
  idle,

  /// 等待前置条件（camera + auth + token）
  waitingPrerequisites,

  /// 正在连接房间
  connecting,

  /// 房间连接成功
  connected,

  /// 连接失败（可重试）
  failed;

  bool get isConnected => this == LiveKitConnectionState.connected;

  /// 是否处于可以尝试连接的状态
  bool get canAttemptConnect =>
      this == LiveKitConnectionState.idle ||
      this == LiveKitConnectionState.waitingPrerequisites ||
      this == LiveKitConnectionState.failed;
}
