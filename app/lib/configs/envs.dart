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

  /// Compile-time environment overrides (--dart-define)
  static const String _prodHost =
      String.fromEnvironment('PROD_API_HOST', defaultValue: 'http://localhost:3601/api');
  static const String _testHost =
      String.fromEnvironment('TEST_API_HOST', defaultValue: 'http://localhost:3601/api');

  /// 当前选择环境的 Base URL
  String get host {
    return switch (this) {
      ServerEnv.production => _prodHost,
      ServerEnv.test => _testHost,
    };
  }

  /// 控制台提示
  String get consoleTips => this == test ? '测试服' : '正式服';
}
