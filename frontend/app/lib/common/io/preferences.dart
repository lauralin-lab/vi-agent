import 'package:rive_rolls_collection/logging/logger.dart';
import 'package:rive_rolls_collection/misc/initializer.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../configs/constans.dart';

/// 配置入口
class Preferences {
  /// 请勿直接初始化使用，请在 App 中获取实例
  Preferences.$();

  /// 是否为首次启动
  bool get firstStartup => _firstStartup;

  /// 获取应用首次启动时间，毫秒（时间戳）UTC
  int get launchTime => sp.getInt(_Key.firstLaunchTime.key) ?? 0;

  /// 用于保存接口，一般情况下请勿直接使用
  SharedPreferences get sp {
    assert(_$settings != null, 'Uninitialized');
    return _$settings!;
  }

  /// 初始化
  Future<void> _init() async {
    _$settings ??= await SharedPreferences.getInstance();
    await _setLaunchTime();
  }

  /// 设置应用首次启动时间
  Future<void> _setLaunchTime() async {
    if (launchTime != 0) return;
    _firstStartup = true;
    await sp.setInt(
      _Key.firstLaunchTime.key,
      DateTime.timestamp().millisecondsSinceEpoch,
    );
  }

  /// （设备编号）仅限内部使用
  /// 请使用 [DeviceIdCompat]
  String? get deviceId => sp.getString(_Key.deviceId.key);

  /// （设置设备编号）仅限内部使用
  /// 请使用 [DeviceIdCompat]
  Future<void> setDeviceId(String deviceId) {
    return sp.setString(_Key.deviceId.key, deviceId);
  }

  /// ios:首次弹出IDFA
  bool get idfaShow => sp.getBool(_Key.idfaShow.key) ?? false;

  /// ios:首次弹出IDFA
  Future<void> setIDFAShow() {
    return sp.setBool(_Key.idfaShow.key, true);
  }

  /// 获取用户提示
  int get userHelp => sp.getInt(_Key.userHelp.key) ?? 0xFFFFFFFFFFFFFFF;

  /// 设置用户提示
  Future<void> setUserHelp(int code) {
    return sp.setInt(_Key.userHelp.key, code);
  }

  /// 获取用户是否为会员（本地缓存接口，请勿直接调用）
  bool get isPremiumInLocalCache => sp.getBool(_Key.premium.key) ?? false;

  /// 设置用户是否为会员（本地缓存接口，请勿直接调用）
  Future<void> setPremiumInLocalCache(bool premium) {
    return sp.setBool(_Key.premium.key, premium);
  }

  /// 获取绑定用户的 UUD 缓存
  String get uuidInLocalCache => sp.getString(_Key.uuid.key) ?? "";

  /// 设置绑定用户的 UUD 缓存
  Future<void> setUuidInLocalCache(String uuid) async {
    await sp.setString(_Key.uuid.key, uuid);
  }

  /// 获取绑定用户的 FirebaseId 缓存
  String get firebaseIdInLocalCache => sp.getString(_Key.firebaseId.key) ?? "";

  /// 设置绑定用户的 FirebaseId 缓存
  Future<void> setFirebaseIdLocalCache(String uuid) async {
    await sp.setString(_Key.firebaseId.key, uuid);
  }

  /// 获取 AdjustId 缓存
  String? get adjustId => sp.getString(_Key.adjustId.key);

  /// 设置绑定 AdjustId 缓存
  Future<void> setAdjustId(String adjustId) async {
    await sp.setString(_Key.adjustId.key, adjustId);
  }

  /// 上次上报成功的 UID
  String? get lastReportedUid => sp.getString(_Key.lastReportedUid.key);

  /// 设置上次上报成功的 UID
  Future<void> setLastReportedUid(String uid) {
    return sp.setString(_Key.lastReportedUid.key, uid);
  }

  /// 获取临时删除的帐户
  bool get firebaseLogout => sp.getBool(_Key.fireBaseSignOut.key) ?? false;

  /// 临时先做一次firebase signOut
  Future<void> setFirebaseLogout(bool logout) async {
    await sp.setBool(_Key.fireBaseSignOut.key, logout);
  }

  /// 是否已展示过引导页
  bool get isGuidanceShown => sp.getBool(_Key.guidanceShown.key) ?? false;

  /// 标记引导页已展示
  Future<void> setGuidanceShown() {
    return sp.setBool(_Key.guidanceShown.key, true);
  }

  /// 是否已完成 Apple/Google 登录（强登录标记，纯本地，无网络依赖）
  bool get hasLogin => sp.getBool(_Key.login.key) ?? false;

  /// 设置登录状态缓存
  Future<void> setHasLogin(bool value) {
    return sp.setBool(_Key.login.key, value);
  }

  ///#region 私有变量

  /// 用于应用设置
  SharedPreferences? _$settings;

  /// 应用首次启动
  bool _firstStartup = false;

  ///#endregion
}

/// 配置初始化工具
class PreferencesInitializer extends Initializer {
  const PreferencesInitializer(super.type, this.preferences);

  final Preferences preferences;

  @override
  Future onInit() {
    if (isDebugMode) {
      final dict = <String, _Key>{};
      for (final key in _Key.values) {
        if (dict.containsKey(key.key)) {
          loge("[Prefs] {$key, ${dict[key.key]}} >> ${key.key} is duplicated");
        }
        dict[key.key] = key;
      }
    }
    return preferences._init();
  }
}

enum _Key {
  /// 设备编号
  deviceId._(0),

  /// 首次启动时间
  firstLaunchTime._(1),

  /// 获取用户提示
  userHelp._(2),

  /// 是否为会员，本地缓存值
  premium._(3),

  /// 绑定用户的 UUD
  uuid._(4),

  /// AdjustId 缓存
  adjustId._(5),

  /// FirebaseID 缓存
  firebaseId._(6),

  /// 临时登出
  fireBaseSignOut._(7),

  /// 上次上报的 UID
  lastReportedUid._(13),

  ///
  idfaShow._(22),

  /// 引导页是否已展示
  guidanceShown._(23),

  /// Apple/Google 登录成功标记
  login._(24);

  /// 构造
  /// `code` 请勿相同
  const _Key._(int code)
    : assert(code >= 0 && code < 100000),
      key = "k${code ~/ 10000}${code % 10000 ~/ 1000}${code % 1000 ~/ 100}${code % 100 ~/ 10}${code % 10}";

  /// 获取保存令牌
  final String key;
}
