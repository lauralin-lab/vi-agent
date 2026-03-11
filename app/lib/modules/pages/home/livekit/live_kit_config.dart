import 'package:livekit_client/livekit_client.dart';

/// 视频编码
VideoEncoding get cameraEncoding => const VideoEncoding(
  maxBitrate: 800 * 1000,
  maxFramerate: 12,
);

VideoEncoding get screenEncoding => const VideoEncoding(
  maxBitrate: 1000 * 1000,
  maxFramerate: 8,
);

/// 房间配置
RoomOptions get roomOptions => RoomOptions(
  adaptiveStream: true,
  dynacast: true,
  defaultAudioPublishOptions: const AudioPublishOptions(name: 'mic'),
  defaultCameraCaptureOptions: const CameraCaptureOptions(
    maxFrameRate: 12,
    params: VideoParameters(dimensions: VideoDimensionsPresets.h540_169),
  ),
  defaultScreenShareCaptureOptions: const ScreenShareCaptureOptions(
    useiOSBroadcastExtension: true,
    params: VideoParameters(dimensions: VideoDimensionsPresets.h720_169),
  ),
  defaultVideoPublishOptions: VideoPublishOptions(
    simulcast: true,
    backupVideoCodec: const BackupVideoCodec(enabled: true),
    videoEncoding: cameraEncoding,
    screenShareEncoding: screenEncoding,
  ),
);
