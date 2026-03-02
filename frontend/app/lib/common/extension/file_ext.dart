import 'dart:io';

import 'package:convert/convert.dart';
import 'package:crypto/crypto.dart' as crypto;

extension FileExt on File {
  /// 删除并忽略错误
  Future<void> deleteIgnore() async {
    try {
      if (!(await exists())) return;
      await delete();
    } catch (_) {
      //
    }
  }

  /// 计算文件Sha1摘要
  Future<String> sha1() async {
    final sink = AccumulatorSink<crypto.Digest>();
    final input = crypto.sha1.startChunkedConversion(sink);
    await openRead().forEach(input.add);
    input.close();

    // 获取 SHA1
    return sink.events.single.toString();
  }
}

extension DirectoryExt on Directory {
  /// 删除并忽略错误
  Future<void> deleteIgnore({bool recursive = false}) async {
    try {
      if (!await exists()) return;
      await delete(recursive: recursive);
    } catch (_) {
      //
    }
  }
}
