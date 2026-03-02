import 'package:json_annotation/json_annotation.dart';

part 'room_info.g.dart';

@JsonSerializable()
class RoomInfo {
  @JsonKey(name: 'url')
  String? serverUrl;
  @JsonKey(name: 'token')
  String? token;
  @JsonKey(name: 'roomName')
  String? roomName;
  @JsonKey(name: 'thread_id')
  String? threadId;
  @JsonKey(name: 'participantName')
  String? pId;

  RoomInfo({this.serverUrl, this.token, this.roomName, this.threadId, this.pId});

  factory RoomInfo.fromJson(Map<String, dynamic> json) => _$RoomInfoFromJson(json);

  Map<String, dynamic> toJson() => _$RoomInfoToJson(this);

  RoomInfo copyWith({
    String? serverUrl,
    String? token,
  }) {
    return RoomInfo(
      serverUrl: serverUrl ?? this.serverUrl,
      token: token ?? this.token,
    );
  }
}
