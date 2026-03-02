import 'package:flutter/material.dart';

/// 虚线绘制器
/// 支持横向和纵向虚线绘制
class DashedLinePainter extends CustomPainter {
  /// 方向
  final Axis axis;

  /// 虚线颜色
  final Color color;

  /// 虚线段宽度（横向时使用）
  final double dashWidth;

  /// 虚线段高度（纵向时使用）
  final double dashHeight;

  /// 虚线间隔
  final double dashSpace;

  /// 线条粗细
  final double strokeWidth;

  const DashedLinePainter({
    this.axis = Axis.vertical,
    this.color = const Color(0xFFD1D1D6),
    this.dashWidth = 4,
    this.dashHeight = 4,
    this.dashSpace = 4,
    this.strokeWidth = 1,
  });

  @override
  void paint(Canvas canvas, Size size) {
    double start = 0;
    final paint = Paint()
      ..color = color
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    if (axis == Axis.horizontal) {
      while (start < size.width) {
        canvas.drawLine(
          Offset(start, size.height / 2),
          Offset(start + dashWidth, size.height / 2),
          paint,
        );
        start += dashWidth + dashSpace;
      }
    } else {
      while (start < size.height) {
        canvas.drawLine(
          Offset(size.width / 2, start),
          Offset(size.width / 2, start + dashHeight),
          paint,
        );
        start += dashHeight + dashSpace;
      }
    }
  }

  @override
  bool shouldRepaint(covariant DashedLinePainter oldDelegate) {
    return oldDelegate.axis != axis ||
        oldDelegate.color != color ||
        oldDelegate.dashWidth != dashWidth ||
        oldDelegate.dashHeight != dashHeight ||
        oldDelegate.dashSpace != dashSpace ||
        oldDelegate.strokeWidth != strokeWidth;
  }
}

/// 虚线组件 - 便捷封装
class DashedLine extends StatelessWidget {
  /// 方向
  final Axis axis;

  /// 虚线颜色
  final Color color;

  /// 虚线段宽度/高度
  final double dashLength;

  /// 虚线间隔
  final double dashSpace;

  /// 线条粗细
  final double strokeWidth;

  /// 线条尺寸（横向时为高度，纵向时为宽度）
  final double? thickness;

  const DashedLine({
    super.key,
    this.axis = Axis.vertical,
    this.color = const Color(0xFFD1D1D6),
    this.dashLength = 4,
    this.dashSpace = 4,
    this.strokeWidth = 1,
    this.thickness,
  });

  @override
  Widget build(BuildContext context) {
    final effectiveThickness = thickness ?? strokeWidth;

    return CustomPaint(
      size: axis == Axis.horizontal
          ? Size(double.infinity, effectiveThickness)
          : Size(effectiveThickness, double.infinity),
      painter: DashedLinePainter(
        axis: axis,
        color: color,
        dashWidth: dashLength,
        dashHeight: dashLength,
        dashSpace: dashSpace,
        strokeWidth: strokeWidth,
      ),
    );
  }
}
