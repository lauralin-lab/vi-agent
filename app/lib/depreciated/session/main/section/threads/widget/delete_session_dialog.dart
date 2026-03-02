import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../../../../../common/extension/ui_ext.dart';

/// Delete session confirmation bottom sheet matching Figma design
/// Shows animated gradient dots and Delete/Cancel buttons
/// Slides up from the bottom with animation
class DeleteSessionDialog extends StatelessWidget {
  final VoidCallback? onDelete;
  final VoidCallback? onCancel;

  const DeleteSessionDialog({
    super.key,
    this.onDelete,
    this.onCancel,
  });

  /// Show the delete session bottom sheet with slide-up animation
  static Future<bool?> show(BuildContext context) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.3),
      transitionAnimationController: AnimationController(
        vsync: Navigator.of(context),
        duration: const Duration(milliseconds: 300),
      ),
      builder: (context) => DeleteSessionDialog(
        onDelete: () => Navigator.of(context).pop(true),
        onCancel: () => Navigator.of(context).pop(false),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: EdgeInsets.symmetric(horizontal: 16.dpx, vertical: 24.dpx),
      padding: EdgeInsets.all(24.dpx),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24.dpx),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Header with title and close button
          _buildHeader(context),
          SizedBox(height: 24.dpx),
          // Animated gradient dots
          const _AnimatedGradientDots(),
          SizedBox(height: 24.dpx),
          // Warning text
          _buildWarningText(),
          SizedBox(height: 24.dpx),
          // Action buttons
          _buildButtons(),
        ],
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        // Spacer for centering
        SizedBox(width: 24.dpx),
        // Title
        Expanded(
          child: Text(
            'Delete Session?',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: const Color(0xFF1A1B1E),
              fontSize: 18.dpx,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        // Close button
        GestureDetector(
          onTap: onCancel,
          child: Icon(
            Icons.close,
            size: 24.dpx,
            color: const Color(0xFF8E8E93),
          ),
        ),
      ],
    );
  }

  Widget _buildWarningText() {
    return Text(
      "The session will be permanently removed.\nThis action can't be undone.",
      textAlign: TextAlign.center,
      style: TextStyle(
        color: const Color(0xFF8E8E93),
        fontSize: 14.dpx,
        fontWeight: FontWeight.w400,
        height: 1.5,
      ),
    );
  }

  Widget _buildButtons() {
    return Row(
      children: [
        // Delete button (primary dark)
        Expanded(
          child: GestureDetector(
            onTap: onDelete,
            child: Container(
              height: 48.dpx,
              decoration: BoxDecoration(
                color: const Color(0xFF1A1B1E),
                borderRadius: BorderRadius.circular(24.dpx),
              ),
              alignment: Alignment.center,
              child: Text(
                'Delete',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 14.dpx,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ),
        ),
        SizedBox(width: 12.dpx),
        // Cancel button (secondary light)
        Expanded(
          child: GestureDetector(
            onTap: onCancel,
            child: Container(
              height: 48.dpx,
              decoration: BoxDecoration(
                color: const Color(0xFFF5F5F7),
                borderRadius: BorderRadius.circular(24.dpx),
              ),
              alignment: Alignment.center,
              child: Text(
                'Cancel',
                style: TextStyle(
                  color: const Color(0xFF1A1B1E),
                  fontSize: 14.dpx,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Animated gradient dots grid (9x9) matching Figma design
class _AnimatedGradientDots extends StatefulWidget {
  const _AnimatedGradientDots();

  @override
  State<_AnimatedGradientDots> createState() => _AnimatedGradientDotsState();
}

class _AnimatedGradientDotsState extends State<_AnimatedGradientDots> with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2000),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const gridSize = 9;
    const dotSize = 8.0;
    const spacing = 6.0;

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return SizedBox(
          width: gridSize * (dotSize + spacing),
          height: gridSize * (dotSize + spacing),
          child: CustomPaint(
            painter: _GradientDotsPainter(
              gridSize: gridSize,
              dotSize: dotSize,
              spacing: spacing,
              animationValue: _controller.value,
            ),
          ),
        );
      },
    );
  }
}

class _GradientDotsPainter extends CustomPainter {
  final int gridSize;
  final double dotSize;
  final double spacing;
  final double animationValue;

  _GradientDotsPainter({
    required this.gridSize,
    required this.dotSize,
    required this.spacing,
    required this.animationValue,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final cellSize = dotSize + spacing;

    for (int row = 0; row < gridSize; row++) {
      for (int col = 0; col < gridSize; col++) {
        // Calculate position
        final x = col * cellSize + dotSize / 2;
        final y = row * cellSize + dotSize / 2;

        // Calculate gradient based on position (diagonal)
        final normalizedPos = (row + col) / (gridSize * 2 - 2);

        // Add wave animation
        final waveOffset = math.sin((normalizedPos + animationValue) * 2 * math.pi);
        final animatedOpacity = (0.3 + normalizedPos * 0.7 + waveOffset * 0.15).clamp(0.2, 1.0);

        // Gradient colors from dark to light (as per Figma)
        final baseColor = Color.lerp(
          const Color(0xFF1A1B1E), // Dark
          const Color(0xFFD1D1D6), // Light
          normalizedPos,
        )!;

        final paint = Paint()
          ..color = baseColor.withValues(alpha: animatedOpacity)
          ..style = PaintingStyle.fill;

        canvas.drawCircle(Offset(x, y), dotSize / 2, paint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _GradientDotsPainter oldDelegate) {
    return oldDelegate.animationValue != animationValue;
  }
}
