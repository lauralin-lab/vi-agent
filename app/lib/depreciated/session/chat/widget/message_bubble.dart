import 'dart:io';
import 'package:flutter/material.dart';

import 'package:flutter/services.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../../common/utils/log_utils.dart';
import '../../../../service/gateway/rpc/gateway_models.dart';
import '../../../../modules/widgets/app_webview.dart';

import '../../../../modules/widgets/app_button.dart';
import '../../../../modules/widgets/app_overlay_menu.dart';
import '../../../../service/session/http/function/file_http_service.dart';
import '../model/chat_models_ui.dart';

/// 消息内容类型
enum MessageContentType {
  text, // 普通文本
  action, // 动作按钮
  location, // 位置卡片
  image, // 图片
}

class MessageBubble extends StatelessWidget {
  final SessionMessage message;
  final void Function(String action)? onActionTap;

  const MessageBubble({
    super.key,
    required this.message,
    this.onActionTap,
  });

  @override
  Widget build(BuildContext context) {
    final parsed = ParsedMessage.fromSessionMessage(message);
    final isUser = message.type == 'user';

    // 检测消息类型
    final contentType = _detectContentType(parsed);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0, horizontal: 16.0),
      child: Column(
        crossAxisAlignment: isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          // 根据类型构建不同组件
          if (contentType == MessageContentType.action)
            _buildActionButton(context, parsed.text)
          else if (contentType == MessageContentType.location)
            _buildLocationCard(context, parsed)
          else
            _buildTextBubble(context, parsed, isUser),
        ],
      ),
    );
  }

  /// 检测消息内容类型
  MessageContentType _detectContentType(ParsedMessage parsed) {
    final text = parsed.text.toLowerCase();

    // 检测动作按钮（以 "ok." 开头或包含导航/确认类关键字）
    if (text.startsWith('ok.') || text.startsWith('ok,') || (text.contains('navigate') && text.length < 100)) {
      return MessageContentType.action;
    }

    // 检测位置卡片
    if (text.contains('location:') || parsed.attachments.any((a) => a.path.contains('map'))) {
      return MessageContentType.location;
    }

    return MessageContentType.text;
  }

  /// 构建动作按钮
  Widget _buildActionButton(BuildContext context, String text) {
    return AppButton.label(
      label: text,
      visualStyle: VisualStyle.black,
      height: 48,
      radius: 24,
      fontSize: 14,
      fontWeight: FontWeight.w500,
      onPressed: () => onActionTap?.call(text),
    );
  }

  /// 构建位置卡片
  Widget _buildLocationCard(BuildContext context, ParsedMessage parsed) {
    // 解析位置信息
    final locationMatch = RegExp(r'location:\s*(.+)', caseSensitive: false).firstMatch(parsed.text);
    final locationName = locationMatch?.group(1) ?? 'Unknown Location';

    return Container(
      width: MediaQuery.of(context).size.width * 0.8,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 10),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 地图预览占位
          Container(
            height: 150,
            color: const Color(0xFFE8E4D9),
            child: const Center(
              child: Icon(Icons.map, size: 48, color: Colors.grey),
            ),
          ),
          // 位置信息
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: Colors.grey[200],
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.location_on, size: 18),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Location',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey,
                        ),
                      ),
                      Text(
                        locationName,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// 匹配 {{workspace://path}} 格式的 URL
  static final RegExp _workspaceUrlRegex = RegExp(
    r'\{\{workspace://([^}]+)\}\}',
  );

  /// 从文本中提取 workspace:// URL 列表，并转换为完整 HTTP URL
  List<String> _extractWorkspaceUrls(String text) {
    final matches = _workspaceUrlRegex.allMatches(text);
    final baseUrl = kGatewayWorkspaceUrl;
    return matches.map((m) {
      final path = m.group(1)!;
      final url = '$baseUrl/$path';
      Log.d('[workspace] raw match="${m.group(0)}" path="$path" url="$url"');
      return url;
    }).toList();
  }

  /// 清理文本中的 workspace:// 标记
  String _stripWorkspaceUrls(String text) {
    return text.replaceAll(_workspaceUrlRegex, '').trim();
  }

  /// 构建文本气泡
  Widget _buildTextBubble(BuildContext context, ParsedMessage parsed, bool isUser) {
    // 获取本地图片列表
    final localImages = message.metadata['images'] as List<dynamic>? ?? [];

    // 提取 workspace:// URL
    final workspaceUrls = _extractWorkspaceUrls(parsed.text);
    final displayText = workspaceUrls.isNotEmpty ? _stripWorkspaceUrls(parsed.text) : parsed.text;

    return Builder(
      builder: (ctx) {
        return GestureDetector(
          onLongPress: () {
            final text = parsed.text;
            AppOverlayMenu.show(
              context: ctx,
              items: [
                AppOverlayMenuItem(
                  icon: Icons.copy,
                  label: 'Copy',
                  onTap: () {
                    if (text.isNotEmpty) {
                      Clipboard.setData(ClipboardData(text: text));
                      ScaffoldMessenger.of(ctx).showSnackBar(
                        const SnackBar(
                          content: Text('Copied'),
                          duration: Duration(seconds: 1),
                          behavior: SnackBarBehavior.floating,
                        ),
                      );
                    }
                  },
                ),
              ],
            );
          },
          child: Container(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.of(ctx).size.width * 0.8,
            ),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: isUser ? Colors.black : Colors.white,
              borderRadius: BorderRadius.circular(16).copyWith(
                bottomRight: isUser ? Radius.zero : const Radius.circular(16),
                bottomLeft: isUser ? const Radius.circular(16) : Radius.zero,
              ),
              boxShadow: [
                BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 5),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 显示本地图片
                if (localImages.isNotEmpty) ...[
                  _buildLocalImages(ctx, localImages),
                  if (displayText.isNotEmpty || parsed.attachments.isNotEmpty) const SizedBox(height: 8),
                ],
                // 显示附件图片（历史消息），放在文字前面，与上传一致
                if (parsed.attachments.isNotEmpty) ...[
                  _buildAttachments(ctx, parsed.attachments),
                  if (displayText.isNotEmpty) const SizedBox(height: 8),
                ],
                if (displayText.isNotEmpty)
                  MarkdownBody(
                    data: displayText,
                    styleSheet: MarkdownStyleSheet(
                      p: TextStyle(
                        color: isUser ? Colors.white : Colors.black87,
                      ),
                    ),
                    onTapLink: (text, href, title) => href != null ? launchUrl(Uri.parse(href)) : null,
                  ),
                // 在气泡底部显示 workspace WebView
                if (workspaceUrls.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  for (final url in workspaceUrls) AppWebView(url: url),
                ],
              ],
            ),
          ),
        );
      },
    );
  }

  /// 构建本地图片显示
  Widget _buildLocalImages(BuildContext context, List<dynamic> imagePaths) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: imagePaths.map((path) {
        return ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Image.file(
            File(path.toString()),
            width: 150,
            height: 150,
            fit: BoxFit.cover,
            errorBuilder: (context, error, stackTrace) => Container(
              width: 150,
              height: 150,
              color: Colors.grey[300],
              child: const Icon(Icons.broken_image, color: Colors.grey),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildAttachments(BuildContext context, List<Attachment> list) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: list.map((att) {
        if (att.isImage) {
          return _buildImage(context, att.path);
        }
        return Chip(
          label: Text(
            att.name ?? 'File',
            style: const TextStyle(fontSize: 10),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildImage(BuildContext context, String imagePath) {
    // Gateway 上传的文件：绝对路径，使用 workspace URL 加载
    if (imagePath.startsWith('workspace://')) {
      final imageUrl = FileHttpService.instance.buildWorkspaceUrl(imagePath);
      final headers = FileHttpService.instance.authHeaders;

      return ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: CachedNetworkImage(
          imageUrl: imageUrl,
          width: 150,
          height: 150,
          fit: BoxFit.cover,
          httpHeaders: headers,
          placeholder: (context, url) => Container(
            color: Colors.grey[200],
            child: const Center(child: CircularProgressIndicator()),
          ),
          errorWidget: (context, url, error) => const Icon(Icons.broken_image),
        ),
      );
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: CachedNetworkImage(
        imageUrl: '',
        width: 150,
        height: 150,
        fit: BoxFit.cover,
        placeholder: (context, url) => Container(
          color: Colors.grey[200],
          child: const Center(child: CircularProgressIndicator()),
        ),
        errorWidget: (context, url, error) => const Icon(Icons.broken_image),
      ),
    );
  }
}
