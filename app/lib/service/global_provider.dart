import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../app.dart';
import 'authentication.dart';
import 'hardware/hard_ware_initializer.dart';

////////////////////////////////////////////////////////////////////////////////
/// 认证变化监听
/// 监听时会得到最后一次用户信息
/// 推荐使用：[WidgetRefExt] 扩展中的方法去 [watchOnAuthChangedProvider] 去快速完成监听
final onAuthChangedProvider = AuthInfoAutoProvider(
  (ref) => _auth.onAuthChangedListener,
  name: 'onAuthChangedProvider',
);

/// 监听相机是否初始化
/// 使用 async* 先 yield 当前同步状态，避免 broadcast stream 事件丢失
final onInitCameraProvider = AutoDisposeStreamProvider<bool>(
  (ref) async* {
    final hw = HardWareInitializer.instance;
    yield hw.isInit;
    await for (final value in hw.onInitCameraChangedListener) {
      yield value;
    }
  },
  name: 'onInitCameraProvider',
);

////////////////////////////////////////////////////////////////////////////////

extension WidgetRefExt on WidgetRef {
  /// 监听相机初始化
  bool watchOnInitCameraProvider() => watch(onInitCameraProvider).value ?? false;
}

////////////////////////////////////////////////////////////////////////////////

/// 内部获取认证方法
Authentication get _auth => App().auth;
