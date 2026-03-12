import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../app.dart';
import 'mock_tools_page.dart';
import 'app_info_page.dart';
import 'log_viewer_page.dart';
import 'env_config_page.dart';

/// 开发者工具入口页面（一级菜单）
class DevToolsPage extends StatelessWidget {
  const DevToolsPage({super.key});

  /// 以底部弹窗形式展示
  static Future<void> show(BuildContext context) {
    HapticFeedback.heavyImpact();
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const DevToolsPage(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      child: Container(
        color: const Color(0xFF1C1C1E),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _buildHandle(),
            _buildHeader(context),
            const Divider(color: Color(0xFF38383A), height: 1),
            _DevMenuItem(
              icon: Icons.wifi_tethering,
              iconColor: const Color(0xFFFF9F0A),
              title: 'HTTP Mock',
              subtitle: '拦截网络请求，返回自定义响应',
              onTap: () => _push(context, const MockToolsPage()),
            ),
            const Divider(color: Color(0xFF38383A), height: 1, indent: 56),
            _DevMenuItem(
              icon: Icons.info_outline_rounded,
              iconColor: const Color(0xFF0A84FF),
              title: '应用信息',
              subtitle: '版本、设备、认证、环境信息',
              onTap: () => _push(context, const AppInfoPage()),
            ),
            const Divider(color: Color(0xFF38383A), height: 1, indent: 56),
            _DevMenuItem(
              icon: Icons.article_outlined,
              iconColor: const Color(0xFFBF5AF2),
              title: '日志查看',
              subtitle: '查看应用运行日志，支持搜索和过滤',
              onTap: () => _push(context, const LogViewerPage()),
            ),
            const Divider(color: Color(0xFF38383A), height: 1, indent: 56),
            _DevMenuItem(
              icon: Icons.swap_horiz_rounded,
              iconColor: const Color(0xFFFF453A),
              title: '环境配置',
              subtitle: '切换服务器环境（生产/测试）',
              onTap: () => _push(context, const EnvConfigPage()),
            ),
            const Divider(color: Color(0xFF38383A), height: 1, indent: 56),
            _DevMenuItem(
              icon: Icons.copy_all_rounded,
              iconColor: const Color(0xFF30D158),
              title: '快速复制',
              subtitle: '一键复制 Token / URL 等常用信息',
              onTap: () => _showQuickCopy(context),
            ),
            const SizedBox(height: 34),
          ],
        ),
      ),
    );
  }

  Widget _buildHandle() {
    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 4),
      child: Container(
        width: 36,
        height: 5,
        decoration: BoxDecoration(
          color: const Color(0xFF5A5A5E),
          borderRadius: BorderRadius.circular(2.5),
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          const Icon(Icons.developer_mode, color: Color(0xFF0A84FF), size: 24),
          const SizedBox(width: 10),
          const Expanded(
            child: Text(
              'Dev Tools',
              style: TextStyle(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.5,
              ),
            ),
          ),
          GestureDetector(
            onTap: () => Navigator.pop(context),
            child: Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: const Color(0xFF48484A),
                borderRadius: BorderRadius.circular(16),
              ),
              child: const Icon(Icons.close_rounded, color: Colors.white, size: 18),
            ),
          ),
        ],
      ),
    );
  }

  void _push(BuildContext context, Widget page) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => page),
    );
  }

  void _showQuickCopy(BuildContext context) {
    final app = App();
    final items = <_CopyItem>[
      _CopyItem('Device ID', app.deviceId),
      _CopyItem('App Version', '${app.version}+${app.buildNumber}'),
      _CopyItem('Package Name', app.packageName),
      if (app.auth.currentAuth.user != null) _CopyItem('User UID', app.auth.currentAuth.user!.uid),
    ];

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => ClipRRect(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        child: Container(
          color: const Color(0xFF1C1C1E),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Padding(
                padding: EdgeInsets.all(16),
                child: Text(
                  '快速复制',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const Divider(color: Color(0xFF38383A), height: 1),
              ...items.map((item) => _QuickCopyTile(item: item)),
              const SizedBox(height: 34),
            ],
          ),
        ),
      ),
    );
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////

/// 一级菜单项
class _DevMenuItem extends StatelessWidget {
  const _DevMenuItem({
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final Color iconColor;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        color: const Color(0xFF2C2C2E),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: iconColor.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: iconColor, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: const TextStyle(color: Color(0xFF8E8E93), fontSize: 13),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded, color: Color(0xFF48484A), size: 22),
          ],
        ),
      ),
    );
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////

class _CopyItem {
  _CopyItem(this.label, this.value);
  final String label;
  final String value;
}

class _QuickCopyTile extends StatelessWidget {
  const _QuickCopyTile({required this.item});
  final _CopyItem item;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        Clipboard.setData(ClipboardData(text: item.value));
        HapticFeedback.lightImpact();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('已复制 ${item.label}'),
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
              width: 100,
              child: Text(
                item.label,
                style: const TextStyle(color: Color(0xFF8E8E93), fontSize: 14),
              ),
            ),
            Expanded(
              child: Text(
                item.value.isEmpty ? '(空)' : item.value,
                style: TextStyle(
                  color: item.value.isEmpty ? const Color(0xFF48484A) : Colors.white,
                  fontSize: 14,
                  fontFamily: 'monospace',
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 8),
            const Icon(Icons.copy_rounded, color: Color(0xFF48484A), size: 16),
          ],
        ),
      ),
    );
  }
}
