import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

/// 基础页面 Widget
///
/// 提供常用的生命周期方法和模板方法模式
abstract class BasePage extends StatefulWidget {
  const BasePage({super.key});
}

/// 基础页面状态
///
/// 提供以下功能：
/// - [initTask] 第一帧渲染后调用
/// - [buildBody] 构建页面内容
/// - [onResume] 从后台恢复时调用
/// - [onPause] 进入后台时调用
/// - [onDispose] 页面销毁时调用
abstract class BasePageState<T extends BasePage> extends State<T> with WidgetsBindingObserver {
  /// 是否已完成初始化任务
  bool _isInitTaskCompleted = false;

  /// 是否已完成初始化任务
  bool get isInitTaskCompleted => _isInitTaskCompleted;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    // 第一帧渲染后调用 initTask
    SchedulerBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        initTask();
        _isInitTaskCompleted = true;
      }
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    onDispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);
    switch (state) {
      case AppLifecycleState.resumed:
        onResume();
        break;
      case AppLifecycleState.paused:
        onPause();
        break;
      case AppLifecycleState.inactive:
        onInactive();
        break;
      case AppLifecycleState.detached:
        onDetached();
        break;
      case AppLifecycleState.hidden:
        onHidden();
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return buildBody(context);
  }

  //////////////////////////////////////////////////////////////////////////////
  // 子类需要实现的方法
  //////////////////////////////////////////////////////////////////////////////

  /// 构建页面内容
  ///
  /// 子类必须实现此方法来构建页面 UI
  Widget buildBody(BuildContext context);

  //////////////////////////////////////////////////////////////////////////////
  // 子类可以重写的生命周期方法
  //////////////////////////////////////////////////////////////////////////////

  /// 第一帧渲染后调用
  ///
  /// 适合进行数据加载、网络请求等异步操作
  /// 此方法在 [initState] 之后、第一帧渲染完成后调用
  @protected
  void initTask() {}

  /// 从后台恢复时调用
  @protected
  void onResume() {}

  /// 进入后台时调用
  @protected
  void onPause() {}

  /// 应用处于非活动状态（如来电）
  @protected
  void onInactive() {}

  /// 应用与视图分离
  @protected
  void onDetached() {}

  /// 应用被隐藏（如多任务切换）
  @protected
  void onHidden() {}

  /// 页面销毁时调用
  ///
  /// 适合进行资源释放、取消订阅等清理操作
  @protected
  void onDispose() {}

  //////////////////////////////////////////////////////////////////////////////
  // 实用方法
  //////////////////////////////////////////////////////////////////////////////

  /// 安全地设置状态
  ///
  /// 仅在 widget 仍然挂载时才调用 setState
  void safeSetState(VoidCallback fn) {
    if (mounted) {
      setState(fn);
    }
  }

  /// 延迟执行
  ///
  /// [duration] 延迟时间
  /// [callback] 回调函数
  void delayed(Duration duration, VoidCallback callback) {
    Future.delayed(duration, () {
      if (mounted) {
        callback();
      }
    });
  }

  /// 下一帧执行
  void nextFrame(VoidCallback callback) {
    SchedulerBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        callback();
      }
    });
  }
}
