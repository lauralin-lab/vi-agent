// ignore_for_file: unused_element
/// Model 模板
///
/// 使用方法：
/// 1. 复制此文件到 lib/modules/models/
/// 2. 将 Template 替换为你的模型名
/// 3. 运行 build_runner 生成序列化代码：
///    flutter pub run build_runner build --delete-conflicting-outputs

import 'package:json_annotation/json_annotation.dart';

part 'template_model.g.dart';

/// Template 数据模型
///
/// 描述：[模型的用途描述]
@JsonSerializable()
class TemplateModel {
  /// 唯一标识符
  final String id;

  /// 名称
  final String name;

  /// 创建时间
  @JsonKey(name: 'created_at')
  final DateTime? createdAt;

  /// 更新时间
  @JsonKey(name: 'updated_at')
  final DateTime? updatedAt;

  const TemplateModel({
    required this.id,
    required this.name,
    this.createdAt,
    this.updatedAt,
  });

  /// 从 JSON 创建实例
  factory TemplateModel.fromJson(Map<String, dynamic> json) => _$TemplateModelFromJson(json);

  /// 转换为 JSON
  Map<String, dynamic> toJson() => _$TemplateModelToJson(this);

  /// 复制并修改
  TemplateModel copyWith({
    String? id,
    String? name,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return TemplateModel(
      id: id ?? this.id,
      name: name ?? this.name,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  @override
  String toString() {
    return 'TemplateModel(id: $id, name: $name)';
  }
}
