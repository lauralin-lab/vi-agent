import 'package:json_annotation/json_annotation.dart';

part 'room_info.g.dart';

@JsonSerializable()
class RoomInfo {
  @JsonKey(name: 'livekit_url', defaultValue: '')
  String liveKitUrl;
  @JsonKey(name: 'token', defaultValue: '')
  String token;
  @JsonKey(name: 'room_name', defaultValue: '')
  String roomName;

  RoomInfo({required this.liveKitUrl, required this.token, required this.roomName});

  factory RoomInfo.fromJson(Map<String, dynamic> json) => _$RoomInfoFromJson(json);

  Map<String, dynamic> toJson() => _$RoomInfoToJson(this);

  RoomInfo copyWith({
    String? liveKitUrl,
    String? token,
    String? roomName,
  }) {
    return RoomInfo(
      liveKitUrl: liveKitUrl ?? this.liveKitUrl,
      token: token ?? this.token,
      roomName: roomName ?? this.roomName,
    );
  }
}
