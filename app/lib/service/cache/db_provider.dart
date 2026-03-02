import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'db_service.dart';

/// 数据库服务 Provider（全局单例）
final databaseServiceProvider = Provider<DatabaseService>((ref) {
  final db = DatabaseService();
  ref.onDispose(() => db.close());
  return db;
});
