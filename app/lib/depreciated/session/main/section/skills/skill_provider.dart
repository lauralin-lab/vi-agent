import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../common/utils/log_utils.dart';
import '../../../../../service/session/http/function/skill_http_service.dart';

//////////////////////////////////////////////////////////////////////////////
// 状态管理
//////////////////////////////////////////////////////////////////////////////

/// Skill Tree 状态
class SkillTreeState {
  final SkillTreeData data;
  final bool isLoading;
  final String? error;

  const SkillTreeState({
    this.data = SkillTreeData.empty,
    this.isLoading = false,
    this.error,
  });

  SkillTreeState copyWith({
    SkillTreeData? data,
    bool? isLoading,
    String? error,
  }) {
    return SkillTreeState(
      data: data ?? this.data,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

/// Skill Tree Notifier
class SkillTreeNotifier extends StateNotifier<SkillTreeState> {
  SkillTreeNotifier(this._service) : super(const SkillTreeState());

  final SkillHttpService _service;

  /// 加载技能树数据
  Future<void> loadSkillTree() async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final data = await _service.getSkillTreeData();
      Log.d('[SkillTreeNotifier] Loaded ${data.unlockedCount} active skills');
      state = state.copyWith(data: data, isLoading: false);
    } catch (e) {
      Log.d('[SkillTreeNotifier] loadSkillTree failed: $e');
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }
}

//////////////////////////////////////////////////////////////////////////////
// Riverpod Providers
//////////////////////////////////////////////////////////////////////////////

/// Skill HTTP Service Provider
final skillHttpServiceProvider = Provider<SkillHttpService>((ref) {
  return const SkillHttpService();
});

/// Skill Tree 状态 Provider
final skillTreeProvider = StateNotifierProvider<SkillTreeNotifier, SkillTreeState>((ref) {
  final service = ref.watch(skillHttpServiceProvider);
  return SkillTreeNotifier(service);
});
