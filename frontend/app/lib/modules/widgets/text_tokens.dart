import 'dart:math';

final class TextToken {
  TextToken(this.start, this.count, this.depth);

  /// 起始
  final int start;

  /// 长度
  final int count;

  /// 深度
  int depth;

  /// 生成聊天机器人展示富文本的令牌
  static void genChatBotRichTextTokens(List<TextToken> ts, String text) {
    _genChatBotRichTextTokens(ts, text);
  }
}

/// 文本令牌
class TextTokens {
  TextTokens._(this.text, this._tokens, this.color, this._func);

  /// 文本集合
  final String text;

  /// 所有令牌
  final List<TextToken> _tokens;

  /// 颜色
  final String color;

  /// 生成函数
  final String Function(TextTokens, int) _func;

  /// 缓冲区
  final StringBuffer _cache = StringBuffer();

  /// 文本长度
  int get count => text.length;

  /// 执行生成
  String gen(int count) => _func(this, count);

  /// 生成聊天机器人展示专用富文本
  static String genChatBotRichText(String text, String color) {
    // 不支持 大于等于4G 的文本
    return genChatBotRichTextTokens(text, color).gen(0xFFFFFFFF);
  }

  /// 生成聊天机器人展示富文本的令牌
  static TextTokens genChatBotRichTextTokens(String text, String color) {
    final ts = <TextToken>[];
    TextToken.genChatBotRichTextTokens(ts, text);
    return TextTokens._(text, ts, color, _genChatBotRichText);
  }
}

////////////////////////////////////////////////////////////////////////////////

/// 生成聊天机器人展示富文本的令牌
void _genChatBotRichTextTokens(List<TextToken> ts, String text) {
  final l1 = "(".codeUnitAt(0), l2 = "（".codeUnitAt(0);
  final r1 = ")".codeUnitAt(0), r2 = "）".codeUnitAt(0);

  var depth = 0;
  var start = 0;
  final codes = text.codeUnits;
  for (var i = 0; i < codes.length; ++i) {
    final code = codes[i];
    if (code == l1 || code == l2) {
      final size = i - start;
      if (size > 0) ts.add(TextToken(start, size, depth));
      start = i;
      depth++;
    } else if (code == r1 || code == r2) {
      var curStart = start;
      if (depth > 0) {
        while (ts.isNotEmpty) {
          final token = ts[ts.length - 1];
          if (token.depth == -1 || token.depth == depth) {
            curStart = token.start;
            ts.removeLast();
            continue;
          }
          break;
        }
        start = i + 1;
        depth--;
        ts.add(TextToken(curStart, i - curStart + 1, -1));
      }
    }
  }

  if (start < codes.length) {
    ts.add(TextToken(start, codes.length - start, 0));
  }
}

/// 生成聊天机器人展示富文本
String _genChatBotRichText(TextTokens self, int count) {
  if (count <= 0) return "";

  final sb = self._cache;
  final text = self.text;
  final ts = self._tokens;
  final header = "<italic><color=${self.color}>";
  const footer = "</color></italic>";

  sb.clear();
  var position = 0;
  for (final t in ts) {
    final curCount = min(count - position, t.count);
    if (curCount <= 0) break;
    final addText = text.substring(t.start, t.start + curCount);
    if (t.depth == -1) sb.write(header);
    sb.write(addText);
    if (t.depth == -1) sb.write(footer);
    position += curCount;
  }
  return sb.toString();
}
