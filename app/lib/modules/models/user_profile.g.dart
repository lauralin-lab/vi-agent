// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'user_profile.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UserProfile _$UserProfileFromJson(Map<String, dynamic> json) => UserProfile(
  json['id'] as String? ?? '',
  json['custom_uid'] as String? ?? '',
  json['package_name'] as String? ?? '',
  json['user_name'] as String? ?? '',
  json['display_name'] as String? ?? '',
  json['email'] as String? ?? '',
  json['photo_url'] as String? ?? '',
  json['sign_in_provider'] as String? ?? '',
  json['tier'] as String? ?? '',
  json['balance'] as String? ?? '',
  json['livekit'] == null
      ? _emptyLiveKit()
      : LiveKit.fromJson(json['livekit'] as Map<String, dynamic>),
);

LiveKit _$LiveKitFromJson(Map<String, dynamic> json) => LiveKit(
  liveKitToken: json['token'] as String? ?? '',
  liveKitUrl: json['url'] as String? ?? '',
  roomName: json['room_name'] as String? ?? '',
  participantName: json['participant_name'] as String? ?? '',
  sessionKey: json['session_key'] as String? ?? '',
);

Map<String, dynamic> _$LiveKitToJson(LiveKit instance) => <String, dynamic>{
  'token': instance.liveKitToken,
  'url': instance.liveKitUrl,
  'room_name': instance.roomName,
  'participant_name': instance.participantName,
  'session_key': instance.sessionKey,
};
