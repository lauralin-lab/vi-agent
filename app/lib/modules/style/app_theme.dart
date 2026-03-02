import 'package:flutter/material.dart';

/// 应用主题
final class AppTheme {
  AppTheme._();

  /// 主色
  static const primaryColor = Color(0xFF171717);

  /// 能清晰显示在主色上的色彩
  static const onPrimaryColor = Color(0xFFF2F2F0);

  /// 辅色
  static const secondaryColor = Color(0xFF373430);

  /// 能清晰显示在辅色上的色彩
  static const onSecondaryColor = Color(0xFFF2F2F2);

  /// 背景色
  static const surfaceColor = Color(0xFFF4F6F6);

  /// 能清晰显示在背景色上的色彩
  static const onSurfaceColor = Color(0xFF373430);

  /// 卡片色
  static const cardColor = Color(0xFFFCFCFC);

  /// 错误色
  static const errorColor = Colors.red;

  /// 特殊色（一般用于背景变暗）
  static const black35 = Color(0x5A000000);

  ////////////////////////////////////////////////////////////////////////////////////////////////////

  /// 25% 透明度主色
  static const primaryColor25 = Color(0x408E8075);

  /// 25% 透明度辅色
  static const secondaryColor25 = Color(0x40373430);

  /// 40% 白色透明色
  static const white40 = Color(0x66FFFFFF);


  /// 创建主题
  static ThemeData createTheme() {
    const colorScheme = ColorScheme(
      brightness: Brightness.light,
      primary: primaryColor,
      onPrimary: onPrimaryColor,
      secondary: secondaryColor,
      onSecondary: onSecondaryColor,
      error: errorColor,
      onError: Colors.white,
      surface: surfaceColor,
      onSurface: onSurfaceColor,
    );
    return ThemeData(
      primaryColor: primaryColor,
      cardColor: cardColor,
      fontFamily: 'SFPro',
      fontFamilyFallback: const ['monospace'],
      colorScheme: colorScheme,
      brightness: colorScheme.brightness,
      textSelectionTheme: TextSelectionThemeData(cursorColor: colorScheme.primary),
      appBarTheme: const AppBarTheme(backgroundColor: surfaceColor),
      splashColor: Colors.transparent,
      tabBarTheme: TabBarThemeData(
        indicatorColor: colorScheme.onSurface,
      ),
    );
  }
}
