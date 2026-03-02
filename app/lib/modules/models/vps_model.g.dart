// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'vps_model.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VpsModel _$VpsModelFromJson(Map<String, dynamic> json) => VpsModel(
  vpsInfo: json['data'] == null
      ? null
      : VpsData.fromJson(json['data'] as Map<String, dynamic>),
  success: json['success'] as bool? ?? false,
);

Map<String, dynamic> _$VpsModelToJson(VpsModel instance) => <String, dynamic>{
  'success': instance.success,
  'data': instance.vpsInfo,
};

VpsData _$VpsDataFromJson(Map<String, dynamic> json) => VpsData(
  status: json['status'] as String?,
  ip: json['ip'] as String?,
  port: (json['port'] as num?)?.toInt(),
  gatewayToken: json['gateway_token'] as String?,
  workSpaceUrl: json['workspace_url'] as String?,
  elsFingerprint: json['els_fingerprint'] as String?,
  createdAt: json['created_at'] as String?,
);

Map<String, dynamic> _$VpsDataToJson(VpsData instance) => <String, dynamic>{
  'status': instance.status,
  'ip': instance.ip,
  'port': instance.port,
  'gateway_token': instance.gatewayToken,
  'workspace_url': instance.workSpaceUrl,
  'els_fingerprint': instance.elsFingerprint,
  'created_at': instance.createdAt,
};
