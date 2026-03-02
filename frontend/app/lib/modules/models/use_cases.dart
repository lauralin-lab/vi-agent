class QuickStartTemplate {
  final String id;
  final String label;
  final String icon;

  const QuickStartTemplate({
    required this.id,
    required this.label,
    required this.icon,
  });
}

final List<QuickStartTemplate> kQuickStartTemplates = [
  const QuickStartTemplate(id: 'fashion', label: 'Style Me', icon: 'scissors'),
  const QuickStartTemplate(id: 'nutrition', label: 'Nutrition', icon: 'file_text'),
  const QuickStartTemplate(id: 'shopping', label: 'Shop It', icon: 'shopping_bag'),
  const QuickStartTemplate(id: 'music', label: 'Music', icon: 'music'),
  const QuickStartTemplate(id: 'film', label: 'Review', icon: 'film'),
];
