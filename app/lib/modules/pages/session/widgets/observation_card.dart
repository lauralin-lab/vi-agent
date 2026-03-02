import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

/// Observation card with left accent bar, thumbnail/waveform, rich text, and chevron.
/// Used in the "What I Caught" section of SessionScreen.
class ObservationCard extends StatelessWidget {
  /// true = camera capture (shows thumbnail), false = voice (shows waveform)
  final bool isVisual;
  final List<TextSpan> textSpans;
  final String? thumbnailUrl;
  final VoidCallback? onTap;

  const ObservationCard({
    super.key,
    required this.isVisual,
    required this.textSpans,
    this.thumbnailUrl,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.3),
              blurRadius: 12,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Left accent bar
              Container(
                width: 3,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.2),
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(16),
                    bottomLeft: Radius.circular(16),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              // Thumbnail or waveform
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.03),
                    borderRadius: BorderRadius.circular(8),
                    border:
                        Border.all(color: Colors.white.withValues(alpha: 0.06)),
                  ),
                  child: isVisual
                      ? ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: thumbnailUrl != null
                              ? CachedNetworkImage(
                                  imageUrl: thumbnailUrl!,
                                  fit: BoxFit.cover,
                                  errorWidget: (_, __, ___) => Icon(
                                    Icons.image_outlined,
                                    color:
                                        Colors.white.withValues(alpha: 0.2),
                                  ),
                                )
                              : Icon(
                                  Icons.image_outlined,
                                  color: Colors.white.withValues(alpha: 0.2),
                                ),
                        )
                      : Center(child: _WaveformIcon()),
                ),
              ),
              const SizedBox(width: 12),
              // Rich text
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: RichText(
                    text: TextSpan(
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.white.withValues(alpha: 0.8),
                        height: 1.6,
                      ),
                      children: textSpans,
                    ),
                  ),
                ),
              ),
              // Chevron
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 0, 12, 0),
                child: Center(
                  child: Container(
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.06),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      Icons.chevron_right,
                      color: Colors.white.withValues(alpha: 0.4),
                      size: 14,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Static waveform bars for voice observations.
class _WaveformIcon extends StatelessWidget {
  const _WaveformIcon();

  static const _heights = [3.0, 5.0, 8.0, 6.0, 4.0, 7.0, 5.0, 3.0];

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: _heights
          .map(
            (h) => Container(
              width: 2,
              height: h * 1.6,
              margin: const EdgeInsets.symmetric(horizontal: 1),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.25),
                borderRadius: BorderRadius.circular(1),
              ),
            ),
          )
          .toList(),
    );
  }
}
