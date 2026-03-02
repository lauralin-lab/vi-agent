import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../common/utils/log_utils.dart';
import '../../../../service/session/http/function/memory_http_service.dart';

//////////////////////////////////////////////////////////////////////////////
// 状态管理
//////////////////////////////////////////////////////////////////////////////

/// Memory 状态
class MemoryState {
  final MemoryData data;
  final bool isLoading;
  final bool isSaving;
  final String? error;

  const MemoryState({
    this.data = MemoryData.empty,
    this.isLoading = false,
    this.isSaving = false,
    this.error,
  });

  MemoryState copyWith({
    MemoryData? data,
    bool? isLoading,
    bool? isSaving,
    String? error,
  }) {
    return MemoryState(
      data: data ?? this.data,
      isLoading: isLoading ?? this.isLoading,
      isSaving: isSaving ?? this.isSaving,
      error: error,
    );
  }
}

/// Memory Notifier
class MemoryNotifier extends StateNotifier<MemoryState> {
  MemoryNotifier(this._service) : super(const MemoryState());

  final MemoryHttpService _service;

  /// 加载 Memory
  Future<void> loadMemory() async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final data = await _service.getMemory();
      state = state.copyWith(data: data, isLoading: false);
    } catch (e) {
      Log.d('[MemoryNotifier] loadMemory failed: $e');
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  /// 保存 Memory
  Future<bool> saveMemory(String content) async {
    state = state.copyWith(isSaving: true, error: null);

    try {
      final result = await _service.saveMemory(content: content);
      if (result.success) {
        state = state.copyWith(
          data: MemoryData(
            exists: true,
            content: content,
            lastModified: result.lastModified ?? DateTime.now(),
          ),
          isSaving: false,
        );
        return true;
      } else {
        state = state.copyWith(isSaving: false, error: result.error);
        return false;
      }
    } catch (e) {
      Log.d('[MemoryNotifier] saveMemory failed: $e');
      state = state.copyWith(isSaving: false, error: e.toString());
      return false;
    }
  }
}

//////////////////////////////////////////////////////////////////////////////
// Riverpod Providers
//////////////////////////////////////////////////////////////////////////////

/// Memory HTTP Service Provider
final memoryHttpServiceProvider = Provider<MemoryHttpService>((ref) {
  return const MemoryHttpService();
});

/// Memory 状态 Provider
final memoryProvider = StateNotifierProvider<MemoryNotifier, MemoryState>((ref) {
  final service = ref.watch(memoryHttpServiceProvider);
  return MemoryNotifier(service);
});
