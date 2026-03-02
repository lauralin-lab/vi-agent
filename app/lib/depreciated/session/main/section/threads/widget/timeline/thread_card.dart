import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../../../../common/extension/ui_ext.dart';
import '../../../../../../../service/session/http/function/file_http_service.dart';
import 'timeline.dart';

/// Thread card widget matching Figma design
/// Shows date, title, tag chip, and optional thumbnail
class ThreadCard extends StatelessWidget {
  final ThreadData data;
  final String title;
  final VoidCallback? onTap;

  const ThreadCard({
    super.key,
    required this.data,
    required this.title,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: EdgeInsets.symmetric(horizontal: 12.dpx, vertical: 16.dpx),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16.dpx),
        ),
        child: Row(
          children: [
            // Left content (title, date, tag)
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Date stamp - 小字灰色
                  Text(
                    data.date,
                    style: TextStyle(
                      color: const Color(0xFF8E8E93),
                      fontSize: 10.dpx,
                      fontWeight: FontWeight.w400,
                    ),
                  ),
                  SizedBox(height: 6.dpx),
                  // Title - 主标题
                  Text(
                    title,
                    style: TextStyle(
                      color: const Color(0xFF1A1B1E),
                      fontSize: 15.dpx,
                      fontWeight: FontWeight.w500,
                      height: 1.4,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  SizedBox(height: 6.dpx),
                  // Tag chip
                  _buildTagChip(),
                ],
              ),
            ),
            // 图片预览
            if (data.files.isNotEmpty) ...[
              SizedBox(width: 12.dpx),
              _FilePreview(files: data.files),
            ],
          ],
        ),
      ),
    );
  }

  /// Build tag chip with sparkle icon
  Widget _buildTagChip() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          '✦',
          style: TextStyle(
            color: const Color(0xFF8E8E93),
            fontSize: 10.dpx,
          ),
        ),
        SizedBox(width: 4.dpx),
        Text(
          data.tag ?? 'Tag',
          style: TextStyle(
            color: const Color(0xFF8E8E93),
            fontSize: 11.dpx,
            fontWeight: FontWeight.w400,
          ),
        ),
      ],
    );
  }
}

/// 文件预览组件 - 单张正方形，多张斜侧叠加
class _FilePreview extends StatelessWidget {
  final List<String> files;

  /// 预览区尺寸
  static final _size = 64.dpx;

  /// 多张叠加时的旋转角度（度数）
  static const _rotations = [-8.0, 4.0, 0.0];

  const _FilePreview({required this.files});

  @override
  Widget build(BuildContext context) {
    if (files.length == 1) {
      return _buildSingleImage(files.first);
    }
    return _buildStackedImages();
  }

  /// 单张图片 - 正方形圆角
  Widget _buildSingleImage(String filePath) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(8.dpx),
      child: SizedBox(
        width: _size,
        height: _size,
        child: _NetworkPreviewImage(filePath: filePath),
      ),
    );
  }

  /// 多张图片 - 斜侧叠加（最多显示3张）
  Widget _buildStackedImages() {
    final displayFiles = files.take(3).toList();
    // 需要额外空间容纳旋转溢出
    final containerSize = _size + 12.dpx;

    return SizedBox(
      width: containerSize,
      height: containerSize,
      child: Stack(
        alignment: Alignment.center,
        children: [
          for (var i = 0; i < displayFiles.length; i++)
            Transform.rotate(
              angle: _rotations[i] * math.pi / 180,
              child: Container(
                width: _size - 4.dpx,
                height: _size - 4.dpx,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(8.dpx),
                  border: Border.all(color: Colors.white, width: 1.5),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.08),
                      blurRadius: 4,
                      offset: const Offset(0, 1),
                    ),
                  ],
                ),
                clipBehavior: Clip.antiAlias,
                child: _NetworkPreviewImage(filePath: displayFiles[i]),
              ),
            ),
        ],
      ),
    );
  }
}

/// 网络预览图片 - 通过 workspace URL 加载（带缓存）
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
      placeholder: (context, url) => Container(
        color: const Color(0xFFF2F2F7),
        child: const Center(
          child: SizedBox(
            width: 16,
            height: 16,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: Color(0xFFAEAEB2),
            ),
          ),
        ),
      ),
      errorWidget: (context, url, error) => Container(
        color: const Color(0xFFF2F2F7),
        child: const Center(
          child: Icon(
            Icons.image_outlined,
            color: Color(0xFFAEAEB2),
            size: 20,
          ),
        ),
      ),
    );
  }
}
