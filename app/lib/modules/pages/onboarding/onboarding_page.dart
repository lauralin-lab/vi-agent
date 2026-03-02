import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';

import '../../shared/ai_card.dart';
import '../../shared/spinner.dart';

class OnboardingPage extends StatefulWidget {
  final VoidCallback onComplete;

  const OnboardingPage({super.key, required this.onComplete});

  @override
  State<OnboardingPage> createState() => _OnboardingPageState();
}

class _OnboardingPageState extends State<OnboardingPage> with TickerProviderStateMixin {
  int _step = 0; // 0=splash, 1=card-demo, 2=controls

  // Connection state sim
  bool _isConnected = false;

  // Demo card animation cycle for step 1
  int _demoState = 0; // 0=scanning, 1=card, 2=result
  List<Timer?> _demoTimers = [];

  // Scan line animation
  late final AnimationController _scanCtrl;
  late final Animation<double> _scanAnim;

  // Step content
  static const _steps = [
    _OnboardingStep(
      id: 'splash',
      title: "The World's First Camera\nThat Thinks Before It Sees",
      subtitle: 'Tap anywhere to begin',
      type: 'fullscreen',
      spotlightY: 0,
    ),
    _OnboardingStep(
      id: 'card-demo',
      title: 'AI suggests, you tap',
      subtitle: 'Point your camera at anything — AI will propose what to do. Just tap the card.',
      type: 'spotlight',
      spotlightY: 0.70,
    ),
    _OnboardingStep(
      id: 'controls',
      title: 'Capture · Explore',
      subtitle: 'Take photos to start. The AI does the rest.',
      type: 'spotlight',
      spotlightY: 0.88,
    ),
  ];

  static const _demoTexts = [
    'Scanning...',
    'I see a plate of mango. Analyze nutrition and calories?',
    '538 kcal · Healthy Choice ✓',
  ];

  static const _demoCtas = ['Wait', 'Deep Dive', 'Done!'];

  @override
  void initState() {
    super.initState();
    _scanCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    );
    _scanAnim = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(parent: _scanCtrl, curve: Curves.linear),
    );

    Future.delayed(const Duration(milliseconds: 2200), () {
      if (mounted) {
        setState(() => _isConnected = true);
        _scanCtrl.repeat();
      }
    });
  }

  @override
  void didUpdateWidget(OnboardingPage old) {
    super.didUpdateWidget(old);
  }

  void _cancelDemoTimers() {
    for (final t in _demoTimers) {
      t?.cancel();
    }
    _demoTimers.clear();
  }

  void _startDemoLoop() {
    _cancelDemoTimers();
    setState(() => _demoState = 0);
    _demoTimers.addAll([
      Timer(const Duration(milliseconds: 1500), () {
        if (mounted) setState(() => _demoState = 1);
      }),
      Timer(const Duration(milliseconds: 4500), () {
        if (mounted) setState(() => _demoState = 2);
      }),
      Timer(const Duration(milliseconds: 7000), () {
        if (mounted) setState(() => _demoState = 0);
      }),
      Timer(const Duration(milliseconds: 8500), () {
        if (mounted) setState(() => _demoState = 1);
      }),
      Timer(const Duration(milliseconds: 11500), () {
        if (mounted) setState(() => _demoState = 2);
      }),
    ]);
  }

  void _handleTap() {
    if (_step == _steps.length - 1) {
      widget.onComplete();
    } else {
      final nextStep = _step + 1;
      if (_steps[nextStep].id == 'card-demo') {
        _startDemoLoop();
      } else {
        _cancelDemoTimers();
      }
      setState(() => _step = nextStep);
    }
  }

  @override
  void dispose() {
    _cancelDemoTimers();
    _scanCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final step = _steps[_step];
    final size = MediaQuery.of(context).size;
    final isLastStep = _step == _steps.length - 1;
    final isSplash = step.type == 'fullscreen';
    final isCardDemo = step.id == 'card-demo';

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: _handleTap,
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Stack(
          children: [
            // ── Camera backdrop (non-interactive) ──
            Positioned.fill(child: _buildCameraBackdrop(size, isCardDemo)),

            // ── Dynamic Island ──
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: Center(
                child: Container(
                  width: 126,
                  height: 36,
                  decoration: const BoxDecoration(
                    color: Color(0xFF111111),
                    borderRadius: BorderRadius.vertical(
                      bottom: Radius.circular(20),
                    ),
                    border: Border(
                      left: BorderSide(color: Color(0x33FFFFFF), width: 1),
                      right: BorderSide(color: Color(0x33FFFFFF), width: 1),
                      bottom: BorderSide(color: Color(0x33FFFFFF), width: 1),
                    ),
                  ),
                ),
              ),
            ),

            // ── Top controls (non-interactive backdrop) ──
            _buildTopControls(),

            // ── Viewfinder ──
            _buildViewfinder(size),

            // ── Card area (demo card) ──
            if (_step >= 1)
              Positioned(
                left: 16,
                right: 16,
                bottom: 108,
                child: AiCard(
                  isVisible: true,
                  text: isCardDemo
                      ? _demoTexts[_demoState]
                      : "I see a plate of mango. What's next? Maybe Calories? Shopping?",
                  ctaText: isCardDemo ? _demoCtas[_demoState] : 'Deep Dive',
                  isFallback: isCardDemo && _demoState == 0,
                ),
              ),

            // ── Bottom shutter controls ──
            _buildBottomControls(),

            // ── Onboarding overlay ──
            Positioned.fill(child: _buildOverlay(step, isSplash, isCardDemo, isLastStep, size)),
          ],
        ),
      ),
    );
  }

  Widget _buildCameraBackdrop(Size size, bool isCardDemo) {
    return Container(
      color: Colors.black,
      child: Center(
        child: Container(
          width: size.width,
          color: const Color(0xFF0D0D0D),
        ),
      ),
    );
  }

  Widget _buildTopControls() {
    return Positioned(
      top: 56,
      left: 0,
      right: 0,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            // Back button
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.08),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.arrow_back, color: Colors.white, size: 20),
            ),

            // Connection indicator
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 400),
              child: _isConnected
                  ? const Icon(Icons.wifi, color: Colors.white, size: 22, key: ValueKey('wifi'))
                  : const CollovSpinner(key: ValueKey('loader')),
            ),

            // Flash + rotate
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                  child: Row(
                    children: [
                      const Icon(Icons.bolt, color: Colors.white, size: 18),
                      Text(
                        'OFF',
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.5),
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 4),
                const Icon(Icons.flip_camera_ios_outlined, color: Colors.white, size: 22),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildViewfinder(Size size) {
    final top = 80.0;
    final bottom = 180.0;
    return Positioned(
      top: top,
      left: 0,
      right: 0,
      bottom: bottom,
      child: Stack(
        children: [
          Container(color: const Color(0xFF1A1A1A)),

          // Subtle gradient overlay
          Positioned.fill(
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.transparent,
                    Colors.black.withOpacity(0.3),
                  ],
                ),
              ),
            ),
          ),

          // Scan line
          if (_isConnected && _step >= 1)
            AnimatedBuilder(
              animation: _scanAnim,
              builder: (_, __) {
                return Positioned(
                  top: _scanAnim.value * (size.height - 260),
                  left: 0,
                  right: 0,
                  child: Container(
                    height: 2,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          Colors.transparent,
                          const Color(0xFF3B82F6).withOpacity(0.6),
                          const Color(0xFF93C5FD).withOpacity(0.9),
                          const Color(0xFF3B82F6).withOpacity(0.6),
                          Colors.transparent,
                        ],
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFF3B82F6).withOpacity(0.3),
                          blurRadius: 20,
                          spreadRadius: 4,
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),

          // Mini result flash for card-demo step 2
          if (_step == 1 && _demoState == 2)
            Positioned.fill(
              child: Center(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: BackdropFilter(
                    filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(0.6),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: Colors.white.withOpacity(0.1)),
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            '538 kcal',
                            style: TextStyle(
                              color: Colors.white.withOpacity(0.9),
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Healthy Choice ✓',
                            style: TextStyle(
                              color: Colors.white.withOpacity(0.5),
                              fontSize: 11,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildBottomControls() {
    return Positioned(
      bottom: 0,
      left: 0,
      right: 0,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Gallery
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.08),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white.withOpacity(0.05)),
                  ),
                  child: const Icon(Icons.image_outlined, color: Colors.white, size: 24),
                ),
                const SizedBox(width: 32),

                // Shutter
                Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white.withOpacity(0.4), width: 4),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(4),
                    child: Container(
                      decoration: const BoxDecoration(
                        color: Colors.white,
                        shape: BoxShape.circle,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 32),

                const SizedBox(width: 48, height: 48),
              ],
            ),
          ),
          SafeArea(top: false, child: const SizedBox(height: 8)),
        ],
      ),
    );
  }

  Widget _buildOverlay(
    _OnboardingStep step,
    bool isSplash,
    bool isCardDemo,
    bool isLastStep,
    Size size,
  ) {
    if (isSplash) {
      return _buildSplashOverlay(step);
    } else {
      return _buildSpotlightOverlay(step, isCardDemo, isLastStep, size);
    }
  }

  Widget _buildSplashOverlay(_OnboardingStep step) {
    return Stack(
      children: [
        // Gradient
        Positioned.fill(
          child: Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.bottomCenter,
                end: Alignment.topCenter,
                stops: const [0, 0.35, 0.65, 1],
                colors: [
                  Colors.black.withOpacity(0.92),
                  Colors.black.withOpacity(0.6),
                  Colors.black.withOpacity(0.2),
                  Colors.black.withOpacity(0.1),
                ],
              ),
            ),
          ),
        ),
        // Text at bottom
        Positioned(
          left: 32,
          right: 32,
          bottom: 80,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                step.title,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 26,
                  fontWeight: FontWeight.bold,
                  height: 1.25,
                  letterSpacing: -0.3,
                  shadows: [
                    Shadow(
                      color: Colors.black,
                      blurRadius: 12,
                      offset: Offset(0, 2),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              Text(
                step.subtitle,
                style: TextStyle(
                  color: Colors.white.withOpacity(0.5),
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildSpotlightOverlay(
    _OnboardingStep step,
    bool isCardDemo,
    bool isLastStep,
    Size size,
  ) {
    return Stack(
      children: [
        // Dark overlay
        Positioned.fill(
          child: CustomPaint(
            painter: _SpotlightPainter(
              spotlightY: step.spotlightY,
              screenSize: size,
            ),
          ),
        ),

        // Tooltip — above spotlight
        Positioned(
          left: 24,
          right: 24,
          top: size.height * (step.spotlightY - 0.26),
          child: _buildTooltip(step, isCardDemo),
        ),

        // Step indicators + CTA
        Positioned(
          bottom: 40,
          left: 0,
          right: 0,
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(_steps.length - 1, (i) {
                  final active = i == _step - 1;
                  return AnimatedContainer(
                    duration: const Duration(milliseconds: 300),
                    width: active ? 20 : 6,
                    height: 6,
                    margin: const EdgeInsets.symmetric(horizontal: 2),
                    decoration: BoxDecoration(
                      color: active ? Colors.white : Colors.white.withOpacity(0.3),
                      borderRadius: BorderRadius.circular(3),
                    ),
                  );
                }),
              ),
              const SizedBox(height: 12),
              Text(
                isLastStep ? 'Tap to get started' : 'Tap to continue',
                style: TextStyle(
                  color: Colors.white.withOpacity(0.4),
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildTooltip(_OnboardingStep step, bool isCardDemo) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
        child: Container(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.95),
            borderRadius: BorderRadius.circular(18),
            boxShadow: const [
              BoxShadow(color: Color(0x33000000), blurRadius: 24, offset: Offset(0, 8)),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                step.title,
                style: const TextStyle(
                  color: Colors.black,
                  fontSize: 17,
                  fontWeight: FontWeight.bold,
                  height: 1.3,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                step.subtitle,
                style: const TextStyle(
                  color: Color(0xFF737373),
                  fontSize: 13,
                  height: 1.5,
                ),
              ),

              // Demo progress dots for card-demo step
              if (isCardDemo) ...[
                const SizedBox(height: 12),
                Row(
                  children: [
                    ...List.generate(3, (i) {
                      final isActive = i == _demoState;
                      final isPast = i < _demoState;
                      return AnimatedContainer(
                        duration: const Duration(milliseconds: 400),
                        width: isActive ? 24 : 8,
                        height: 4,
                        margin: const EdgeInsets.only(right: 4),
                        decoration: BoxDecoration(
                          color: isActive
                              ? Colors.black.withOpacity(0.7)
                              : isPast
                              ? Colors.black.withOpacity(0.3)
                              : Colors.black.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(2),
                        ),
                      );
                    }),
                    const SizedBox(width: 4),
                    Text(
                      _demoState == 0
                          ? 'Scanning...'
                          : _demoState == 1
                          ? 'Card appears ↑'
                          : 'Result!',
                      style: TextStyle(
                        color: Colors.black.withOpacity(0.3),
                        fontSize: 9,
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _OnboardingStep {
  final String id;
  final String title;
  final String subtitle;
  final String type;
  final double spotlightY;

  const _OnboardingStep({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.type,
    required this.spotlightY,
  });
}

/// Paints a semi-transparent overlay with a rounded rect cutout
class _SpotlightPainter extends CustomPainter {
  final double spotlightY;
  final Size screenSize;

  const _SpotlightPainter({
    required this.spotlightY,
    required this.screenSize,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = Colors.black.withOpacity(0.6);
    canvas.drawRect(Rect.fromLTWH(0, 0, size.width, size.height), paint);

    // Cutout
    final cutoutPaint = Paint()
      ..blendMode = BlendMode.clear
      ..color = Colors.transparent;
    final cutoutRect = RRect.fromRectAndRadius(
      Rect.fromLTRB(
        16,
        size.height * (spotlightY - 0.1),
        size.width - 16,
        size.height * (spotlightY + 0.1),
      ),
      const Radius.circular(16),
    );
    canvas.drawRRect(cutoutRect, cutoutPaint);

    // Subtle border around cutout
    final borderPaint = Paint()
      ..color = Colors.white.withOpacity(0.12)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    canvas.drawRRect(cutoutRect, borderPaint);
  }

  @override
  bool shouldRepaint(_SpotlightPainter old) => old.spotlightY != spotlightY;
}
