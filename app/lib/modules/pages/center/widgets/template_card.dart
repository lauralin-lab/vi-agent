import 'package:flutter/material.dart';

import '../../../models/use_cases.dart';

IconData templateIcon(String name) {
  return switch (name) {
    'scissors' => Icons.content_cut_outlined,
    'file_text' => Icons.description_outlined,
    'shopping_bag' => Icons.shopping_bag_outlined,
    'music' => Icons.music_note_outlined,
    _ => Icons.movie_outlined,
  };
}

class TemplateCard extends StatelessWidget {
  final QuickStartTemplate template;
  final VoidCallback onTap;

  const TemplateCard({super.key, required this.template, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final icon = templateIcon(template.icon);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 84,
        height: 96,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.035),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: Colors.white.withValues(alpha: 0.07)),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: Colors.white.withValues(alpha: 0.45), size: 22),
            const SizedBox(height: 10),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6),
              child: Text(
                template.label,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.45),
                  fontSize: 9.5,
                  fontWeight: FontWeight.w500,
                  height: 1.3,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
