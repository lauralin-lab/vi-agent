import 'package:flutter/material.dart';

class TransitionNavigationBar extends StatelessWidget implements PreferredSizeWidget {
  final String title;
  final VoidCallback? onBack;
  final List<Widget>? actions;
  final Color? backgroundColor;

  const TransitionNavigationBar({
    super.key,
    required this.title,
    this.onBack,
    this.actions,
    this.backgroundColor,
  });

  static const double _barHeight = 44.0;
  static const double _transitionHeight = 40.0; // 过渡区域高度

  @override
  Size get preferredSize {
    return const Size.fromHeight(_barHeight);
  }

  @override
  Widget build(BuildContext context) {
    final double topPadding = MediaQuery.of(context).padding.top;
    final double totalHeight = _barHeight + topPadding;
    final Color bgColor = backgroundColor ?? Theme.of(context).scaffoldBackgroundColor;

    return SizedBox(
      height: totalHeight,
      child: Stack(
        clipBehavior: Clip.none, // 允许子元素超出边界
        children: [
          /// ===== 实体背景层 =====
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            height: totalHeight,
            child: Container(
              color: bgColor,
            ),
          ),

          /// ===== 渐变过渡层（向下延伸）=====
          Positioned(
            top: totalHeight, // 从 AppBar 底部开始
            left: 0,
            right: 0,
            height: _transitionHeight,
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    bgColor,
                    bgColor.withAlpha(0),
                  ],
                ),
              ),
            ),
          ),

          /// ===== 内容层 =====
          Positioned(
            top: topPadding,
            left: 0,
            right: 0,
            height: _barHeight,
            child: Row(
              children: [
                IconButton(
                  icon: const Icon(Icons.arrow_back_ios_new, size: 20),
                  onPressed: onBack ?? () => Navigator.of(context).maybePop(),
                ),
                Expanded(
                  child: Center(
                    child: Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                        fontSize: 17,
                      ),
                    ),
                  ),
                ),
                if (actions != null) ...actions! else const SizedBox(width: 48),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
