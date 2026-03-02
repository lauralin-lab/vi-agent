import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../routing/router.dart';
import '../../../service/session/http/function/thread_http_service.dart';
import 'provider/thread_provider.dart';
import 'widgets/empty_state.dart';
import 'widgets/history_group.dart';
import 'widgets/promo_block.dart';
import 'widgets/quick_start_section.dart';
import '../../models/use_cases.dart';

class CenterPage extends ConsumerStatefulWidget {
  const CenterPage({super.key});

  @override
  ConsumerState<CenterPage> createState() => _CenterPageState();
}

class _CenterPageState extends ConsumerState<CenterPage> {
  bool _searchOpen = false;
  String _searchQuery = '';
  final _searchFocus = FocusNode();
  final Map<String, bool> _expanded = {};

  @override
  void initState() {
    super.initState();
    // 初始化时加载 sessions
    Future.microtask(() {
      ref.read(threadListProvider.notifier).loadSessions();
    });
  }

  @override
  void dispose() {
    _searchFocus.dispose();
    super.dispose();
  }

  /// 将 sessions 按时间分组 (Today / Yesterday / This Week / Earlier)
  Map<String, List<ThreadSession>> _groupSessions(List<ThreadSession> sessions) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final yesterday = today.subtract(const Duration(days: 1));
    final weekAgo = today.subtract(const Duration(days: 7));

    final groups = <String, List<ThreadSession>>{};
    for (final session in sessions) {
      final date = DateTime(session.timestamp.year, session.timestamp.month, session.timestamp.day);
      final String group;
      if (!date.isBefore(today)) {
        group = 'Today';
      } else if (!date.isBefore(yesterday)) {
        group = 'Yesterday';
      } else if (!date.isBefore(weekAgo)) {
        group = 'This Week';
      } else {
        group = 'Earlier';
      }
      groups.putIfAbsent(group, () => []).add(session);
    }
    return groups;
  }

  /// 搜索过滤
  List<ThreadSession> _filterSessions(List<ThreadSession> sessions) {
    if (_searchQuery.trim().isEmpty) return sessions;
    final q = _searchQuery.toLowerCase();
    return sessions.where((s) => s.title.toLowerCase().contains(q)).toList();
  }

  @override
  Widget build(BuildContext context) {
    final padding = MediaQuery.of(context).padding;
    final threadState = ref.watch(threadListProvider);
    final sessions = _filterSessions(threadState.sessions);
    final grouped = _groupSessions(sessions);

    return Scaffold(
      backgroundColor: const Color(0xFF0A0A0A),
      body: Stack(
        children: [
          // ── Scrollable content ──
          RefreshIndicator(
            onRefresh: () => ref.read(threadListProvider.notifier).refresh(),
            color: Colors.white,
            backgroundColor: const Color(0xFF1A1A1A),
            child: ListView(
              padding: EdgeInsets.only(top: padding.top, bottom: padding.bottom + 80),
              children: [
                PromoBlock(
                  onOpenProfile: () => const MemoryRoute().push(context),
                ),
                QuickStartSection(
                  templates: kQuickStartTemplates,
                  onTapTemplate: (_) => const HomeRoute().push(context),
                ),
                if (threadState.isLoading && sessions.isEmpty)
                  _buildLoadingState()
                else if (sessions.isEmpty)
                  HistoryEmptyState(
                    onStart: () => const HomeRoute().push(context),
                  )
                else ...[
                  _buildHistoryHeader(sessions.length),
                  ..._kGroupOrder
                      .where((g) => grouped.containsKey(g))
                      .map(
                        (g) => HistoryGroup(
                          name: g,
                          items: grouped[g]!,
                          expanded: _expanded[g] ?? (g == 'Today'),
                          onToggle: () => setState(() => _expanded[g] = !(_expanded[g] ?? (g == 'Today'))),
                          onItemTap: (session) => SessionRoute(
                            SessionRouteExtra(sessionKey: session.key),
                          ).push(context),
                        ),
                      ),
                ],
              ],
            ),
          ),

          // ── Bottom fade ──
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            height: 100,
            child: IgnorePointer(
              child: Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.bottomCenter,
                    end: Alignment.topCenter,
                    colors: [Color(0xFF0A0A0A), Colors.transparent],
                  ),
                ),
              ),
            ),
          ),

          // ── Camera FAB ──
          Positioned(
            bottom: padding.bottom + 20,
            right: 20,
            child: GestureDetector(
              onTap: () {
                if (context.canPop()) {
                  context.pop();
                } else {
                  const HomeRoute().push(context);
                }
              },
              child: Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.9),
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.4),
                      blurRadius: 20,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: const Icon(Icons.camera_alt_outlined, color: Colors.black, size: 22),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ──────────────────────────── Loading State ──────────────────────────────────

  Widget _buildLoadingState() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 60),
      child: Center(
        child: SizedBox(
          width: 24,
          height: 24,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            color: Colors.white.withValues(alpha: 0.3),
          ),
        ),
      ),
    );
  }

  // ──────────────────────────── History Header ────────────────────────────────

  Widget _buildHistoryHeader(int count) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                'HISTORY',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.3),
                  fontSize: 10,
                  fontFamily: 'Courier New',
                  fontWeight: FontWeight.w700,
                  letterSpacing: 2.2,
                ),
              ),
              const SizedBox(width: 4),
              Text(
                '· $count',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.15),
                  fontSize: 10,
                  fontFamily: 'Courier New',
                ),
              ),
              const Spacer(),
              GestureDetector(
                onTap: () {
                  setState(() {
                    _searchOpen = !_searchOpen;
                    if (!_searchOpen) _searchQuery = '';
                  });
                  if (_searchOpen) {
                    Future.delayed(const Duration(milliseconds: 50), () {
                      _searchFocus.requestFocus();
                    });
                  }
                },
                child: Icon(
                  _searchOpen ? Icons.close : Icons.search,
                  color: Colors.white.withValues(alpha: 0.3),
                  size: 16,
                ),
              ),
            ],
          ),

          // Search input
          AnimatedCrossFade(
            duration: const Duration(milliseconds: 220),
            crossFadeState: _searchOpen ? CrossFadeState.showSecond : CrossFadeState.showFirst,
            firstChild: const SizedBox.shrink(),
            secondChild: Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Container(
                height: 36,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.03),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
                ),
                child: Row(
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(left: 10, right: 6),
                      child: Icon(Icons.search, color: Colors.white.withValues(alpha: 0.2), size: 14),
                    ),
                    Expanded(
                      child: TextField(
                        focusNode: _searchFocus,
                        onChanged: (v) => setState(() => _searchQuery = v),
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.8),
                          fontSize: 13,
                        ),
                        decoration: InputDecoration(
                          hintText: 'Search threads...',
                          hintStyle: TextStyle(
                            color: Colors.white.withValues(alpha: 0.2),
                            fontSize: 13,
                          ),
                          border: InputBorder.none,
                          isDense: true,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

const _kGroupOrder = ['Today', 'Yesterday', 'This Week', 'Earlier'];
