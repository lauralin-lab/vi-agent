import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

/// 应用路由监听器
class AppNavigatorObserver extends NavigatorObserver {
  AppNavigatorObserver();

  /// 页面堆栈
  final List<Route<dynamic>> _routerStack = [];

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    _routerStack.add(route);
  }

  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) {
    assert(route == _routerStack.last);
    _routerStack.removeLast();
  }

  @override
  void didRemove(Route<dynamic> route, Route<dynamic>? previousRoute) {
    for (int i = _routerStack.length - 1; i >= 0; --i) {
      final r = _routerStack[i];
      if (route != r) continue;
      _routerStack.removeAt(i);
      break;
    }
  }

  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) {
    if (newRoute == null || oldRoute == null) return;
    for (int i = _routerStack.length - 1; i >= 0; --i) {
      final r = _routerStack[i];
      if (oldRoute != r) continue;
      _routerStack[i] = newRoute;
      break;
    }
  }

  /// 返回
  Future<void> popUntil(BuildContext context, String routeName) async {
    var exist = false;
    for (var value in _routerStack) {
      if (value.settings.name == routeName) {
        exist = true;
        break;
      }
    }

    // 不存在
    if (!exist) return;

    final rs = _routerStack;

    while (rs.last.settings.name != routeName && rs.length > 1) {
      if (!context.mounted) break;
      final name = rs.last.settings.name;
      if (name?.startsWith('/') != true) {
        Navigator.of(context).pop(); // 不是 GoRouter 节点
      } else {
        context.pop();
        await Future.delayed(const Duration(milliseconds: 5)); // 暂时延迟解决问题
      }
    }
  }

  /// 当前页面名称
  String get currentPageName => currentPage?.settings.name ?? '';

  /// 当前页面路由
  Route<dynamic>? get currentPage {
    return _routerStack.isEmpty ? null : _routerStack.last;
  }

  bool containsPage(String pageName) {
    return _routerStack.any((element) => element.settings.name == pageName);
  }

  /// 打印栈
  // ignore: unused_element
  String _printStack() {
    final sb = StringBuffer();
    const header = 'RouterStack: [';
    sb.write(header);
    for (final item in _routerStack) {
      if (sb.length > header.length) sb.write(', ');
      sb.write(item.settings.name ?? '');
    }
    sb.write(']');
    return sb.toString();
  }
}
