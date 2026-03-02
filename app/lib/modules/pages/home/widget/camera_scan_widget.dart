import 'package:flutter/material.dart';

/// 暴露给外部调用的控制器
class ScanningController {
  VoidCallback? _onPlay;

  /// 供外部调用的重新播放方法
  void play() {
    _onPlay?.call();
  }

  void _attach(VoidCallback onPlay) {
    _onPlay = onPlay;
  }

  void _detach() {
    _onPlay = null;
  }
}

/// 扫描动画覆盖层组件
class ScanningOverlay extends StatefulWidget {
  final ScanningController? controller;
  final Duration duration;
  final int columns;

  const ScanningOverlay({
    super.key,
    this.controller,
    this.duration = const Duration(milliseconds: 2500),
    this.columns = 24,
  });

  @override
  State<ScanningOverlay> createState() => _ScanningOverlayState();
}

class _ScanningOverlayState extends State<ScanningOverlay> with SingleTickerProviderStateMixin {
  late AnimationController _animationController;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      vsync: this,
      duration: widget.duration,
    );

    // 绑定外部控制器的方法
    widget.controller?._attach(_playAnimation);

    // 监听动画状态，播放结束后触发重绘以清除扫描线
    _animationController.addStatusListener((status) {
      if (status == AnimationStatus.completed) {
        setState(() {}); // 触发重绘以清除高亮行
      }
    });

    // 初始也可以默认播一次，如果不需要可以注释掉这行
    _playAnimation();
  }

  @override
  void didUpdateWidget(covariant ScanningOverlay oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.controller != oldWidget.controller) {
      oldWidget.controller?._detach();
      widget.controller?._attach(_playAnimation);
    }
  }

  void _playAnimation() {
    // 每次调用从 0 开始完整播放一次
    _animationController.forward(from: 0.0);
  }

  @override
  void dispose() {
    widget.controller?._detach();
    _animationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _animationController,
      builder: (context, child) {
        // 如果动画没在播放，传 -1 进去，表示只渲染黑色底纹 (progress = -1.0)
        final double progress = _animationController.isAnimating ? _animationController.value : -1.0;

        return CustomPaint(
          size: Size.infinite,
          painter: _ScanningPainter(
            progress: progress,
            columns: widget.columns,
          ),
        );
      },
    );
  }
}

/// 自定义绘制画笔
class _ScanningPainter extends CustomPainter {
  final double progress;
  final int columns;

  _ScanningPainter({
    required this.progress,
    required this.columns,
  });

  // 常量配置
  static const double dotRadius = 4;
  static const double baseAlpha = 0.03;
  static const double peakAlpha = 1.0;
  static const int trailRows = 8;
  static const Color dotColor = Colors.white;

  @override
  void paint(Canvas canvas, Size size) {
    if (size.width == 0 || size.height == 0) return;

    final Paint paint = Paint()..style = PaintingStyle.fill;

    // 为了让点完整显示不被屏幕边缘裁剪一半，设置偏移 padding 等于半径
    const double padding = dotRadius;

    // 【紧贴左右边缘】根据指定的列数，动态推导出 gap 间距
    final double gap = (size.width - padding * 2) / (columns - 1);

    // 垂直方向使用相同的 gap 保持阵列是正方形网格
    final int rows = ((size.height - padding * 2) / gap).ceil() + 1;

    final int totalSweepRows = rows + trailRows;
    final double scanRow = progress >= 0 ? progress * totalSweepRows : -999.0;
    final bool isScanning = progress >= 0;

    for (int r = 0; r < rows; r++) {
      double alpha = baseAlpha;

      if (isScanning) {
        final double dist = scanRow - r;

        if (dist >= 0 && dist < 1) {
          alpha = peakAlpha;
        } else if (dist >= 1 && dist < 1 + trailRows) {
          final double t = (dist - 1) / trailRows;
          alpha = peakAlpha + (baseAlpha - peakAlpha) * t;
        }
      }

      paint.color = dotColor.withValues(alpha: alpha.clamp(0.0, 1.0));

      for (int c = 0; c < columns; c++) {
        final double x = padding + c * gap;
        final double y = padding + r * gap;
        canvas.drawCircle(Offset(x, y), dotRadius, paint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _ScanningPainter oldDelegate) {
    return oldDelegate.progress != progress || oldDelegate.columns != columns;
  }
}
