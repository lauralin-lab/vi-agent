import 'package:flutter/material.dart';
import 'package:lottie/lottie.dart';
import 'package:rive_rolls_collection/disposables/disposable.dart';
import '../style/app_theme.dart';
import 'adaptive_transition_page.dart';

/// 加载对话框
class LoadingDialog extends StatelessWidget {
  const LoadingDialog._(this.message, this.canPop, this._disposable);

  /// 显示消息
  final String? message;

  /// 是否允许直接返回
  final bool canPop;

  /// 销毁句柄
  final _Disposable _disposable;

  /// 显示加载弹窗
  ///
  /// 返回一个可用于关闭该弹窗的回调函数
  static VoidCallback show(
    BuildContext context, {
    String? message,
    VoidCallback? onDismiss,
    bool canPop = false,
    bool Function()? onWillPop,
    bool barrierDismissible = false,
    Color barrierColor = Colors.black54,
    AdaptiveDialogTransitionType type = AdaptiveDialogTransitionType.floatUp,
  }) {
    final disposable = _Disposable(context, onDismiss, onWillPop);
    showAdaptiveTransitionDialog(
      context: context,
      barrierColor: barrierColor,
      barrierDismissible: barrierDismissible,
      builder: (context) => LoadingDialog._(message, canPop, disposable),
      transition: type,
    ).then(disposable.onDismissProxy);
    return disposable.dispose;
  }

  @override
  Widget build(BuildContext context) {
    const size = 150.0;
    const lottie = 'assets/lottie/loading.json';
    final loading = SizedBox(
      height: size,
      child: Lottie.asset(
        lottie,
        height: size,
        delegates: LottieDelegates(
          values: [
            ValueDelegate.colorFilter(
              ['**'],
              value: const ColorFilter.mode(Colors.white, BlendMode.srcIn),
            ),
          ],
        ),
      ),
    );
    Widget child = message == null
        ? Center(child: loading)
        : Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              loading,
              Text(
                message!,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          );

    // 对返回进行拦截
    return PopScope(
      canPop: canPop,
      onPopInvokedWithResult: _disposable.onPopInvoked,
      child: child,
    );
  }
}

///
class _Disposable extends Disposable {
  _Disposable(this.context, this.onDismiss, this.onWillPop);

  /// 上下文
  final BuildContext context;

  /// 关闭回调
  final VoidCallback? onDismiss;

  /// 返回 `true` 表示退出
  final bool Function()? onWillPop;

  /// 窗口是否关闭
  bool dismiss = false;

  /// 销毁
  void onDismissProxy(dynamic _) {
    dismiss = true;
    onDismiss?.call();
  }

  /// 执行退出请求
  void onPopInvoked(bool pop, dynamic _) {
    if (pop) return;
    if (!(onWillPop?.call() ?? false)) return;
    dispose();
  }

  @override
  void dispose() {
    if (disposed) return;
    Navigator.pop(context);
  }

  @override
  bool get disposed => dismiss;
}
