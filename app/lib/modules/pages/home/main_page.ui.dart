part of 'main_page.dart';

extension _UI on _MainPageState {
  /// 构建UI主体
  Widget _buildBody(BuildContext context, bool inInit) {
    return Material(
      color: Colors.black,
      child: !inInit ? context.buildCircularLoading() : _buildCameraStack(context),
    );
  }

  /// 构建Camera布局
  Widget _buildCameraStack(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        // 构建Camera的显示
        Positioned.fill(child: _buildPre(context)),
        // 键盘消失
        Positioned.fill(
          child: GestureDetector(
            behavior: HitTestBehavior.translucent,
            onTap: () => _promptFocusNode.unfocus(),
          ),
        ),
        // 头部
        Positioned(
          left: 0,
          right: 0,
          top: App().safeTop + 8.dpx,
          child: MainTopToolsWidget(onAction: _onCameraAction),
        ),
        // 底部
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          child: MainBottomToolsWidget(
            onAction: _onCameraAction,
            promptTF: _promptTF,
            promptFocusNode: _promptFocusNode,
          ),
        ),
      ],
    );
  }

  /// 构建Camera View
  Widget _buildPre(BuildContext context) {
    return Consumer(
      builder: (context, ref, _) {
        ref.watch(onSwitchCameraProvider);
        return Stack(
          fit: StackFit.expand,
          children: [
            Positioned.fill(
              child: VideoTrackRenderer(
                fit: VideoViewFit.cover,
                renderMode: VideoRenderMode.auto,
                HardWareInitializer.instance.videoTrack!,
              ),
            ),
            Positioned.fill(
              child: IgnorePointer(
                child: ScanningOverlay(
                  controller: _scanningController, // 传入控制器
                  duration: const Duration(milliseconds: 2500),
                  columns: 24, // 控制显示多少列，你可以通过修改这个值来调整斑点疏密
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}
