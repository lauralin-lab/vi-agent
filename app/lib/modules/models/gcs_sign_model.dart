import 'package:json_annotation/json_annotation.dart';

part 'gcs_sign_model.g.dart';

@JsonSerializable()
class GcsSignModel {
  @JsonKey(name: 'presigned_url', defaultValue: '')
  final String presignedUrl;
  @JsonKey(name: 'public_url', defaultValue: '')
  final String publicUrl;
  @JsonKey(name: 'key', defaultValue: '')
  final String key;
  @JsonKey(name: 'content_type', defaultValue: 'image/jpeg')
  final String contentType;
  @JsonKey(name: 'image', defaultValue: '')
  final String mediaType;

  const GcsSignModel({
    required this.presignedUrl,
    required this.publicUrl,
    required this.key,
    required this.contentType,
    required this.mediaType,
  });

  factory GcsSignModel.fromJson(Map<String, dynamic> json) => _$GcsSignModelFromJson(json);

  Map<String, dynamic> toJson() => _$GcsSignModelToJson(this);

  GcsSignModel copyWith({
    String? presignedUrl,
    String? publicUrl,
    String? key,
    String? contentType,
    String? mediaType,
  }) {
    return GcsSignModel(
      presignedUrl: presignedUrl ?? this.presignedUrl,
      publicUrl: publicUrl ?? this.publicUrl,
      key: key ?? this.key,
      contentType: contentType ?? this.contentType,
      mediaType: mediaType ?? this.mediaType,
    );
  }
}
