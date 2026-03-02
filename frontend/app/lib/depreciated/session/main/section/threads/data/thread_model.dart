import '../widget/timeline/timeline.dart';

/// 数据分组模型
class ThreadDataGroup {
  final String dateLabel;
  final List<ThreadData> items;

  const ThreadDataGroup({
    required this.dateLabel,
    required this.items,
  });
}
