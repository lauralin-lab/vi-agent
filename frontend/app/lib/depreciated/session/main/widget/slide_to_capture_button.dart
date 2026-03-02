import 'package:flutter/material.dart';

import '../../../../common/extension/ui_ext.dart';
import '../../../../modules/widgets/app_image.dart';

class SlideToCaptureButton extends StatefulWidget {
  const SlideToCaptureButton({super.key});

  @override
  State<SlideToCaptureButton> createState() => _SlideToCaptureButtonState();
}

class _SlideToCaptureButtonState extends State<SlideToCaptureButton> {
  bool _isExpanded = false;
  double _dragOffset = 0.0;
  final double _expandedHeight = 80.dpx;
  final double _collapsedSize = 44.dpx;
  final double _iconSize = 44.dpx;
  final double _cameraIconSize = 18.dpx;

  double get _maxDragDistance => _expandedHeight - _collapsedSize - 8.dpx;

  void _onTap() {
    setState(() {
      _isExpanded = !_isExpanded;
      if (!_isExpanded) {
        _dragOffset = 0.0;
      }
    });
  }

  void _onVerticalDragUpdate(DragUpdateDetails details) {
    if (!_isExpanded) return;
    setState(() {
      _dragOffset += details.delta.dy;
      _dragOffset = _dragOffset.clamp(0.0, _maxDragDistance);
    });
  }

  void _onVerticalDragEnd(DragEndDetails details) {
    if (!_isExpanded) return;
    if (_dragOffset > _maxDragDistance * 0.8) {
      Navigator.pop(context);
    } else {
      setState(() {
        _dragOffset = 0.0;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        AnimatedOpacity(
          opacity: _isExpanded ? 1.0 : 0.0,
          duration: const Duration(milliseconds: 200),
          child: Padding(
            padding: EdgeInsets.only(bottom: 8.dpx),
            child: Text(
              'SLIDE TO CAPTURE',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.6),
                fontSize: 12.dpx,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ),
        GestureDetector(
          onTap: _onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeInOut,
            width: _collapsedSize,
            height: _isExpanded ? _expandedHeight : _collapsedSize,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(_collapsedSize / 2),
            ),
            child: Stack(
              alignment: Alignment.topCenter,
              children: [
                Positioned(
                  bottom: 6.dpx,
                  child: AnimatedOpacity(
                    opacity: _isExpanded ? 1.0 : 0.0,
                    duration: const Duration(milliseconds: 300),
                    child: Icon(
                      Icons.arrow_downward,
                      size: 18.dpx,
                      color: Colors.black,
                    ),
                  ),
                ),

                // Draggable Camera Icon
                Positioned(
                  top: _isExpanded ? _dragOffset : 0,
                  child: GestureDetector(
                    onVerticalDragUpdate: _onVerticalDragUpdate,
                    onVerticalDragEnd: _onVerticalDragEnd,
                    child: Container(
                      width: _iconSize,
                      height: _iconSize,
                      alignment: Alignment.center,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.transparent,
                      ),
                      child: AppImage.asset(
                        'assets/images/ic_camera.webp',
                        width: _cameraIconSize,
                        height: _cameraIconSize,
                        color: Colors.black,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
