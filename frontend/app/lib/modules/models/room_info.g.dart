// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'room_info.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RoomInfo _$RoomInfoFromJson(Map<String, dynamic> json) => RoomInfo(
  serverUrl: json['url'] as String?,
  token: json['token'] as String?,
  roomName: json['roomName'] as String?,
  threadId: json['thread_id'] as String?,
  pId: json['participantName'] as String?,
);

Map<String, dynamic> _$RoomInfoToJson(RoomInfo instance) => <String, dynamic>{
  'url': instance.serverUrl,
  'token': instance.token,
  'roomName': instance.roomName,
  'thread_id': instance.threadId,
  'participantName': instance.pId,
};
