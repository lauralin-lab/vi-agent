part of 'home_page.dart';

/// 子类运动控制器
class ChildMotion {
  const ChildMotion(this.controller, this.count);

  /// 子页面数量
  final int count;

  /// 子页面控制器
  final PageController controller;
}

/// 首页手势处理
class HomeGestureMotion {
  HomeGestureMotion._();

  /// 页面控制器（主）
  final parent = PageController();

  /// 手势集合
  final gestures = <Type, GestureRecognizerFactory>{};

  /// 子类运动控制器
  final children = <int, ChildMotion>{};

  /// 当前拖动组件
  Drag? currentDrag;

  /// 拖拽开始位置
  DragStartDetails? _start;

  /// 拖拽开始时，iOS 下 Flutter 引擎故障
  bool _dragFirstUpdatedIssue = false;

  /// 当前页面
  double? get currentPage => parent.hasClients ? parent.page : null;

  /// 绑定子组件
  void bind(int index, ChildMotion child) {
    children[index] = child;
  }

  /// 解绑子组件
  void unbind(int index) {
    children.remove(index);
  }

  /// 销毁
  void dispose() {
    currentDrag?.cancel();
    currentDrag = null;
    parent.dispose();
  }

  /// 利用手势包裹组件
  Widget build(BuildContext context, Widget child) {
    final gestureSettings = MediaQuery.maybeGestureSettingsOf(context);
    final configuration = ScrollConfiguration.of(context);

    gestures[PanGestureRecognizer] = GestureRecognizerFactoryWithHandlers<PanGestureRecognizer>(
          () => PanGestureRecognizer(debugOwner: this),
          (instance) {
        instance
          ..onDown = _onPanDown
          ..onStart = _onPanStart
        // ..onUpdate = _onPanUpdate
          ..onEnd = _onPanEnd
          ..onCancel = _onPanCancel
          ..multitouchDragStrategy = configuration.getMultitouchDragStrategy(context)
          ..gestureSettings = gestureSettings;
      },
    );

    return RawGestureDetector(gestures: gestures, behavior: HitTestBehavior.opaque, child: child);
  }

  /// 获取前按下事件
  void _onPanDown(DragDownDetails details) {
    // 这里没使用
  }

  /// 拖拽开始
  void _onPanStart(DragStartDetails details) {
    _start = details;
    _dragFirstUpdatedIssue = false;
  }

  /// 拖拽更新
  void _onPanUpdate(DragUpdateDetails details) {
    final start = _start;
    var delta = details.delta;

    // ??? 你滑动了，但滑动距离为 0 ???
    if (start == null || (delta.dx == 0.0 && delta.dy == 0.0)) return;

    // ??? 什么 Flutter BUG ???
    if (Platform.isIOS && !_dragFirstUpdatedIssue) {
      _dragFirstUpdatedIssue = true;
      delta = details.localPosition - start.localPosition;
      details = details.copyWith(delta: delta);
    }

    if (currentDrag == null) {
      ScrollController? current;
      // 仅横向滑动
      if (delta.dy.abs() < delta.dx.abs()) {
        final child = children[parent.page?.round() ?? 0];
        if (child != null && child.controller.hasClients) {
          // 优先滑动内部页面
          final pIndex = child.controller.page?.round() ?? 0;
          final max = child.count - 1;
          if ((delta.dx < 0 && pIndex < max) || (delta.dx > 0 && pIndex > 0)) {
            current = child.controller;
          }
        }
        current ??= parent;
      }

      if (current != null) {
        currentDrag = current.position.drag(start, _dragCancelCallback);
      }
    }

    currentDrag?.update(details.horizontal());
  }

  /// 拖拽结束
  void _onPanEnd(DragEndDetails details) {
    currentDrag?.end(details.horizontal());
    currentDrag = null;
    _dragFirstUpdatedIssue = false;
  }

  /// 拖拽取消
  void _onPanCancel() {
    currentDrag?.cancel();
    currentDrag = null;
    _dragFirstUpdatedIssue = false;
  }

  /// 拖拽取消回调
  static void _dragCancelCallback() {
    // 暂不需要做实际实现
  }
}
