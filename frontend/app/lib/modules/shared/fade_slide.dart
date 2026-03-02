import 'package:flutter/material.dart';

/// Fade-in + slide-up entrance animation widget.
///
/// Matches framer-motion pattern:
///   initial={{ opacity: 0, y: fromY }}  animate={{ opacity: 1, y: 0 }}
///
/// Trigger by toggling [visible] from false → true.
class FadeSlide extends StatelessWidget {
  final bool visible;
  final Widget child;

  /// Vertical offset to slide from (pixels, positive = down).
  final double fromY;
  final Duration duration;
  final Curve curve;

  const FadeSlide({
    super.key,
    required this.visible,
    required this.child,
    this.fromY = 12,
    this.duration = const Duration(milliseconds: 600),
    this.curve = const Cubic(0.23, 1.0, 0.32, 1.0),
  });

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: fromY, end: visible ? 0.0 : fromY),
      duration: duration,
      curve: curve,
      builder: (_, y, inner) => Transform.translate(
        offset: Offset(0, y),
        child: AnimatedOpacity(
          opacity: visible ? 1.0 : 0.0,
          duration: duration,
          curve: curve,
          child: inner,
        ),
      ),
      child: child,
    );
  }
}
