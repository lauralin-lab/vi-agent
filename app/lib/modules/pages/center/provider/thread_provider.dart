import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../common/utils/log_utils.dart';
import '../../../../service/gateway/rpc/gateway_provider.dart';
import '../../../../service/session/http/function/thread_http_service.dart';
import '../../../../depreciated/session/main/section/threads/data/thread_model.dart';
import '../../../../depreciated/session/main/section/threads/widget/timeline/timeline.dart';

//////////////////////////////////////////////////////////////////////////////
// 数据转换工具
//////////////////////////////////////////////////////////////////////////////

/// 将 ThreadSession 转换为 ThreadData/ThreadDataGroup 的工具类
class ThreadDataConverter {
  /// 月份缩写
  static const _months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  /// 格式化日期为 "MMM d" 格式（如 "Jan 27"）
  static String _formatDate(DateTime date) {
    return '${_months[date.month - 1]} ${date.day}';
  }

  /// 将 ThreadSession 转换为 ThreadData
  static ThreadData fromThreadSession(ThreadSession session) {
    return ThreadData(
      date: session.timestamp.toString(),
      title: session.title,
      sessionKey: session.key,
      tag: null,
      thumbnailUrl: null,
      sessionInfo: session,
      files: session.files,
    );
  }

  /// 将 ThreadSession 列表按日期分组
  static List<ThreadDataGroup> groupByDate(List<ThreadSession> sessions) {
    if (sessions.isEmpty) return [];

    final Map<String, List<ThreadData>> grouped = {};

    for (final session in sessions) {
      final dateLabel = _formatDate(session.timestamp);
      grouped.putIfAbsent(dateLabel, () => []);
      grouped[dateLabel]!.add(fromThreadSession(session));
    }

    final groups = grouped.entries.map((entry) {
      return ThreadDataGroup(
        dateLabel: entry.key,
        items: entry.value,
      );
    }).toList();

    groups.sort((a, b) => b.dateLabel.compareTo(a.dateLabel));

    return groups;
  }
}

//////////////////////////////////////////////////////////////////////////////
// Thread 列表状态
//////////////////////////////////////////////////////////////////////////////

/// Thread 列表状态
class ThreadListState {
  final List<ThreadSession> sessions;
  final bool isLoading;
  final String? error;

  const ThreadListState({
    this.sessions = const [],
    this.isLoading = false,
    this.error,
  });

  ThreadListState copyWith({
    List<ThreadSession>? sessions,
    bool? isLoading,
    String? error,
  }) {
    return ThreadListState(
      sessions: sessions ?? this.sessions,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

/// Thread 列表 Notifier
class ThreadListNotifier extends StateNotifier<ThreadListState> {
  ThreadListNotifier(this._ref, this._http) : super(const ThreadListState());

  final Ref _ref;
  final ThreadHttpService _http;

  GatewayAPI get _api => _ref.read(gatewayAPIProvider);

  /// 加载所有 Sessions
  Future<void> loadSessions() async {
    if (state.isLoading) return;

    state = state.copyWith(isLoading: true, error: null);

    try {
      final sessions = await _http.getSessions();
      Log.d('[ThreadListNotifier] Loaded ${sessions.length} sessions');
      state = state.copyWith(sessions: sessions, isLoading: false);
    } catch (e) {
      Log.d('[ThreadListNotifier] Load sessions failed: $e');
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  /// 根据 sessionKey 查找 ThreadSession
  ThreadSession? getThreadSessionByKey(String sessionKey) {
    try {
      return state.sessions.firstWhere((s) => s.key == sessionKey);
    } catch (_) {
      return null;
    }
  }

  /// 删除 Thread Session
  Future<void> deleteThreadSession(String sessionKey) async {
    state = state.copyWith(isLoading: true);

    try {
      await _api.deleteSession(sessionKey: sessionKey);
      Log.d('[ThreadListNotifier] Deleted session $sessionKey');

      final newSessions = state.sessions.where((s) => s.key != sessionKey).toList();
      state = state.copyWith(sessions: newSessions, isLoading: false);
    } catch (e) {
      Log.d('[ThreadListNotifier] Delete session $sessionKey failed: $e');
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  /// 重命名 Thread Session
  Future<void> renameThreadSession(String sessionKey, String newName) async {
    try {
      await _api.renameSession(sessionKey: sessionKey, label: newName);
      Log.d('[ThreadListNotifier] Renamed session $sessionKey to $newName');
      await loadSessions();
    } catch (e) {
      Log.d('[ThreadListNotifier] Rename session $sessionKey failed: $e');
    }
  }

  /// 创建新会话
  Future<void> newThreadSession() async {
    try {
      Log.d('[ThreadListNotifier] Creating new session');
      await _api.newSession();
      Log.d('[ThreadListNotifier] New session created');
      await loadSessions();
    } catch (e) {
      Log.d('[ThreadListNotifier] New session failed: $e');
    }
  }

  /// 刷新列表
  Future<void> refresh() async {
    await loadSessions();
  }
}

//////////////////////////////////////////////////////////////////////////////
// Providers
//////////////////////////////////////////////////////////////////////////////

/// Thread 列表状态 Provider
final threadListProvider = StateNotifierProvider<ThreadListNotifier, ThreadListState>((ref) {
  final http = ref.watch(threadHttpServiceProvider);
  return ThreadListNotifier(ref, http);
});

/// 按日期分组的 Thread 列表
final threadGroupsProvider = Provider<List<ThreadDataGroup>>((ref) {
  final threadState = ref.watch(threadListProvider);
  return ThreadDataConverter.groupByDate(threadState.sessions);
});

/// Thread 列表是否正在加载
final isLoadingThreadsProvider = Provider<bool>((ref) {
  return ref.watch(threadListProvider).isLoading;
});

/// Thread 列表的原始 sessions
final threadSessionsProvider = Provider<List<ThreadSession>>((ref) {
  return ref.watch(threadListProvider).sessions;
});

/// 刷新 Thread 列表（删除/重命名后调用）
Future<void> refreshThreads(WidgetRef ref) async {
  await ref.read(threadListProvider.notifier).refresh();
}
