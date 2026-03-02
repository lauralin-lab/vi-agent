import '../../config.dart';

/// Web Content HTTP Service - 获取 session 页面的 webview HTML 内容
class WebHttpService {
  const WebHttpService();

  /// 获取指定 session 的 content-stream HTML
  String getContentStreamUrl({required String sessionKey}) {
    return '${SessionConfig.baseUrl}/collov/session/content-stream?key=$sessionKey';
  }
}
