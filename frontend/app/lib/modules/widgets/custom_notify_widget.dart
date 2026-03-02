import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:fluttertoast/fluttertoast.dart';
import 'package:gap/gap.dart';
import 'package:rive_rolls_rich_text/auto_rich_text.dart';

import '../../common/extension/color_ext.dart';
import '../../common/extension/ui_ext.dart';
import '../style/app_theme.dart';

const _toastDuration = Duration(milliseconds: 3200);
const _animationDuration = Duration(milliseconds: 350);
const _fadeDuration = Duration(milliseconds: 200);
const _delayDuration = Duration(milliseconds: 150);

const _bgPadding = EdgeInsets.only(left: 15, right: 5, top: 12, bottom: 12);

/// 提示错误
/// [duration] 显示时间，[dragHide] 拖拽关闭
void notifyError(String message, {Duration duration = _toastDuration, bool dragHide = false}) {
  customNotify(
    duration: duration,
    dragHide: dragHide,
    child: CustomNotifyWidget(
      icon: const AssetImage('assets/images/ic_notify_error.webp'),
      backgroundColor: const Color(0xFF2F1010),
      textStyle: const TextStyle(color: Colors.white),
      message: message,
    ),
  );
}

/// 提示网络不佳
/// [duration] 显示时间，[dragHide] 拖拽关闭
void notifyPoorNetwork(String message, {Duration duration = _toastDuration, bool dragHide = true}) {
  customNotify(
    duration: duration,
    dragHide: dragHide,
    child: DefaultTextStyle.merge(
      child: CustomNotifyWidget(
        icon: const AssetImage('assets/images/ic_notify_network_error.webp'),
        backgroundColor: AppTheme.secondaryColor.scaled(0.9),
        textStyle: const TextStyle(color: Colors.white),
        message: message,
      ),
    ),
  );
}

/// 提示完成
/// [duration] 显示时间，[dragHide] 拖拽关闭
void notifyDone(String message, {bool rich = false, Duration duration = _toastDuration, bool dragHide = true}) {
  customNotify(
    duration: duration,
    dragHide: dragHide,
    child: CustomNotifyWidget(
      icon: const AssetImage('assets/images/ic_notify_done.webp'),
      iconSize: 14,
      iconColor: Colors.white,
      backgroundColor: AppTheme.secondaryColor.scaled(0.9),
      textStyle: const TextStyle(color: Colors.white),
      message: message,
      rich: rich,
    ),
  );
}

/// 提示消息
/// [duration] 显示时间，[dragHide] 拖拽关闭
void notifyMessage(
  String message, {
  String imagePath = 'assets/images/ic_notify_info.webp',
  double iconSize = 22,
  Duration duration = _toastDuration,
  bool dragHide = true,
}) {
  customNotify(
    duration: duration,
    dragHide: dragHide,
    child: CustomNotifyWidget(
      icon: AssetImage(imagePath),
      backgroundColor: AppTheme.secondaryColor.scaled(0.9),
      textStyle: const TextStyle(color: Colors.white),
      message: message,
      iconSize: iconSize,
    ),
  );
}

/// 自定义通知
/// [duration] 显示时间，[dragHide] 拖拽关闭
void customNotify({required Widget child, Duration duration = _toastDuration, bool dragHide = true}) {
  assert(_toastDuration.inMicroseconds >= 1000);
  FToast().showToast(
    toastDuration: duration,
    fadeDuration: _fadeDuration,
    child: child,
    positionedToastBuilder: (_, child, __) => Positioned(
      top: 0,
      left: 8,
      right: 8,
      child: ToastWidget(child, duration, dragHide),
    ),
  );
}

/// 显示Toast
void customCenterNotify(String msg,) {
  Fluttertoast.showToast(
    msg: msg,
    gravity: ToastGravity.CENTER,
    backgroundColor: Colors.black,
    textColor: Colors.white,
    fontSize: 14.0,
  );
}

/// 自定义通知提示组件
class CustomNotifyWidget extends StatelessWidget {
  /// 图标
  final ImageProvider icon;

  /// 背景色
  final Color? backgroundColor;

  /// 边框
  final Border? border;

  /// 提示消息
  final String message;

  /// 是否为富文本
  final bool rich;

  /// 图标大小
  final double? iconSize;

  final Color? iconColor;

  /// 文本样式
  final TextStyle? textStyle;

  /// 是否显示关闭按钮
  final bool showClose;

  const CustomNotifyWidget({
    super.key,
    required this.icon,
    this.iconColor,
    this.backgroundColor,
    this.border,
    required this.message,
    this.rich = false,
    this.iconSize = 22,
    this.textStyle,
    this.showClose = false,
  });

  @override
  Widget build(BuildContext context) {
    final style = TextStyle(fontWeight: FontWeight.w600, fontSize: 13.dpx).merge(textStyle);
    const bRadius = BorderRadius.all(Radius.circular(8));
    final text = rich ? AutoRichText.sample(text: message, style: style) : Text(message, style: style);
    Widget children = Row(mainAxisSize: MainAxisSize.max, children: [
      Image(image: icon, width: iconSize, height: iconSize, color: iconColor),
      const Gap(10),
      Expanded(child: text),
    ]);
    if (showClose) {
      children = Row(
        mainAxisSize: MainAxisSize.max,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Flexible(child: children),
          GestureDetector(
            onTap: FToast().removeCustomToast, // 此处无法拿到外部的关闭方法
            child: Container(
              padding: const EdgeInsets.all(3),
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.black12,
              ),
              child: const Icon(Icons.close_rounded, size: 18),
            ),
          )
        ],
      );
    }
    return Container(
      padding: _bgPadding,
      decoration: BoxDecoration(
        color: backgroundColor ?? Theme.of(context).colorScheme.surface,
        borderRadius: bRadius,
        border: border,
      ),
      child: children,
    );
  }
}

class ToastWidget extends StatefulWidget {
  const ToastWidget(
    this.child,
    this.duration,
    this.dragHide, {
    super.key,
  });

  final Widget child;

  final Duration duration;

  final bool dragHide;

  @override
  State<ToastWidget> createState() => _ToastState();
}

class _ToastState extends State<ToastWidget> with SingleTickerProviderStateMixin {
  _ToastState();

  late final AnimationController _animationCtrl;

  Timer? _timer;

  double _offset = 0;

  void showIt() {
    _animationCtrl.animateTo(1, curve: Curves.easeInOutSine);
  }

  void hideIt() {
    _animationCtrl.animateBack(0, curve: Curves.easeInOutSine);
    _timer?.cancel();
  }

  @override
  void initState() {
    _animationCtrl = AnimationController(
      vsync: this,
      duration: _animationDuration - _delayDuration,
    )..addListener(() => setState(() {}));

    super.initState();

    showIt();
    _timer = Timer(widget.duration, hideIt);
  }

  @override
  void deactivate() {
    _timer?.cancel();
    _animationCtrl.stop();
    super.deactivate();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _animationCtrl.dispose();
    super.dispose();
  }

  double _top(BuildContext context) => MediaQuery.of(context).padding.top + 20;

  @override
  Widget build(BuildContext context) {
    final top = _top(context);
    Widget child = widget.child;
    if (widget.dragHide) {
      child = GestureDetector(
        onVerticalDragUpdate: _onVerticalDragUpdate,
        onVerticalDragEnd: _onVerticalDragEnd,
        onVerticalDragCancel: _onVerticalDragCancel,
        child: child,
      );
    }
    return Transform.translate(
      offset: Offset(0, _animationCtrl.value * top - 12),
      child: child,
    );
  }

  void _onVerticalDragUpdate(DragUpdateDetails details) {
    _offset += details.delta.dy;
    _offset = min(0, _offset);
    final top = _top(context);
    final v = ((_offset + top + 12) / top).clamp(0.0, 1.0);

    if (!mounted) return;
    _animationCtrl.value = v;
  }

  void _onVerticalDragEnd(DragEndDetails details) {
    _onVerticalDragCancel();
  }

  void _onVerticalDragCancel() {
    if (!mounted) return;
    if (_offset < -32) {
      hideIt();
      FToast().removeCustomToast();
    } else {
      showIt();
    }
  }
}
