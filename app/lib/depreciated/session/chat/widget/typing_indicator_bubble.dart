import 'package:flutter/material.dart';

/// 跳动的 "..." loading 指示器，用于显示 agent 正在回复
class TypingIndicatorBubble extends StatefulWidget {
  const TypingIndicatorBubble({super.key});

  @override
  State<TypingIndicatorBubble> createState() => _TypingIndicatorBubbleState();
}

class _TypingIndicatorBubbleState extends State<TypingIndicatorBubble> with TickerProviderStateMixin {
  late List<AnimationController> _controllers;
  late List<Animation<double>> _animations;

  @override
  void initState() {
    super.initState();
    _controllers = List.generate(
      3,
      (index) => AnimationController(
        duration: const Duration(milliseconds: 400),
        vsync: this,
      ),
    );

    _animations = _controllers.map((controller) {
      return Tween<double>(begin: 0, end: -8).animate(
        CurvedAnimation(parent: controller, curve: Curves.easeInOut),
      );
    }).toList();

    // 依次启动动画，形成波浪效果
    _startAnimation();
  }

  Future<void> _startAnimation() async {
    while (mounted) {
      for (int i = 0; i < 3; i++) {
        if (!mounted) return;
        _controllers[i].forward();
        await Future.delayed(const Duration(milliseconds: 150));
      }
      await Future.delayed(const Duration(milliseconds: 100));
      for (int i = 0; i < 3; i++) {
        if (!mounted) return;
        _controllers[i].reverse();
      }
      await Future.delayed(const Duration(milliseconds: 300));
    }
  }

  @override
  void dispose() {
    for (final controller in _controllers) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0, horizontal: 16.0),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Container(
          padding: const EdgeInsets.only(top: 22, bottom: 16, left: 16, right: 16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16).copyWith(
              bottomLeft: Radius.zero,
            ),
            boxShadow: [
              BoxShadow(color: Colors.black.withAlpha(5), blurRadius: 5),
            ],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: List.generate(3, (index) {
              return AnimatedBuilder(
                animation: _animations[index],
                builder: (context, child) {
                  return Transform.translate(
                    offset: Offset(0, _animations[index].value),
                    child: child,
                  );
                },
                child: Container(
                  width: 8,
                  height: 8,
                  margin: EdgeInsets.only(right: index < 2 ? 4 : 0),
                  decoration: const BoxDecoration(
                    color: Color(0xFF8E8E93),
                    shape: BoxShape.circle,
                  ),
                ),
              );
            }),
          ),
        ),
      ),
    );
  }
}
