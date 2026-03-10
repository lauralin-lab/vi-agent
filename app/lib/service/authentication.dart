import 'dart:async';
import 'dart:io';

import 'package:advertising_id/advertising_id.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:rive_rolls_collection/common.dart';
import 'package:rive_rolls_collection/logging/logger.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../app.dart';
import '../common/utils/log_utils.dart';
import '../modules/models/user_profile.dart';
import 'network/api_service.dart';

typedef AuthInfoAutoProvider = AutoDisposeStreamProvider<AuthInfo>;

enum AuthProvider {
  /// 未知
  unknown._('unknown'),

  /// 匿名登陆
  anonymous._('anonymous'),

  /// 苹果账号
  apple._('apple'),

  /// Facebook 账号（未实现）
  facebook._('facebook.com'),

  /// 谷歌账号
  google._('google'),

  /// 推特（未实现）
  twitter._('twitter.com'),

  /// Github（未实现）
  github._('github.com'),

  /// 手机（未实现）
  phone._('phone'),

  /// 邮箱（未实现）
  email._('password'),

  /// 恢复匿名登录
  restore._('restore');

  const AuthProvider._(this.id);

  /// 提供商编号
  final String id;

  /// 从供应商获得登录类型
  static AuthProvider fromProviderId(String id) {
    for (var value in values) {
      if (value.id == id) return value;
    }
    return unknown;
  }
}

/// 登录状态
enum LoginState {
  /// 登录成功
  ok,

  /// 正在登录
  logging,

  /// 已登录
  logged,

  /// 登录取消
  cancel,

  /// 供应商认证失败
  authFailed,

  /// 创建账户失败
  createFailed,

  /// 请登录失败
  requestFailed,
}

/// 删除账户状态
enum DeleteAccountState {
  /// 删除成功
  ok,

  /// 正在登录，请勿操作
  logging,

  /// 销户中
  deleting,

  /// 未登录
  notLogged,

  /// 会员用户，禁止删除账户
  vip,

  /// 网络异常
  networkError,

  /// 请求 Firebase 登录失败
  requestFailed,
}

/// 登陆信息
final class AuthInfo {
  /// 登录状态
  final AuthProvider provider;

  /// 用户信息
  final User? user;

  /// 个人信息
  final SelfProfile? self;

  /// 构造函数
  const AuthInfo(this.provider, this.user, this.self);

  /// 用户是否登录
  bool get logged => user != null;

  AuthInfo copyWith({
    AuthProvider? provider,
    User? user,
    SelfProfile? self,
  }) {
    return AuthInfo(
      provider ?? this.provider,
      user ?? this.user,
      self ?? this.self,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AuthInfo &&
          runtimeType == other.runtimeType &&
          provider == other.provider &&
          user == other.user &&
          self == other.self;

  @override
  int get hashCode => Object.hash(provider, user, self);

  @override
  String toString() => 'AuthInfo{provider: $provider, user: $user, self: $self}';
}

class Authentication {
  /// 登录信息
  AuthInfo get currentAuth => _authInfo;

  /// 判断用户是否登录
  bool get logged => _authInfo.logged;

  /// 监听账户变化，监听时会返回最后一次结果
  Stream<AuthInfo> get onAuthChangedListener => _authStream;

  /// 用户 UUID
  String get uuid => currentAuth.self?.uuid ?? App().preferences.uuidInLocalCache;


  // /// 尝试刷新自动登录，一般情况下请勿使用
  // void tryAutoLogin([bool refresh = false]) {
  //   if (logged) return;
  //   _AutoLogin.login(refresh);
  // }

  /// 退出
  Future<bool> logout() async {
    try {
      App().preferences.setHasLogin(false);
      await FirebaseAuth.instance.signOut();
    } catch (ex) {
      loge(ex);
      return false;
    }
    return true;
  }

  /// 登录
  Future<LoginState> login(AuthProvider type, [String? token]) async {
    // 强登录模式：开放 Apple / Google 登录，不再限制匿名/恢复
    // assert(type == AuthProvider.anonymous || type == AuthProvider.restore);
    // 判断是否已登录
    if (logged) return LoginState.logged;

    // 判断是否正在登录
    if (_accountLogging) return LoginState.logging;

    // 开始登录
    try {
      _accountLogging = true;
      final (UserCredential?, LoginState) credential;
      switch (type) {
        case AuthProvider.anonymous:
          credential = await _signInWithAnonymous();
        case AuthProvider.restore:
          credential = await _signInWithRestore(token!);
        case AuthProvider.google:
          credential = await _signInWithGoogle();
        case AuthProvider.apple:
          credential = await _signInWithApple();
        default:
          throw ArgumentError(); // 没有实现，上面做了判断，不会执行
      }
      if (credential.$2 != LoginState.ok) {
        return credential.$2;
      }
      final authUser = _userToAuthInfo(credential.$1!.user, null);
      final user = authUser.user;
      if (user != null) {
        final token = (await user.getIdToken()) ?? await user.getIdToken(true);
        if (token == null || (!await _createCurrentUser(user.uid, token))) {
          await logout(); // 登录失败，退出账号
          return LoginState.createFailed;
        }
      }

      // 登录回调
      _currentAuth = authUser;
      // _getUserVps();
      _updateUserState();
      return LoginState.ok;
    } catch (ex, st) {
      _logError(ex, st);
      return LoginState.requestFailed;
    } finally {
      _accountLogging = false;
    }
  }

  ///#region 内部方法
  Authentication.$() {
    _init();
  }

  /// 设置登录信息
  set _currentAuth(AuthInfo info) {
    if (_authInfo == info) return;
    _authInfo = info;
    _notifyUpdateUserInfo();
  }

  /// 初始化
  Future<void> _init() async {
    // 卸载重装后 iOS Keychain 中 Firebase 登录态不会被清除,---如果有用户信息走一次退出
    if (!App().preferences.hasLogin) {
      if (FirebaseAuth.instance.currentUser != null) {
        await FirebaseAuth.instance.signOut();
      }
    }

    final auth = FirebaseAuth.instance;

    // 设置当前用户
    _currentAuth = _userToAuthInfo(auth.currentUser, null);

    auth.authStateChanges().listen((User? user) {
      // 登录过程中不处理
      if (_accountLogging) return;
      _initTime = DateTime.now();
      _currentAuth = _userToAuthInfo(user, null);
      _updateUserState();
      // _getUserVps();
    });

    _authStream = Stream.multi((c) {
      _listeners.add(c);
      c.onCancel = () => _listeners.remove(c);
      c.add(_authInfo);
    });

    // 如果用户 2 秒没有初始化信息，则进行初始化
    Future.delayed(const Duration(milliseconds: 2000), () {
      if (_initTime != null) return;
      _initTime = DateTime.now();
      _queryUserData();
    });

    // 强登录模式：不再自动匿名登录，用户必须经过登录页完成 Apple/Google 登录
    // if (auth.currentUser == null) {
    //   _AutoLogin.login();
    // }

    Connectivity().onConnectivityChanged.listen(_onConnectChanged);

    // 每十分钟刷新一次用户信息
    Timer.periodic(const Duration(minutes: 10), _tryRefreshUserDataTask);
  }

  /// 用户信息转登录信息
  AuthInfo _userToAuthInfo(User? user, UserProfile? profile) {
    // 用户登出
    if (user == null) {
      return const AuthInfo(AuthProvider.unknown, null, null);
    } else {
      // 匿名用户
      if (user.isAnonymous) {
        logi("当前登录平台：${AuthProvider.anonymous}");
        return AuthInfo(AuthProvider.anonymous, user, SelfProfile.fromUserProfile(profile));
      }

      // TODO(WIP): 目前自定义登录实现仅限恢复登录，携带  "provider_id": "anonymous",
      if (user.providerData.isEmpty) {
        logi("当前登录平台：${AuthProvider.restore}");
        return AuthInfo(AuthProvider.restore, user, SelfProfile.fromUserProfile(profile));
      }

      final pd = user.providerData;
      final providerId = pd.firstOrNull?.providerId;
      final provider = AuthProvider.fromProviderId(providerId ?? 'unknown');
      logi("当前登录平台：$provider");
      return AuthInfo(provider, user, SelfProfile.fromUserProfile(profile));
    }
  }

  /// 匿名登陆
  Future<(UserCredential?, LoginState)> _signInWithAnonymous() async {
    return (
      await FirebaseAuth.instance.signInAnonymously(),
      LoginState.ok,
    );
  }

  /// 匿名登陆（恢复）
  Future<(UserCredential?, LoginState)> _signInWithRestore(String token) async {
    return (
      await FirebaseAuth.instance.signInWithCustomToken(token),
      LoginState.ok,
    );
  }

  Future<(UserCredential?, LoginState)> _signInWithApple() async {
    final appleProvider = AppleAuthProvider();
    return (
      await FirebaseAuth.instance.signInWithProvider(appleProvider),
      LoginState.ok,
    );
  }

  /// google登陆
  Future<(UserCredential?, LoginState)> _signInWithGoogle() async {
    // 登录并创建凭据
    final (credential, state) = await _authenticateGoogle();
    if (credential == null) return (null, state);

    // 执行登录
    return (
      await FirebaseAuth.instance.signInWithCredential(credential),
      LoginState.ok,
    );
  }

  /// 执行谷歌认证
  Future<(OAuthCredential?, LoginState)> _authenticateGoogle() async {
    // 开始登录
    final googleUser = await GoogleSignIn().signIn();
    if (googleUser == null) return const (null, LoginState.cancel); // 登录取消

    // 创建凭据
    final googleAuth = await googleUser.authentication;
    final credential = GoogleAuthProvider.credential(
      accessToken: googleAuth.accessToken,
      idToken: googleAuth.idToken,
    );
    return (credential, LoginState.ok);
  }

  /// 更新用户信息，并发送给监听者
  void _notifyUpdateUserInfo() {
    for (var l in _listeners) {
      l.add(_authInfo);
    }
  }

  /// 创建用户
  Future<bool> _createCurrentUser(String uid, String idToken) async {
    try {
      //(uid, idToken)
      final uuid = await ApiService.postUserCreate(idToken, App().packageName);
      if (uuid != null) _currentUserUuid = uuid;
      return true;
    } catch (ex, st) {
      _logError(ex, st);
    }
    return false;
  }

  /// 更新用户状态
  /// 由于目前不存在账号切换问题，这里不处理极端情况下频繁切换账号导致可能得串号问题
  Future<void> _updateUserState() async {
    final uid = currentAuth.user?.uid;

    // 执行上报
    await _reportIfWait(uid);

    // 查询用户基本数据
    await _queryUserData();
  }

  /// 等待用户信息请求完成
  Completer<void> userCompleter = Completer();

  /// 查询用户基本信息
  /// 由于目前不存在账号切换问题，这里不处理极端情况下频繁切换账号导致可能得串号问题
  Future<void> _queryUserData([bool retry = true, int count = 0]) async {
    final info = currentAuth;
    if (!info.logged) {
      _currentUserUuid = "";
      return;
    }
    try {
      final profile = await ApiService.getUserProfile();
      _currentUserUuid = profile.viUserId;
      _currentAuth = currentAuth.copyWith(self: SelfProfile.fromUserProfile(profile));
      //用户请求完成后走下
      if (!userCompleter.isCompleted) {
        userCompleter.complete();
      }
      _lastUserUpdated = DateTime.now();
    } on DioException catch (err) {
      // 网络异常重试
      if (err.type == DioExceptionType.connectionTimeout ||
          err.type == DioExceptionType.receiveTimeout ||
          err.type == DioExceptionType.sendTimeout) {
        if (!retry) {
          //用户信息接口异常情况
          userCompleter.completeError(err);
          return;
        }
        await _delayedQueryUserData(count * 5 + 10, count < 3, count + 1);
        return;
      }

      // 尝试重试，在登录 Firebase 之后，如果用户没有创建过账户，则需要创建账户
      if (err.response?.statusCode == 400 && (err.response?.data as Map? ?? {})['code'] == 40001) {
        final user = info.user;
        final idToken = await user?.getIdToken();
        if (user != null && idToken != null) {
          await _createCurrentUser(user.uid, idToken);
          // _getUserVps();
          if (!retry) return;
          await _delayedQueryUserData(count * 3, count < 3, count + 1);
          return;
        }
      }

      // 令牌失效，重试
      if (err.response?.statusCode == 422 || err.response?.statusCode == 401) {
        if (!retry) return;
        await currentAuth.user?.getIdToken(true);
        await _delayedQueryUserData(count * 3, false, count + 1);
        return;
      }

      //用户信息接口异常情况
      userCompleter.completeError(err);
      rethrow;
    }
  }

  /// 延迟多少秒执行查询
  Future<void> _delayedQueryUserData(int seconds, bool retry, int count) {
    return Future.delayed(seconds.sec, () => _queryUserData(retry, count));
  }

  /// 监听网络变化
  void _onConnectChanged(List<ConnectivityResult> results) {
    var willUpdate = false;
    for (final result in results) {
      switch (result) {
        case ConnectivityResult.wifi:
        case ConnectivityResult.ethernet:
        case ConnectivityResult.mobile:
        case ConnectivityResult.vpn:
          willUpdate = true;
          break;
        case ConnectivityResult.other:
        case ConnectivityResult.bluetooth:
        case ConnectivityResult.none:
          return;
      }
      if (willUpdate) break;
    }

    if (!willUpdate) return;

    /// 网络发生变化
    // 强登录模式：不再自动补匿名登录
    // if (!logged) _AutoLogin.login(true);
  }

  /// 尝试更新用户信息
  Future<void> _tryRefreshUserData(DateTime now) async {
    if (_lastUserUpdating) return;
    if (_lastUserUpdated == null || now.difference(_lastUserUpdated!) > const Duration(seconds: 300)) {
      try {
        _lastUserUpdating = true;
        await _queryUserData();
      } finally {
        _lastUserUpdating = false;
      }
    }
  }

  /// 尝试使用定时器更新用户信息
  Future<void> _tryRefreshUserDataTask(Timer _) {
    return _tryRefreshUserData(DateTime.now());
  }

  /// 设置用户的 UUID
  set _currentUserUuid(String uuid) {
    final preferences = App().preferences;
    if (preferences.uuidInLocalCache == uuid) return;
    App().preferences.setUuidInLocalCache(uuid);
  }

  /// 上报信息
  ///
  /// 如果之前上报过，则不等待此接口执行完成，否则等待
  Future<void> _reportIfWait(String? uid) {
    if (!logged || uid == null) return Future.value();

    // 本次启动已经上报过
    if (_reportedUid == uid) return Future.value();

    final f = ApiService.reportInfo().then(
      (r) {
        if (!r) return;
        // 上报成功
        _reportedUid = uid;
        App().preferences.setLastReportedUid(uid);
      },
    );

    // 之前上报过则不等待
    return uid == App().preferences.lastReportedUid ? Future.value() : f;
  }

  ///#endregion 内部方法˚

  ///#region 私有属性

  /// 认证监听广播流
  late final Stream<AuthInfo> _authStream;

  /// 监听者
  final _listeners = <MultiStreamController<AuthInfo>>{};

  /// 登录信息，请使用 [AuthInfoAutoProvider]
  AuthInfo _authInfo = const AuthInfo(AuthProvider.unknown, null, null);

  /// 登录中
  bool _accountLogging = false;

  /// 最后更新状态
  DateTime? _lastUserUpdated;

  /// 初始化用户信息时间
  DateTime? _initTime;

  /// 最后更新时间
  bool _lastUserUpdating = false;

  /// 已经上报成功过的 uid
  String? _reportedUid;
}

/// 输出错误
void _logError(Object? ex, [StackTrace? st]) {
  if (ex == null) return;
  if (kDebugMode) {
    loge(ex, stackTrace: st);
  } else {
    if (ex is DioException) {
      var msg = 'DioError [${ex.type}]: ${ex.message}';
      Log.d(msg);
    } else {
      Log.d(ex.toString());
    }
  }
}

// /// 自动登录
// base class _AutoLogin {
//   /// 当前登录任务
//   static _LoginTask? current;
//
//   /// 执行登录
//   static void login([bool refresh = false]) {
//     final count = current?.count ?? 999;
//     if ((!refresh && count < 10) || (refresh && count < 2)) {
//       return;
//     }
//
//     current?.cancel();
//     current = _LoginTask(0);
//   }
// }
//
// /// 登录任务
// final class _LoginTask {
//   /// 初始化登录
//   _LoginTask(this.count) {
//     _timer = Timer(Duration(seconds: (count * 2).clamp(1, 60)), _login);
//   }
//
//   /// 计时器
//   late final Timer _timer;
//
//   /// 尝试登录次数
//   late final int count;
//
//   /// 取消
//   void cancel() => _timer.cancel();
//
//   /// 执行登录
//   Future<void> _login() async {
//     if (App().auth.logged) {
//       cleanSelf();
//       return;
//     }
//
//     LoginState? r;
//     UidWithToken? ut;
//
//     logi("[自动登录] >> 开始登录");
//     if (Platform.isAndroid) {
//       final gaid = await AdvertisingId.id();
//       if (gaid != null) {
//         try {
//           // 旁门左道，如果失败，则认证失败，下次再来---android
//           // ut = await ApiService.postRestoreUser(App().deviceId, gaid);
//         } catch (e) {
//           r = LoginState.authFailed;
//         }
//       }
//       if (App().auth.logged) {
//         cleanSelf();
//         return;
//       }
//     }
//
//     r ??= await App().auth.login(ut == null ? AuthProvider.anonymous : AuthProvider.restore, ut?.token);
//
//     logi("[自动登录] >> ${App().auth.currentAuth}");
//
//     if (r == LoginState.logged || r == LoginState.ok || App().auth.logged) {
//       cleanSelf();
//       return;
//     }
//
//     // 被人替代了
//     if (_AutoLogin.current != this) return;
//
//     // 继续尝试
//     _AutoLogin.current = _LoginTask(count + 1);
//   }
//
//   /// 清理自身
//   void cleanSelf() {
//     if (_AutoLogin.current != this) return;
//     _AutoLogin.current = null;
//   }
// }

/// UID
class UidWithToken {
  const UidWithToken(this.uid, this.token);

  /// 用户编号
  final String uid;

  /// 令牌
  final String token;

  @override
  String toString() => 'UidWithToken{uid: $uid, token: $token}';
}
