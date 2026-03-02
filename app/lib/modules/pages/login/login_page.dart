import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:rive_rolls_collection/common.dart';
import 'package:video_player/video_player.dart';

import '../../../app.dart';
import '../../../common/extension/ui_ext.dart';
import '../../../routing/router.dart';
import '../../../service/authentication.dart';
import '../../widgets/custom_notify_widget.dart';
import '../../widgets/loading_dialog.dart';

part 'login_page.ui.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  late final VideoPlayerController _videoController;

  @override
  void initState() {
    super.initState();
    _videoController = VideoPlayerController.asset('assets/media/promo-bg.mp4')
      ..setLooping(true)
      ..setVolume(0)
      ..initialize().then((_) {
        if (mounted) {
          setState(() {});
          _videoController.play();
        }
      });
  }

  @override
  void dispose() {
    _videoController.dispose();
    super.dispose();
  }

  /// 第三方登陆
  Future<void> _onLogin(AuthProvider type) async {
    final dismiss = LoadingDialog.show(context);
    try {
      final result = await App().auth.login(type);
      if (!mounted) return;
      if (LoginState.ok == result) {
        customCenterNotify('Login Success');
        App().preferences.setHasLogin(true);
        const HomeRoute().go(context);
      }
    } catch (e) {
      logd(e);
    } finally {
      dismiss();
    }
  }

  @override
  Widget build(BuildContext context) {
    return _buildBody(context);
  }
}
