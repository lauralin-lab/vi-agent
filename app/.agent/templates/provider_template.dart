// ignore_for_file: unused_element
/// Provider 模板
///
/// 使用方法：
/// 1. 复制此文件到对应的 provider 目录
/// 2. 将 Template 替换为你的功能名
/// 3. 运行 build_runner 生成代码：
///    flutter pub run build_runner build --delete-conflicting-outputs

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'template_provider.g.dart';

/// 异步数据获取 Provider
///
/// 用于从 API 获取数据的场景
@riverpod
Future<String> templateData(Ref ref) async {
  // 模拟 API 调用
  await Future.delayed(const Duration(seconds: 1));
  return 'Template Data';
}

/// 带参数的 Provider
///
/// 用于需要传递参数的场景
@riverpod
Future<String> templateDataWithParam(Ref ref, {required String id}) async {
  // 根据 id 获取数据
  await Future.delayed(const Duration(seconds: 1));
  return 'Data for $id';
}

/// 状态管理 Provider（Notifier）
///
/// 用于需要管理和修改状态的场景
@riverpod
class TemplateNotifier extends _$TemplateNotifier {
  @override
  int build() {
    // 返回初始状态
    return 0;
  }

  /// 增加计数
  void increment() {
    state = state + 1;
  }

  /// 减少计数
  void decrement() {
    state = state - 1;
  }

  /// 重置
  void reset() {
    state = 0;
  }
}

/// 异步状态管理 Provider（AsyncNotifier）
///
/// 用于需要异步初始化和管理状态的场景
@riverpod
class TemplateAsyncNotifier extends _$TemplateAsyncNotifier {
  @override
  Future<List<String>> build() async {
    // 异步初始化
    return _fetchItems();
  }

  Future<List<String>> _fetchItems() async {
    // 模拟 API 调用
    await Future.delayed(const Duration(seconds: 1));
    return ['Item 1', 'Item 2', 'Item 3'];
  }

  /// 刷新数据
  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetchItems());
  }

  /// 添加项目
  Future<void> addItem(String item) async {
    final currentItems = state.value ?? [];
    state = AsyncValue.data([...currentItems, item]);
  }
}
