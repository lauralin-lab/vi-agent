import 'package:flutter/material.dart';

/// Unified spinning icon used across camera, onboarding, and session screens.
/// Replaces _SpinningLoader (camera/onboarding) and _SpinnerIcon (session).
class CollovSpinner extends StatefulWidget {
  final double size;
  final double opacity;
  final IconData icon;

  const CollovSpinner({
    super.key,
    this.size = 22,
    this.opacity = 0.8,
    this.icon = Icons.loop,
  });

  @override
  State<CollovSpinner> createState() => _CollovSpinnerState();
}

class _CollovSpinnerState extends State<CollovSpinner>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    )..repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return RotationTransition(
      turns: _ctrl,
      child: Icon(
        widget.icon,
        color: Colors.white.withValues(alpha: widget.opacity),
        size: widget.size,
      ),
    );
  }
}
