// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'action_card_model.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ActionCardModel _$ActionCardModelFromJson(Map<String, dynamic> json) =>
    ActionCardModel(
      title: json['title'] as String?,
      options: (json['options'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$ActionCardModelToJson(ActionCardModel instance) =>
    <String, dynamic>{'title': instance.title, 'options': instance.options};
