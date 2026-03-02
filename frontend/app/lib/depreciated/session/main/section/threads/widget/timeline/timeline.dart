import 'package:flutter/material.dart';

import '../../components/dashed_line_painter.dart';
import '../../components/timeline_dot.dart';
import '../../data/thread_model.dart';

/// 节点状态枚举
enum ThreadStatus {
  completed, // 已完成
  inProgress, // 进行中
  pending, // 待办
}

/// 时间线配置
class TimelineConfig {
  final double dotSize;
  final double dashWidth;
  final double dashHeight;
  final double dashSpace;
  final double strokeWidth;
  final Color lineColor;

  /// dot 和虚线之间的间距
  final double dotLineGap;

  const TimelineConfig({
    this.dotSize = 24,
    this.dashWidth = 4,
    this.dashHeight = 4,
    this.dashSpace = 4,
    this.strokeWidth = 1,
    this.lineColor = const Color(0xFFD1D1D6),
    this.dotLineGap = 8,
  });
}

class ThreadTimeline extends StatelessWidget {
  final Axis axis;
  final List<ThreadDataGroup> data;
  final TimelineConfig config;

  /// chip 点击回调
  /// [item] - 当前时间节点数据
  /// [index] - 时间节点索引
  /// [chipTitle] - 被点击的 chip 标题
  final void Function(ThreadData item, int index, String chipTitle)? onChipTap;
  final Widget? emptyWidget;
  final EdgeInsetsGeometry? padding;

  const ThreadTimeline({
    super.key,
    required this.axis,
    required this.data,
    this.config = const TimelineConfig(),
    this.onChipTap,
    this.emptyWidget,
    this.padding,
  });

  @override
  Widget build(BuildContext context) {
    // 空数据处理
    if (data.isEmpty) {
      return emptyWidget ?? _buildDefaultEmpty();
    }

    return _buildHorizontalLayout();
  }

  /// 默认空状态
  Widget _buildDefaultEmpty() {
    return const Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.timeline, size: 48, color: Colors.grey),
          SizedBox(height: 12),
          Text('暂无时间线数据', style: TextStyle(color: Colors.grey, fontSize: 14)),
        ],
      ),
    );
  }

  /// 横向布局 - 匹配设计稿左侧首页样式
  /// 默认最多显示5条，多于5条时可滚动（轮播效果）
  Widget _buildHorizontalLayout() {
    // 限制最多显示5条
    final displayData = data.take(5).toList();

    return SingleChildScrollView(
      primary: false,
      physics: const ClampingScrollPhysics(),
      scrollDirection: Axis.horizontal,
      padding: padding ?? const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: displayData.asMap().entries.map((entry) {
          return _buildHorizontalSection(entry.value, entry.key, isLast: entry.key == displayData.length - 1);
        }).toList(),
      ),
    );
  }

  /// 横向子模块 - 节点 + 虚线 + 日期 + chips
  /// 虚线从 TimelineDot 右边开始，连接到下一个节点
  /// 日期标签用 Stack 放在 dot 的右上角
  Widget _buildHorizontalSection(ThreadDataGroup item, int index, {bool? isLast}) {
    final isLastItem = isLast ?? (index == data.length - 1);

    return SizedBox(
      width: 220,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 第一行：TimelineDot + 日期标签(右上角) + 虚线
          Stack(
            clipBehavior: Clip.none,
            children: [
              // 底层：TimelineDot + 虚线
              Row(
                children: [
                  TimelineDot(size: config.dotSize),
                  // 虚线从 dot 右边开始
                  if (!isLastItem) ...[
                    SizedBox(width: config.dotLineGap),
                    Expanded(
                      child: SizedBox(
                        height: config.dotSize,
                        child: Center(
                          child: CustomPaint(
                            size: const Size(double.infinity, 1),
                            painter: DashedLinePainter(
                              axis: Axis.horizontal,
                              color: config.lineColor,
                              dashWidth: config.dashWidth,
                              dashSpace: config.dashSpace,
                              strokeWidth: config.strokeWidth,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              // 日期标签 - 定位在 dot 右上角
              Positioned(
                left: config.dotSize + 4,
                top: -2,
                child: Text(item.dateLabel, style: _dateStyle),
              ),
            ],
          ),
          const SizedBox(height: 20),
          // Chips 列表 - 使用 Expanded 填充剩余空间
          Expanded(
            child: SingleChildScrollView(
              primary: false,
              physics: const ClampingScrollPhysics(),
              scrollDirection: Axis.vertical,
              child: SizedBox(
                width: double.infinity,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: item.items.map((t) => _buildChip(t.title, t, index)).toList(),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// 构建标签 Chip - 圆角灰色背景
  Widget _buildChip(String text, ThreadData item, int index) {
    return GestureDetector(
      onTap: onChipTap != null ? () => onChipTap!(item, index, text) : null,
      behavior: HitTestBehavior.opaque,
      child: Column(
        children: [
          Container(
            margin: const EdgeInsets.only(bottom: 6),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: const Color(0xFFF2F2F7),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Text(
              text,
              style: const TextStyle(
                fontSize: 13,
                color: Colors.black87,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(height: 10),
        ],
      ),
    );
  }

  TextStyle get _dateStyle => const TextStyle(
    color: Color(0xFF8E8E93),
    fontSize: 10,
    fontWeight: FontWeight.w400,
  );
}

/// 时间线数据模型
class ThreadData {
  final String date;
  final String title;
  final ThreadStatus status;
  final dynamic extra; // 扩展数据
  final String? sessionKey; // Session key for API operations
  final String? thumbnailUrl; // Preview thumbnail image URL
  final String? tag; // Tag label for the card
  final dynamic sessionInfo; // 原始 SessionInfo 对象，用于导航
  final List<String> files; // 关联的文件列表

  const ThreadData({
    required this.date,
    required this.title,
    this.status = ThreadStatus.inProgress,
    this.extra,
    this.sessionKey,
    this.thumbnailUrl,
    this.tag,
    this.sessionInfo,
    this.files = const [],
  });

  /// 便捷构造函数（兼容旧代码）
  factory ThreadData.simple(String date, String title) {
    return ThreadData(date: date, title: title);
  }
}
