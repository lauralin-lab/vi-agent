// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'user_profile.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UserProfile _$UserProfileFromJson(Map<String, dynamic> json) => UserProfile(
  json['user_id'] as String? ?? '',
  json['vi_user_id'] as String? ?? '',
  json['firebase_uid'] as String? ?? '',
  json['display_name'] as String? ?? '',
  json['email'] as String? ?? '',
  json['photo_url'] as String? ?? '',
  json['sign_in_provider'] as String? ?? '',
  json['language'] as String? ?? '',
  json['is_new_user'] as bool? ?? true,
  json['invite_required'] as bool? ?? false,
);
