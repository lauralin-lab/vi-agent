// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'room_info.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RoomInfo _$RoomInfoFromJson(Map<String, dynamic> json) => RoomInfo(
  liveKitUrl: json['livekit_url'] as String? ?? '',
  token: json['token'] as String? ?? '',
  roomName: json['room_name'] as String? ?? '',
);

Map<String, dynamic> _$RoomInfoToJson(RoomInfo instance) => <String, dynamic>{
  'livekit_url': instance.liveKitUrl,
  'token': instance.token,
  'room_name': instance.roomName,
};
