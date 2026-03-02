part of 'home_page.dart';

extension _UI on _HomePageState {
  /// 构建主体
  Widget _buildBody(BuildContext context) {
    return Stack(
      alignment: Alignment.center,
      children: [
        Positioned.fill(
          child: PageView(
            controller: gestureMotion.parent,
            physics: const NeverScrollableScrollPhysics(),
            children: [
              const MainPage(),
            ],
          ).wrapGesture(context, gestureMotion),
        ),
      ],
    );
  }
}

extension _Ext on Widget {
  /// 包裹手势
  Widget wrapGesture(BuildContext context, HomeGestureMotion gd) => gd.build(context, this);
}
