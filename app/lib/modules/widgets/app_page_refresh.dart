import 'dart:math' as math;

import 'package:easy_refresh/easy_refresh.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

//////////////////////////////////////////////////////////////////////////////
// AppRefreshHeader — 自定义刷新指示器（圆环进度动画）
//////////////////////////////////////////////////////////////////////////////

/// 自定义刷新 Header — 类似 CircularProgressIndicator
///
/// 下拉时圆弧逐渐填满，刷新中持续旋转。
class AppRefreshHeader extends Header {
  const AppRefreshHeader({
    super.triggerOffset = 80,
    super.clamping = false,
    super.hapticFeedback = false,
  });

  @override
  Widget build(BuildContext context, IndicatorState state) {
    return _AppRefreshIndicator(state: state);
  }
}

class _AppRefreshIndicator extends StatefulWidget {
  const _AppRefreshIndicator({required this.state});
  final IndicatorState state;

  @override
  State<_AppRefreshIndicator> createState() => _AppRefreshIndicatorState();
}

class _AppRefreshIndicatorState extends State<_AppRefreshIndicator> with SingleTickerProviderStateMixin {
  late final AnimationController _spin;

  @override
  void initState() {
    super.initState();
    _spin = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    );
  }

  @override
  void dispose() {
    _spin.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.state.notifier,
      builder: (context, _) {
        final notifier = widget.state.notifier;
        final offset = notifier.offset;
        final trigger = widget.state.indicator.triggerOffset;
        final mode = widget.state.mode;

        // 下拉进度 0 → 1
        final progress = (offset / trigger).clamp(0.0, 1.0);

        // 刷新中 → 旋转；完成/闲置 → 停止
        final isRefreshing = mode == IndicatorMode.processing || mode == IndicatorMode.armed;
        if (isRefreshing) {
          if (!_spin.isAnimating) _spin.repeat();
        } else if (mode == IndicatorMode.done || mode == IndicatorMode.inactive) {
          _spin.stop();
          _spin.reset();
        }

        const indicatorSize = 32.0;

        return SizedBox(
          height: offset,
          child: Center(
            child: AnimatedOpacity(
              duration: const Duration(milliseconds: 150),
              opacity: progress.clamp(0.0, 1.0),
              child: SizedBox(
                width: indicatorSize,
                height: indicatorSize,
                child: AnimatedBuilder(
                  animation: _spin,
                  builder: (context, child) {
                    return CustomPaint(
                      painter: _ArcPainter(
                        progress: progress,
                        rotation: _spin.value * 2 * math.pi,
                        isRefreshing: isRefreshing,
                        color: const Color(0xFF8C908F),
                      ),
                    );
                  },
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

/// 圆弧绘制
class _ArcPainter extends CustomPainter {
  _ArcPainter({
    required this.progress,
    required this.rotation,
    required this.isRefreshing,
    required this.color,
  });

  final double progress;
  final double rotation;
  final bool isRefreshing;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (size.shortestSide - 4) / 2;

    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round;

    // 背景轨道（下拉阶段显示，刷新中隐藏）
    if (!isRefreshing) {
      canvas.drawCircle(center, radius, paint..color = color.withOpacity(0.15));
    }

    // 前景弧
    paint.color = color;
    final rect = Rect.fromCircle(center: center, radius: radius);

    if (isRefreshing) {
      // 刷新中：缺口圆环旋转（约 300°，留 60° 缺口）
      canvas.drawArc(
        rect,
        rotation,
        math.pi * 5 / 3,
        false,
        paint,
      );
    } else {
      // 下拉中：弧长随进度从 0° → 360°
      canvas.drawArc(
        rect,
        -math.pi / 2,
        math.pi * 2 * progress,
        false,
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(_ArcPainter oldDelegate) =>
      progress != oldDelegate.progress || rotation != oldDelegate.rotation || isRefreshing != oldDelegate.isRefreshing;
}

//////////////////////////////////////////////////////////////////////////////
// AppRefresh — 带渐进式震动的下拉刷新封装
//////////////////////////////////////////////////////////////////////////////

/// 下拉刷新组件，带渐进式震动反馈
///
/// 下拉越深，震动越强：
/// - 轻震 (lightImpact)
/// - 中震 (mediumImpact)
/// - 重震 (heavyImpact)
///
/// 默认使用 [AppRefreshHeader]（渐变圆点动画）。
class AppRefresh extends StatefulWidget {
  const AppRefresh({
    super.key,
    required this.onRefresh,
    required this.child,
    this.header,
    this.triggerOffset = 80,
    this.hapticThresholds = const [20, 50, 90],
  });

  /// 刷新回调
  final Future<void> Function() onRefresh;

  /// 子组件（通常是 CustomScrollView）
  final Widget child;

  /// 自定义 Header，默认 AppRefreshHeader
  final Header? header;

  /// 触发刷新的偏移量
  final double triggerOffset;

  /// 震动阈值列表（最多 3 级：light → medium → heavy）
  final List<double> hapticThresholds;

  @override
  State<AppRefresh> createState() => _AppRefreshState();
}

class _AppRefreshState extends State<AppRefresh> {
  late final EasyRefreshController _controller;
  int _lastHapticLevel = 0;

  @override
  void initState() {
    super.initState();
    _controller = EasyRefreshController(controlFinishRefresh: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _triggerProgressiveHaptic(double pixels) {
    int level = 0;
    for (int i = 0; i < widget.hapticThresholds.length; i++) {
      if (pixels >= widget.hapticThresholds[i]) level = i + 1;
    }
    if (level > _lastHapticLevel) {
      _lastHapticLevel = level;
      switch (level) {
        case 1:
          HapticFeedback.lightImpact();
          break;
        case 2:
          HapticFeedback.mediumImpact();
          break;
        case 3:
          HapticFeedback.heavyImpact();
          break;
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return NotificationListener<ScrollNotification>(
      onNotification: (notification) {
        if (notification is ScrollUpdateNotification) {
          final pixels = notification.metrics.pixels;
          if (pixels < 0) {
            _triggerProgressiveHaptic(pixels.abs());
          } else if (_lastHapticLevel > 0) {
            _lastHapticLevel = 0;
          }
        } else if (notification is ScrollEndNotification) {
          _lastHapticLevel = 0;
        }
        return false;
      },
      child: EasyRefresh(
        controller: _controller,
        header: widget.header ?? AppRefreshHeader(triggerOffset: widget.triggerOffset),
        onRefresh: () async {
          HapticFeedback.heavyImpact();
          await widget.onRefresh();
          _controller.finishRefresh();
        },
        child: widget.child,
      ),
    );
  }
}
