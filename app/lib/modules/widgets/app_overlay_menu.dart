import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../common/extension/ui_ext.dart';

/// 菜单项数据模型
class AppOverlayMenuItem {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color color;

  const AppOverlayMenuItem({
    required this.icon,
    required this.label,
    required this.onTap,
    this.color = const Color(0xFF1A1B1E),
  });
}

/// 统一的 Overlay 长按菜单
///
/// 使用方法:
/// ```dart
/// AppOverlayMenu.show(
///   context: context,          // 触发菜单的 widget 的 BuildContext
///   items: [
///     AppOverlayMenuItem(icon: Icons.copy, label: 'Copy', onTap: () {}),
///     AppOverlayMenuItem(icon: Icons.delete, label: 'Delete', onTap: () {}, color: Colors.red),
///   ],
/// );
/// ```
class AppOverlayMenu {
  static OverlayEntry? _current;

  /// 显示菜单，基于触发元素的 BuildContext 自动定位
  static void show({
    required BuildContext context,
    required List<AppOverlayMenuItem> items,
    double blurSigma = 5,
    double overlayAlpha = 0.1,
    double menuRadius = 16,
    double gap = 8,
  }) {
    dismiss();

    final renderBox = context.findRenderObject() as RenderBox?;
    if (renderBox == null) return;

    HapticFeedback.mediumImpact();

    final position = renderBox.localToGlobal(Offset.zero);
    final size = renderBox.size;

    final sourceRect = Rect.fromLTWH(
      position.dx,
      position.dy,
      size.width,
      size.height,
    );

    final overlay = Overlay.of(context);

    _current = OverlayEntry(
      builder: (ctx) => _AppOverlayMenuWidget(
        items: items,
        sourceRect: sourceRect,
        onDismiss: dismiss,
        blurSigma: blurSigma,
        overlayAlpha: overlayAlpha,
        menuRadius: menuRadius,
        gap: gap,
      ),
    );

    overlay.insert(_current!);
  }

  /// 关闭菜单
  static void dismiss() {
    _current?.remove();
    _current = null;
  }
}

/// 内部 overlay widget
class _AppOverlayMenuWidget extends StatelessWidget {
  final List<AppOverlayMenuItem> items;
  final Rect sourceRect;
  final VoidCallback onDismiss;
  final double blurSigma;
  final double overlayAlpha;
  final double menuRadius;
  final double gap;

  const _AppOverlayMenuWidget({
    required this.items,
    required this.sourceRect,
    required this.onDismiss,
    required this.blurSigma,
    required this.overlayAlpha,
    required this.menuRadius,
    required this.gap,
  });

  @override
  Widget build(BuildContext context) {
    final screenSize = MediaQuery.of(context).size;

    // 菜单定位在源组件下方，右对齐
    final menuTop = sourceRect.bottom + gap;
    final menuRight = screenSize.width - sourceRect.right;

    return GestureDetector(
      onTap: onDismiss,
      behavior: HitTestBehavior.opaque,
      child: Material(
        color: Colors.transparent,
        child: Stack(
          children: [
            // 高斯模糊遮罩 — 镂空源组件区域
            ClipPath(
              clipper: _HoleClipper(sourceRect, menuRadius),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: blurSigma, sigmaY: blurSigma),
                child: Container(
                  width: screenSize.width,
                  height: screenSize.height,
                  color: Colors.black.withValues(alpha: overlayAlpha),
                ),
              ),
            ),
            // 操作菜单
            Positioned(
              top: menuTop,
              right: menuRight,
              child: _buildMenu(context),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMenu(BuildContext context) {
    return IntrinsicWidth(
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(menuRadius.dpx),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.12),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: items.asMap().entries.map((entry) {
            final index = entry.key;
            final item = entry.value;
            return Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _buildActionItem(item),
                if (index < items.length - 1)
                  Divider(
                    height: 1,
                    indent: 12.dpx,
                    endIndent: 12.dpx,
                    color: const Color(0xFFE5E5EA),
                  ),
              ],
            );
          }).toList(),
        ),
      ),
    );
  }

  Widget _buildActionItem(AppOverlayMenuItem item) {
    return GestureDetector(
      onTap: () {
        onDismiss();
        item.onTap();
      },
      child: Container(
        padding: EdgeInsets.symmetric(horizontal: 16.dpx, vertical: 12.dpx),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(item.icon, size: 14.dpx, color: item.color),
            SizedBox(width: 8.dpx),
            Text(
              item.label,
              style: TextStyle(
                color: item.color,
                fontSize: 14.dpx,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 镂空 clipper — 在遮罩上挖出源组件的圆角矩形区域
class _HoleClipper extends CustomClipper<Path> {
  final Rect rect;
  final double radius;

  _HoleClipper(this.rect, this.radius);

  @override
  Path getClip(Size size) {
    return Path()
      ..addRect(Rect.fromLTWH(0, 0, size.width, size.height))
      ..addRRect(RRect.fromRectAndRadius(rect, Radius.circular(radius.dpx)))
      ..fillType = PathFillType.evenOdd;
  }

  @override
  bool shouldReclip(_HoleClipper old) => rect != old.rect;
}
