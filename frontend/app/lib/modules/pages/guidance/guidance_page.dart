import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../routing/router.dart';
import '../home/main_page.dart';

/// 引导页 - 首次启动时展示
///
/// 动画序列：
/// Phase 1: 全屏渐变背景，文字渐出
/// Phase 1.5: 文字下方出现向下箭头，等待用户下拉
/// Phase 2: 背景缩小 5%（四周 10px），出现圆角
/// Phase 3: 图片从上方推入，渐变容器挤压到 190px
/// Phase 4: 文字渐隐，渐变容器消失 → fade 跳转到 Main
class GuidancePage extends StatefulWidget {
  const GuidancePage({super.key});

  @override
  State<GuidancePage> createState() => _GuidancePageState();
}

class _GuidancePageState extends State<GuidancePage> with TickerProviderStateMixin {
  static const _text = "The World's First Camera That\nThinks Before It Sees";
  static const double _gradientMidHeight = 190.0;
  static const double _maxInset = 10.0;
  static const double _maxRadius = 52.0;

  /// 是否等待用户下拉
  bool _waitingForSwipe = false;

  /// 下拉累计距离
  double _dragDistance = 0.0;

  /// 触发下拉的阈值
  static const double _swipeThreshold = 80.0;

  /// Phase 1: 文字渐出
  late final AnimationController _textFadeController;
  late final Animation<double> _textOpacity;

  /// 箭头弹跳动画
  late final AnimationController _arrowController;
  late final Animation<double> _arrowBounce;
  late final Animation<double> _arrowOpacity;

  /// Phase 2: 背景缩小
  late final AnimationController _scaleController;
  late final Animation<double> _scale;

  /// Phase 3: 图片推入，渐变挤压到 190px
  late final AnimationController _imageController;
  late final Animation<double> _imageProgress;

  /// Phase 4: 文字渐隐 + 渐变容器消失 + 图片扩到 10px 边距
  late final AnimationController _expandController;
  late final Animation<double> _expandProgress;

  @override
  void initState() {
    super.initState();

    // Phase 1: 文字渐出 800ms
    _textFadeController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );
    _textOpacity = CurvedAnimation(parent: _textFadeController, curve: Curves.easeIn);

    // 箭头弹跳动画（循环）
    _arrowController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    );
    _arrowBounce = Tween<double>(begin: 0, end: 12).animate(
      CurvedAnimation(parent: _arrowController, curve: Curves.easeInOut),
    );
    _arrowOpacity = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(
        parent: _arrowController,
        curve: const Interval(0.0, 0.3, curve: Curves.easeIn),
      ),
    );

    // Phase 2: 背景缩小 600ms
    _scaleController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );
    _scale = Tween<double>(begin: 1.0, end: 0.95).animate(
      CurvedAnimation(parent: _scaleController, curve: Curves.easeOutCubic),
    );

    // Phase 3: 图片推入 800ms
    _imageController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );
    _imageProgress = CurvedAnimation(parent: _imageController, curve: Curves.easeOutCubic);

    // Phase 4: 扩展 800ms
    _expandController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );
    _expandProgress = CurvedAnimation(parent: _expandController, curve: Curves.easeInOutCubic);

    // Phase 1 完成后 → 显示箭头，等待用户下拉
    _textFadeController.addStatusListener((s) {
      if (s == AnimationStatus.completed && mounted) {
        setState(() => _waitingForSwipe = true);
        _arrowController.repeat(reverse: true);
      }
    });

    // Phase 2 → Phase 3
    _scaleController.addStatusListener((s) {
      if (s == AnimationStatus.completed && mounted) {
        Future.delayed(const Duration(milliseconds: 200), () {
          if (mounted) _imageController.forward();
        });
      }
    });

    // Phase 3 → Phase 4
    _imageController.addStatusListener((s) {
      if (s == AnimationStatus.completed && mounted) {
        Future.delayed(const Duration(milliseconds: 400), () {
          if (mounted) _expandController.forward();
        });
      }
    });

    // Phase 4 完成后 → 直接 fade 跳转到 Main（不再有 Phase 5 的 scale 全屏）
    _expandController.addStatusListener((s) {
      if (s == AnimationStatus.completed && mounted) {
        _dismiss();
      }
    });

    // 启动
    Future.delayed(const Duration(milliseconds: 400), () {
      if (mounted) _textFadeController.forward();
    });
  }

  @override
  void dispose() {
    _textFadeController.dispose();
    _arrowController.dispose();
    _scaleController.dispose();
    _imageController.dispose();
    _expandController.dispose();

    super.dispose();
  }

  /// 用户下拉触发后续动画
  void _onSwipeTriggered() {
    if (!_waitingForSwipe) return;
    setState(() => _waitingForSwipe = false);
    _arrowController.stop();
    HapticFeedback.lightImpact();
    Future.delayed(const Duration(milliseconds: 100), () {
      if (mounted) _scaleController.forward();
    });
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        statusBarBrightness: Brightness.dark,
      ),
      child: GestureDetector(
        onTap: _waitingForSwipe ? null : _dismiss,
        onVerticalDragStart: _waitingForSwipe ? (_) => _dragDistance = 0 : null,
        onVerticalDragUpdate: _waitingForSwipe
            ? (details) {
                _dragDistance += details.delta.dy;
                if (_dragDistance > _swipeThreshold) {
                  _onSwipeTriggered();
                }
              }
            : null,
        child: Scaffold(
          backgroundColor: Colors.white,
          body: AnimatedBuilder(
            animation: Listenable.merge([
              _textFadeController,
              _arrowController,
              _scaleController,
              _imageController,
              _expandController,
            ]),
            builder: (context, _) {
              final scale = _scale.value;
              final imageT = _imageProgress.value;
              final expandT = _expandProgress.value;

              final screenHeight = MediaQuery.of(context).size.height;

              // Phase 2: 缩放产生固定 px 内边距
              final scaleInset = (1.0 - scale) / 0.05 * _maxInset;
              final scaleRadius = (1.0 - scale) / 0.05 * _maxRadius;

              final outerInset = scaleInset;
              final currentRadius = scaleRadius;

              // 用实际外边距计算可用高度
              final availableHeight = screenHeight - outerInset * 2;

              // Phase 3: 渐变容器从全屏挤压到 190px
              final gradientAfterImage = availableHeight - imageT * (availableHeight - _gradientMidHeight);

              // Phase 4: 渐变容器从 190px → 0，图片继续扩展
              final gradientHeight = gradientAfterImage * (1.0 - expandT);
              final imageHeight = availableHeight - gradientHeight;

              // Phase 4: 文字透明度反转（1 → 0）
              final textOpacity = _textOpacity.value * (1.0 - expandT);

              // 图片与渐变之间的间隙
              final gap = gradientHeight > 1 ? (imageT * 8.0) : 0.0;

              return Padding(
                padding: EdgeInsets.all(outerInset),
                child: Column(
                  children: [
                    // 图片区域
                    if (imageHeight > 0) ...[
                      SizedBox(
                        height: imageHeight - gap,
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(currentRadius),
                          child: Image.asset(
                            'assets/images/ic_guide_pic.png',
                            fit: BoxFit.cover,
                            width: double.infinity,
                            height: double.infinity,
                          ),
                        ),
                      ),
                      if (gap > 0) SizedBox(height: gap),
                    ],

                    // 渐变 + 文字容器
                    if (gradientHeight > 1)
                      SizedBox(
                        height: gradientHeight,
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(currentRadius),
                          child: Container(
                            width: double.infinity,
                            height: double.infinity,
                            decoration: const BoxDecoration(
                              gradient: LinearGradient(
                                begin: Alignment(-0.22, -1.0),
                                end: Alignment(0.22, 1.0),
                                colors: [
                                  Color(0xFF060B0F),
                                  Color(0xFF3F5563),
                                  Color(0xFF8C908F),
                                  Color(0xFF888C8B),
                                ],
                                stops: [0.0525, 0.5178, 0.8785, 0.983],
                              ),
                            ),
                            padding: const EdgeInsets.symmetric(horizontal: 38),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Spacer(),
                                Opacity(
                                  opacity: textOpacity.clamp(0.0, 1.0),
                                  child: const Text(
                                    _text,
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontSize: 20,
                                      fontWeight: FontWeight.w400,
                                      height: 1.2,
                                      letterSpacing: -0.43,
                                    ),
                                  ),
                                ),
                                const Spacer(),

                                // 上拉箭头提示（底部）
                                if (_waitingForSwipe)
                                  AnimatedBuilder(
                                    animation: _arrowController,
                                    builder: (context, child) {
                                      return Opacity(
                                        opacity: _arrowOpacity.value,
                                        child: Transform.translate(
                                          offset: Offset(0, -_arrowBounce.value),
                                          child: child,
                                        ),
                                      );
                                    },
                                    child: Center(
                                      child: Padding(
                                        padding: const EdgeInsets.only(bottom: 24),
                                        child: Column(
                                          children: [
                                            Text(
                                              'Swipe down to start',
                                              style: TextStyle(
                                                color: Colors.white.withValues(alpha: 0.5),
                                                fontSize: 13,
                                                fontWeight: FontWeight.w400,
                                                letterSpacing: 0.3,
                                              ),
                                            ),
                                            const SizedBox(height: 4),
                                            Icon(
                                              Icons.keyboard_arrow_down_rounded,
                                              color: Colors.white.withValues(alpha: 0.8),
                                              size: 32,
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          ),
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

  void _dismiss() {
    MainPage.showGuidanceOverlay = true;
    const HomeRoute().go(context);
  }
}
