part of 'login_page.dart';

extension _UI on _LoginPageState {
  /// 构建UI主体
  Widget _buildBody(BuildContext context) {
    return Material(
      color: Colors.black,
      child: Stack(
        fit: StackFit.expand,
        children: [
          // 全屏视频背景
          _buildVideoBackground(),
          // 渐变遮罩（底部加深，让按钮更清晰）
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.transparent,
                    Colors.transparent,
                    Colors.black.withValues(alpha: 0.3),
                    Colors.black.withValues(alpha: 0.7),
                  ],
                  stops: const [0.0, 0.4, 0.7, 1.0],
                ),
              ),
            ),
          ),
          // 内容层
          SafeArea(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Spacer(flex: 5),
                // 标题文案
                Padding(
                  padding: EdgeInsets.symmetric(horizontal: 28.dpx),
                  child: Text(
                    "The World's First Camera That Thinks Before It Sees",
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 22.dpx,
                      fontWeight: FontWeight.w700,
                      height: 1.15,
                      letterSpacing: -0.5,
                    ),
                  ),
                ),
                const Spacer(flex: 5),
                // Apple 登陆按钮
                Visibility(
                  visible: Platform.isIOS,
                  child: Padding(
                    padding: EdgeInsets.symmetric(horizontal: 23.dpx),
                    child: _buildLoginBtn(context, _LoginBtn.apple),
                  ),
                ),
                SizedBox(height: 9.dpx),
                // Google 登陆按钮
                Padding(
                  padding: EdgeInsets.symmetric(horizontal: 23.dpx),
                  child: _buildLoginBtn(context, _LoginBtn.google),
                ),
                SizedBox(height: 22.dpx),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// 全屏视频背景
  Widget _buildVideoBackground() {
    if (!_videoController.value.isInitialized) {
      return const SizedBox.expand(child: ColoredBox(color: Colors.black));
    }
    return SizedBox.expand(
      child: FittedBox(
        fit: BoxFit.cover,
        child: SizedBox(
          width: _videoController.value.size.width,
          height: _videoController.value.size.height,
          child: VideoPlayer(_videoController),
        ),
      ),
    );
  }

  /// 构建登陆按钮
  Widget _buildLoginBtn(BuildContext context, _LoginBtn btn) {
    return InkWell(
      onTap: () => _onLogin(btn.authType),
      child: Container(
        height: 48.dpx,
        width: double.infinity,
        decoration: BoxDecoration(
          color: btn.bgColor,
          borderRadius: BorderRadius.all(Radius.circular(24.dpx)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Image.asset(
              btn.iconStr,
              width: 18.dpx,
              height: 18.dpx,
            ),
            SizedBox(width: 9.dpx),
            Text(
              btn.title,
              style: TextStyle(
                color: btn.titleColor,
                fontSize: 14.dpx,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

enum _LoginBtn {
  apple._(
    iconStr: 'assets/images/ic_apple.webp',
    bgColor: Colors.white,
    authType: AuthProvider.apple,
  ),
  google._(
    iconStr: 'assets/images/ic_google.webp',
    bgColor: Color(0x1AFFFFFF),
    authType: AuthProvider.google,
  );

  const _LoginBtn._({
    required this.iconStr,
    required this.bgColor,
    required this.authType,
  });

  /// 图标路径
  final String iconStr;

  /// 背景色
  final Color bgColor;

  /// 登陆类型
  final AuthProvider authType;

  /// 按钮标题
  String get title {
    switch (this) {
      case _LoginBtn.apple:
        return 'Continue with Apple';
      case _LoginBtn.google:
        return 'Continue with Google';
    }
  }

  /// 标题颜色
  Color get titleColor {
    switch (this) {
      case _LoginBtn.apple:
        return const Color(0xFF1A1B1E);
      case _LoginBtn.google:
        return Colors.white;
    }
  }
}
