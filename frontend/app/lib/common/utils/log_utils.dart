import 'dart:collection';
import 'dart:developer' as developer;
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as path;

import '../io/paths.dart';

/// 日志工具类
///
/// 提供统一的日志输出接口，支持不同级别的日志
/// 同时将日志保存到内存缓冲区和文件中
class Log {
  Log._();

  static const String _defaultTag = 'App';

  /// 内存中的日志条目（最近 2000 条）
  static final Queue<LogEntry> _entries = Queue<LogEntry>();
  static const int _maxEntries = 2000;

  /// 日志文件写入器
  static IOSink? _fileSink;
  static bool _fileInitialized = false;

  /// 获取所有内存中的日志
  static List<LogEntry> get entries => _entries.toList();

  /// 清空内存中的日志
  static void clearEntries() => _entries.clear();

  /// 调试日志
  static void d(String message, {String? tag}) {
    _log(message, tag: tag ?? _defaultTag, level: LogLevel.debug);
  }

  /// 信息日志
  static void i(String message, {String? tag}) {
    _log(message, tag: tag ?? _defaultTag, level: LogLevel.info);
  }

  /// 警告日志
  static void w(String message, {String? tag}) {
    _log(message, tag: tag ?? _defaultTag, level: LogLevel.warning);
  }

  /// 错误日志
  static void e(String message, {String? tag, Object? error, StackTrace? stackTrace}) {
    _log(message, tag: tag ?? _defaultTag, level: LogLevel.error, error: error, stackTrace: stackTrace);
  }

  /// HTTP 请求日志
  static void http(String message, {String? tag}) {
    _log(message, tag: tag ?? 'HTTP', level: LogLevel.debug);
  }

  /// 输出分隔线
  static void separator({String? tag}) {
    d('━' * 60, tag: tag);
  }

  /// 核心日志输出
  static void _log(
    String message, {
    required String tag,
    required LogLevel level,
    Object? error,
    StackTrace? stackTrace,
  }) {
    final now = DateTime.now();
    final timestamp = now.toIso8601String().substring(11, 23);
    final formattedMessage = '[$timestamp][$tag] $message';

    // 1. 输出到 developer console
    developer.log(
      formattedMessage,
      name: tag,
      level: level.value,
      error: error,
      stackTrace: stackTrace,
    );

    // 2. 输出到 debugPrint
    debugPrint(formattedMessage);
    if (error != null) debugPrint('Error: $error');
    if (stackTrace != null) debugPrint('StackTrace: $stackTrace');

    // 3. 保存到内存
    final entry = LogEntry(
      timestamp: now,
      tag: tag,
      level: level,
      message: message,
      error: error?.toString(),
    );
    _entries.addLast(entry);
    while (_entries.length > _maxEntries) {
      _entries.removeFirst();
    }

    // 4. 写入文件
    _writeToFile(formattedMessage, error: error, stackTrace: stackTrace);
  }

  /// 初始化日志文件
  static void _initFile() {
    if (_fileInitialized) return;
    _fileInitialized = true;

    try {
      final logDir = Directory(path.join(Paths.temporaryDirectory.path, '.logs'));
      if (!logDir.existsSync()) {
        logDir.createSync(recursive: true);
      }

      // 清理旧日志（保留最近 3 个文件）
      _cleanOldLogs(logDir);

      final date = DateTime.now().toIso8601String().substring(0, 10);
      final logFile = File(path.join(logDir.path, 'app_$date.log'));
      _fileSink = logFile.openWrite(mode: FileMode.append);
      _fileSink!.writeln('\n═══ App started at ${DateTime.now().toIso8601String()} ═══\n');
    } catch (e) {
      debugPrint('[Log] Failed to init log file: $e');
    }
  }

  /// 写入日志文件
  static void _writeToFile(String message, {Object? error, StackTrace? stackTrace}) {
    _initFile();
    try {
      _fileSink?.writeln(message);
      if (error != null) _fileSink?.writeln('  Error: $error');
      if (stackTrace != null) _fileSink?.writeln('  StackTrace: $stackTrace');
    } catch (_) {}
  }

  /// 清理旧日志文件
  static void _cleanOldLogs(Directory logDir) {
    try {
      final files = logDir.listSync().whereType<File>().toList()..sort((a, b) => b.path.compareTo(a.path));
      // 保留最近 3 个
      for (int i = 3; i < files.length; i++) {
        files[i].deleteSync();
      }
    } catch (_) {}
  }

  /// 获取日志文件路径
  static String? get logFilePath {
    try {
      final logDir = Directory(path.join(Paths.temporaryDirectory.path, '.logs'));
      final date = DateTime.now().toIso8601String().substring(0, 10);
      return path.join(logDir.path, 'app_$date.log');
    } catch (_) {
      return null;
    }
  }

  /// 刷新文件缓冲区
  static Future<void> flush() async {
    await _fileSink?.flush();
  }
}

/// 日志级别
enum LogLevel {
  debug(500, 'D'),
  info(800, 'I'),
  warning(900, 'W'),
  error(1000, 'E');

  const LogLevel(this.value, this.label);

  final int value;
  final String label;
}

/// 日志条目
class LogEntry {
  LogEntry({
    required this.timestamp,
    required this.tag,
    required this.level,
    required this.message,
    this.error,
  });

  final DateTime timestamp;
  final String tag;
  final LogLevel level;
  final String message;
  final String? error;

  String get timeString =>
      '${timestamp.hour.toString().padLeft(2, '0')}:'
      '${timestamp.minute.toString().padLeft(2, '0')}:'
      '${timestamp.second.toString().padLeft(2, '0')}.'
      '${timestamp.millisecond.toString().padLeft(3, '0')}';
}
