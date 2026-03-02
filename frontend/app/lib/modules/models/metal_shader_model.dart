import 'package:json_annotation/json_annotation.dart';
part 'metal_shader_model.g.dart';

@JsonSerializable()
class MetalShaderModel {
  @JsonKey(name: 'name')
  String? name;
  @JsonKey(name: 'metal_file')
  String? metalFile;
  @JsonKey(name: 'effect_description')
  String? effectDescription;
  @JsonKey(name: 'theme')
  String? theme;
  @JsonKey(name: 'usage_guide')
  String? usageGuide;

  MetalShaderModel({
    this.name,
    this.metalFile,
    this.effectDescription,
    this.theme,
    this.usageGuide,
  });

  factory MetalShaderModel.fromJson(Map<String, dynamic> json) =>
      _$MetalShaderModelFromJson(json);

  Map<String, dynamic> toJson() => _$MetalShaderModelToJson(this);

  MetalShaderModel copyWith({
    String? name,
    String? metalFile,
    String? effectDescription,
    String? theme,
    String? usageGuide,
  }) {
    return MetalShaderModel(
      name: name ?? this.name,
      metalFile: metalFile ?? this.metalFile,
      effectDescription: effectDescription ?? this.effectDescription,
      theme: theme ?? this.theme,
      usageGuide: usageGuide ?? this.usageGuide,
    );
  }
}
