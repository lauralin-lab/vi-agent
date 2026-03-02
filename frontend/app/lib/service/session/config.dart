import '../gateway/rpc/gateway_models.dart';

class SessionConfig {
  /// 从 WebSocket URL 转换为 HTTP base URL
  /// ws://127.0.0.1:18789  → http://127.0.0.1:18789
  /// wss://moltbot.collov.ai → https://moltbot.collov.ai
  static String _wsToHttpUrl(String wsUrl) {
    if (wsUrl.startsWith('wss://')) {
      return wsUrl.replaceFirst('wss://', 'https://');
    } else if (wsUrl.startsWith('ws://')) {
      return wsUrl.replaceFirst('ws://', 'http://');
    }
    return wsUrl;
  }

  /// Gateway WebSocket URL
  static String get baseUrl => _wsToHttpUrl(kGatewayUrl);
}
