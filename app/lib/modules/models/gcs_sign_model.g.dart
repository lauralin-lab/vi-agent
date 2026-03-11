// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'gcs_sign_model.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GcsSignModel _$GcsSignModelFromJson(Map<String, dynamic> json) => GcsSignModel(
  presignedUrl: json['presigned_url'] as String? ?? '',
  publicUrl: json['public_url'] as String? ?? '',
  key: json['key'] as String? ?? '',
  contentType: json['content_type'] as String? ?? 'image/jpeg',
  mediaType: json['image'] as String? ?? '',
);

Map<String, dynamic> _$GcsSignModelToJson(GcsSignModel instance) =>
    <String, dynamic>{
      'presigned_url': instance.presignedUrl,
      'public_url': instance.publicUrl,
      'key': instance.key,
      'content_type': instance.contentType,
      'image': instance.mediaType,
    };
