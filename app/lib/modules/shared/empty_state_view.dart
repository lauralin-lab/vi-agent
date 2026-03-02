import 'package:flutter/material.dart';

/// Dark-themed empty state view matching the design system palette.
///
/// Compact enough to sit inside a card, with a subtle glassy icon circle,
/// muted-white title, and optional subtitle / action widget.
class EmptyStateView extends StatelessWidget {
  const EmptyStateView({
    super.key,
    this.title,
    this.subtitle,
    this.action,
  });

  final String? title;
  final String? subtitle;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Image icon with dark-theme tint
          Image.asset(
            'assets/images/ic_empty.webp',
            width: 48,
            height: 48,
            color: Colors.white.withValues(alpha: 0.18),
          ),

          if (title != null) ...[
            const SizedBox(height: 14),
            Text(
              title!,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.3),
                fontSize: 13,
                fontWeight: FontWeight.w500,
                letterSpacing: 0.2,
              ),
            ),
          ],

          if (subtitle != null) ...[
            const SizedBox(height: 6),
            Text(
              subtitle!,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.18),
                fontSize: 12,
                height: 1.5,
              ),
            ),
          ],

          if (action != null) ...[
            const SizedBox(height: 20),
            action!,
          ],
        ],
      ),
    );
  }
}
