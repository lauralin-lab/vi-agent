import 'package:flutter/material.dart';

import '../../../models/use_cases.dart';
import 'template_card.dart';

class QuickStartSection extends StatelessWidget {
  final List<QuickStartTemplate> templates;
  final ValueChanged<QuickStartTemplate> onTapTemplate;

  const QuickStartSection({
    super.key,
    required this.templates,
    required this.onTapTemplate,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 0, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 12, right: 16),
            child: Text(
              'QUICK START',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.3),
                fontSize: 10,
                fontFamily: 'Courier New',
                fontWeight: FontWeight.w700,
                letterSpacing: 2.2,
              ),
            ),
          ),
          SizedBox(
            height: 96,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.only(left: 4, right: 16),
              itemCount: templates.length,
              separatorBuilder: (_, __) => const SizedBox(width: 10),
              itemBuilder: (_, i) => TemplateCard(
                template: templates[i],
                onTap: () => onTapTemplate(templates[i]),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
