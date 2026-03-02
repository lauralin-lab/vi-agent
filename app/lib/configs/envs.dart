/// 服务器环境配置
enum ServerEnv {
  /// 正式生产环境
  production._(0),

  /// 测试环境
  test._(1);

  /// 初始化
  const ServerEnv._(this.value);

  /// 环境变量
  final int value;

  /// 当前选择环境的 Base URL
  String get host {
    return switch (this) {
      ServerEnv.production => 'https://api.dev-user.agentone.collov.ai/v1',
      ServerEnv.test => 'https://api.dev-user.agentone.collov.ai/v1',
    };
  }

  /// 控制台提示
  String get consoleTips => this == test ? '测试服' : '正式服';
}
