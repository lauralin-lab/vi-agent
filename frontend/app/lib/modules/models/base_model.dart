import 'package:json_annotation/json_annotation.dart';

abstract class BaseModel {
  /// 数据版本
  @JsonKey(name: 'success', defaultValue: false)
  final bool success;

  const BaseModel({this.success = false});
}
