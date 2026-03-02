import 'package:flutter/material.dart';
import 'package:gap/gap.dart';

import '../../../common/extension/context_ext.dart';
import '../../../common/extension/ui_ext.dart';
import '../../style/app_theme.dart';
import '../../widgets/adaptive_transition_page.dart';
import '../../widgets/app_image.dart';

/// 请求相册权限说明弹窗
class AccessMediaTipDialog extends StatelessWidget {
  const AccessMediaTipDialog._();

  /// 显示对话框
  static Future<bool> show(BuildContext context) async {
    final result = await showAdaptiveTransitionDialog(
      context: context,
      transition: AdaptiveDialogTransitionType.floatUp,
      barrierColor: Colors.black54,
      barrierDismissible: true,
      builder: (c) => const AccessMediaTipDialog._(),
    );
    return result as bool? ?? false;
  }

  /// 默认文本样式
  TextStyle get _defTextStyle {
    return const TextStyle(
      color: AppTheme.onSurfaceColor,
      fontSize: 16,
      fontWeight: FontWeight.bold,
    );
  }

  @override
  Widget build(BuildContext context) {
    Widget child = Column(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        AppImage.asset(
          "assets/images/img_access_media.webp",
          height: 144,
          fit: BoxFit.fitHeight,
        ),
        const Gap(8),
        Text('Access Album', style: _defTextStyle),
        const Gap(12),
        const Text(
          'Your privacy matters to CozyAI We’ll only process selected photos and won’t store or share your data.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
        ),
        const Gap(18),
        _buildContinueButton(context),
      ],
    );

    final width = context.isTablet ? 420.0 : context.screenWidth * 0.78;
    return Center(
      child: ConstrainedBox(
        constraints: BoxConstraints(minWidth: width, maxWidth: width),
        child: Material(
          color: AppTheme.surfaceColor,
          borderRadius: const BorderRadius.all(Radius.circular(16)),
          child: Stack(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 24, 18, 24),
                child: child,
              ),
              Positioned(
                left: 8,
                top: 8,
                child: context.buildCloseButton(
                  iconSize: 20,
                  size: 32,
                  backgroundColor: AppTheme.primaryColor,
                  color: AppTheme.onPrimaryColor,
                  onTap: () => Navigator.pop(context, false),
                ),
              )
            ],
          ),
        ),
      ),
    );
  }

  /// 构建继续按钮
  Widget _buildContinueButton(BuildContext context) {
    const borderRadius = BorderRadius.all(Radius.circular(16));
    return Ink(
      decoration: BoxDecoration(
        color: Theme.of(context).primaryColor,
        borderRadius: borderRadius,
      ),
      child: InkWell(
        borderRadius: borderRadius,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 20),
          alignment: Alignment.center,
          child: Text(
            'Continue',
            style: _defTextStyle.copyWith(color: AppTheme.onPrimaryColor),
          ),
        ),
        onTap: () => Navigator.pop(context, true),
      ),
    );
  }
}
