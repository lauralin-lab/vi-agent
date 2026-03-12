import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../app.dart';
import '../../../configs/constans.dart';

/// 应用信息展示页面（二级页面）
class AppInfoPage extends StatelessWidget {
  const AppInfoPage({super.key});

  @override
  Widget build(BuildContext context) {
    final app = App();
    final user = app.auth.currentAuth.user;

    return Scaffold(
      backgroundColor: const Color(0xFF1C1C1E),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1C1C1E),
        foregroundColor: Colors.white,
        title: const Text(
          '应用信息',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
        ),
      ),
      body: ListView(
        children: [
          // 应用信息
          _buildSection('应用', [
            _InfoRow('App Name', app.packageName),
            _InfoRow('Version', '${app.version}+${app.buildNumber}'),
            const _InfoRow('Debug Mode', isDebugMode ? 'YES' : 'NO'),
            const _InfoRow('Debug Tools', kEnableDebugTools ? 'YES' : 'NO'),
          ]),

          // 环境信息
          _buildSection('环境', [
            _InfoRow('Server Host', app.serverEnv.host),
          ]),

          // 用户信息
          _buildSection('用户', [
            _InfoRow('Login Status', user != null ? '已登录' : '未登录'),
            if (user != null) ...[
              _InfoRow('UID', user.uid),
              _InfoRow('Email', user.email ?? '(无)'),
              _InfoRow('Display Name', user.displayName ?? '(无)'),
              _InfoRow('Provider', user.providerData.map((p) => p.providerId).join(', ')),
            ],
          ]),

          // 设备信息
          _buildSection('设备', [
            _InfoRow('Device ID', app.deviceId),
            _InfoRow('Platform', Platform.operatingSystem),
            _InfoRow('OS Version', Platform.operatingSystemVersion),
            _InfoRow('Dart Version', Platform.version.split(' ').first),
            _InfoRow('Locale', app.currentLocale().toString()),
          ]),

          const SizedBox(height: 34),
        ],
      ),
    );
  }

  Widget _buildSection(String title, List<_InfoRow> rows) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
          child: Text(
            title.toUpperCase(),
            style: const TextStyle(
              color: Color(0xFF8E8E93),
              fontSize: 13,
              fontWeight: FontWeight.w600,
              letterSpacing: 1,
            ),
          ),
        ),
        Container(
          color: const Color(0xFF2C2C2E),
          child: Column(
            children: [
              for (int i = 0; i < rows.length; i++) ...[
                if (i > 0) const Divider(color: Color(0xFF38383A), height: 1, indent: 16),
                rows[i],
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// 信息行 - 可长按复制
class _InfoRow extends StatelessWidget {
  const _InfoRow(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onLongPress: () {
        Clipboard.setData(ClipboardData(text: value));
        HapticFeedback.lightImpact();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('已复制: $label'),
            backgroundColor: const Color(0xFF30D158),
            duration: const Duration(seconds: 1),
          ),
        );
      },
      behavior: HitTestBehavior.opaque,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            SizedBox(
              width: 120,
              child: Text(
                label,
                style: const TextStyle(color: Color(0xFF8E8E93), fontSize: 14),
              ),
            ),
            Expanded(
              child: Text(
                value,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontFamily: 'monospace',
                ),
                textAlign: TextAlign.right,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
