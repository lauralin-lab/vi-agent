/// 图片、视频类
class MediaModel {
  // 图片地址
  final String path;

  // 是否视频
  final bool isVideo;

  // 视频时长
  final int duration;

  // 视频地址
  final String? videoPath;

  const MediaModel({required this.path, this.isVideo = false, this.duration = 0, this.videoPath});
}
