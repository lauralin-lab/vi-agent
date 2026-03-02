import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../service/session/http/function/file_http_service.dart';
import '../../../../service/session/http/function/thread_http_service.dart';

class HistoryItem extends StatelessWidget {
  final ThreadSession session;
  final VoidCallback onTap;

  const HistoryItem({super.key, required this.session, required this.onTap});

  /// 格式化时间为相对描述
  String _formatRelativeTime(DateTime timestamp) {
    final now = DateTime.now();
    final diff = now.difference(timestamp);

    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes} mins ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${timestamp.month}/${timestamp.day}';
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
          ),
          child: Row(
            children: [
              // Thumbnail
              session.files.isNotEmpty
                  ? _FilePreview(files: session.files)
                  : ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Container(
                        width: 52,
                        height: 52,
                        color: Colors.white.withValues(alpha: 0.04),
                        child: _placeholderIcon(),
                      ),
                    ),
              const SizedBox(width: 14),

              // Text
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      session.title,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.85),
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        letterSpacing: 0.15,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 5),
                    Text(
                      _formatRelativeTime(session.timestamp),
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.2),
                        fontSize: 10,
                        fontFamily: 'Courier New',
                      ),
                    ),
                  ],
                ),
              ),

              Icon(
                Icons.chevron_right,
                color: Colors.white.withValues(alpha: 0.1),
                size: 16,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _placeholderIcon() {
    return Center(
      child: Icon(
        Icons.chat_bubble_outline,
        color: Colors.white.withValues(alpha: 0.2),
        size: 20,
      ),
    );
  }
}

/// 文件预览组件 — 只显示第一张图片
class _FilePreview extends StatelessWidget {
  final List<String> files;

  static const _size = 52.0;

  const _FilePreview({required this.files});

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: SizedBox(
        width: _size,
        height: _size,
        child: _NetworkPreviewImage(filePath: files.first),
      ),
    );
  }
}

/// 网络预览图片 — 通过 workspace URL 加载（带认证）
class _NetworkPreviewImage extends StatelessWidget {
  final String filePath;

  const _NetworkPreviewImage({required this.filePath});

  @override
  Widget build(BuildContext context) {
    final url = FileHttpService.instance.buildWorkspaceUrl(filePath);
    final headers = FileHttpService.instance.authHeaders;

    return CachedNetworkImage(
      imageUrl: url,
      httpHeaders: headers,
      fit: BoxFit.cover,
      placeholder: (_, __) => Container(
        color: Colors.white.withValues(alpha: 0.04),
      ),
      errorWidget: (_, __, ___) => Container(
        color: Colors.white.withValues(alpha: 0.04),
        child: Center(
          child: Icon(
            Icons.image_outlined,
            color: Colors.white.withValues(alpha: 0.2),
            size: 18,
          ),
        ),
      ),
    );
  }
}
