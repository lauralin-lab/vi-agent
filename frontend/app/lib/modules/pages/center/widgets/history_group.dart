import 'package:flutter/material.dart';

import '../../../../service/session/http/function/thread_http_service.dart';
import 'history_item.dart';

class HistoryGroup extends StatelessWidget {
  final String name;
  final List<ThreadSession> items;
  final bool expanded;
  final VoidCallback onToggle;
  final ValueChanged<ThreadSession> onItemTap;

  const HistoryGroup({
    super.key,
    required this.name,
    required this.items,
    required this.expanded,
    required this.onToggle,
    required this.onItemTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.02),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: Colors.white.withValues(alpha: 0.05)),
        ),
        child: Column(
          children: [
            // Group header
            GestureDetector(
              onTap: onToggle,
              behavior: HitTestBehavior.opaque,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                child: Row(
                  children: [
                    Text(
                      name,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.7),
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.2,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.04),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        '${items.length}',
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.2),
                          fontSize: 10,
                          fontFamily: 'Courier New',
                        ),
                      ),
                    ),
                    const Spacer(),
                    AnimatedRotation(
                      turns: expanded ? 0 : -0.25,
                      duration: const Duration(milliseconds: 200),
                      child: Icon(
                        Icons.expand_more,
                        color: Colors.white.withValues(alpha: 0.25),
                        size: 16,
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Items
            if (expanded)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Column(
                  children: items
                      .map(
                        (s) => HistoryItem(
                          session: s,
                          onTap: () => onItemTap(s),
                        ),
                      )
                      .toList(),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
