import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../common/utils/log_utils.dart';

/// 日志查看器页面（二级页面）
class LogViewerPage extends StatefulWidget {
  const LogViewerPage({super.key});

  @override
  State<LogViewerPage> createState() => _LogViewerPageState();
}

class _LogViewerPageState extends State<LogViewerPage> {
  List<LogEntry> _entries = [];
  LogLevel? _filterLevel;
  String _searchQuery = '';
  final _scrollController = ScrollController();
  bool _autoScroll = true;

  @override
  void initState() {
    super.initState();
    _loadEntries();
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _loadEntries() {
    setState(() {
      _entries = Log.entries;
    });
    if (_autoScroll) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollController.hasClients) {
          _scrollController.jumpTo(_scrollController.position.maxScrollExtent);
        }
      });
    }
  }

  List<LogEntry> get _filteredEntries {
    return _entries.where((e) {
      if (_filterLevel != null && e.level != _filterLevel) return false;
      if (_searchQuery.isNotEmpty) {
        final q = _searchQuery.toLowerCase();
        return e.message.toLowerCase().contains(q) || e.tag.toLowerCase().contains(q);
      }
      return true;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filteredEntries;

    return Scaffold(
      backgroundColor: const Color(0xFF1C1C1E),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1C1C1E),
        foregroundColor: Colors.white,
        title: Text(
          '日志 (${filtered.length})',
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
        ),
        actions: [
          IconButton(
            icon: Icon(
              _autoScroll ? Icons.vertical_align_bottom : Icons.vertical_align_top,
              size: 20,
            ),
            tooltip: _autoScroll ? '自动滚动: 开' : '自动滚动: 关',
            onPressed: () => setState(() => _autoScroll = !_autoScroll),
          ),
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert, size: 20),
            color: const Color(0xFF2C2C2E),
            itemBuilder: (_) => [
              const PopupMenuItem(
                value: 'refresh',
                child: Text('刷新', style: TextStyle(color: Colors.white)),
              ),
              const PopupMenuItem(
                value: 'clear',
                child: Text('清空内存日志', style: TextStyle(color: Colors.white)),
              ),
              const PopupMenuItem(
                value: 'share',
                child: Text('分享日志文件', style: TextStyle(color: Colors.white)),
              ),
              const PopupMenuItem(
                value: 'copy',
                child: Text('复制全部', style: TextStyle(color: Colors.white)),
              ),
            ],
            onSelected: _onMenuAction,
          ),
        ],
      ),
      body: Column(
        children: [
          // 搜索栏
          _buildSearchBar(),
          // 级别过滤
          _buildLevelFilter(),
          const Divider(color: Color(0xFF38383A), height: 1),
          // 日志列表
          Expanded(
            child: filtered.isEmpty
                ? _buildEmpty()
                : ListView.builder(
                    controller: _scrollController,
                    itemCount: filtered.length,
                    itemBuilder: (_, i) => _LogTile(entry: filtered[i]),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchBar() {
    return Container(
      color: const Color(0xFF2C2C2E),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: TextField(
        onChanged: (v) => setState(() => _searchQuery = v),
        style: const TextStyle(color: Colors.white, fontSize: 14),
        cursorColor: const Color(0xFF0A84FF),
        decoration: InputDecoration(
          hintText: '搜索日志...',
          hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.3)),
          prefixIcon: const Icon(Icons.search, color: Color(0xFF8E8E93), size: 20),
          filled: true,
          fillColor: const Color(0xFF3A3A3C),
          contentPadding: const EdgeInsets.symmetric(vertical: 8),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide.none,
          ),
        ),
      ),
    );
  }

  Widget _buildLevelFilter() {
    return Container(
      color: const Color(0xFF2C2C2E),
      padding: const EdgeInsets.only(left: 12, right: 12, bottom: 8),
      child: Row(
        children: [
          _FilterChip(label: 'ALL', selected: _filterLevel == null, onTap: () => setState(() => _filterLevel = null)),
          const SizedBox(width: 6),
          ...LogLevel.values.map(
            (level) => Padding(
              padding: const EdgeInsets.only(right: 6),
              child: _FilterChip(
                label: level.label,
                color: _levelColor(level),
                selected: _filterLevel == level,
                onTap: () => setState(() => _filterLevel = _filterLevel == level ? null : level),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmpty() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.article_outlined, size: 48, color: Colors.white.withValues(alpha: 0.15)),
          const SizedBox(height: 12),
          Text(
            '暂无日志',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.35), fontSize: 15),
          ),
        ],
      ),
    );
  }

  void _onMenuAction(String action) {
    switch (action) {
      case 'refresh':
        _loadEntries();
        break;
      case 'clear':
        Log.clearEntries();
        _loadEntries();
        break;
      case 'share':
        _shareLogFile();
        break;
      case 'copy':
        _copyAll();
        break;
    }
  }

  Future<void> _shareLogFile() async {
    final filePath = Log.logFilePath;
    if (filePath == null) return;

    await Log.flush();
    final file = File(filePath);
    if (!file.existsSync()) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('日志文件不存在'), backgroundColor: Color(0xFFFF453A)),
        );
      }
      return;
    }

    // 读取文件内容并复制到剪贴板
    final content = await file.readAsString();
    await Clipboard.setData(ClipboardData(text: content));
    HapticFeedback.lightImpact();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('日志文件内容已复制到剪贴板'),
          backgroundColor: Color(0xFF30D158),
          duration: Duration(seconds: 1),
        ),
      );
    }
  }

  void _copyAll() {
    final text = _filteredEntries.map((e) => '[${e.timeString}][${e.level.label}][${e.tag}] ${e.message}').join('\n');
    Clipboard.setData(ClipboardData(text: text));
    HapticFeedback.lightImpact();
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('已复制全部日志'),
        backgroundColor: Color(0xFF30D158),
        duration: Duration(seconds: 1),
      ),
    );
  }

  static Color _levelColor(LogLevel level) {
    return switch (level) {
      LogLevel.debug => const Color(0xFF8E8E93),
      LogLevel.info => const Color(0xFF0A84FF),
      LogLevel.warning => const Color(0xFFFF9F0A),
      LogLevel.error => const Color(0xFFFF453A),
    };
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    this.color,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final Color? color;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = color ?? const Color(0xFF8E8E93);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        decoration: BoxDecoration(
          color: selected ? c.withValues(alpha: 0.25) : const Color(0xFF3A3A3C),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected ? c : Colors.transparent,
            width: 1,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? c : const Color(0xFF8E8E93),
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////

class _LogTile extends StatelessWidget {
  const _LogTile({required this.entry});

  final LogEntry entry;

  @override
  Widget build(BuildContext context) {
    final color = switch (entry.level) {
      LogLevel.debug => const Color(0xFF8E8E93),
      LogLevel.info => const Color(0xFF0A84FF),
      LogLevel.warning => const Color(0xFFFF9F0A),
      LogLevel.error => const Color(0xFFFF453A),
    };

    return GestureDetector(
      onLongPress: () {
        Clipboard.setData(ClipboardData(text: '[${entry.timeString}][${entry.tag}] ${entry.message}'));
        HapticFeedback.lightImpact();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('已复制'),
            backgroundColor: Color(0xFF30D158),
            duration: Duration(milliseconds: 600),
          ),
        );
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: Color(0xFF2C2C2E), width: 0.5)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 时间 + 级别
            SizedBox(
              width: 90,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    entry.timeString,
                    style: const TextStyle(
                      color: Color(0xFF636366),
                      fontSize: 10,
                      fontFamily: 'monospace',
                    ),
                  ),
                  Row(
                    children: [
                      Container(
                        width: 6,
                        height: 6,
                        margin: const EdgeInsets.only(right: 4),
                        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                      ),
                      Text(
                        entry.tag,
                        style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w600),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ],
              ),
            ),
            // 消息
            Expanded(
              child: Text(
                entry.message,
                style: TextStyle(
                  color: entry.level == LogLevel.error ? const Color(0xFFFF453A) : Colors.white.withValues(alpha: 0.85),
                  fontSize: 12,
                  fontFamily: 'monospace',
                  height: 1.4,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
