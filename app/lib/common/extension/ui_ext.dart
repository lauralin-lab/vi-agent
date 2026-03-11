import 'dart:io';
import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:lottie/lottie.dart';

import '../../modules/style/app_theme.dart';
import '../../modules/widgets/app_image.dart';

enum CommonButtonType {
  /// 返回按钮
  arrow._(
    icon: Icons.arrow_back_ios_new,
    size: 20,
    color: Colors.white,
    buttonSize: kToolbarHeight,
    weight: FontWeight.w500,
  ),

  /// 返回按钮（圆润版）
  arrowRound._(
    icon: Icons.arrow_back_ios_new_rounded,
    size: 18,
    color: Colors.white,
    buttonSize: kToolbarHeight,
    weight: FontWeight.w500,
  ),

  /// 关闭按钮
  close._(
    icon: Icons.close,
    size: 18,
    color: Colors.white,
    buttonSize: 24,
    weight: FontWeight.w500,
  ),

  /// 关闭按钮（圆润版）
  closeRound._(
    icon: Icons.close_rounded,
    size: 18,
    color: Colors.white,
    buttonSize: 24,
    weight: FontWeight.w500,
  ),

  /// 播放按钮
  playRound._(
    icon: Icons.play_arrow_rounded,
    size: 28,
    color: Colors.white,
    buttonSize: 28,
    weight: FontWeight.bold,
  ),

  /// 播放按钮
  pause._(
    icon: Icons.pause,
    size: 26,
    color: Colors.white,
    buttonSize: 28,
    weight: FontWeight.normal,
  ),

  /// 下载按钮
  download._(
    icon: Icons.arrow_downward,
    size: 20,
    color: Colors.white,
    buttonSize: 28,
    weight: FontWeight.bold,
  ),

  /// 前进按钮
  forward._(
    icon: Icons.arrow_forward_ios,
    size: 18,
    color: Colors.white,
    buttonSize: kToolbarHeight,
    weight: FontWeight.w500,
  );

  /// 枚举构造
  const CommonButtonType._({
    required this.icon,
    required this.size,
    required this.color,
    required this.buttonSize,
    required this.weight,
  });

  /// 图标
  final IconData icon;

  /// 默认图标大小
  final double size;

  /// 默认图标颜色
  final Color color;

  /// 默认按钮大小
  final double buttonSize;

  /// 默认权重
  final FontWeight weight;
}

extension UIContextExt on BuildContext {
  /// 构建圆圈加载视图
  Widget buildCircularLoading({
    Key? key,
    double size = 96,
    double strokeWidth = 12,
    Color color = Colors.white,
  }) {
    final child = RepaintBoundary(
      child: CircularProgressIndicator(
        color: color,
        strokeWidth: strokeWidth,
        strokeCap: StrokeCap.round,
      ),
    );

    // 居中
    return Center(
      key: key,
      child: SizedBox.square(dimension: size, child: child),
    );
  }

  /// 构建导航栏返回按钮
  Widget buildAppBarBackButton() {
    return ClipRRect(
      borderRadius: const BorderRadius.all(Radius.circular(40)),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 30, sigmaY: 30),
        child: buildCommonButton(
          type: CommonButtonType.arrow,
          color: Colors.white.withValues(alpha: 0.4),
          backgroundColor: Colors.white.withValues(alpha: 0.1),
          borderRadius: const BorderRadius.all(Radius.circular(40)),
          size: 40,
        ),
      ),
    );
  }

  /// 构建通用图标按钮
  ///
  /// [onTap] 点击事件
  /// [size] 按钮大小
  /// [iconSize] 图标大小
  /// [color] 图标颜色
  /// [backgroundColor] 背景颜色
  /// [weight] 图片粗细权重
  /// [rounded] 圆润版本
  Widget buildCommonButton({
    required CommonButtonType type,
    VoidCallback? onTap,
    double? size,
    double? iconSize,
    Color? color,
    Color? backgroundColor,
    FontWeight? weight,
    BorderRadius? borderRadius,
  }) {
    final decorate = backgroundColor != null;
    final widget = InkWell(
      borderRadius: borderRadius,
      onTap: onTap,
      child: Container(
        width: size ?? type.buttonSize,
        height: size ?? type.buttonSize,
        alignment: Alignment.center,
        child: buildIcon(
          type.icon,
          color: color ?? type.color,
          size: iconSize ?? type.size,
          weight: weight ?? type.weight,
        ),
      ),
    );
    return Material(
      type: decorate ? MaterialType.canvas : MaterialType.transparency,
      color: backgroundColor,
      borderRadius: decorate ? borderRadius : null,
      child: widget,
    );
  }

  /// 构建图标
  ///
  /// [onTap] 点击事件
  /// [size] 图标大小
  /// [color] 图标颜色
  /// [weight] 图片粗细权重
  Widget buildIcon(
    IconData icon, {
    double size = 16,
    Color color = Colors.black,
    FontWeight? weight = FontWeight.bold,
    bool inherit = false,
    List<Shadow>? shadows,
    FontStyle? fontStyle,
  }) {
    return RichText(
      overflow: TextOverflow.visible,
      text: TextSpan(
        text: String.fromCharCode(icon.codePoint),
        style: TextStyle(
          inherit: inherit,
          color: color,
          fontSize: size,
          fontFamily: icon.fontFamily,
          package: icon.fontPackage,
          fontWeight: weight,
          shadows: shadows,
          fontStyle: fontStyle,
        ),
      ),
    );
  }

  /// 构建关闭按钮
  Widget buildCloseButton({
    VoidCallback? onTap,
    double size = 24,
    double iconSize = 18,
    Color color = const Color(0xFFB6B6C8),
    Color? backgroundColor = AppTheme.secondaryColor,
    FontWeight? weight = FontWeight.bold,
    bool rounded = true,
  }) {
    final decorate = backgroundColor != null;
    final borderRadius = BorderRadius.circular(size / 2);
    return Material(
      type: decorate ? MaterialType.canvas : MaterialType.transparency,
      color: backgroundColor,
      borderRadius: decorate ? borderRadius : null,
      child: InkWell(
        onTap: onTap,
        borderRadius: borderRadius,
        child: Container(
          width: size,
          height: size,
          alignment: Alignment.center,
          child: buildIcon(
            rounded ? Icons.close_rounded : Icons.close,
            color: color,
            size: iconSize,
            weight: weight,
          ),
        ),
      ),
    );
  }

  /// 构建叠层的通用Container
  Widget buildCameraBtnLayer({
    required Widget child,
    required Size size,
    VoidCallback? onTap,
    BoxBorder? border,
    BorderRadiusGeometry? borderRadius,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: ClipRRect(
        borderRadius: borderRadius ?? BorderRadius.all(Radius.circular(44.dpx)),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 18.dpx, sigmaY: 18.dpx),
          child: Container(
            width: size.width,
            height: size.height,
            decoration: BoxDecoration(
              borderRadius: borderRadius ?? BorderRadius.all(Radius.circular(44.dpx)),
              border: border ?? Border.all(color: Colors.white.withValues(alpha: 0.2), width: 1.dpx),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.2),
                  offset: const Offset(0, -1),
                  blurStyle: BlurStyle.inner,
                )
              ]
            ),
            child: Center(
              child: child,
            ),
          ),
        ),
      ),
    );
  }

  /// 构建一个加载动画
  Widget buildLoadingAnimation({
    Color? backgroundColor = Colors.black54,
    BoxConstraints? constraints,
    AlignmentGeometry? alignment = Alignment.center,
    double? height = 150,
  }) {
    return Container(
      alignment: alignment,
      constraints: constraints,
      color: backgroundColor,
      child: Lottie.asset(
        'assets/lottie/loading.json',
        height: height,
        delegates: LottieDelegates(
          values: [
            ValueDelegate.colorFilter(
              ['**'],
              value: const ColorFilter.mode(AppTheme.primaryColor, BlendMode.srcIn),
            ),
          ],
        ),
      ),
    );
  }
}

extension UIStateExt<T extends StatefulWidget> on State<T> {}

class UIExt {
  const UIExt._();

  /// 获取屏幕大小
  static Size get absScreenSize {
    return _view.physicalSize / _view.devicePixelRatio;
  }

  /// 获取屏幕大小（物理像素）
  static Size get absPhysicalSize => _view.physicalSize;

  /// 屏幕安全区大小
  static EdgeInsets get absSafeArea {
    final p = _view.padding;
    final r = _view.devicePixelRatio;
    return EdgeInsets.fromLTRB(
      p.left / r,
      p.top / r,
      p.right / r,
      p.bottom / r,
    );
  }

  /// 低分辨率手机， 720P 或以下的手机，这里是物理分辨率，而不是逻辑
  static bool get lowResolutionDevice {
    final size = _view.physicalSize;
    return math.min(size.width, size.height) <= 720;
  }

  /// 屏幕像素比
  static double get devicePixelRatio => _view.devicePixelRatio;

  /// 获取 View
  static FlutterView get _view => PlatformDispatcher.instance.views.first;

  /// 选择合适的用户合成图封面全屏宽度
  static double? get fullFusionCoverWidth {
    final size = _view.physicalSize;
    final m = math.min(size.width, size.height);
    if (m >= 1080) return null;
    if (m >= 1024) return 1024;
    if (m >= 960) return 960;
    if (m >= 720) return 720;
    return 640;
  }

  /// 计算动态缩放比
  /// 用于一些特殊机型的适配
  static double get dps {
    if (_sDps != null) return _sDps!;
    final ms = absScreenSize.shortestSide;
    double dps = 1.0;
    if (Platform.isAndroid) {
      // 针对 三星 Note 或 Google Pixel 等部分机型进行一个轻微放大
      if (ms > 408.0 && ms < 444.0) {
        dps = 1.025;
      }
    } else if (Platform.isIOS) {
      // 针对 pro max 和 plus 机型适配，但是禁止用于平板
      // 截止到 2024 年底，最大 pt 为 440，456 为冗余计算
      if (ms > 410.0 && ms < 456.0) {
        dps = ms / 380.0;
      }
    }
    return (_sDps = dps);
  }

  /// 动态缩放比，配合人体工程
  static double? _sDps;
}

extension UIExtDouble on double {
  /// 动态像素
  ///
  /// 用于特殊情况下时适配
  double get dpx => this * UIExt.dps;

  /// 像素
  ///
  /// 用逻辑像素除以屏幕像素比
  double get px => this / UIExt.devicePixelRatio;
}

extension UIExtInt on int {
  /// 动态像素
  ///
  /// 用于特殊情况下时适配
  double get dpx => this * UIExt.dps;

  /// 像素
  ///
  /// 用逻辑像素除以屏幕像素比
  double get px => this / UIExt.devicePixelRatio;
}
