import 'dart:collection';

import 'package:flutter/widgets.dart';

/// 惰性加载组件
/// 思路：保证创建时 diff 算法不受影响
class LazyIndexedStack extends StatefulWidget {
  const LazyIndexedStack({
    super.key,
    required this.index,
    required this.count,
    required this.builder,
    this.alignment = AlignmentDirectional.topStart,
    this.textDirection,
    this.clipBehavior = Clip.hardEdge,
    this.sizing = StackFit.loose,
  });

  /// 当前索引
  final int index;

  /// 构建子组件
  final IndexedWidgetBuilder builder;

  /// 子组件数量
  final int count;

  /// 布局大小
  final StackFit sizing;

  /// 详见 [Stack.alignment]
  final AlignmentGeometry alignment;

  /// 文本方向
  final TextDirection? textDirection;

  /// 裁剪模式
  final Clip clipBehavior;

  @override
  State<StatefulWidget> createState() => _LazyIndexedStackState();
}

class _LazyIndexedStackState extends State<LazyIndexedStack> {
  _LazyIndexedStackState();

  /// 是否已经加载的索引
  final HashSet<int> _loaded = HashSet<int>();

  /// 子组件缓存
  final List<Widget> _children = <Widget>[];

  /// 是否需要重建
  bool _invalid = true;

  @override
  void initState() {
    super.initState();
    _loaded.add(widget.index);
  }

  @override
  void didUpdateWidget(covariant LazyIndexedStack oldWidget) {
    super.didUpdateWidget(oldWidget);
    _loaded.add(widget.index);
    _invalid = true;
  }

  @override
  Widget build(BuildContext context) {
    _recreateChildren(context);
    return IndexedStack(
      index: widget.index,
      sizing: widget.sizing,
      alignment: widget.alignment,
      clipBehavior: widget.clipBehavior,
      textDirection: widget.textDirection,
      children: _children,
    );
  }

  /// 重建子组件
  void _recreateChildren(BuildContext context) {
    if (!_invalid) return;
    if (_children.length == widget.count) {
      for (var i = 0; i < widget.count; i++) {
        _children[i] = _buildChild(context, i);
      }
    } else {
      _children.clear();
      for (var i = 0; i < widget.count; i++) {
        _children.add(_buildChild(context, i));
      }
    }
    _invalid = false;
  }

  /// 构建单个子组件
  Widget _buildChild(BuildContext context, int index) {
    if (!_loaded.contains(index)) return const SizedBox.shrink();
    return widget.builder(context, index);
  }
}
