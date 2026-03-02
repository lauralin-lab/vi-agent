import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';

/// Normal AI suggestion card with typewriter effect and swipe-to-correct gesture.
class AiCard extends StatefulWidget {
  final bool isVisible;
  final String text;
  final String ctaText;
  final bool isFallback;
  final bool showHint;
  final bool isMicOn;
  final VoidCallback? onTap;
  final VoidCallback? onSwipeLeft;

  const AiCard({
    super.key,
    required this.isVisible,
    required this.text,
    this.ctaText = 'Deep Dive',
    this.isFallback = false,
    this.showHint = false,
    this.isMicOn = false,
    this.onTap,
    this.onSwipeLeft,
  });

  @override
  State<AiCard> createState() => _AiCardState();
}

class _AiCardState extends State<AiCard> with TickerProviderStateMixin {
  String _displayedText = '';
  String _prevText = '';
  Timer? _typeTimer;

  // Cursor blink
  bool _showCursor = true;
  Timer? _cursorTimer;

  // Drag
  double _dragX = 0;
  double _dragStartX = 0;

  // Entry animation
  late final AnimationController _entryCtrl;
  late final Animation<Offset> _entrySlide;
  late final Animation<double> _entryFade;

  @override
  void initState() {
    super.initState();
    _entryCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 450),
    );
    _entrySlide = Tween<Offset>(
      begin: const Offset(0, 0.6),
      end: Offset.zero,
    ).animate(CurvedAnimation(
      parent: _entryCtrl,
      curve: Curves.easeOutCubic,
    ));
    _entryFade = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(parent: _entryCtrl, curve: Curves.easeOut),
    );

    if (widget.isVisible) _entryCtrl.forward();

    _startTypewriter(widget.text);

    _cursorTimer = Timer.periodic(const Duration(milliseconds: 530), (_) {
      if (mounted) setState(() => _showCursor = !_showCursor);
    });
  }

  @override
  void didUpdateWidget(AiCard old) {
    super.didUpdateWidget(old);
    if (!old.isVisible && widget.isVisible) {
      _entryCtrl.forward(from: 0);
    }
    if (old.text != widget.text) {
      _startTypewriter(widget.text);
    }
  }

  void _startTypewriter(String next) {
    _typeTimer?.cancel();
    final prev = _prevText;
    int commonLen = 0;
    while (commonLen < prev.length &&
        commonLen < next.length &&
        prev[commonLen] == next[commonLen]) {
      commonLen++;
    }
    if (next.length <= prev.length && commonLen >= next.length) {
      setState(() => _displayedText = next);
      _prevText = next;
      return;
    }
    setState(() => _displayedText = next.substring(0, commonLen));
    int idx = commonLen;
    _typeTimer = Timer.periodic(const Duration(milliseconds: 24), (t) {
      idx++;
      if (!mounted) {
        t.cancel();
        return;
      }
      if (idx >= next.length) {
        setState(() => _displayedText = next);
        _prevText = next;
        t.cancel();
      } else {
        setState(() => _displayedText = next.substring(0, idx));
      }
    });
  }

  @override
  void dispose() {
    _typeTimer?.cancel();
    _cursorTimer?.cancel();
    _entryCtrl.dispose();
    super.dispose();
  }

  double get _dragOpacity => 1 - ((-_dragX).clamp(0, 120) / 120) * 0.5;

  double get _fontSize {
    final len = widget.text.length;
    if (len >= 90) return 11;
    if (len >= 60) return 12;
    if (len >= 30) return 13;
    return 14;
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.isVisible) return const SizedBox.shrink();

    return FadeTransition(
      opacity: _entryFade,
      child: SlideTransition(
        position: _entrySlide,
        child: GestureDetector(
          onHorizontalDragStart: (d) {
            _dragStartX = d.localPosition.dx;
            _dragX = 0;
          },
          onHorizontalDragUpdate: (d) {
            final dx = d.localPosition.dx - _dragStartX;
            if (mounted) setState(() => _dragX = dx.clamp(-120.0, 20.0));
          },
          onHorizontalDragEnd: (_) {
            if (_dragX < -60) widget.onSwipeLeft?.call();
            if (mounted) setState(() => _dragX = 0);
          },
          onTap: widget.onTap,
          child: Opacity(
            opacity: _dragOpacity,
            child: Transform.translate(
              offset: Offset(_dragX, 0),
              child: _buildCard(),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildCard() {
    final isFallback = widget.isFallback;
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
        child: Container(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          decoration: BoxDecoration(
            color: isFallback
                ? Colors.black.withOpacity(0.25)
                : Colors.black.withOpacity(0.35),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: Colors.white.withOpacity(isFallback ? 0.08 : 0.12),
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.4),
                blurRadius: 30,
                offset: const Offset(0, 4),
              ),
              BoxShadow(
                color: Colors.white.withOpacity(0.06),
                blurRadius: 0,
                offset: const Offset(0, 1),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              // AI status label
              if (!isFallback) ...[
                Row(
                  children: [
                    if (widget.isMicOn) ...[
                      ..._buildWaveformBars(),
                      const SizedBox(width: 6),
                      Text(
                        'LISTENING...',
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.4),
                          fontSize: 9,
                          fontFamily: 'Courier New',
                          letterSpacing: 1.2,
                        ),
                      ),
                    ] else ...[
                      Icon(
                        Icons.remove_red_eye_outlined,
                        size: 10,
                        color: Colors.white.withOpacity(0.4),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        'AI VIEWING...',
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.4),
                          fontSize: 9,
                          fontFamily: 'Courier New',
                          letterSpacing: 1.2,
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 8),
              ],

              // Main text with typewriter cursor
              RichText(
                text: TextSpan(
                  style: TextStyle(
                    fontSize: _fontSize,
                    fontWeight: FontWeight.w500,
                    color: Colors.white.withOpacity(isFallback ? 0.7 : 0.9),
                    height: 1.45,
                  ),
                  children: [
                    TextSpan(text: _displayedText),
                    if (_displayedText != widget.text && _showCursor)
                      WidgetSpan(
                        child: Container(
                          width: 2,
                          height: _fontSize * 1.1,
                          margin: const EdgeInsets.only(left: 1),
                          color: Colors.white.withOpacity(0.7),
                        ),
                      ),
                  ],
                ),
              ),

              if (isFallback) ...[
                const SizedBox(height: 6),
                Text(
                  '💡 Or say / type what you want',
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.4),
                    fontSize: 10,
                  ),
                ),
              ],

              const SizedBox(height: 10),

              Row(
                children: [
                  if (widget.showHint && !isFallback)
                    Text(
                      'Not right? Swipe left ←',
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.25),
                        fontSize: 9,
                        letterSpacing: 0.5,
                      ),
                    ),
                  const Spacer(),
                  // CTA pill
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.white
                          .withOpacity(isFallback ? 0.08 : 0.12),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: Colors.white
                            .withOpacity(isFallback ? 0.10 : 0.15),
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.white.withOpacity(0.08),
                          blurRadius: 0,
                          offset: const Offset(0, 1),
                        ),
                      ],
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          widget.ctaText,
                          style: TextStyle(
                            color: Colors.white
                                .withOpacity(isFallback ? 0.7 : 0.9),
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 0.3,
                          ),
                        ),
                        const SizedBox(width: 2),
                        Icon(
                          Icons.chevron_right,
                          size: 12,
                          color: Colors.white
                              .withOpacity(isFallback ? 0.3 : 0.6),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _buildWaveformBars() {
    const heights = [2.0, 4.0, 6.0, 3.0, 5.0, 7.0, 4.0, 2.0, 5.0, 3.0, 6.0];
    return List.generate(heights.length, (i) {
      return _WaveBar(baseHeight: heights[i] * 1.2, delayMs: i * 80);
    });
  }
}

/// Correction mode card — shown after swipe left
class AiCorrectionCard extends StatefulWidget {
  final List<String> alternatives;
  final VoidCallback onClose;
  final ValueChanged<String> onSelect;
  final ValueChanged<String> onSubmit;

  const AiCorrectionCard({
    super.key,
    this.alternatives = const [],
    required this.onClose,
    required this.onSelect,
    required this.onSubmit,
  });

  @override
  State<AiCorrectionCard> createState() => _AiCorrectionCardState();
}

class _AiCorrectionCardState extends State<AiCorrectionCard> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
        child: Container(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          decoration: BoxDecoration(
            color: Colors.black.withOpacity(0.45),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.white.withOpacity(0.15)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.5),
                blurRadius: 30,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              // Header
              Row(
                children: [
                  Text(
                    'What would you like instead?',
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.5),
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                      letterSpacing: 0.3,
                    ),
                  ),
                  const Spacer(),
                  GestureDetector(
                    onTap: widget.onClose,
                    child: Container(
                      width: 22,
                      height: 22,
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.06),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        Icons.close,
                        size: 12,
                        color: Colors.white.withOpacity(0.5),
                      ),
                    ),
                  ),
                ],
              ),

              if (widget.alternatives.isNotEmpty) ...[
                const SizedBox(height: 10),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: widget.alternatives.map((alt) {
                    return GestureDetector(
                      onTap: () => widget.onSelect(alt),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.08),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                              color: Colors.white.withOpacity(0.12)),
                        ),
                        child: Text(
                          alt,
                          style: TextStyle(
                            color: Colors.white.withOpacity(0.8),
                            fontSize: 11,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ],

              const SizedBox(height: 10),

              // Text input row
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      autofocus: true,
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.85),
                        fontSize: 12,
                      ),
                      decoration: InputDecoration(
                        hintText: 'Or tell me what you want...',
                        hintStyle: TextStyle(
                          color: Colors.white.withOpacity(0.25),
                          fontSize: 12,
                        ),
                        filled: true,
                        fillColor: Colors.white.withOpacity(0.05),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(20),
                          borderSide: BorderSide(
                              color: Colors.white.withOpacity(0.08)),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(20),
                          borderSide: BorderSide(
                              color: Colors.white.withOpacity(0.08)),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(20),
                          borderSide: BorderSide(
                              color: Colors.white.withOpacity(0.18)),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 8),
                        isDense: true,
                      ),
                      onSubmitted: (v) {
                        if (v.trim().isNotEmpty) widget.onSubmit(v.trim());
                      },
                    ),
                  ),
                  const SizedBox(width: 8),
                  ValueListenableBuilder<TextEditingValue>(
                    valueListenable: _controller,
                    builder: (_, val, __) {
                      final hasText = val.text.trim().isNotEmpty;
                      return GestureDetector(
                        onTap: hasText
                            ? () => widget.onSubmit(_controller.text.trim())
                            : null,
                        child: Container(
                          width: 32,
                          height: 32,
                          decoration: BoxDecoration(
                            color: hasText
                                ? Colors.white.withOpacity(0.9)
                                : Colors.white.withOpacity(0.06),
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            Icons.chevron_right,
                            size: 14,
                            color: hasText
                                ? Colors.black
                                : Colors.white.withOpacity(0.2),
                          ),
                        ),
                      );
                    },
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _WaveBar extends StatefulWidget {
  final double baseHeight;
  final int delayMs;
  const _WaveBar({required this.baseHeight, required this.delayMs});

  @override
  State<_WaveBar> createState() => _WaveBarState();
}

class _WaveBarState extends State<_WaveBar>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    );
    _anim = Tween<double>(begin: 0.3, end: 1.0).animate(
      CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut),
    );
    Future.delayed(Duration(milliseconds: widget.delayMs), () {
      if (mounted) _ctrl.repeat(reverse: true);
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _anim,
      builder: (_, __) => Container(
        width: 1.5,
        height: widget.baseHeight * _anim.value,
        margin: const EdgeInsets.only(right: 2),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.4),
          borderRadius: BorderRadius.circular(1),
        ),
      ),
    );
  }
}
