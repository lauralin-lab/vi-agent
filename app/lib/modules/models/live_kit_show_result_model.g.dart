// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'live_kit_show_result_model.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LiveKitShowResultModel _$LiveKitShowResultModelFromJson(
  Map<String, dynamic> json,
) => LiveKitShowResultModel(
  resultType: $enumDecodeNullable(
    _$LiveKitShowResultTypeEnumMap,
    json['result_type'],
  ),
  content: json['content'] as String?,
);

Map<String, dynamic> _$LiveKitShowResultModelToJson(
  LiveKitShowResultModel instance,
) => <String, dynamic>{
  'result_type': _$LiveKitShowResultTypeEnumMap[instance.resultType],
  'content': instance.content,
};

const _$LiveKitShowResultTypeEnumMap = {
  LiveKitShowResultType.html: 'html',
  LiveKitShowResultType.markdown: 'markdown',
  LiveKitShowResultType.url: 'url',
  LiveKitShowResultType.json: 'json',
  LiveKitShowResultType.text: 'text',
  LiveKitShowResultType.data: 'data',
};
