import 'dart:io';

import 'package:rive_rolls_collection/logging/logger.dart';

import '../extension/ui_ext.dart';


/// 获取错误返回 -1，否则返回字节数
int getAndroidTotalPhysicalMemory() {
  if (!Platform.isAndroid) return -1;
  final info = _exec('cat', ['/proc/meminfo']);
  if (info == null) return -1;
  final lines = info.split('\n');
  for (var line in lines) {
    final params = line.split(':');
    if (params.length < 2) continue;
    if (params[0].trim() == 'MemTotal') {
      final kbStr = params[1].trim();
      final kb = kbStr.substring(0, kbStr.length - 3);
      return int.parse(kb) * 1024;
    }
  }
  return -1;
}

class DeviceUtils {
  DeviceUtils._();

  /// 手机总内存 MiB
  static int _memory = -100;

  /// 低端设备
  static bool get isLowDevice {
    if (Platform.isAndroid) {
      if (_memory == -100) {
        try {
          _memory = getAndroidTotalPhysicalMemory() ~/ (1024 * 1024);
        } catch (e) {
          _memory = 0;
          // ignored
        }
      }
    }

    // Android 内存小于 3.5GB 的设备，手机 4G 内存可能会有保留空间，用于镜像映射等
    if (_memory > 0 && _memory < 3200) return true;

    // 核心个数小于6，低端设备
    // 将 A10 和 高通 82X 处理归为低端设备，这两种设备优化太差e
    // A10 是伪四核处理器，随着设备电池老化，充电时 CPU 降频厉害，附注 A10X 是6核不讨论
    // 高通 82X 处理器，4 核，浮点强于整数运算，容易出现降频问题
    if (Platform.numberOfProcessors < 6) return true;

    // Android、iOS 分辨率低于 720 的设备
    return UIExt.lowResolutionDevice;
  }

  /// 高性能设备
  static bool get isHPDevice {
    if (Platform.isAndroid) {
      if (_memory == -100) {
        try {
          _memory = getAndroidTotalPhysicalMemory() ~/ (1024 * 1024);
        } catch (e) {
          _memory = 0;
          // ignored
        }
      }
    }

    // 核心个数
    final processors = Platform.numberOfProcessors;

    // 至少是 A11 + 720 以上分辨率
    // TODO(WIP): 这里的判断还得深化一下必须剔除 A13 之前的处理器
    if (Platform.isIOS) {
      return processors > 4 && !UIExt.lowResolutionDevice;
    }

    // Android 内存大于 7GB 的设备，手机 8G 内存可能会有保留空间，且核心大于 6 核
    // Android 8 核心处理器都烂大街了，这里主要是内存的判断，8 x A53 也 TM 是 8 核
    return _memory > 7000 && processors > 6;
  }
}

/// 执行命令
String? _exec(String executable, List<String> arguments, {bool runInShell = false}) {
  try {
    final r = Process.runSync(executable, arguments, runInShell: runInShell);
    if (r.exitCode == 0) return r.stdout.toString();
    loge(r.stderr);
  } catch (e) {
    // ignore
  }
  return null;
}
