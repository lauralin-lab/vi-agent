import 'package:flutter/material.dart';

/// 创建一个简单的对话框
class DialogLite extends StatelessWidget {
  /// 创建一个简单的对话框
  const DialogLite({
    super.key,
    this.backgroundColor,
    this.elevation,
    this.shadowColor,
    this.clipBehavior = Clip.none,
    this.shape,
    this.alignment,
    this.child,
    this.constraints = const BoxConstraints(minWidth: 240),
  }) : assert(elevation == null || elevation >= 0.0);

  /// 背景色
  final Color? backgroundColor;

  /// 阴影宽度
  final double? elevation;

  /// 阴影颜色
  final Color? shadowColor;

  /// 剪裁
  final Clip clipBehavior;

  /// 边框样式，默认 [_shape]
  final ShapeBorder? shape;

  /// 对齐，默认居中
  final AlignmentGeometry? alignment;

  /// 子布局
  final Widget? child;

  /// 对话框大小约束
  final BoxConstraints constraints;

  @override
  Widget build(BuildContext context) {
    final dt = DialogTheme.of(context);

    final widget = Material(
      color: backgroundColor ?? dt.backgroundColor,
      elevation: elevation ?? dt.elevation ?? 6,
      shadowColor: shadowColor ?? dt.shadowColor ?? Colors.transparent,
      shape: shape ?? dt.shape ?? _shape,
      type: MaterialType.card,
      clipBehavior: clipBehavior,
      child: child,
    );

    return Align(
      alignment: alignment ?? dt.alignment ?? Alignment.center,
      child: ConstrainedBox(constraints: constraints, child: widget),
    );
  }

  /// 默认边框样式
  static const _shape = RoundedRectangleBorder(
    borderRadius: BorderRadius.all(Radius.circular(12.0)),
  );
}
