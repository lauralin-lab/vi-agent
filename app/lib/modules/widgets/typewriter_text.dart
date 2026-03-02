import 'dart:math' as math;

import 'package:flutter/scheduler.dart';
import 'package:flutter/widgets.dart';

import 'text_tokens.dart';


/// 可接受追加的文本接口
abstract class AppendableText {
  /// 为 `true` 表示不再接受文本添加
  bool get eof;

  /// 当前文本长度
  int get count;

  /// 生成文本
  /// [count] 表示显示文本数量
  String gen(int count);

  /// 生成文本，并附加越界效果，默认此函数不强制实现
  /// [count] 表示显示文本数量
  /// [overflow] 表示当前越界长度
  /// [maxOverflow] 表示最大越界长度
  String genWithOverflow(int count, int overflow, int maxOverflow) {
    return gen(count);
  }
}

/// 文本缓冲区接口
abstract class TextBuffer extends AppendableText {
  /// 追加文本
  void append(String text);
}

////////////////////////////////////////////////////////////////////////////////////////////////////

/// 简单的文本缓冲区
final class SampleTextBuffer extends TextBuffer {
  SampleTextBuffer([String? content]) : _buffer = content ?? "";

  /// 缓冲区
  /// 这里不使用 StringBuffer，太鸡肋了
  String _buffer;

  /// 是否结束
  bool _eof = false;

  @override
  int get count => _buffer.length;

  @override
  bool get eof => _eof;

  /// 标记结束
  void markEof() {
    if (_eof) return;
    _eof = true;
  }

  @override
  String gen(int count) {
    count = count.clamp(0, this.count);
    return _buffer.substring(0, count);
  }

  @override
  void append(String text) {
    if (_eof) return;
    _buffer += text;
  }
}

/// 利用 [TextTokens] 实现效果
final class ImmutableTextTokens extends AppendableText {
  ImmutableTextTokens(this.tokens);

  /// 令牌
  final TextTokens tokens;

  @override
  int get count => tokens.count;

  @override
  bool get eof => true;

  @override
  String gen(int count) => tokens.gen(count);
}

/// 利用 [TextToken] 实现效果
final class MutableTextTokens extends TextBuffer {
  MutableTextTokens(this.color, this.italicColor, [String? content])
      : _buffer = content ?? "",
        _tokens = [] {
    if (_buffer.isEmpty) return;
    TextToken.genChatBotRichTextTokens(_tokens, _buffer);
  }

  /// 正常字体颜色
  final String color;

  /// 斜体文本颜色
  final String italicColor;

  /// 所有令牌
  final List<TextToken> _tokens;

  /// 缓冲区
  final StringBuffer _cache = StringBuffer();

  /// 缓冲区
  /// 这里不使用 StringBuffer，太鸡肋了
  String _buffer;

  /// 是否结束
  bool _eof = false;

  @override
  int get count => _buffer.length;

  @override
  bool get eof => _eof;

  /// 标记结束
  void markEof() {
    if (_eof) return;
    _eof = true;
  }

  @override
  String gen(int count) => genWithOverflow(count, 0, 0);

  @override
  String genWithOverflow(int count, int overflow, int maxOverflow) {
    count = count.clamp(0, this.count);
    if (count == 0) return "";

    final sb = _cache;
    final ts = _tokens;
    final header = "<italic><color=$italicColor>";
    const footer = "</color></italic>";

    sb.clear();
    var position = 0;
    final overCount = (maxOverflow - overflow).clamp(0, count);

    for (var i = 0; i < ts.length; i++) {
      final t = ts[i];
      final pack = t.depth == -1;
      final curCount = math.min(count - position, t.count);
      if (curCount <= 0) break;
      final String addText;
      final originText = _buffer.substring(t.start, t.start + curCount);
      final colorCount = overCount - (count - (position + curCount));
      final tolerant = !eof && i + 1 == ts.length && _startsBracket(originText);
      if (maxOverflow > 0 && overCount > 0 && colorCount > 0) {
        final codes = originText.runes.toList(); // O(N)! 用于处理 Unicode 字符
        final sb = StringBuffer();
        for (var i = 0; i < codes.length; i++) {
          final index = codes.length - i;
          if (index <= colorCount) {
            final offset = index + (overCount - colorCount);
            final a = (offset / (overCount + 1) * 255).round().clamp(0, 255);
            final curColor = pack || tolerant ? italicColor : color;
            sb.write("<color=$curColor${a.toRadixString(16).padLeft(2, '0')}>");
          }
          sb.writeCharCode(codes[i]);
          if (index <= colorCount) sb.write("</color>");
        }
        addText = sb.toString();
        // logw("$overCount, $colorCount, $addText"); // 用于调试
      } else {
        addText = originText;
      }
      if (pack || tolerant) sb.write(header);
      sb.write(addText);
      if (pack || tolerant) sb.write(footer);
      position += curCount;
    }
    return sb.toString();
  }

  @override
  void append(String text) {
    if (_eof || text.isEmpty) return;
    _buffer += text;
    _tokens.clear();
    TextToken.genChatBotRichTextTokens(_tokens, _buffer);
  }

  /// 重置并追加，降低 GC 次数
  void resetAndAppend(String text) {
    assert(text.startsWith(_buffer));
    if (text == _buffer) return;
    _buffer = text;
    _tokens.clear();
    TextToken.genChatBotRichTextTokens(_tokens, _buffer);
  }

  /// 起始包含括号
  bool _startsBracket(String msg) => msg.startsWith("(") || msg.startsWith("（");
}

////////////////////////////////////////////////////////////////////////////////////////////////////

/// 类似打印机效果控制器
class TypewriterTextController {
  TypewriterTextController({
    required this.text,
    this.speed = 3,
    this.appendText = "",
    this.persistMode = true,
    this.overflow = 0,
  }) : assert(overflow >= 0 && speed > 0);

  /// 文本
  final AppendableText text;

  /// 每秒字符个数
  final int speed;

  /// 拖尾效果
  final String appendText;

  /// 持续模式
  /// 如果持续模式，则文本在不足的情况，这段时间会叠加到新添加的文本中，
  /// 否则会丢弃与上一帧间隔的时间
  final bool persistMode;

  /// 越界模式
  ///
  /// 默认为 0，表示不越界
  /// 大于 0 时，表示越界字符数（用户字符数量计算越界等待时间量）
  /// 请注意，此参数只有在配合特定的 [text] 才有效
  final int overflow;

  /// 显示的文本
  String _text = "";

  /// 上次显示的位置，包含越界的位置
  int _lastRawCount = 0;

  /// 动画开始时间
  int? _st;

  /// 上一帧时间
  int? _pt;

  /// 是否是否结束
  bool get ended => text.eof && _lastRawCount >= text.count + overflow;

  /// 更新文本
  bool _tick(Duration ts) {
    if (!text.eof && text.count <= 0) {
      // 缺少文本这时候不需要更新
      return false;
    }
    final now = ts.inMilliseconds;
    final prev = _pt ?? now;
    _st ??= now;
    _pt = now;

    int d = math.max(now - _st!, 0);
    int rawCount = (d / 1000.0 * speed).round().clamp(0, text.count + overflow);
    int count = rawCount.clamp(0, text.count);
    if (!text.eof) rawCount = count;

    if (_lastRawCount >= rawCount) {
      // 丢弃与上一帧产生的时间
      if (!text.eof && !persistMode && count == text.count) {
        _st = _st! + math.max(now - prev, 0);
      }
      return false;
    }

    _text = text.genWithOverflow(count, rawCount - count, overflow);
    _lastRawCount = rawCount;

    // 追加在没有完成时的拖尾文本
    if (count < text.count && appendText.isNotEmpty) {
      _text += appendText;
    }

    return true;
  }
}

/// 类似打印机效果
class TypewriterText extends StatefulWidget {
  const TypewriterText({
    super.key,
    required this.builder,
    required this.controller,
    this.onEnded,
    this.delay = Duration.zero,
  });

  /// 控制器
  final TypewriterTextController controller;

  /// 延迟开始
  final Duration delay;

  /// 组件构建
  final Widget Function(String) builder;

  /// 结束回调
  final VoidCallback? onEnded;

  @override
  State<StatefulWidget> createState() => _TypewriterTextState();
}

class _TypewriterTextState extends State<TypewriterText> {
  _TypewriterTextState();

  /// 当前动画编号
  int? _tickId;

  /// 结束
  bool _ended = false;

  @override
  void initState() {
    super.initState();
    _ended = widget.controller.ended;
    if (widget.delay.inMilliseconds > 0) {
      Future.delayed(widget.delay, _scheduleTick);
    } else {
      _scheduleTick();
    }
  }

  @override
  void dispose() {
    if (_tickId != null) {
      SchedulerBinding.instance.cancelFrameCallbackWithId(_tickId!);
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.builder(widget.controller._text);

  /// 更新动画
  void _tick(Duration ts) {
    _tickId = null;
    if (!mounted) return;

    if (widget.controller._tick(ts)) {
      setState(() {});
    }

    if (!widget.controller.ended) {
      _scheduleTick(true);
    }

    if (widget.controller.ended && !_ended) {
      _ended = true;
      widget.onEnded?.call();
    }
  }

  /// 执行动画
  void _scheduleTick([bool rescheduling = false]) {
    if (!mounted) return;
    _tickId = SchedulerBinding.instance.scheduleFrameCallback(
      _tick,
      rescheduling: rescheduling,
    );
  }
}
