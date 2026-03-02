import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../service/session/http/function/skill_http_service.dart';
import 'skill_provider.dart';

//////////////////////////////////////////////////////////////////////////////
// 常量
//////////////////////////////////////////////////////////////////////////////

/// 分类颜色映射
const _categoryColors = <String, Color>{
  '笔记': Color(0xFFF97316),
  '通讯': Color(0xFF06B6D4),
  '开发': Color(0xFF8B5CF6),
  'AI': Color(0xFFEC4899),
  '家居': Color(0xFF14B8A6),
  '音乐': Color(0xFFF43F5E),
  '工具': Color(0xFFEAB308),
  '任务': Color(0xFF22C55E),
  '位置': Color(0xFF3B82F6),
  '生活': Color(0xFF0EA5E9),
  '搜索': Color(0xFF10B981),
  '记忆': Color(0xFFA855F7),
  '自定义': Color(0xFFF59E0B),
};

/// 分类图标映射
const _categoryIcons = <String, String>{
  '笔记': '📝',
  '通讯': '💬',
  '开发': '🔧',
  'AI': '🤖',
  '家居': '🏠',
  '音乐': '🎵',
  '工具': '🔐',
  '任务': '✅',
  '位置': '📍',
  '生活': '🌤️',
  '搜索': '🌐',
  '记忆': '🧠',
  '自定义': '✨',
};

Color _colorForCategory(String category) => _categoryColors[category] ?? const Color(0xFF667EEA);

String _iconForCategory(String category) => _categoryIcons[category] ?? '📦';

//////////////////////////////////////////////////////////////////////////////
// 节点数据
//////////////////////////////////////////////////////////////////////////////

enum _NodeType { root, category, skill }

class _TreeNode {
  final String id;
  final String label;
  final String icon;
  final _NodeType type;
  final Color color;
  Offset position;

  _TreeNode({
    required this.id,
    required this.label,
    required this.icon,
    required this.type,
    required this.color,
    required this.position,
  });

  double get radius {
    switch (type) {
      case _NodeType.root:
        return 28;
      case _NodeType.category:
        return 20;
      case _NodeType.skill:
        return 14;
    }
  }
}

class _TreeEdge {
  final String sourceId;
  final String targetId;

  const _TreeEdge({required this.sourceId, required this.targetId});
}

//////////////////////////////////////////////////////////////////////////////
// Widget
//////////////////////////////////////////////////////////////////////////////

/// 技能树可视化组件 - 简单的力导向布局渲染
class SkillsSection extends ConsumerStatefulWidget {
  const SkillsSection({super.key});

  @override
  ConsumerState<SkillsSection> createState() => _SkillsSectionState();
}

class _SkillsSectionState extends ConsumerState<SkillsSection> with SingleTickerProviderStateMixin {
  late AnimationController _pulseController;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 3),
    )..repeat();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(skillTreeProvider.notifier).loadSkillTree();
    });
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(skillTreeProvider);

    if (state.isLoading && state.data.unlockedCount == 0) {
      return _buildContainer(
        child: const Center(child: CircularProgressIndicator(strokeWidth: 1.5)),
      );
    }

    if (state.data.unlockedCount == 0) {
      return _buildContainer(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('🌱', style: TextStyle(fontSize: 36, color: Colors.white.withValues(alpha: 0.3))),
              const SizedBox(height: 8),
              Text(
                '技能树还是空的',
                style: TextStyle(fontSize: 13, color: Colors.white.withValues(alpha: 0.4)),
              ),
              const SizedBox(height: 4),
              Text(
                '开始使用 Agent 的各种技能吧',
                style: TextStyle(fontSize: 11, color: Colors.white.withValues(alpha: 0.25)),
              ),
            ],
          ),
        ),
      );
    }

    // Build tree data
    final nodes = <_TreeNode>[];
    final edges = <_TreeEdge>[];
    _buildTree(state.data, nodes, edges);

    return _buildContainer(
      child: AnimatedBuilder(
        animation: _pulseController,
        builder: (context, _) {
          return CustomPaint(
            painter: _SkillTreePainter(
              nodes: nodes,
              edges: edges,
              pulseValue: _pulseController.value,
            ),
            size: Size.infinite,
          );
        },
      ),
    );
  }

  Widget _buildContainer({required Widget child}) {
    return Container(
      height: 260,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: const LinearGradient(
          colors: [Color(0xFF0A0A0F), Color(0xFF12121A), Color(0xFF0F1318)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          // 微妙的背景辉光
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: Alignment.center,
                  radius: 0.8,
                  colors: [
                    const Color(0xFF4ADE80).withValues(alpha: 0.04),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          child,
          // 已解锁数量
          Positioned(
            top: 14,
            right: 16,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
              ),
              child: Consumer(
                builder: (context, ref, _) {
                  final count = ref.watch(skillTreeProvider).data.unlockedCount;
                  return Text(
                    '$count skills',
                    style: TextStyle(
                      fontSize: 11,
                      color: Colors.white.withValues(alpha: 0.5),
                      fontWeight: FontWeight.w500,
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// 构建树节点和边
  void _buildTree(SkillTreeData data, List<_TreeNode> nodes, List<_TreeEdge> edges) {
    const rootId = 'agent';
    final grouped = data.groupedActiveSkills;

    // 计算布局
    const boxWidth = 400.0;
    const boxHeight = 260.0;
    const centerX = boxWidth / 2;
    const centerY = boxHeight / 2;

    // Root node
    nodes.add(
      _TreeNode(
        id: rootId,
        label: 'Agent',
        icon: '🧠',
        type: _NodeType.root,
        color: const Color(0xFF4ADE80),
        position: const Offset(centerX, centerY),
      ),
    );

    final categories = grouped.keys.toList();
    final catCount = categories.length;

    for (var ci = 0; ci < catCount; ci++) {
      final cat = categories[ci];
      final catId = 'cat-$cat';
      final catAngle = (2 * pi * ci / catCount) - pi / 2;
      const catDist = 80.0;

      final catX = centerX + catDist * cos(catAngle);
      final catY = centerY + catDist * sin(catAngle);

      nodes.add(
        _TreeNode(
          id: catId,
          label: cat,
          icon: _iconForCategory(cat),
          type: _NodeType.category,
          color: _colorForCategory(cat),
          position: Offset(catX, catY),
        ),
      );

      edges.add(_TreeEdge(sourceId: rootId, targetId: catId));

      // Skills in this category
      final skills = grouped[cat]!;
      for (var si = 0; si < skills.length; si++) {
        final skill = skills[si];
        final skillAngle = catAngle + (si - (skills.length - 1) / 2) * 0.45;
        const skillDist = 55.0;

        final skillX = catX + skillDist * cos(skillAngle);
        final skillY = catY + skillDist * sin(skillAngle);

        nodes.add(
          _TreeNode(
            id: skill.id,
            label: skill.name,
            icon: skill.icon,
            type: _NodeType.skill,
            color: _colorForCategory(skill.category),
            position: Offset(skillX, skillY),
          ),
        );

        edges.add(_TreeEdge(sourceId: catId, targetId: skill.id));
      }
    }
  }
}

//////////////////////////////////////////////////////////////////////////////
// Custom Painter
//////////////////////////////////////////////////////////////////////////////

class _SkillTreePainter extends CustomPainter {
  final List<_TreeNode> nodes;
  final List<_TreeEdge> edges;
  final double pulseValue;

  _SkillTreePainter({
    required this.nodes,
    required this.edges,
    required this.pulseValue,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (nodes.isEmpty) return;

    // Scale to fit the container
    final scaleX = size.width / 400;
    final scaleY = size.height / 260;
    final scale = min(scaleX, scaleY) * 0.85;
    final offsetX = (size.width - 400 * scale) / 2;
    final offsetY = (size.height - 260 * scale) / 2;

    Offset transform(Offset pos) => Offset(pos.dx * scale + offsetX, pos.dy * scale + offsetY);

    // Build node lookup
    final nodeMap = <String, _TreeNode>{};
    for (final node in nodes) {
      nodeMap[node.id] = node;
    }

    // Draw edges
    for (final edge in edges) {
      final source = nodeMap[edge.sourceId];
      final target = nodeMap[edge.targetId];
      if (source == null || target == null) continue;

      final sp = transform(source.position);
      final tp = transform(target.position);

      // Curved dashed line
      final midX = (sp.dx + tp.dx) / 2;
      final midY = (sp.dy + tp.dy) / 2;
      final dx = tp.dx - sp.dx;
      final dy = tp.dy - sp.dy;
      final controlX = midX + dy * 0.12;
      final controlY = midY - dx * 0.12;

      final path = Path()
        ..moveTo(sp.dx, sp.dy)
        ..quadraticBezierTo(controlX, controlY, tp.dx, tp.dy);

      // Draw dashed
      final paint = Paint()
        ..color = const Color(0xFF4ADE80).withValues(alpha: 0.35)
        ..strokeWidth = 1.5 * scale
        ..style = PaintingStyle.stroke;

      _drawDashedPath(canvas, path, paint, 4 * scale, 3 * scale);
    }

    // Draw nodes
    for (final node in nodes) {
      final pos = transform(node.position);
      final r = node.radius * scale;

      switch (node.type) {
        case _NodeType.root:
          // Glow
          final glowPaint = Paint()
            ..shader = RadialGradient(
              colors: [
                const Color(0xFF4ADE80).withValues(alpha: 0.3 + 0.15 * sin(pulseValue * 2 * pi)),
                Colors.transparent,
              ],
            ).createShader(Rect.fromCircle(center: pos, radius: r * 2.2));
          canvas.drawCircle(pos, r * 2.2, glowPaint);

          // Circle
          final rootPaint = Paint()
            ..shader = const RadialGradient(
              colors: [Color(0xFF4ADE80), Color(0xFF22C55E)],
            ).createShader(Rect.fromCircle(center: pos, radius: r));
          canvas.drawCircle(pos, r, rootPaint);

        case _NodeType.category:
          // Glow
          final catGlow = Paint()
            ..color = node.color.withValues(alpha: 0.15)
            ..maskFilter = MaskFilter.blur(BlurStyle.normal, 8 * scale);
          canvas.drawCircle(pos, r * 1.3, catGlow);

          // Circle
          final catPaint = Paint()..color = node.color;
          canvas.drawCircle(pos, r, catPaint);

        case _NodeType.skill:
          // Fill
          final skillFill = Paint()..color = const Color(0xFF4ADE80).withValues(alpha: 0.1);
          canvas.drawCircle(pos, r, skillFill);

          // Stroke
          final skillStroke = Paint()
            ..color = node.color.withValues(alpha: 0.7)
            ..style = PaintingStyle.stroke
            ..strokeWidth = 1.8 * scale;
          canvas.drawCircle(pos, r, skillStroke);
      }

      // Icon
      final iconPainter = TextPainter(
        text: TextSpan(
          text: node.icon,
          style: TextStyle(fontSize: r * 0.85),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      iconPainter.paint(
        canvas,
        Offset(pos.dx - iconPainter.width / 2, pos.dy - iconPainter.height / 2),
      );

      // Label beneath
      final labelPainter = TextPainter(
        text: TextSpan(
          text: node.label,
          style: TextStyle(
            fontSize: 9 * scale,
            color: Colors.white.withValues(alpha: 0.55),
          ),
        ),
        textDirection: TextDirection.ltr,
        textAlign: TextAlign.center,
      )..layout();
      labelPainter.paint(
        canvas,
        Offset(pos.dx - labelPainter.width / 2, pos.dy + r + 4 * scale),
      );
    }
  }

  void _drawDashedPath(Canvas canvas, Path path, Paint paint, double dashLength, double gapLength) {
    for (final metric in path.computeMetrics()) {
      double distance = 0;
      while (distance < metric.length) {
        final end = min(distance + dashLength, metric.length);
        canvas.drawPath(metric.extractPath(distance, end), paint);
        distance = end + gapLength;
      }
    }
  }

  @override
  bool shouldRepaint(covariant _SkillTreePainter oldDelegate) {
    return oldDelegate.pulseValue != pulseValue || oldDelegate.nodes != nodes;
  }
}
