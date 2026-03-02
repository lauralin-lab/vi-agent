import 'dart:async';

import 'package:flutter/material.dart';

/// Manages a list of one-shot timers and cancels them all on dispose.
///
/// Usage:
///   class _MyState extends State`<MyWidget>` with TimerMixin {
///     void _doSomething() {
///       schedule(400, () => setState(() => _visible = true));
///     }
///   }
mixin TimerMixin<T extends StatefulWidget> on State<T> {
  final List<Timer> _mixinTimers = [];

  /// Schedule [fn] to run after [ms] milliseconds.
  /// The timer is auto-cancelled in dispose().
  void schedule(int ms, VoidCallback fn) {
    _mixinTimers.add(Timer(Duration(milliseconds: ms), fn));
  }

  @override
  void dispose() {
    for (final t in _mixinTimers) {
      t.cancel();
    }
    super.dispose();
  }
}

/// Tracks which named sections are collapsed and exposes toggle logic.
///
/// Usage:
///   class _MyState extends State`<MyWidget>` with CollapsibleSectionsMixin {
///     // In build:
///     SessionSection(
///       collapsed: isSectionCollapsed('mySection'),
///       onToggle: () => toggleSection('mySection'),
///     )
mixin CollapsibleSectionsMixin<T extends StatefulWidget> on State<T> {
  final collapsedSections = <String>{};

  void toggleSection(String id) {
    setState(() {
      if (collapsedSections.contains(id)) {
        collapsedSections.remove(id);
      } else {
        collapsedSections.add(id);
      }
    });
  }

  bool isSectionCollapsed(String id) => collapsedSections.contains(id);
}
