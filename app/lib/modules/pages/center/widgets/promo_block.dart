import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../shared/fade_slide.dart';

/// Promotion block with fullscreen → card shrink-in animation.
///
/// Matches PromotionBlock.jsx:
///   - Starts fullscreen (100vh, no margins, square corners)
///   - After 400ms: AnimatedContainer shrinks to card (margins 20, radius 24, height 320)
///   - Content paddingTop: 45vh → 106px over 2600ms Cubic(0.22,1,0.36,1)
///   - Texts and profile button fade+slide in with staggered delays
class PromoBlock extends StatefulWidget {
  final VoidCallback? onOpenProfile;

  const PromoBlock({super.key, this.onOpenProfile});

  @override
  State<PromoBlock> createState() => _PromoBlockState();
}

class _PromoBlockState extends State<PromoBlock> with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  bool _shrunk = false;
  bool _text1Visible = false;
  bool _text2Visible = false;
  bool _profileVisible = false;

  final List<Timer> _timers = [];

  @override
  void initState() {
    super.initState();
    // Staggered sequence: text1 → text2 → shrink → profile
    _t(200, () => setState(() => _text1Visible = true));
    _t(350, () => setState(() => _text2Visible = true));
    _t(400, () => setState(() => _shrunk = true));
    _t(3000, () => setState(() => _profileVisible = true));
  }

  void _t(int ms, VoidCallback fn) {
    _timers.add(
      Timer(Duration(milliseconds: ms), () {
        if (mounted) fn();
      }),
    );
  }

  @override
  void dispose() {
    for (final t in _timers) {
      t.cancel();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final availH = MediaQuery.of(context).size.height - MediaQuery.of(context).padding.top;
    const dur = Duration(milliseconds: 2600);
    const curve = Cubic(0.22, 1.0, 0.36, 1.0);

    return AnimatedContainer(
      duration: dur,
      curve: curve,
      margin: _shrunk ? const EdgeInsets.only(left: 20, right: 20, bottom: 24) : EdgeInsets.zero,
      height: _shrunk ? 320.0 : availH,
      clipBehavior: Clip.hardEdge,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(_shrunk ? 24 : 0),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Background image (video stand-in)
          CachedNetworkImage(
            imageUrl: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?q=80&w=800&auto=format&fit=crop',
            fit: BoxFit.cover,
            errorWidget: (_, __, ___) => Container(color: const Color(0xFF1A1A1A)),
          ),
          // Gradient overlay
          Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                stops: const [0, 0.4, 1],
                colors: [
                  Colors.black.withValues(alpha: 0.25),
                  Colors.black.withValues(alpha: 0.35),
                  Colors.black.withValues(alpha: 0.65),
                ],
              ),
            ),
          ),
          // Glass border (clipped by parent)
          Container(
            decoration: BoxDecoration(
              border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
            ),
          ),
          // Content: paddingTop animates 45vh → 106
          AnimatedPadding(
            duration: dur,
            curve: curve,
            padding: EdgeInsets.only(
              top: _shrunk ? 106.0 : availH * 0.45,
              bottom: _shrunk ? 22.0 : 48.0,
              left: 24,
              right: 24,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                FadeSlide(
                  visible: _text1Visible,
                  fromY: 14,
                  child: Text(
                    'Hi Qianhua,',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.8),
                      fontSize: 16,
                      fontWeight: FontWeight.w400,
                      height: 1.55,
                      letterSpacing: -0.2,
                    ),
                  ),
                ),
                FadeSlide(
                  visible: _text2Visible,
                  fromY: 10,
                  child: Text(
                    "Here's the recap of your latest explorations and visual tasks.",
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.8),
                      fontSize: 16,
                      fontWeight: FontWeight.w400,
                      height: 1.55,
                      letterSpacing: -0.2,
                    ),
                  ),
                ),
                const SizedBox(height: 72),
                Center(
                  child: FadeSlide(
                    visible: _profileVisible,
                    fromY: 8,
                    duration: const Duration(milliseconds: 500),
                    child: GestureDetector(
                      onTap: widget.onOpenProfile,
                      child: Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.12),
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
                        ),
                        child: Icon(
                          Icons.person_outline,
                          color: Colors.white.withValues(alpha: 0.7),
                          size: 17,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
