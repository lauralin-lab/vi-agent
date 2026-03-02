import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';

import '../../common/utils/log_utils.dart';
import '../gateway/rpc/function/session_service.dart';
import '../../depreciated/session/chat/model/chat_models_ui.dart';

/// 数据库服务 - 管理本地 sqflite 缓存
class DatabaseService {
  static const _dbName = 'collov_cache.db';
  static const _dbVersion = 1;

  Database? _database;

  /// 获取数据库实例
  Future<Database> get database async {
    _database ??= await _initDatabase();
    return _database!;
  }

  /// 初始化数据库
  Future<Database> _initDatabase() async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, _dbName);

    Log.d('[DatabaseService] Opening database at $path');

    return openDatabase(
      path,
      version: _dbVersion,
      onCreate: _onCreate,
    );
  }

  /// 创建表
  Future<void> _onCreate(Database db, int version) async {
    await db.execute('''
      CREATE TABLE sessions (
        key TEXT PRIMARY KEY,
        display_name TEXT,
        kind TEXT,
        channel TEXT,
        updated_at INTEGER,
        json_data TEXT NOT NULL
      )
    ''');

    await db.execute('''
      CREATE TABLE messages (
        message_id TEXT PRIMARY KEY,
        session_key TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL
      )
    ''');

    // 为 messages 建索引，加速按 session_key 查询
    await db.execute('''
      CREATE INDEX idx_messages_session_key ON messages (session_key)
    ''');

    Log.d('[DatabaseService] Database tables created');
  }

  // =========================================================================
  // Sessions CRUD
  // =========================================================================

  /// 批量写入 sessions（替换全部）
  Future<void> saveSessions(List<SessionInfo> sessions) async {
    final db = await database;
    final batch = db.batch();

    // 清空旧数据后批量插入
    batch.delete('sessions');
    for (final session in sessions) {
      batch.insert('sessions', _sessionToRow(session));
    }

    await batch.commit(noResult: true);
    Log.d('[DatabaseService] Saved ${sessions.length} sessions');
  }

  /// 读取所有 sessions
  Future<List<SessionInfo>> getSessions() async {
    final db = await database;
    final rows = await db.query('sessions', orderBy: 'updated_at DESC');

    return rows.map(_rowToSession).toList();
  }

  /// 删除单个 session（级联删除消息）
  Future<void> deleteSession(String sessionKey) async {
    final db = await database;
    await db.delete('sessions', where: 'key = ?', whereArgs: [sessionKey]);
    await db.delete('messages', where: 'session_key = ?', whereArgs: [sessionKey]);
    Log.d('[DatabaseService] Deleted session $sessionKey');
  }

  // =========================================================================
  // Messages CRUD
  // =========================================================================

  /// 保存某个 session 的消息（替换该 session 的所有消息）
  Future<void> saveMessages(String sessionKey, List<SessionMessage> messages) async {
    final db = await database;
    final batch = db.batch();

    // 删除该 session 的旧消息
    batch.delete('messages', where: 'session_key = ?', whereArgs: [sessionKey]);

    for (final msg in messages) {
      batch.insert('messages', _messageToRow(sessionKey, msg));
    }

    await batch.commit(noResult: true);
    Log.d('[DatabaseService] Saved ${messages.length} messages for session $sessionKey');
  }

  /// 追加单条消息
  Future<void> insertMessage(String sessionKey, SessionMessage message) async {
    final db = await database;
    await db.insert(
      'messages',
      _messageToRow(sessionKey, message),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// 读取某个 session 的消息
  Future<List<SessionMessage>> getMessages(String sessionKey) async {
    final db = await database;
    final rows = await db.query(
      'messages',
      where: 'session_key = ?',
      whereArgs: [sessionKey],
      orderBy: 'created_at ASC',
    );

    return rows.map(_rowToMessage).toList();
  }

  // =========================================================================
  // 数据转换
  // =========================================================================

  Map<String, dynamic> _sessionToRow(SessionInfo session) {
    final json = session.toJson();
    return {
      'key': session.key,
      'display_name': session.displayName,
      'kind': session.kind,
      'channel': session.channel,
      'updated_at': session.updatedAt?.millisecondsSinceEpoch,
      'json_data': jsonEncode(json),
    };
  }

  SessionInfo _rowToSession(Map<String, dynamic> row) {
    final json = jsonDecode(row['json_data'] as String) as Map<String, dynamic>;
    return SessionInfo.fromJson(json);
  }

  Map<String, dynamic> _messageToRow(String sessionKey, SessionMessage msg) {
    return {
      'message_id': msg.messageId,
      'session_key': sessionKey,
      'type': msg.type,
      'content': msg.content is String ? msg.content : jsonEncode(msg.content),
      'metadata': msg.metadata != null ? jsonEncode(msg.metadata) : null,
      'created_at': msg.createdAt.millisecondsSinceEpoch,
    };
  }

  SessionMessage _rowToMessage(Map<String, dynamic> row) {
    dynamic metadata;
    if (row['metadata'] != null) {
      try {
        metadata = jsonDecode(row['metadata'] as String);
      } catch (_) {
        metadata = {};
      }
    } else {
      metadata = {};
    }

    return SessionMessage(
      messageId: row['message_id'] as String,
      type: row['type'] as String,
      content: row['content'] as String? ?? '',
      metadata: metadata,
      createdAt: DateTime.fromMillisecondsSinceEpoch(row['created_at'] as int),
    );
  }

  /// 关闭数据库
  Future<void> close() async {
    await _database?.close();
    _database = null;
  }
}
