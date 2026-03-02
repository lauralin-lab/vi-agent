import 'package:json_annotation/json_annotation.dart';

part 'live_kit_show_result_model.g.dart';

/// 结果展示类型
enum LiveKitShowResultType {
  @JsonValue('html')
  html,

  @JsonValue('markdown')
  markdown,

  @JsonValue('url')
  url,

  @JsonValue('json')
  json,

  @JsonValue('text')
  text,

  @JsonValue('data')
  data,;

  /// 是否是markdown
  bool get isMarkdown => this == LiveKitShowResultType.markdown;

  /// 是否为json
  bool get isJson => this == LiveKitShowResultType.json;
}

@JsonSerializable()
class LiveKitShowResultModel {
  @JsonKey(name: 'result_type')
  final LiveKitShowResultType? resultType;

  @JsonKey(name: 'content')
  final String? content;

  const LiveKitShowResultModel({
    this.resultType,
    this.content,
  });

  factory LiveKitShowResultModel.fromJson(Map<String, dynamic> json) =>
      _$LiveKitShowResultModelFromJson(json);

  Map<String, dynamic> toJson() =>
      _$LiveKitShowResultModelToJson(this);

  LiveKitShowResultModel copyWith({
    LiveKitShowResultType? resultType,
    String? content,
  }) {
    return LiveKitShowResultModel(
      resultType: resultType ?? this.resultType,
      content: content ?? this.content,
    );
  }
}