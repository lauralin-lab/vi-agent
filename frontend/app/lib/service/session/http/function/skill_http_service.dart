import 'package:flutter/foundation.dart';

import '../../../../common/utils/log_utils.dart';
import '../gateway_dio.dart';

//////////////////////////////////////////////////////////////////////////////
// Models
//////////////////////////////////////////////////////////////////////////////

/// 已安装的技能信息 (对应 GET /api/installed-skills 返回的 skill)
class InstalledSkill {
  final String id;
  final String name;
  final String icon;
  final String category;

  const InstalledSkill({
    required this.id,
    required this.name,
    required this.icon,
    required this.category,
  });

  factory InstalledSkill.fromJson(Map<String, dynamic> json) {
    return InstalledSkill(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      icon: json['icon'] as String? ?? '✨',
      category: json['category'] as String? ?? '工具',
    );
  }
}

/// 技能使用记录 (对应 GET /api/skill-usage 返回的 usage 项)
class SkillUsage {
  final String skill;

  const SkillUsage({required this.skill});

  factory SkillUsage.fromJson(Map<String, dynamic> json) {
    return SkillUsage(
      skill: json['skill'] as String? ?? '',
    );
  }

  /// 去掉 "skill:" 前缀的 key
  String get skillKey {
    if (skill.startsWith('skill:')) return skill.substring(6);
    return skill;
  }
}

/// 技能树综合数据
class SkillTreeData {
  final List<InstalledSkill> installedSkills;
  final List<SkillUsage> usedSkills;

  const SkillTreeData({
    required this.installedSkills,
    required this.usedSkills,
  });

  static const empty = SkillTreeData(installedSkills: [], usedSkills: []);

  /// 过滤出已安装且已使用的技能
  List<InstalledSkill> get activeSkills {
    final installedIds = {for (final s in installedSkills) s.id};
    final usedKeys = usedSkills.map((u) => u.skillKey).toSet();
    final activeIds = installedIds.intersection(usedKeys);
    return installedSkills.where((s) => activeIds.contains(s.id)).toList();
  }

  /// 活跃技能按 category 分组
  Map<String, List<InstalledSkill>> get groupedActiveSkills {
    final map = <String, List<InstalledSkill>>{};
    for (final skill in activeSkills) {
      map.putIfAbsent(skill.category, () => []).add(skill);
    }
    return map;
  }

  /// 已解锁技能数量
  int get unlockedCount => activeSkills.length;
}

//////////////////////////////////////////////////////////////////////////////
// HTTP Service
//////////////////////////////////////////////////////////////////////////////

/// Skill HTTP Service - 通过 HTTP 接口获取技能和使用数据
class SkillHttpService {
  const SkillHttpService();

  /// 获取技能使用记录
  /// GET /api/skill-usage
  Future<List<SkillUsage>> getSkillUsage() async {
    try {
      final resp = await gatewayDio.get('/api/skill-usage');
      final data = resp.data;

      if (data is Map<String, dynamic>) {
        final usage = data['usage'] as List? ?? [];
        return usage.whereType<Map<String, dynamic>>().map(SkillUsage.fromJson).toList();
      }

      return [];
    } catch (e) {
      Log.d('[SkillHttpService] getSkillUsage failed: $e');
      return [];
    }
  }

  /// 获取已安装的技能列表
  /// GET /api/installed-skills
  Future<List<InstalledSkill>> getInstalledSkills() async {
    try {
      final resp = await gatewayDio.get('/api/installed-skills');
      final data = resp.data;

      if (data is Map<String, dynamic>) {
        final skills = data['skills'] as List? ?? [];
        return skills.whereType<Map<String, dynamic>>().map(InstalledSkill.fromJson).toList();
      }

      return [];
    } catch (e) {
      Log.d('[SkillHttpService] getInstalledSkills failed: $e');
      return [];
    }
  }

  /// 同时获取使用记录和已安装技能
  Future<SkillTreeData> getSkillTreeData() async {
    try {
      final results = await Future.wait([
        getSkillUsage(),
        getInstalledSkills(),
      ]);

      return SkillTreeData(
        usedSkills: results[0] as List<SkillUsage>,
        installedSkills: results[1] as List<InstalledSkill>,
      );
    } catch (e) {
      Log.d('[SkillHttpService] getSkillTreeData failed: $e');
      return SkillTreeData.empty;
    }
  }
}
