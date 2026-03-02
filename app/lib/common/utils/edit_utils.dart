import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';

/// 编辑工具类，提供SSE解析和打字机效果等实用功能
class EditUtils {
  const EditUtils._();

  /// 解析Server-Sent Events (SSE) 响应流
  ///
  /// [response] 包含SSE响应的Dio Response对象
  /// 返回一个包含SSE事件的Stream
  ///
  /// 如果响应体为空或解析失败，将抛出异常
  static Stream<SseEvent> parseSse(Response<ResponseBody> resp) {
    final controller = StreamController<SseEvent>();
    final byteStream = resp.data!.stream;
    final lines = utf8.decoder.bind(byteStream).transform(const LineSplitter());
    String? currentEvent;
    String dataBuffer = '';
    late final StreamSubscription sub;
    sub = lines.listen(
      (line) {
        if (line.startsWith('event:')) {
          currentEvent = line.substring(6).trim();
        } else if (line.startsWith('data:')) {
          dataBuffer += line.substring(5).trim();
        } else if (line.isEmpty) {
          if (currentEvent != null) {
            controller.add(SseEvent(currentEvent!, dataBuffer));
          }
          currentEvent = null;
          dataBuffer = '';
        }
      },
      onError: (err) => controller.addError(err),
      onDone: () => controller.close(),
    );
    controller.onCancel = () => sub.cancel();
    return controller.stream;
  }

  /// 将文本转换为逐字输出的流，实现打字机效果
  ///
  /// [text] 要显示的文本
  /// [charDelay] 每个字符之间的延迟时间，默认为零（无延迟）
  ///
  /// 返回一个异步生成器，逐个字符输出文本
  static Stream<String> typewriter(String text, {Duration charDelay = Duration.zero}) async* {
    for (final rune in text.runes) {
      if (charDelay > Duration.zero) {
        await Future.delayed(charDelay);
      }
      yield String.fromCharCode(rune);
    }
  }

  static Future<T?> awaitEvent<T>({
    required Response<ResponseBody> resp,
    required String targetEvent,
    required T Function(Map<String, dynamic>) transform,
  }) async {
    await for (final ev in parseSse(resp)) {
      if (ev.name == targetEvent && ev.data.isNotEmpty) {
        try {
          final jsonData = jsonDecode(ev.data) as Map<String, dynamic>;
          return transform(jsonData);
        } catch (_) {}
      }
    }
    return null;
  }
}

class SseEvent {
  final String name;
  final String data;

  const SseEvent(this.name, this.data);
}
