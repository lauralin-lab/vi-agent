import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:rive_rolls_collection/common.dart';
import '../../../../common/extension/ui_ext.dart';
import '../../../widgets/app_image.dart';
import '../provider/main_provider.dart';
import 'camera_action_button.dart';

class MainTopToolsWidget extends ConsumerStatefulWidget {
  const MainTopToolsWidget({
    super.key,
    this.onAction,
  });

  /// Action callback
  final ValueChanged<CameraActionType>? onAction;

  @override
  ConsumerState createState() => _MainTopToolsWidgetState();
}

class _MainTopToolsWidgetState extends ConsumerState<MainTopToolsWidget> {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: 12.dpx),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          _leftTools(context),
          _middleTools(context),
          _rightTools(context),
        ],
      ),
    );
  }

  /// 左部工具
  Widget _leftTools(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        CameraActionsButton(
          size: CameraActionsButtonSize.medium,
          onTap: () => widget.onAction?.call(CameraActionType.back),
          child: Icon(Icons.arrow_back, color: Colors.white, size: 16.dpx),
        ),
      ],
    );
  }

  /// 中间LiveKit状态
  Widget _middleTools(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.all(Radius.circular(32.dpx)),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 18.dpx, sigmaY: 18.dpx),
        child: Container(
          padding: EdgeInsets.symmetric(horizontal: 12.dpx),
          height: 32.dpx,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.all(Radius.circular(32.dpx)),
            border: Border.all(color: Colors.white.withValues(alpha: 0.2), width: 1.dpx),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.2),
                offset: const Offset(0, -1),
                blurStyle: BlurStyle.inner,
              ),
            ],
          ),
          child: Consumer(
            builder: (context, ref, _) {
              final connectStatus = ref.watch(connectionStatusProvider);
              return AnimatedSwitcher(
                duration: 300.ms,
                child: Row(
                  key: ValueKey(connectStatus),
                  children: [
                    connectStatus.getIcon(),
                    Gap(9.dpx),
                    Text(
                      connectStatus.getTitle(),
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.6),
                        fontSize: 11.dpx,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  /// 右部工具
  Widget _rightTools(BuildContext context) {
    return Row(
      children: [
        CameraActionsButton(
          size: CameraActionsButtonSize.medium,
          onTap: () => widget.onAction?.call(CameraActionType.toggleCamera),
          child: AppImage.asset(
            'assets/images/ic_camera_switch.webp',
            width: 16.dpx,
            height: 16.dpx,
          ),
        ),
      ],
    );
  }
}
