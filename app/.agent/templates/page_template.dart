// ignore_for_file: unused_element
/// 页面模板
///
/// 使用方法：
/// 1. 复制此文件到 lib/modules/pages/[功能名]/
/// 2. 将 Template 替换为你的功能名（如 UserProfile）
/// 3. 同时创建 xxx_page.ui.dart 文件
/// 4. 在 router.dart 中添加路由定义

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Template 页面
///
/// 负责：
/// - 页面生命周期管理
/// - 状态管理
/// - 业务逻辑处理
class TemplatePage extends ConsumerStatefulWidget {
  const TemplatePage({super.key});

  @override
  ConsumerState<TemplatePage> createState() => _TemplatePageState();
}

class _TemplatePageState extends ConsumerState<TemplatePage> {
  @override
  void initState() {
    super.initState();
    // 初始化逻辑
  }

  @override
  void dispose() {
    // 清理资源
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return const _TemplatePageUI();
  }
}

/// Template 页面 UI
///
/// 负责：
/// - 纯 UI 构建
/// - 布局实现
class _TemplatePageUI extends StatelessWidget {
  const _TemplatePageUI();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Template'),
      ),
      body: const Center(
        child: Text('Template Page'),
      ),
    );
  }
}
