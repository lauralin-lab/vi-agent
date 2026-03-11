import 'package:json_annotation/json_annotation.dart';

part 'user_profile.g.dart';

/// 基础信息
class SelfProfile {
  const SelfProfile(this.uuid, this.userName, this.avatar, this.firebaseID);

  /// 用户 UUID
  final String uuid;

  /// 用户名称
  final String userName;

  /// 用户头像链接
  final String avatar;

  /// fireBase ID
  final String firebaseID;

  static SelfProfile? fromUserProfile(UserProfile? profile) {
    if (profile == null) return null;
    return SelfProfile(profile.viUserId, profile.displayName, profile.photoUrl, profile.firebaseUid);
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is SelfProfile &&
          runtimeType == other.runtimeType &&
          uuid == other.uuid &&
          userName == other.userName &&
          avatar == other.avatar &&
          firebaseID == other.firebaseID;

  @override
  int get hashCode => Object.hash(uuid, userName, avatar, firebaseID);
}

/// 用户信息
@JsonSerializable(createToJson: false)
class UserProfile {
  /// 默认构造函数
  UserProfile(
    this.userId,
    this.viUserId,
    this.firebaseUid,
    this.displayName,
    this.eMail,
    this.photoUrl,
    this.signInProvider,
    this.language,
    this.isNewUser,
    this.inviteRequired,
  );

  /// 用户 UD
  @JsonKey(name: 'user_id', defaultValue: '')
  String userId;

  /// VI 系统唯一ID
  @JsonKey(name: 'vi_user_id', defaultValue: '')
  String viUserId;

  /// firebase ID
  @JsonKey(name: 'firebase_uid', defaultValue: '')
  String firebaseUid;

  /// 用户显示名字
  @JsonKey(name: 'display_name', defaultValue: '')
  String displayName;

  /// 邮箱
  @JsonKey(name: 'email', defaultValue: '')
  String eMail;

  /// 照片
  @JsonKey(name: 'photo_url', defaultValue: '')
  String photoUrl;

  /// 登陆方式
  @JsonKey(name: 'sign_in_provider', defaultValue: '')
  String signInProvider;

  /// 语言
  @JsonKey(name: 'language', defaultValue: '')
  String language;

  /// 语言
  @JsonKey(name: 'is_new_user', defaultValue: true)
  bool isNewUser;

  /// 当前是否需要邀请码
  @JsonKey(name: 'invite_required', defaultValue: false)
  bool inviteRequired;

  factory UserProfile.fromJson(Map<String, dynamic> json) => _$UserProfileFromJson(json);

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is UserProfile &&
          runtimeType == other.runtimeType &&
          userId == other.userId &&
          viUserId == other.viUserId &&
          firebaseUid == other.firebaseUid &&
          displayName == other.displayName &&
          eMail == other.eMail &&
          photoUrl == other.photoUrl &&
          signInProvider == other.signInProvider &&
          language == other.language &&
          isNewUser == other.isNewUser &&
          inviteRequired == other.inviteRequired;

  @override
  int get hashCode => Object.hash(
    userId,
    viUserId,
    firebaseUid,
    displayName,
    eMail,
    photoUrl,
    signInProvider,
    language,
    isNewUser,
    inviteRequired,
  );

  @override
  String toString() {
    return 'UserProfile{'
        'userId:$userId,'
        'vUserId:$viUserId,'
        'firebaseUid: $firebaseUid,'
        'displayName: $displayName,'
        'eMail: $eMail,'
        'photoUrl: $photoUrl,'
        'signInProvider: $signInProvider,'
        'language: $language,'
        'isNewUser: $isNewUser,'
        'inviteRequired: $inviteRequired'
        '}';
  }
}
