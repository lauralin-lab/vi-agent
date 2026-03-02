import 'package:flutter/material.dart';

/// 时间线渐变圆点组件
/// 多层渐变发光效果，匹配 Figma 设计稿
class TimelineDot extends StatelessWidget {
  /// 圆点大小
  final double size;

  /// 是否使用自定义渐变
  final Gradient? gradient;

  const TimelineDot({
    super.key,
    this.size = 24,
    this.gradient,
  });

  /// 默认渐变色
  static const defaultGradient = LinearGradient(
    begin: Alignment(0.50, 0.00),
    end: Alignment(0.39, 1.03),
    colors: [
      Color(0xFF060B0F),
      Color(0xFF3F5563),
      Color(0xFF8C908F),
      Color(0xFF888C8B),
    ],
  );

  @override
  Widget build(BuildContext context) {
    final effectiveGradient = gradient ?? defaultGradient;
    final middleSize = size * 0.80;
    final innerSize = size * 0.60;

    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // 外层 - 20% 透明度
          Opacity(
            opacity: 0.20,
            child: Container(
              width: size,
              height: size,
              decoration: BoxDecoration(
                gradient: effectiveGradient,
                shape: BoxShape.circle,
              ),
            ),
          ),
          // 中层 - 40% 透明度
          Opacity(
            opacity: 0.40,
            child: Container(
              width: middleSize,
              height: middleSize,
              decoration: BoxDecoration(
                gradient: effectiveGradient,
                shape: BoxShape.circle,
              ),
            ),
          ),
          // 内层 - 100% 透明度
          Container(
            width: innerSize,
            height: innerSize,
            decoration: BoxDecoration(
              gradient: effectiveGradient,
              shape: BoxShape.circle,
            ),
          ),
        ],
      ),
    );
  }
}
