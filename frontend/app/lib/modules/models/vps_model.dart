import 'package:json_annotation/json_annotation.dart';

import 'base_model.dart';

part 'vps_model.g.dart';

@JsonSerializable()
class VpsModel extends BaseModel {
  @JsonKey(name: 'data')
  VpsData? vpsInfo;

  VpsModel({this.vpsInfo, super.success});

  factory VpsModel.fromJson(Map<String, dynamic> json) => _$VpsModelFromJson(json);

  Map<String, dynamic> toJson() => _$VpsModelToJson(this);

  VpsModel copyWith({
    VpsData? vpsInfo,
  }) {
    return VpsModel(
      vpsInfo: vpsInfo ?? this.vpsInfo,
    );
  }
}

@JsonSerializable()
class VpsData {
  @JsonKey(name: 'status')
  String? status;
  @JsonKey(name: 'ip')
  String? ip;
  @JsonKey(name: 'port')
  int? port;
  @JsonKey(name: 'gateway_token')
  String? gatewayToken;
  @JsonKey(name: 'workspace_url')
  String? workSpaceUrl;
  @JsonKey(name: 'els_fingerprint')
  String? elsFingerprint;
  @JsonKey(name: 'created_at')
  String? createdAt;

  VpsData({
    this.status,
    this.ip,
    this.port,
    this.gatewayToken,
    this.workSpaceUrl,
    this.elsFingerprint,
    this.createdAt,
  });

  factory VpsData.fromJson(Map<String, dynamic> json) => _$VpsDataFromJson(json);

  Map<String, dynamic> toJson() => _$VpsDataToJson(this);

  /// 对外暴露枚举类型
  VpsStatus get statusEnum => VpsStatusExt.fromString(status);

  VpsData copyWith({
    String? status,
    String? ip,
    int? port,
    String? gatewayToken,
    String? workSpaceUrl,
    String? elsFingerprint,
    String? createdAt,
  }) {
    return VpsData(
      status: status ?? this.status,
      ip: ip ?? this.ip,
      port: port ?? this.port,
      workSpaceUrl: workSpaceUrl ?? this.workSpaceUrl,
      gatewayToken: gatewayToken ?? this.gatewayToken,
      elsFingerprint: elsFingerprint ?? this.elsFingerprint,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}

enum VpsStatus {
  // 尚未开始创建
  pending,
  // Hetzner 正在创建服务器
  creating,
  // 服务器已创建，正在安装配置
  initializing,
  // 配置完成
  initialized,
  // 初始化失败
  initFailed,
}

extension VpsStatusExt on VpsStatus {
  static VpsStatus fromString(String? value) {
    switch (value) {
      case 'pending':
        return VpsStatus.pending;
      case 'creating':
        return VpsStatus.creating;
      case 'initializing':
        return VpsStatus.initializing;
      case 'initialized':
        return VpsStatus.initialized;
      case 'init_failed':
        return VpsStatus.initFailed;
      default:
        return VpsStatus.pending;
    }
  }
}
