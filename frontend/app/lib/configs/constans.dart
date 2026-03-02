import 'dart:io';

import 'package:flutter/foundation.dart';

/// 是否是调试模式
const bool isDebugMode = !kReleaseMode;

/// 是否正在测试
final bool isTestingMode = Platform.environment.containsKey('FLUTTER_TEST');

/// 应用名称
const String appBaseName = 'AgentOne';

/// 进行处理的图片最长边
const maxPhotoSize = 2048;


/// 是否启用帮助中心，TODO(WIP): 需要替换ID才能启用
const kEnableHelpshift = false;

/// 是否是内部版本
/// debug 模式下默认开启；release 模式需通过 --dart-define=IS_INTERNAL_VERSION=true 显式开启
const kEnableDebugTools = isDebugMode || bool.fromEnvironment('IS_INTERNAL_VERSION');
