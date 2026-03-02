import 'dart:math' as math;

import 'package:flutter/material.dart';

class HistoryEmptyState extends StatefulWidget {
  final VoidCallback onStart;

  const HistoryEmptyState({super.key, required this.onStart});

  @override
  State<HistoryEmptyState> createState() => _HistoryEmptyStateState();
}

class _HistoryEmptyStateState extends State<HistoryEmptyState>
    with TickerProviderStateMixin {
  late final AnimationController _pulseCtrl;
  late final AnimationController _orbitCtrl1;
  late final AnimationController _orbitCtrl2;
  late final AnimationController _shimmerCtrl;

  @override
  void initState() {
    super.initState();
    _pulseCtrl =
        AnimationController(vsync: this, duration: const Duration(seconds: 4))
          ..repeat(reverse: true);
    _orbitCtrl1 =
        AnimationController(vsync: this, duration: const Duration(seconds: 10))
          ..repeat();
    _orbitCtrl2 =
        AnimationController(vsync: this, duration: const Duration(seconds: 14))
          ..repeat();
    _shimmerCtrl = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 2500))
      ..repeat();
  }

  @override
  void dispose() {
    _pulseCtrl.dispose();
    _orbitCtrl1.dispose();
    _orbitCtrl2.dispose();
    _shimmerCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(32, 40, 32, 96),
      child: Column(
        children: [
          // ── Animated eye ──
          AnimatedBuilder(
            animation: Listenable.merge([_pulseCtrl, _orbitCtrl1, _orbitCtrl2]),
            builder: (_, __) {
              final pulse =
                  CurvedAnimation(parent: _pulseCtrl, curve: Curves.easeInOut)
                      .value;
              final orbit1 = _orbitCtrl1.value * 2 * math.pi;
              final orbit2 = _orbitCtrl2.value * 2 * math.pi;
              const sz = 200.0;
              const r1 = 60.0;
              const r2 = 74.0;

              return SizedBox(
                width: sz,
                height: sz,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    // Background glow
                    Transform.scale(
                      scale: 1 + 0.2 * pulse,
                      child: Container(
                        width: sz,
                        height: sz,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: RadialGradient(
                            colors: [
                              const Color(0xFF643CFF)
                                  .withValues(alpha: 0.04 + 0.03 * pulse),
                              Colors.transparent,
                            ],
                          ),
                        ),
                      ),
                    ),

                    // Outer ring
                    Transform.scale(
                      scale: 1 + 0.08 * pulse,
                      child: Container(
                        width: 148,
                        height: 148,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: const Color(0xFF8C78FF)
                                .withValues(alpha: 0.03 + 0.04 * pulse),
                          ),
                        ),
                      ),
                    ),

                    // Middle ring
                    Transform.scale(
                      scale: 1 + 0.05 * pulse,
                      child: Container(
                        width: 122,
                        height: 122,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: const Color(0xFF8C78FF)
                                .withValues(alpha: 0.04 + 0.07 * pulse),
                          ),
                        ),
                      ),
                    ),

                    // Core circle + Eye
                    Container(
                      width: 96,
                      height: 96,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [
                            const Color(0xFF785AFF).withValues(alpha: 0.08),
                            const Color(0xFF3C2896).withValues(alpha: 0.04),
                          ],
                        ),
                        border: Border.all(
                          color: const Color(0xFF8C78FF).withValues(alpha: 0.12),
                        ),
                      ),
                      child: Transform.scale(
                        scale: 1 + 0.1 * pulse,
                        child: Icon(
                          Icons.remove_red_eye_outlined,
                          size: 36,
                          color: const Color(0xFFD8B4FE).withValues(alpha: 0.25),
                        ),
                      ),
                    ),

                    // Orbiting dot 1 — purple, 10s
                    Transform.translate(
                      offset: Offset(
                        r1 * math.sin(orbit1),
                        -r1 * math.cos(orbit1),
                      ),
                      child: Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color:
                              const Color(0xFF8C78FF).withValues(alpha: 0.6),
                          boxShadow: [
                            BoxShadow(
                              color: const Color(0xFF8C78FF)
                                  .withValues(alpha: 0.3),
                              blurRadius: 8,
                            ),
                          ],
                        ),
                      ),
                    ),

                    // Orbiting dot 2 — blue, 14s counter-rotate
                    Transform.translate(
                      offset: Offset(
                        -r2 * math.sin(orbit2),
                        r2 * math.cos(orbit2),
                      ),
                      child: Container(
                        width: 6,
                        height: 6,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color:
                              const Color(0xFF50A0FF).withValues(alpha: 0.5),
                          boxShadow: [
                            BoxShadow(
                              color: const Color(0xFF50A0FF)
                                  .withValues(alpha: 0.2),
                              blurRadius: 6,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),

          const SizedBox(height: 40),

          // Gradient tagline
          ShaderMask(
            shaderCallback: (bounds) => const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Color(0x99FFFFFF),
                Color(0x66B4AAFF),
                Color(0x59FFFFFF),
              ],
            ).createShader(bounds),
            child: const Text(
              "The World's First Camera That Thinks Before It Sees",
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.bold,
                height: 1.35,
              ),
            ),
          ),

          const SizedBox(height: 14),

          Text(
            'Your visual explorations and AI sessions will appear here. Start by pointing your camera at something interesting.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.22),
              fontSize: 12,
              fontWeight: FontWeight.w300,
              height: 1.65,
            ),
          ),

          const SizedBox(height: 36),

          // Start exploring button with shimmer
          AnimatedBuilder(
            animation: _shimmerCtrl,
            builder: (_, __) {
              final shimmerX = (_shimmerCtrl.value * 3 - 1);
              return GestureDetector(
                onTap: widget.onStart,
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [
                        const Color(0xFF785AFF).withValues(alpha: 0.12),
                        const Color(0xFF3C8CFF).withValues(alpha: 0.08),
                      ],
                    ),
                    borderRadius: BorderRadius.circular(30),
                    border: Border.all(
                        color: const Color(0xFF8C78FF).withValues(alpha: 0.18)),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFF643CFF).withValues(alpha: 0.08),
                        blurRadius: 20,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Stack(
                    children: [
                      // Shimmer
                      Positioned.fill(
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(30),
                          child: FractionalTranslation(
                            translation: Offset(shimmerX, 0),
                            child: Container(
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  colors: [
                                    Colors.transparent,
                                    Colors.white.withValues(alpha: 0.05),
                                    Colors.transparent,
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.camera_alt_outlined,
                            size: 15,
                            color: const Color(0xFFD8B4FE).withValues(alpha: 0.6),
                          ),
                          const SizedBox(width: 10),
                          Text(
                            'Start exploring',
                            style: TextStyle(
                              color: const Color(0xFFE9D5FF)
                                  .withValues(alpha: 0.6),
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                              letterSpacing: 0.3,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}
