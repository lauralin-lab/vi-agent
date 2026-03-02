import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

/// 最后一次点击时间
int _lastClackTime = 0;

/// 短时点击间隔
const _shortDuration = 300;

/// 长时点击间隔
const _longDuration = 500;

extension DebounceVoidCallback on VoidCallback {
  /// 构建禁止全局重复点击函数
  VoidCallback wrapTapDebounce([bool longDuration = false]) {
    return () {
      final now = DateTime.now().millisecondsSinceEpoch;
      final d = longDuration ? _longDuration : _shortDuration;
      if ((now - _lastClackTime).abs() < d) return;
      _lastClackTime = now;
      this();
    };
  }
}

extension GoRouterExt on BuildContext {
  /// 返回时禁止多次、连续点击
  void popWithTapDebounce<T extends Object?>([T? result]) {
    final now = DateTime.now().millisecondsSinceEpoch;
    if ((now - _lastClackTime).abs() < _shortDuration) return;
    _lastClackTime = now;
    pop(result);
  }
}

extension NavigatorStateExt on NavigatorState {
  /// 返回时禁止多次、连续点击
  void popWithTapDebounce<T extends Object?>([T? result]) {
    final now = DateTime.now().millisecondsSinceEpoch;
    if ((now - _lastClackTime).abs() < _shortDuration) return;
    _lastClackTime = now;
    pop(result);
  }
}

/// 全局点击控制
final class GlobalClick {
  GlobalClick._();

  /// 是否允许本地点击
  static bool allowClick([bool longDuration = false]) {
    final now = DateTime.now().millisecondsSinceEpoch;
    final d = longDuration ? _longDuration : _shortDuration;
    if ((now - _lastClackTime).abs() < d) return false;
    _lastClackTime = now;
    return true;
  }
}
