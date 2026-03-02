import 'package:flutter/material.dart';
import 'package:rive_rolls_collection/widget/wizard_hero.dart';

import '../../common/extension/ui_ext.dart';
import '../../common/extension/user_help_type.dart';

class Tips {
  /// 关闭引导
  static void dismiss(BuildContext context, UserHelpType guideType) {
    WizardHeroOverlays.of(context).dismiss(guideType.name);
  }

  /// 是否存在引导
  static bool isContain(BuildContext context, UserHelpType guideType) {
    return WizardHeroOverlays.of(context).isContain(guideType.name);
  }

  /// Agent Thinking Task Tips
  static void showAgentThinkingTaskTips(
    BuildContext context, {
    required UserHelpType type,
    required List<String> tags,
  }) {
    WizardHeroOverlays.of(context).show(
      tag: type.name,
      sigma: 0,
      bindTags: tags,
      transitionMode: WizardTransitionMode.backgroundAndForeground,
      backgroundColor: Colors.transparent,
      foregroundBuilder: (c, helper, tag, bounds) {
        return helper.createDialogContent(
          bounds,
          RichText(
            text: TextSpan(
              style: TextStyle(fontSize: 12.dpx),
              children: [
                const TextSpan(
                  text: 'Task is running in the background\nYou can find it later on ',
                  style: TextStyle(
                    color: Colors.black,
                  ),
                ),
                WidgetSpan(
                  alignment: PlaceholderAlignment.baseline,
                  baseline: TextBaseline.alphabetic,
                  child: ShaderMask(
                    shaderCallback: (bounds) {
                      return const LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [Color(0xFF060B0F), Color(0xFF3F5563), Color(0xFF8C908F), Color(0xFF888C8B)],
                      ).createShader(bounds);
                    },
                    child: const Text(
                      'Home → Threads',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        decoration: TextDecoration.underline,
                        decorationColor: Colors.white,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          backgroundColor: Colors.white,
          borderRadius: 18.dpx,
          padding: EdgeInsets.symmetric(horizontal: 18.dpx, vertical: 10.dpx),
        );
      },
      onTap: () => Tips.dismiss(context, type),
    );
  }
}
