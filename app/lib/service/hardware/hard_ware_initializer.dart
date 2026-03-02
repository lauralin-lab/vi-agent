import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:livekit_client/livekit_client.dart';
import 'package:path/path.dart' as path;
import 'package:rive_rolls_collection/common.dart';
import 'package:rive_rolls_collection/misc/initializer.dart';

import '../../common/io/paths.dart';

class HardWareInitializer extends Initializer {
  /// 初始化
  factory HardWareInitializer(InitializeType type) => _instance ??= HardWareInitializer._(type);

  /// 获取单列
  static HardWareInitializer get instance => _instance!;

  /// 初始化
  HardWareInitializer._(super.type);

  /// 监听 Camera变化
  Stream<bool> get onInitCameraChangedListener => _initChangedListener.stream;

  /// 获取音频轨道
  LocalAudioTrack? get audioTrack => _audioTrack;

  /// 获取视频轨道
  LocalVideoTrack? get videoTrack => _videoTrack;

  /// 判断音视频是否初始化完成
  bool get isInit => _audioTrack != null && _videoTrack != null;

  @override
  Future onInit() async {
    if (_audioTrack != null && _videoTrack != null) return;

    try {
      // 获取设备
      final devices = await Hardware.instance.enumerateDevices();
      final audioInputs = devices.where((d) => d.kind == 'audioinput').toList();
      final videoInputs = devices.where((d) => d.kind == 'videoinput').toList();

      // 并行初始化
      await Future.wait([
        _initAudio(audioInputs),
        _initVideo(videoInputs),
      ]);

      _initChangedListener.add(true);
    } catch (e) {
      loge(e);
    }
  }

  /// 切换摄像头
  Future<bool> toggleCamera(bool isFront, bool isConnected) async {
    if (_videoTrack == null) return false;
    try {
      final newPosition = isFront ? CameraPosition.front : CameraPosition.back;

      if (isConnected) {
        await _videoTrack!.restartTrack(
          CameraCaptureOptions(
            cameraPosition: newPosition,
            params: VideoParametersPresets.h1080_169,
          ),
        );
      } else {
        await _videoTrack?.stop();
        await _videoTrack?.dispose();

        _videoTrack = await LocalVideoTrack.createCameraTrack(
          CameraCaptureOptions(
            cameraPosition: newPosition,
            params: VideoParametersPresets.h1080_169,
          ),
        );
      }

      return true;
    } catch (e) {
      return false;
    }
  }

  /// 拍照
  Future<String?> takePhoto() async {
    if (_videoTrack == null) return null;

    try {
      // 保存的图片路径
      final parent = Paths.takePhotosDirectory;
      if (!await parent.exists()) await parent.create(recursive: true);

      // 使用时间戳生成文件名
      final String savePath = path.join(parent.path, '${DateTime.now().millisecondsSinceEpoch}.jpg');
      // 获取当前帧
      final captureFrame = await _videoTrack!.mediaStreamTrack.captureFrame();
      // 保存
      final Uint8List captureByte = captureFrame.asUint8List();
      await File(savePath).writeAsBytes(captureByte);
      return savePath;
    } catch (e) {
      return null;
    }
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////////
  ///region 内部方法˚
  ///
  /// 初始化音频
  Future<void> _initAudio(List<MediaDevice> inputs) async {
    if (inputs.isEmpty || _audioTrack != null) return;
    _audioTrack = await LocalAudioTrack.create(
      AudioCaptureOptions(deviceId: inputs.first.deviceId),
    );
    await _audioTrack!.start();
  }

  /// 初始化视频
  Future<void> _initVideo(List<MediaDevice> inputs) async {
    if (inputs.isEmpty || _videoTrack != null) return;
    // 默认后置摄像头---如果使用device id可获取超广角
    _videoTrack = await LocalVideoTrack.createCameraTrack(
      const CameraCaptureOptions(
        // deviceId: inputs.first.deviceId,
        cameraPosition: CameraPosition.back,
        params: VideoParametersPresets.h1080_169,
      ),
    );
    await _videoTrack!.start();
  }

  ///#endregion 内部方法˚

  ///#region 私有属性

  /// 单列
  static HardWareInitializer? _instance;

  /// 初始化流监听
  final _initChangedListener = StreamController<bool>.broadcast();

  /// 音频流
  LocalAudioTrack? _audioTrack;

  /// 视频流
  LocalVideoTrack? _videoTrack;

  ///#endregion 私有属性
}
