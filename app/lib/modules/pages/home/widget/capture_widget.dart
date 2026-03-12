import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:rive_rolls_collection/common.dart';

import '../../../../common/extension/context_ext.dart';
import '../../../../common/extension/ui_ext.dart';
import '../../../widgets/app_image.dart';
import '../provider/main_provider.dart';

class CaptureWidget extends ConsumerStatefulWidget {
  const CaptureWidget({super.key});

  @override
  ConsumerState createState() => _CaptureWidgetState();
}

class _CaptureWidgetState extends ConsumerState<CaptureWidget> with SingleTickerProviderStateMixin {
  /// 浮动呼吸动画
  late AnimationController _driftController;

  /// 展开的标识符
  bool _isExpand = false;

  @override
  void initState() {
    super.initState();

    // 匀速无线循环动画，时长 4 秒
    _driftController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 4),
    )..repeat();
  }

  @override
  void dispose() {
    _driftController.dispose();
    super.dispose();
  }

  /// 删除指定索引的拍照图片
  void _onDelCaptureImage(int index) {
    ref.read(captureImageProvider.notifier).remove(index);
  }

  @override
  Widget build(BuildContext context) {
    final captureArr = ref.watch(captureImageProvider);
    // 展开状态
    final isExpand = _isExpand && captureArr.length > 1;

    return captureArr.isEmpty
        ? const SizedBox.shrink(key: ValueKey('empty'))
        : AnimatedSwitcher(
            duration: 300.ms,
            reverseDuration: 0.ms,
            switchInCurve: Curves.easeOutCubic,
            switchOutCurve: Curves.easeInCubic,
            transitionBuilder: (Widget child, Animation<double> animation) {
              // 组合动画缩放 + 透明度
              return FadeTransition(
                opacity: animation,
                child: ScaleTransition(
                  scale: Tween<double>(begin: 0.9, end: 1.0).animate(animation),
                  child: child,
                ),
              );
            },
            child: isExpand ? _buildExpandAfter(captureArr) : _buildExpandBefore(captureArr),
          );
  }

  /// 展开前
  Widget _buildExpandBefore(List<String> captureArr) {
    return AnimatedBuilder(
      key: const ValueKey('source'),
      animation: _driftController,
      builder: (context, child) {
        final double t = _driftController.value;
        final double rad = t * 2 * math.pi;
        final double offsetY = math.sin(rad) * 2.0;
        final double angle = math.sin(rad * 2) * 0.008;

        return Padding(
          padding: EdgeInsets.only(left: 14.dpx),
          child: InkWell(
            onTap: captureArr.length > 1
                ? () {
                    setState(() {
                      _isExpand = true;
                      _driftController.stop();
                    });
                  }
                : null,
            child: Transform(
              alignment: Alignment.center,
              transform: Matrix4.translationValues(0, offsetY, 0)..rotateZ(angle),
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  AppImage.asset(
                    captureArr.last,
                    width: 44.dpx,
                    height: 44.dpx,
                    fit: BoxFit.cover,
                    fadeIn: Duration.zero,
                    borderRadius: BorderRadius.all(Radius.circular(12.dpx)),
                  ),
                  Positioned(
                    top: -4,
                    right: -4,
                    child: Visibility(
                      visible: captureArr.length == 1,
                      child: InkWell(
                        onTap: () => _onDelCaptureImage(0),
                        child: Container(
                          padding: EdgeInsets.all(2.dpx),
                          decoration: const BoxDecoration(shape: BoxShape.circle, color: Colors.black),
                          child: AppImage.asset(
                            'assets/images/ic_close_small.webp',
                            width: 10.dpx,
                            height: 10.dpx,
                            fit: BoxFit.cover,
                          ),
                        ),
                      ),
                    ),
                  ),
                  Positioned(
                    bottom: -10,
                    right: -4,
                    child: Container(
                      padding: EdgeInsets.all(4.dpx),
                      decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                      child: Center(
                        child: Text(
                          '${captureArr.length}',
                          style: TextStyle(color: Colors.black, fontSize: 10.dpx, fontWeight: FontWeight.w500),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  /// 展开后
  Widget _buildExpandAfter(List<String> captureArr) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.0, end: 1.0),
      duration: 300.ms,
      builder: (context, value, child) {
        return Transform.translate(
          offset: Offset(0, -20 * (1 - value)),
          child: Opacity(
            opacity: value,
            child: Container(
              margin: EdgeInsets.symmetric(horizontal: 14.dpx),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.5),
                borderRadius: BorderRadius.circular(12.dpx),
                border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12.dpx),
                child: Container(
                  height: 54.dpx,
                  padding: EdgeInsets.all(5.dpx),
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: captureArr.length + 1,
                    separatorBuilder: (_, __) => Gap(8.dpx),
                    itemBuilder: (context, index) {
                      if (index == captureArr.length) {
                        return GestureDetector(
                          onTap: () => setState(() {
                            _isExpand = false;
                            _driftController.repeat();
                          }),
                          child: Container(
                            width: 44.dpx,
                            height: 44.dpx,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.all(Radius.circular(12.dpx)),
                              border: Border.all(color: Colors.white.withValues(alpha: 0.3)),
                              color: Colors.white.withValues(alpha: 0.05),
                            ),
                            child: Center(
                              child: Text(
                                "Done",
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.8),
                                  fontSize: 11.dpx,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ),
                          ),
                        );
                      }

                      return TweenAnimationBuilder<double>(
                        // 利用延迟实现交错感
                        tween: Tween(begin: 0.0, end: 1.0),
                        duration: Duration(milliseconds: 400 + (index * 100)),
                        curve: Curves.elasticOut,
                        builder: (context, value, child) {
                          return Transform.scale(scale: value, child: child);
                        },
                        child: Stack(
                          clipBehavior: Clip.none,
                          children: [
                            AppImage.asset(
                              captureArr[index],
                              width: 44.dpx,
                              height: 44.dpx,
                              fit: BoxFit.cover,
                              borderRadius: BorderRadius.all(Radius.circular(12.dpx)),
                            ),
                            Positioned(
                              top: -4,
                              right: -4,
                              child: InkWell(
                                onTap: () => _onDelCaptureImage(index),
                                child: Container(
                                  padding: EdgeInsets.all(2.dpx),
                                  decoration: const BoxDecoration(shape: BoxShape.circle, color: Colors.black),
                                  child: AppImage.asset(
                                    'assets/images/ic_close_small.webp',
                                    width: 10.dpx,
                                    height: 10.dpx,
                                    fit: BoxFit.cover,
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
            ),
          ),
        );
      },
    );
  }
}
