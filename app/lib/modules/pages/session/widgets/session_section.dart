import 'package:flutter/material.dart';

/// Collapsible section wrapper used throughout SessionScreen.
///
/// Renders a labelled header row (icon + label + divider + chevron)
/// and an animated expand/collapse body.
class SessionSection extends StatelessWidget {
  final String id;
  final IconData icon;
  final String label;
  final Widget child;
  final bool collapsed;
  final VoidCallback onToggle;

  const SessionSection({
    super.key,
    required this.id,
    required this.icon,
    required this.label,
    required this.child,
    required this.collapsed,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: onToggle,
          child: Row(
            children: [
              Icon(icon, color: Colors.white.withValues(alpha: 0.3), size: 13),
              const SizedBox(width: 8),
              Text(
                label,
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.3),
                  fontSize: 9,
                  fontFamily: 'Courier New',
                  fontWeight: FontWeight.w700,
                  letterSpacing: 2.0,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Container(
                  height: 1,
                  color: Colors.white.withValues(alpha: 0.04),
                ),
              ),
              const SizedBox(width: 8),
              AnimatedRotation(
                turns: collapsed ? 0 : 0.5,
                duration: const Duration(milliseconds: 300),
                child: Icon(
                  Icons.keyboard_arrow_up_rounded,
                  color: Colors.white.withValues(alpha: 0.15),
                  size: 13,
                ),
              ),
            ],
          ),
        ),
        AnimatedCrossFade(
          duration: const Duration(milliseconds: 300),
          crossFadeState:
              collapsed ? CrossFadeState.showSecond : CrossFadeState.showFirst,
          firstChild: Padding(
            padding: const EdgeInsets.only(top: 12),
            child: child,
          ),
          secondChild: const SizedBox.shrink(),
        ),
      ],
    );
  }
}
