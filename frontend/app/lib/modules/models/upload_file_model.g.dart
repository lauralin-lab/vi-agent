// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'upload_file_model.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UploadFileModel _$UploadFileModelFromJson(Map<String, dynamic> json) =>
    UploadFileModel(
      success: json['success'] as bool?,
      files: (json['files'] as List<dynamic>?)
          ?.map((e) => Files.fromJson(e as Map<String, dynamic>))
          .toList(),
      file: json['file'] == null
          ? null
          : Files.fromJson(json['file'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$UploadFileModelToJson(UploadFileModel instance) =>
    <String, dynamic>{
      'success': instance.success,
      'files': instance.files,
      'file': instance.file,
    };

Files _$FilesFromJson(Map<String, dynamic> json) => Files(
  success: json['success'] as bool?,
  url: json['url'] as String?,
  filename: json['filename'] as String?,
  path: json['path'] as String?,
  size: (json['size'] as num?)?.toInt(),
  mimetype: json['mimetype'] as String?,
  thumbnail: json['thumbnail'] as String?,
);

Map<String, dynamic> _$FilesToJson(Files instance) => <String, dynamic>{
  'success': instance.success,
  'url': instance.url,
  'filename': instance.filename,
  'path': instance.path,
  'size': instance.size,
  'mimetype': instance.mimetype,
  'thumbnail': instance.thumbnail,
};
