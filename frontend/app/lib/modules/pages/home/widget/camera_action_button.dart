import 'package:flutter/material.dart';
import '../../../../common/extension/ui_ext.dart';

/// 相机操作类型枚举
enum CameraActionType {
  /// 不显示
  none,

  /// 拍照
  capture,

  /// 返回
  back,

  /// 闪光灯
  flash,

  /// 音量采集---金银
  mute,

  /// 发送
  send,

  /// 预聊天页
  preChat,

  /// 切换前后摄像头
  toggleCamera,

  /// 请求 Action Card
  requestActionCard,
}

/// 相机操作按钮尺寸预设
enum CameraActionsButtonSize {
  /// 小尺寸 (29x29)，用于顶部工具栏
  small._(buttonSize: 29),

  /// 中等尺寸 (32x32)，用于底部工具栏
  medium._(buttonSize: 32),

  /// 默认尺寸 (44x44)
  regular._(buttonSize: 44),

  /// 大尺寸 (72x72)，用于拍照按钮
  large._(buttonSize: 72);

  const CameraActionsButtonSize._({
    required this.buttonSize,
  });

  final double buttonSize;
}

/// 相机操作按钮组件
///
/// 封装了 [buildCommonLayer] 的通用相机操作按钮，
/// 提供统一的样式和交互体验。
class CameraActionsButton extends StatelessWidget {
  const CameraActionsButton({
    super.key,
    this.size = CameraActionsButtonSize.regular,
    this.onTap,
    this.customSize,
    this.border,
    required this.child,
  });

  /// 按钮尺寸预设
  final CameraActionsButtonSize size;

  /// 点击回调
  final VoidCallback? onTap;

  /// 自定义按钮尺寸
  final Size? customSize;

  /// 自定义边框
  final BoxBorder? border;

  /// 子Widget
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final buttonSize = customSize ?? Size(size.buttonSize.dpx, size.buttonSize.dpx);

    return context.buildCameraBtnLayer(
      size: buttonSize,
      border: border,
      onTap: onTap,
      child: Center(child: child),
    );
  }
}
