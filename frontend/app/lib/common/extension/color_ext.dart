import 'dart:math';
import 'dart:ui';

extension ColorExt2 on Color {
  /// 颜色附加系数
  /// 不改变透明度
  Color scaled(double scale) {
    if (scale == 1.0) return this;
    return withValues(
      red: min(r * scale, 1.0),
      green: min(g * scale, 1.0),
      blue: min(b * scale, 1.0),
    );
  }
}
