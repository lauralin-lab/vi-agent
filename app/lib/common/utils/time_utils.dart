class TimeUtils {
  /// 将秒数转换为 mm:ss 或 hh:mm:ss 格式
  static String formatDuration(int seconds) {
    final int hours = seconds ~/ 3600;
    final int minutes = (seconds % 3600) ~/ 60;
    final int secs = seconds % 60;

    final minutesStr = minutes.toString().padLeft(2, '0');
    final secondsStr = secs.toString().padLeft(2, '0');

    if (hours > 0) {
      final hoursStr = hours.toString();
      return '$hoursStr:$minutesStr:$secondsStr';
    } else {
      return '$minutesStr:$secondsStr';
    }
  }
}
