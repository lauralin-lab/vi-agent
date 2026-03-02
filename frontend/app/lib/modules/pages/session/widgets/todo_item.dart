import 'package:flutter/material.dart';

import '../../../shared/spinner.dart';

// ─── Models ───────────────────────────────────────────────────────────────────

class TodoSubstep {
  final String text;
  final int delayMs;
  const TodoSubstep(this.text, this.delayMs);
}

enum TodoStatus { pending, active, completed }

class SessionTodo {
  final int id;
  final String text;
  final List<TodoSubstep> substeps;
  final String completedSummary;
  TodoStatus status = TodoStatus.pending;
  String activeSubstep = '';

  SessionTodo({
    required this.id,
    required this.text,
    required this.substeps,
    required this.completedSummary,
  });
}

// ─── Widget ───────────────────────────────────────────────────────────────────

/// Single todo item card with pending / active (spinner + substeps) / completed states.
class TodoItemCard extends StatelessWidget {
  final SessionTodo todo;

  const TodoItemCard({super.key, required this.todo});

  @override
  Widget build(BuildContext context) {
    final isActive = todo.status == TodoStatus.active;
    final isCompleted = todo.status == TodoStatus.completed;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
      decoration: BoxDecoration(
        color: isActive
            ? Colors.white.withValues(alpha: 0.02)
            : isCompleted
            ? Colors.white.withValues(alpha: 0.01)
            : Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isActive ? Colors.white.withValues(alpha: 0.08) : Colors.white.withValues(alpha: 0.04),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: isCompleted
                ? Icon(Icons.check_circle_outline, color: Colors.white.withValues(alpha: 0.5), size: 16)
                : isActive
                ? const CollovSpinner(
                    size: 16,
                    opacity: 0.6,
                    icon: Icons.refresh_rounded,
                  )
                : Icon(Icons.circle_outlined, color: Colors.white.withValues(alpha: 0.1), size: 16),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  todo.text,
                  style: TextStyle(
                    color: isCompleted
                        ? Colors.white.withValues(alpha: 0.4)
                        : isActive
                        ? Colors.white.withValues(alpha: 0.85)
                        : Colors.white.withValues(alpha: 0.2),
                    fontSize: 12,
                    height: 1.4,
                    letterSpacing: 0.2,
                  ),
                ),
                if (isActive && todo.activeSubstep.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.memory, color: Colors.white.withValues(alpha: 0.3), size: 9),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          todo.activeSubstep,
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.35),
                            fontSize: 10,
                            fontFamily: 'Courier New',
                            height: 1.5,
                            letterSpacing: 0.3,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
                if (isCompleted) ...[
                  const SizedBox(height: 4),
                  Text(
                    '✓ ${todo.completedSummary}',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.4),
                      fontSize: 10,
                      fontFamily: 'Courier New',
                      height: 1.4,
                      letterSpacing: 0.3,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
