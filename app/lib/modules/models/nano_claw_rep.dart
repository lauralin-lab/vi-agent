import 'package:json_annotation/json_annotation.dart';
part 'nano_claw_rep.g.dart';

@JsonSerializable()
class NanoClawRep {
  @JsonKey(name: 'ok')
  bool? ok;
  @JsonKey(name: 'taskId')
  String? taskId;
  @JsonKey(name: 'sessionId')
  String? sessionId;

  NanoClawRep({
    this.ok,
    this.taskId,
    this.sessionId,
  });

  factory NanoClawRep.fromJson(Map<String, dynamic> json) =>
      _$NanoClawRepFromJson(json);

  Map<String, dynamic> toJson() => _$NanoClawRepToJson(this);

  NanoClawRep copyWith({
    bool? ok,
    String? taskId,
    String? sessionId,
  }) {
    return NanoClawRep(
      ok: ok ?? this.ok,
      taskId: taskId ?? this.taskId,
      sessionId: sessionId ?? this.sessionId,
    );
  }
}
