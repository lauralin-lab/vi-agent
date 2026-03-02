import '../../app.dart';

/// 用户帮助提示
enum UserHelpType {
  /// 无
  none._none(),

  /// 装饰引导
  stagingGuide._(0),

  /// 访问媒体权限提示
  accessMediaTip._(1),

  /// Agent Thinking Tips
  agentThinkingTip._(2),

  ;

  /// 初始化
  const UserHelpType._(int offset)
      : assert(offset >= 0 && offset <= 56),
        code = 1 << offset;

  /// 初始化无
  const UserHelpType._none() : code = 0;

  /// 编码
  final int code;

  /// 用户是否已经查看此提示（默认为开）
  bool get enable => (App().preferences.userHelp & code) != 0;

  /// 设置用户是否已经查看此提示（默认为开）
  set enable(bool value) {
    final userGuide = App().preferences.userHelp;
    if (value == ((userGuide & code) != 0)) return;
    if (value) {
      App().preferences.setUserHelp(userGuide | code);
    } else {
      App().preferences.setUserHelp(userGuide & (~code));
    }
  }
}
