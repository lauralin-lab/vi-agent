import 'package:json_annotation/json_annotation.dart';

part 'upload_file_model.g.dart';

@JsonSerializable()
class UploadFileModel {
  @JsonKey(name: 'success')
  bool? success;
  // 多个
  @JsonKey(name: 'files')
  List<Files>? files;
  // 单个
  @JsonKey(name: 'file')
  Files? file;

  UploadFileModel({
    this.success,
    this.files,
    this.file
  });

  factory UploadFileModel.fromJson(Map<String, dynamic> json) => _$UploadFileModelFromJson(json);

  Map<String, dynamic> toJson() => _$UploadFileModelToJson(this);

  UploadFileModel copyWith({
    bool? success,
    List<Files>? files,
  }) {
    return UploadFileModel(
      success: success ?? this.success,
      files: files ?? this.files,
    );
  }
}

@JsonSerializable()
class Files {
  @JsonKey(name: 'success')
  bool? success;
  @JsonKey(name: 'url')
  String? url;
  @JsonKey(name: 'filename')
  String? filename;
  @JsonKey(name: 'path')
  String? path;
  @JsonKey(name: 'size')
  int? size;
  @JsonKey(name: 'mimetype')
  String? mimetype;
  @JsonKey(name: 'thumbnail')
  String? thumbnail;

  Files({
    this.success,
    this.url,
    this.filename,
    this.path,
    this.size,
    this.mimetype,
    this.thumbnail,
  });

  factory Files.fromJson(Map<String, dynamic> json) => _$FilesFromJson(json);

  Map<String, dynamic> toJson() => _$FilesToJson(this);

  Files copyWith({
    bool? success,
    String? url,
    String? filename,
    String? path,
    int? size,
    String? mimetype,
    String? thumbnail,
  }) {
    return Files(
      success: success ?? this.success,
      url: url ?? this.url,
      filename: filename ?? this.filename,
      path: path ?? this.path,
      size: size ?? this.size,
      mimetype: mimetype ?? this.mimetype,
      thumbnail: thumbnail ?? this.thumbnail,
    );
  }
}

// class UploadMediaModel {
//   const UploadMediaModel({
//     required this.uuid,
//     required this.ext,
//   });
//
//   final String uuid;
//   final String ext;
//
//   /// 从 workspace://uploads/{uuid}.{ext} 解析
//   factory UploadMediaModel.fromWorkspaceUrl(String url) {
//     final reg = RegExp(r'uploads/([^\.]+)\.(\w+)$');
//     final match = reg.firstMatch(url);
//
//     if (match == null) {
//       throw FormatException('Invalid workspace url: $url');
//     }
//
//     return UploadMediaModel(
//       uuid: match.group(1)!,
//       ext: match.group(2)!,
//     );
//   }
// }
//
// extension UploadMediaModelXml on UploadMediaModel {
//   String toXml() => '<media id="$uuid" ext="$ext"></media>';
// }
