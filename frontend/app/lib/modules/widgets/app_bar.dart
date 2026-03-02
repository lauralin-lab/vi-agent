import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../common/exception/exceptions.dart';
import '../../common/extension/ui_ext.dart';
import '../style/app_theme.dart';

/// 返回按钮
enum AppbarBackIcon {
  /// 不显示
  none,

  /// 样式为 [Icons.arrow_back_ios_new]
  back,

  /// 样式为 [Icons.arrow_back_ios_new_rounded]
  backRound,

  /// 样式为 [Icons.arrow_back_ios_new_rounded]
  /// 附带阴影
  backRoundShadow,

  /// 样式为 [Icons.close]
  close,

  /// 样式为 [Icons.close_rounded]
  closeRound,

  /// 样式为 [Icons.close_rounded]
  /// 附带阴影
  closeRoundShadow;

  /// 获取图标
  IconData get icon {
    return switch (this) {
      back => Icons.arrow_back_ios_new,
      backRound => Icons.arrow_back_ios_new_rounded,
      backRoundShadow => Icons.arrow_back_ios_new_rounded,
      close => Icons.close,
      closeRound => Icons.close_rounded,
      closeRoundShadow => Icons.close_rounded,
      AppbarBackIcon.none => throw const AppException(),
    };
  }

  /// 获取阴影
  List<Shadow>? get shadows {
    const shadows = [BoxShadow(color: Colors.black12, blurRadius: 5, spreadRadius: 1)];
    return switch (this) {
      backRoundShadow => shadows,
      closeRoundShadow => shadows,
      _ => null,
    };
  }
}

/// 应用返回模式
enum AppBarPopMode {
  /// 使用 [context.pop]
  goRouter,

  /// 使用 [Navigator.pop(context)]
  navigation,
}

class TopAppBar extends StatelessWidget implements PreferredSizeWidget {
  TopAppBar({
    super.key,
    this.primary = true,
    this.title,
    this.titleText,
    this.titleSpacing = 0,
    this.centerTitle,
    this.backIcon = AppbarBackIcon.none,
    this.backIconColor = AppTheme.secondaryColor,
    this.backIgnorePop = false,
    this.backWeight = FontWeight.w500,
    this.popMode = AppBarPopMode.goRouter,
    this.leading,
    this.leadingWidth,
    this.actions,
    this.backgroundColor,
    this.popResult,
    this.onWillPop,
    this.flexibleSpace,
    this.automaticallyImplyLeading = true,
    this.height,
    this.backIconSize,
    this.titleTextShadow = false,
    this.ignoreLeadingOnTap = false,
  }) : preferredSize = _PreferredAppBarSize(height),
       assert(!(backIcon != AppbarBackIcon.none && leading != null), 'backIcon 和 leading 不能同时使用');

  /// 标题部件，如果存在 [title]，则使用 [title]，否则使用 [titleText]
  final Widget? title;

  /// 标题文本，优先使用 [title]
  final String? titleText;

  /// 标题文本应用，绑定 [titleText]
  final bool titleTextShadow;

  /// 应用栏中返回按钮的样式，默认为：[AppbarBackIcon.none]
  final AppbarBackIcon backIcon;

  /// [backIcon] 对应的图标颜色
  final Color backIconColor;

  /// [backIcon] 对应的权重
  final FontWeight backWeight;

  /// 返回按钮忽略 [onWillPop] 函数
  final bool backIgnorePop;

  /// 返回模式
  /// 当 [backIcon] 存在是生效
  final AppBarPopMode popMode;

  /// 左上角部件，和 [backIcon] 不能同时使用
  final Widget? leading;

  /// 右侧图标操作小部件
  final List<Widget>? actions;

  /// 状态栏背景色
  final Color? backgroundColor;

  /// 标题是否居中
  /// 参数设置等同于 [AppBar.centerTitle]
  final bool? centerTitle;

  /// 路由返回， 并且携带参数
  final Object? Function()? popResult;

  /// 返回时拦截，如果返回 `false`，内部不响应，否则执行 `pop`
  /// [isBackButton] 表示该时间是否来自于左上角返回按钮
  final FutureOr<bool> Function(bool isBackButton)? onWillPop;

  /// 参数设置等同于 [AppBar.primary]
  final bool primary;

  /// 参数设置等同于 [AppBar.leadingWidth]
  final double? leadingWidth;

  /// 设置状态栏高度，默认为 [kToolbarHeight]
  final double? height;

  /// 参数设置等同于 [AppBar.flexibleSpace]
  final Widget? flexibleSpace;

  /// 标题与 [leading] 之间的间距
  /// 参数设置等同于 [AppBar.titleSpacing]
  final double titleSpacing;

  /// 参数设置等同于 [AppBar.automaticallyImplyLeading]
  final bool automaticallyImplyLeading;

  /// 忽略 [leading] 的点击事件
  final bool ignoreLeadingOnTap;

  /// 返回按钮的大小
  final double? backIconSize;

  @override
  final Size preferredSize;

  @override
  Widget build(BuildContext context) {
    Widget? titleWidget = title;
    Widget? leadingWidget = leading != null ? Center(child: leading) : null;

    // 处理标题
    if (titleWidget == null && titleText != null) {
      titleWidget = Text(
        titleText!,
        style: !titleTextShadow
            ? TextStyle(fontWeight: FontWeight.w500, fontSize: 18.dpx, color: Colors.white)
            : const TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 18,
                shadows: [Shadow(blurRadius: 5, color: Colors.black26, offset: Offset(0, 1))],
              ),
      );
    }

    if (leadingWidget == null && backIcon != AppbarBackIcon.none) {
      leadingWidget = Center(
        child: Icon(
          backIcon.icon,
          color: backIconColor,
          weight: backWeight.value.toDouble(),
          shadows: backIcon.shadows,
          size: backIconSize ?? 24,
        ),
      );
    }

    if (leadingWidget != null && !ignoreLeadingOnTap) {
      leadingWidget = PopScope(
        canPop: popResult == null && onWillPop == null,
        onPopInvokedWithResult: (r, _) {
          if (r) return;
          _exit(context);
        },
        child: InkWell(
          highlightColor: Colors.transparent,
          onTap: () => _exit(context, true),
          customBorder: const CircleBorder(),
          child: leadingWidget,
        ),
      );
    }

    SystemUiOverlayStyle? overlayStyle;
    if (_emptyColor(backgroundColor) && _brightness(backIconColor) < 0.5) {
      overlayStyle = const SystemUiOverlayStyle(
        statusBarIconBrightness: Brightness.dark,
        statusBarBrightness: Brightness.light,
      );
    }

    return AppBar(
      primary: primary,
      elevation: 0,
      scrolledUnderElevation: 0,
      title: titleWidget,
      titleSpacing: titleSpacing,
      centerTitle: centerTitle,
      leading: leadingWidget,
      leadingWidth: leadingWidth,
      actions: actions,
      flexibleSpace: flexibleSpace,
      backgroundColor: backgroundColor ?? Colors.transparent,
      surfaceTintColor: backgroundColor ?? Colors.transparent,
      systemOverlayStyle: overlayStyle,
      automaticallyImplyLeading: automaticallyImplyLeading,
    );
  }

  /// 退出函数
  Future<void> _exit(BuildContext context, [bool back = false]) async {
    final ignore = backIgnorePop && back;
    final r = onWillPop == null || ignore ? true : (await onWillPop!(back));
    if (r && context.mounted) {
      final result = popResult?.call();
      switch (popMode) {
        case AppBarPopMode.goRouter:
          context.pop(result);
          break;
        case AppBarPopMode.navigation:
          Navigator.pop(context, result);
      }
    }
  }

  double _brightness(Color color) => 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;

  bool _emptyColor(Color? color) => color == null || color == Colors.transparent;
}

class _PreferredAppBarSize extends Size {
  const _PreferredAppBarSize(this.toolbarHeight) : super.fromHeight(toolbarHeight ?? kToolbarHeight);

  /// 高度
  final double? toolbarHeight;
}
