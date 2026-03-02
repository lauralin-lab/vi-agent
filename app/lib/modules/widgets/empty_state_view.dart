import 'package:flutter/material.dart';

/// 空状态视图组件
///
/// 用于显示列表为空、无数据等空状态场景
/// 包含一个 inbox 图标和可自定义的标题和描述
class EmptyStateView extends StatelessWidget {
  const EmptyStateView({
    super.key,
    this.imageAsset,
    this.title,
    this.subtitle,
    this.action,
    this.imageSize = 64,
  });

  /// 自定义图片资源路径，默认为 ic_empty.webp
  final String? imageAsset;

  /// 标题文字
  final String? title;

  /// 副标题/描述文字
  final String? subtitle;

  /// 可选的操作按钮
  final Widget? action;

  /// 图片大小
  final double imageSize;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // 图片
            Image.asset(
              imageAsset ?? 'assets/images/ic_empty.webp',
              width: imageSize,
              height: imageSize,
              color: Colors.grey.shade400,
            ),

            // 标题
            if (title != null) ...[
              const SizedBox(height: 24),
              Text(
                title!,
                style: theme.textTheme.titleMedium?.copyWith(
                  color: Colors.grey.shade400,
                  fontWeight: FontWeight.w600,
                ),
                textAlign: TextAlign.center,
              ),
            ],

            // 副标题
            if (subtitle != null) ...[
              const SizedBox(height: 8),
              Text(
                subtitle!,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: Colors.grey.shade400,
                ),
                textAlign: TextAlign.center,
              ),
            ],

            // 操作按钮
            if (action != null) ...[
              const SizedBox(height: 24),
              action!,
            ],
          ],
        ),
      ),
    );
  }
}
