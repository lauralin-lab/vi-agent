import 'package:json_annotation/json_annotation.dart';

part 'user_profile.g.dart';

/// 基础信息
class SelfProfile {
  const SelfProfile(this.uuid, this.userName, this.avatar, this.firebaseID, this.liveKit);

  /// 用户 UUID
  final String uuid;

  /// 用户名称
  final String userName;

  /// 用户头像链接
  final String avatar;

  /// fireBase ID
  final String firebaseID;

  /// LiveKit信息
  final LiveKit liveKit;

  static SelfProfile? fromUserProfile(UserProfile? profile) {
    if (profile == null) return null;
    return SelfProfile(
      profile.uuid,
      profile.userName,
      profile.photoUrl,
      profile.firebaseUid,
      profile.liveKit,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is SelfProfile &&
          runtimeType == other.runtimeType &&
          uuid == other.uuid &&
          userName == other.userName &&
          avatar == other.avatar &&
          firebaseID == other.firebaseID &&
          liveKit == other.liveKit;

  @override
  int get hashCode => Object.hash(uuid, userName, avatar, firebaseID, liveKit);
}

/// 用户信息
@JsonSerializable(createToJson: false)
class UserProfile {
  /// 默认构造函数
  const UserProfile(
    this.firebaseUid,
    this.uuid,
    this.packageName,
    this.userName,
    this.displayName,
    this.eMail,
    this.photoUrl,
    this.signInProvider,
    this.tier,
    this.balance,
    this.liveKit,
  );

  /// firebase_uid
  @JsonKey(name: 'id', defaultValue: '')
  final String firebaseUid;

  /// 用户 UUID
  @JsonKey(name: 'custom_uid', defaultValue: '')
  final String uuid;

  /// 包名
  @JsonKey(name: 'package_name', defaultValue: '')
  final String packageName;

  /// 用户名称
  @JsonKey(name: 'user_name', defaultValue: '')
  final String userName;

  /// 用户显示名字
  @JsonKey(name: 'display_name', defaultValue: '')
  final String displayName;

  /// Email
  @JsonKey(name: 'email', defaultValue: '')
  final String eMail;

  /// 头像
  @JsonKey(name: 'photo_url', defaultValue: '')
  final String photoUrl;

  /// 登陆方式
  @JsonKey(name: 'sign_in_provider', defaultValue: '')
  final String signInProvider;

  /// tier
  @JsonKey(name: 'tier', defaultValue: '')
  final String tier;

  /// balance
  @JsonKey(name: 'balance', defaultValue: '')
  final String balance;

  /// liveKit
  @JsonKey(name: 'livekit', defaultValue: _emptyLiveKit)
  final LiveKit liveKit;

  factory UserProfile.fromJson(Map<String, dynamic> json) => _$UserProfileFromJson(json);

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is UserProfile &&
          runtimeType == other.runtimeType &&
          firebaseUid == other.firebaseUid &&
          uuid == other.uuid &&
          packageName == other.packageName &&
          userName == other.userName &&
          displayName == other.displayName &&
          eMail == other.eMail &&
          photoUrl == other.photoUrl &&
          signInProvider == other.signInProvider &&
          tier == other.tier &&
          balance == other.balance &&
          liveKit == other.liveKit;

  @override
  int get hashCode => Object.hash(
    firebaseUid,
    uuid,
    packageName,
    userName,
    displayName,
    eMail,
    photoUrl,
    signInProvider,
    tier,
    balance,
    liveKit,
  );

  @override
  String toString() {
    return 'UserProfile{'
        'firebaseUid: $firebaseUid,'
        'uuid: $uuid, '
        'packageName: $packageName,'
        'userName: $userName, '
        'displayName: $displayName,'
        'eMail: $eMail,'
        'photoUrl: $photoUrl,'
        'signInProvider: $signInProvider,'
        'tier: $tier,'
        'balance: $balance,'
        'liveKit: $liveKit,'
        '}';
  }
}

@JsonSerializable()
class LiveKit {
  LiveKit({
    required this.liveKitToken,
    required this.liveKitUrl,
    required this.roomName,
    required this.participantName,
    required this.sessionKey,
  });

  static final LiveKit empty = LiveKit(
    liveKitToken: '',
    liveKitUrl: '',
    roomName: '',
    participantName: '',
    sessionKey: '',
  );

  /// LiveKit Token
  @JsonKey(name: 'token', defaultValue: '')
  String liveKitToken;

  /// LiveKit Url
  @JsonKey(name: 'url', defaultValue: '')
  String liveKitUrl;

  /// LiveKit RoomName
  @JsonKey(name: 'room_name', defaultValue: '')
  String roomName;

  /// LiveKit participantName
  @JsonKey(name: 'participant_name', defaultValue: '')
  String participantName;

  /// SessionKey
  @JsonKey(name: 'session_key', defaultValue: '')
  String sessionKey;

  factory LiveKit.fromJson(Map<String, dynamic> json) => _$LiveKitFromJson(json);

  Map<String, dynamic> toJson() => _$LiveKitToJson(this);

  LiveKit copyWith({
    String? liveKitToken,
    String? liveKitUrl,
    String? roomName,
    String? participantName,
    String? sessionKey,
  }) {
    return LiveKit(
      liveKitToken: liveKitToken ?? this.liveKitToken,
      liveKitUrl: liveKitUrl ?? this.liveKitUrl,
      roomName: roomName ?? this.roomName,
      participantName: participantName ?? this.participantName,
      sessionKey: sessionKey ?? this.sessionKey,
    );
  }
}

/// 空数据
LiveKit _emptyLiveKit() => LiveKit.empty;
