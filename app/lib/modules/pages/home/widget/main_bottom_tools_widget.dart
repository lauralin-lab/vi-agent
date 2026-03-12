import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:rive_rolls_collection/extension/duration_ext.dart';
import '../../../../app.dart';
import '../../../../common/extension/ui_ext.dart';
import '../../../widgets/app_image.dart';
import '../provider/main_provider.dart';
import 'camera_action_button.dart';
import 'capture_widget.dart';

class MainBottomToolsWidget extends ConsumerStatefulWidget {
  const MainBottomToolsWidget({
    super.key,
    this.onAction,
    required this.promptTF,
    required this.promptFocusNode,
  });

  /// Action callback
  final ValueChanged<CameraActionType>? onAction;

  /// PromptTF
  final TextEditingController promptTF;

  /// PromptFocus
  final FocusNode promptFocusNode;

  @override
  ConsumerState<MainBottomToolsWidget> createState() => _MainBottomToolsWidgetState();
}

class _MainBottomToolsWidgetState extends ConsumerState<MainBottomToolsWidget> {
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const CaptureWidget(),
        Gap(10.dpx),
        _buildCameraTools(context),
      ],
    );
  }

  /// 拍照按钮工具栏
  Widget _buildCameraTools(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(left: 60.dpx, bottom: App().safeBottom, right: 60.dpx),
      child: Row(
        children: [
          Expanded(
            child: Align(
              alignment: Alignment.centerLeft,
              child: Consumer(
                builder: (context, ref, _) {
                  final isMute = ref.watch(muteProvider);
                  return CameraActionsButton(
                    size: CameraActionsButtonSize.regular,
                    onTap: () => widget.onAction?.call(CameraActionType.mute),
                    child: AppImage.asset(
                      isMute ? 'assets/images/ic_mic_closed.webp' : 'assets/images/ic_mic_open.webp',
                      width: 22.dpx,
                      height: 22.dpx,
                    ),
                  );
                },
              ),
            ),
          ),
          CameraActionsButton(
            size: CameraActionsButtonSize.large,
            onTap: () => widget.onAction?.call(CameraActionType.capture),
            border: Border.all(color: Colors.white.withValues(alpha: 0.6), width: 3.dpx),
            child: Container(
              margin: EdgeInsets.all(3.dpx),
              decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: 0.8)),
            ),
          ),
          Expanded(
            child: Align(
              alignment: Alignment.centerRight,
              child: Consumer(
                builder: (context, ref, _) {
                  final captureArr = ref.watch(captureImageProvider);
                  return AnimatedSwitcher(
                    duration: 200.ms,
                    child: captureArr.isNotEmpty
                        ? GestureDetector(
                            key: const ValueKey('done'),
                            onTap: () => widget.onAction?.call(CameraActionType.send),
                            child: Container(
                              width: 44.dpx,
                              height: 44.dpx,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                gradient: const LinearGradient(
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                  colors: [Color(0xD922C55E), Color(0xD910B981)],
                                ),
                                border: Border.all(color: Colors.white.withValues(alpha: 0.25)),
                              ),
                              child: Icon(
                                Icons.check_circle_outline_rounded,
                                color: Colors.white,
                                size: 22.dpx,
                              ),
                            ),
                          )
                        : const SizedBox.shrink(key: ValueKey('empty')),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
