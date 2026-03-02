import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:rive_rolls_collection/common.dart';

import '../../../../app.dart';
import '../../../../common/extension/ui_ext.dart';
import '../../../../service/authentication.dart';
import '../../../widgets/adaptive_transition_page.dart';
import '../../../widgets/app_image.dart';
import '../../../widgets/custom_notify_widget.dart';
import '../../../widgets/loading_dialog.dart';

class ThirdLoginDialog extends ConsumerStatefulWidget {
  const ThirdLoginDialog._();

  static Future<void> show(BuildContext context) async {
    await showAdaptiveTransitionDialog(
      context: context,
      barrierDismissible: true,
      builder: (context) => const ThirdLoginDialog._(),
      transition: AdaptiveDialogTransitionType.dropMenu,
      routeSettings: const RouteSettings(name: 'ThirdLoginDialog'),
    );
  }

  @override
  ConsumerState createState() => _ThirdLoginDialogState();
}

class _ThirdLoginDialogState extends ConsumerState<ThirdLoginDialog> {
  /// 第三方登陆
  Future<void> _thirdLogin(AuthProvider type) async {
    VoidCallback? dismiss =  LoadingDialog.show(context);
    try {
      final result = await App().auth.login(type);
      Navigator.of(context).pop();
      if(LoginState.ok == result){
        customCenterNotify('Success');
      }
    } catch (e) {
      logd(e);
    } finally {
      dismiss();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Positioned(top: 8.dpx, left: 8.dpx, right: 8.dpx, child: _buildBody()),
      ],
    );
  }

  /// 构建Body
  Widget _buildBody() {
    return Material(
      color: Colors.transparent,
      child: Container(
        width: double.infinity,
        padding: EdgeInsets.symmetric(horizontal: 23.dpx),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.all(Radius.circular(36.dpx)),
          gradient: const LinearGradient(
            colors: [Color(0xFF060B0F), Color(0xFF3F5563), Color(0xFF8C908F), Color(0xFF888C8B)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Gap(App().safeTop + 70.dpx),
            Text(
              'Continue with an account',
              style: TextStyle(color: Colors.white, fontSize: 18.dpx, height: 22.dpx / 18.dpx),
            ),
            Gap(16.dpx),
            Text(
              'Log in to start your task and keep your history across devices.',
              style: TextStyle(color: Colors.white.withValues(alpha: 0.6), height: 1.2.dpx),
            ),
            Gap(180.dpx),
            _buildLoginBtn(context, _ThirdLoginBtn.apple),
            Gap(9.dpx),
            _buildLoginBtn(context, _ThirdLoginBtn.google),
            Gap(22.dpx),
          ],
        ),
      ),
    );
  }

  /// 构建按钮
  Widget _buildLoginBtn(BuildContext context, _ThirdLoginBtn btn) {
    return InkWell(
      onTap: () => _thirdLogin(btn.authType),
      child: Container(
        height: 44.dpx,
        width: double.infinity,
        decoration: BoxDecoration(color: btn.bgColor, borderRadius: BorderRadius.all(Radius.circular(18.dpx))),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            AppImage.asset(
              btn.iconStr,
              width: 16.dpx,
              height: 16.dpx,
            ),
            Gap(9.dpx),
            Text(
              btn.title,
              style: TextStyle(
                color: btn.titleColor,
                fontSize: 12.dpx,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

enum _ThirdLoginBtn {
  apple._(iconStr: 'assets/images/ic_apple.webp', bgColor: Colors.white, authType: AuthProvider.apple),
  google._(iconStr: 'assets/images/ic_google.webp', bgColor: Color(0x1AFFFFFF), authType: AuthProvider.google);

  const _ThirdLoginBtn._({required this.iconStr, required this.bgColor, required this.authType});

  /// 图标
  final String iconStr;

  /// 背景色
  final Color bgColor;

  /// 登陆类型
  final AuthProvider authType;

  /// 标题名字
  String get title {
    switch (this) {
      case _ThirdLoginBtn.apple:
        return 'Continue with Apple';
      case _ThirdLoginBtn.google:
        return 'Continue with Google';
    }
  }

  /// 标题颜色
  Color get titleColor {
    switch (this) {
      case _ThirdLoginBtn.apple:
        return const Color(0xFF1A1B1E);
      case _ThirdLoginBtn.google:
        return Colors.white;
    }
  }
}
