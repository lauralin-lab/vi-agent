import 'package:flutter/material.dart';
import 'package:gap/gap.dart';

import '../style/app_theme.dart';
import 'app_image.dart';

/// 样式
enum VisualStyle {
  /// 主样式
  primary,

  /// 黑色
  black,

  /// 灰色
  gray,

  /// 辅色按钮
  secondary,

  /// 透明按钮
  transparent;
}

/// 样式实现
abstract class AppButtonStyle {
  @protected
  const AppButtonStyle();

  /// 构建布局
  Widget build(AppButton button, BuildContext context);

  /// 样式名称
  String get styleName => "AppButtonStyle";
}

/// 文本版本
class LabelAppButtonStyle extends AppButtonStyle {
  const LabelAppButtonStyle({
    required this.text,
    this.icon,
    this.iconColor,
    this.textColor,
    this.letterSpacing,
    this.bottom,
    this.right,
    this.fontSize = 18,
    this.iconSize = 16,
    this.fontWeight = FontWeight.bold,
    this.fontFamily,
    this.centerIcon,
  });

  /// 主文本字体大小
  final double fontSize;

  /// 图标大小
  final double iconSize;

  /// 左侧图标
  final String? icon;

  /// 图标颜色
  final Color? iconColor;

  /// 文本
  final String text;

  /// 文本颜色
  final Color? textColor;

  /// 文本间距
  final double? letterSpacing;

  /// 字体粗细
  final FontWeight fontWeight;

  /// 底部装饰
  final Widget? bottom;

  /// 右部装饰
  final Widget? right;

  final String? fontFamily;

  /// 中间图标
  final AppImage? centerIcon;

  @override
  Widget build(AppButton button, BuildContext context) {
    final enable = button.onPressed != null && button.showTheme;
    final theme = Theme.of(context);

    final children = <Widget>[];
    // 最左边添加图片
    if (icon != null) {
      children.add(Image.asset(
        icon!,
        height: iconSize,
        color: enable ? (iconColor ?? button.defaultColor(theme)) : const Color(0xFFB6B6C9),
      ));
      children.add(const Gap(8));
    }

    Widget child = Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (centerIcon != null) Container(margin: const EdgeInsets.only(right: 5), child: centerIcon),
        button.buildText(
          text,
          theme: theme,
          fontSize: fontSize,
          textColor: textColor,
          letterSpacing: letterSpacing,
          fontWeight: fontWeight,
          fontFamily: fontFamily,
        ),
      ],
    );

    if (bottom != null) {
      child = Column(
        mainAxisSize: MainAxisSize.min,
        children: [child, bottom!],
      );
    }
    children.add(button.expand ? Expanded(child: child) : child);

    Widget widget = Row(
      mainAxisAlignment: MainAxisAlignment.center,
      mainAxisSize: button.expand ? MainAxisSize.max : MainAxisSize.min,
      children: children,
    );

    if (right != null) {
      widget = Stack(
        fit: StackFit.loose,
        alignment: Alignment.center,
        children: [widget, Positioned(right: 0, child: right!)],
      );
    }

    return widget;
  }
}

/// 最简单的版本
class SampleAppButtonStyle extends AppButtonStyle {
  const SampleAppButtonStyle(this.child);

  /// 子布局
  final Widget child;

  @override
  Widget build(AppButton button, BuildContext context) => child;
}

/// 图标版本
class IconAppButtonStyle extends AppButtonStyle {
  const IconAppButtonStyle({
    required this.icon,
    this.color,
    this.size = 24,
    this.weight = FontWeight.bold,
    this.shadows,
  });

  /// 图标
  final IconData icon;

  /// 文本颜色
  final Color? color;

  /// 文本间距
  final double size;

  /// 字体粗细
  final FontWeight weight;

  /// 阴影
  final List<Shadow>? shadows;

  @override
  Widget build(AppButton button, BuildContext context) {
    final child = RichText(
      overflow: TextOverflow.visible,
      text: TextSpan(
        text: String.fromCharCode(icon.codePoint),
        style: TextStyle(
          inherit: false,
          color: color,
          fontSize: size,
          fontFamily: icon.fontFamily,
          package: icon.fontPackage,
          fontWeight: weight,
          shadows: shadows,
        ),
      ),
    );
    return Center(child: child);
  }
}

/// 按钮
class AppButton extends StatelessWidget {
  /// 点击事件
  final VoidCallback? onPressed;

  /// 样式
  final VisualStyle visualStyle;

  /// 扩展模式
  final bool expand;

  /// 内容边距
  final EdgeInsets padding;

  /// 宽度因子
  final double? widthFactor;

  /// 圆角的角度
  final double? radius;

  /// 可点击情况下，是否显示主题色
  final bool showTheme;

  /// 使用安全区
  final bool useSafeArea;

  /// 如果按钮为渐变，[bgColor] 无效
  final List<Color>? colors;

  final AlignmentGeometry? begin;

  final AlignmentGeometry? end;

  /// 背景颜色，可以和 [endColor] 组成渐变
  final Color? bgColor;

  /// 不可点击时候的背景
  final Color? disabledColor;

  /// 按钮宽度
  final double? width;

  /// 按钮高度
  final double? height;

  /// 构建器可以是 [LabelAppButtonStyle]
  final AppButtonStyle style;

  /// 是否启用
  bool get enable => onPressed != null && showTheme;

  const AppButton({
    super.key,
    required this.style,
    this.visualStyle = VisualStyle.primary,
    this.onPressed,
    this.bgColor,
    this.disabledColor,
    this.colors,
    this.begin,
    this.end,
    this.width,
    this.height = 56,
    this.widthFactor,
    this.radius,
    this.expand = false,
    this.showTheme = true,
    this.useSafeArea = false,
    this.padding = const EdgeInsets.fromLTRB(24, 4, 24, 4),
  });

  /// 标签按钮
  AppButton.label({
    super.key,
    required String label,
    Widget? bottom,
    Widget? right,
    String? icon,
    Color? iconColor,
    Color? textColor,
    double? letterSpacing,
    double fontSize = 18,
    double iconSize = 16,
    String? fontFamily,
    FontWeight fontWeight = FontWeight.bold,
    AppImage? centerIcon,
    this.visualStyle = VisualStyle.primary,
    this.onPressed,
    this.bgColor,
    this.disabledColor,
    this.colors,
    this.begin,
    this.end,
    this.height = 56,
    this.widthFactor,
    this.radius,
    this.expand = false,
    this.showTheme = true,
    this.useSafeArea = false,
    this.padding = const EdgeInsets.fromLTRB(24, 4, 24, 4),
  })  : width = null,
        style = LabelAppButtonStyle(
          text: label,
          icon: icon,
          iconColor: iconColor,
          right: right,
          bottom: bottom,
          iconSize: iconSize,
          fontSize: fontSize,
          textColor: textColor,
          fontWeight: fontWeight,
          letterSpacing: letterSpacing,
          fontFamily: fontFamily,
          centerIcon: centerIcon,
        );

  /// 图标按钮
  AppButton.icon({
    super.key,
    required IconData icon,
    Color? iconColor,
    double iconSize = 24.0,
    FontWeight iconWeight = FontWeight.bold,
    List<Shadow>? iconShadows,
    this.visualStyle = VisualStyle.primary,
    this.onPressed,
    this.bgColor,
    this.disabledColor,
    this.colors,
    this.begin,
    this.end,
    this.width,
    this.height,
    this.widthFactor,
    this.radius,
    this.expand = false,
    this.showTheme = true,
    this.useSafeArea = false,
    this.padding = EdgeInsets.zero,
  }) : style = IconAppButtonStyle(
          icon: icon,
          color: iconColor,
          size: iconSize,
          weight: iconWeight,
          shadows: iconShadows,
        );

  /// 最简化的版本
  AppButton.sample({
    super.key,
    required Widget child,
    this.visualStyle = VisualStyle.primary,
    this.onPressed,
    this.bgColor,
    this.disabledColor,
    this.colors,
    this.begin,
    this.end,
    this.width,
    this.height,
    this.widthFactor,
    this.radius,
    this.expand = false,
    this.showTheme = true,
    this.useSafeArea = false,
    this.padding = EdgeInsets.zero,
  }) : style = SampleAppButtonStyle(child);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final backgroundColor = _backgroundColor(theme);
    final enable = this.enable;

    // 创建子类
    Widget child = style.build(this, context);

    child = height != null || width != null
        ? Container(
            width: width,
            height: height,
            padding: padding,
            child: child,
          )
        : Padding(padding: padding, child: child);

    // 包裹
    child = FractionallySizedBox(widthFactor: widthFactor, child: child);

    // 圆角
    final br = BorderRadius.all(Radius.circular(radius ?? 96));

    // 设置渐变
    if (colors != null && enable) {
      child = Ink(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: begin ?? Alignment.centerLeft,
            end: end ?? Alignment.centerRight,
            colors: colors!,
          ),
          borderRadius: br,
        ),
        child: child,
      );
    }

    child = Material(
      color: enable ? backgroundColor : disabledColor ?? theme.disabledColor,
      type: enable && (colors != null || backgroundColor == Colors.transparent)
          ? MaterialType.transparency
          : MaterialType.canvas,
      borderRadius: br,
      child: InkWell(onTap: onPressed, borderRadius: br, child: child),
    );

    // 设置安全区域
    if (useSafeArea) child = SafeArea(top: false, child: child);

    return child;
  }

  /// 构建文本
  Widget buildText(
    String text, {
    required ThemeData theme,
    double? fontSize,
    Color? textColor,
    double? letterSpacing,
    FontWeight? fontWeight,
    String? fontFamily,
  }) {
    const disable = Color(0xFFB6B6C9);
    return Text(
      text,
      softWrap: false,
      textAlign: TextAlign.center,
      style: TextStyle(
        color: textColor ?? (enable ? defaultColor(theme) : disable),
        fontSize: fontSize,
        fontFamily: fontFamily,
        fontWeight: fontWeight ?? FontWeight.bold,
        overflow: TextOverflow.fade,
        letterSpacing: letterSpacing,
      ),
    );
  }

  /// 获取默认颜色
  Color defaultColor(ThemeData theme) {
    return visualStyle == VisualStyle.primary ? Colors.black : Colors.white;
  }

  /// 获取背景色
  Color _backgroundColor(ThemeData theme) {
    if (bgColor != null) return bgColor!;
    return switch (visualStyle) {
      VisualStyle.black => AppTheme.secondaryColor,
      VisualStyle.secondary => const Color(0xFF234AF2),
      VisualStyle.gray => const Color(0xFF2E2F35),
      VisualStyle.transparent => Colors.transparent,
      _ => theme.primaryColor
    };
  }
}
