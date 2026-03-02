import 'package:json_annotation/json_annotation.dart';

part 'action_card_model.g.dart';

@JsonSerializable()
class ActionCardModel {
  @JsonKey(name: 'title')
  String? title;
  @JsonKey(name: 'options')
  List<String>? options;

  ActionCardModel({this.title, this.options});

  factory ActionCardModel.fromJson(Map<String, dynamic> json) => _$ActionCardModelFromJson(json);

  Map<String, dynamic> toJson() => _$ActionCardModelToJson(this);
}
