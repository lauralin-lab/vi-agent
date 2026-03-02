extension BytesExt on List<int> {
  /// 输出 32 进制字符串
  String toBase32String() {
    if (length == 0) return '0';
    const chars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    var sb = <String>[];
    var index = length - 1;
    var bit = 0, num = 0;
    while (index >= 0 || bit > 0) {
      if (index >= 0 && bit < 5) {
        final code = this[index];
        assert(code >= 0 && code <= 0xFF);
        num |= code << bit;
        bit += 8;
        index--;
      }

      var ch = chars[num & 0x1F];
      num >>= 5;
      bit -= 5;
      sb.add(ch);
    }

    if (sb.length > 1 && sb.last == '0') sb.removeLast();
    return sb.reversed.join();
  }
}
