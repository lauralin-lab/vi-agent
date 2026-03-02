// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'metal_shader_model.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MetalShaderModel _$MetalShaderModelFromJson(Map<String, dynamic> json) =>
    MetalShaderModel(
      name: json['name'] as String?,
      metalFile: json['metal_file'] as String?,
      effectDescription: json['effect_description'] as String?,
      theme: json['theme'] as String?,
      usageGuide: json['usage_guide'] as String?,
    );

Map<String, dynamic> _$MetalShaderModelToJson(MetalShaderModel instance) =>
    <String, dynamic>{
      'name': instance.name,
      'metal_file': instance.metalFile,
      'effect_description': instance.effectDescription,
      'theme': instance.theme,
      'usage_guide': instance.usageGuide,
    };
