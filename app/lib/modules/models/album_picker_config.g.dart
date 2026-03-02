// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'album_picker_config.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AlbumPickerConfig<T> _$AlbumPickerConfigFromJson<T extends AbsAlbumPickerItem>(
  Map<String, dynamic> json,
  T Function(Object? json) fromJsonT,
) => AlbumPickerConfig<T>(
  (json['ver'] as num?)?.toInt() ?? 1,
  (json['ri'] as List<dynamic>?)?.map((e) => e as String).toList() ?? [],
  (json['lc'] as Map<String, dynamic>?)?.map(
        (k, e) => MapEntry(k, fromJsonT(e)),
      ) ??
      {},
  (json['ac'] as Map<String, dynamic>?)?.map(
        (k, e) => MapEntry(k, e as String),
      ) ??
      {},
);

Map<String, dynamic> _$AlbumPickerConfigToJson<T extends AbsAlbumPickerItem>(
  AlbumPickerConfig<T> instance,
  Object? Function(T value) toJsonT,
) => <String, dynamic>{
  'ver': instance.version,
  'ri': instance.recentItems,
  'lc': instance.localCache.map((k, e) => MapEntry(k, toJsonT(e))),
  'ac': instance.assetCache,
};

VPickerItem _$VPickerItemFromJson(Map<String, dynamic> json) => VPickerItem(
  json['i'] as String? ?? '',
  (json['w'] as num?)?.toInt() ?? 0,
  (json['h'] as num?)?.toInt() ?? 0,
  (json['d'] as num?)?.toInt() ?? 0,
  json['t'] as String? ?? '',
  json['n'] as String? ?? '',
);

Map<String, dynamic> _$VPickerItemToJson(VPickerItem instance) =>
    <String, dynamic>{
      'i': instance.id,
      'w': instance.width,
      'h': instance.height,
      'n': instance.name,
      'd': instance.duration,
      't': instance.thumbnailName,
    };

IPickerItem _$IPickerItemFromJson(Map<String, dynamic> json) => IPickerItem(
  json['i'] as String? ?? '',
  (json['w'] as num?)?.toInt() ?? 0,
  (json['h'] as num?)?.toInt() ?? 0,
  json['n'] as String? ?? '',
);

Map<String, dynamic> _$IPickerItemToJson(IPickerItem instance) =>
    <String, dynamic>{
      'i': instance.id,
      'w': instance.width,
      'h': instance.height,
      'n': instance.name,
    };
