import 'dart:convert';

import '../utils/image_crop.dart';

typedef RouteCodecEncoder<T> = Map<String, dynamic> Function(T);
typedef RouteCodecDecoder<T> = T? Function(Map<String, dynamic>);

const String _kTypeId = "&#@ID@#&";

class RouteCodec extends Codec<dynamic, Map<String, dynamic>?> {
  RouteCodec.$() {
    // 注册再此
    register<PhotoArgs>(PhotoArgs.encodeToRoute, PhotoArgs.decodeFromRoute);
  }

  final _DynamicEncoder _encoder = _DynamicEncoder();
  final _DynamicDecoder _decoder = _DynamicDecoder();

  /// 执行注册
  void register<T>(RouteCodecEncoder<T> encoder, RouteCodecDecoder<T> decoder) {
    _encoder.encoders[T] = (e) => encoder(e as T);
    _decoder.decoders[T.hashCode] = decoder;
  }

  @override
  Converter<Map<String, dynamic>?, dynamic> get decoder => _decoder;

  @override
  Converter<dynamic, Map<String, dynamic>?> get encoder => _encoder;
}

class _DynamicEncoder extends Converter<dynamic, Map<String, dynamic>?> {
  _DynamicEncoder();

  /// 编码器
  final Map<Type, RouteCodecEncoder> encoders = {};

  @override
  Map<String, dynamic>? convert(dynamic input) {
    if (input == null) return null;

    final type = input.runtimeType;
    final data = encoders[type]?.call(input);
    if (data == null) return null;
    return {_kTypeId: type.hashCode, "data": data};
  }
}

class _DynamicDecoder extends Converter<Map<String, dynamic>?, dynamic> {
  _DynamicDecoder();

  /// 解码器
  final Map<int, RouteCodecDecoder> decoders = {};

  @override
  dynamic convert(Map<String, dynamic>? input) {
    if (input == null) return null;
    final typeId = input[_kTypeId];
    final data = input["data"];
    if (typeId == null || data == null) return null;
    return decoders[typeId]?.call(data);
  }
}
