import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../app.dart';
import '../../../configs/envs.dart';
import '../../../common/network/dio.dart';

/// 环境配置页面
class EnvConfigPage extends StatefulWidget {
  const EnvConfigPage({super.key});

  @override
  State<EnvConfigPage> createState() => _EnvConfigPageState();
}

class _EnvConfigPageState extends State<EnvConfigPage> {
  late ServerEnv _currentEnv = App().serverEnv;
  bool _isCustom = false;
  String? _customUrl;
  late final TextEditingController _urlController = TextEditingController();

  /// 当前实际生效的 Base URL
  String get _activeUrl => _isCustom ? (_customUrl ?? '') : _currentEnv.host;

  @override
  void dispose() {
    _urlController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1C1C1E),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1C1C1E),
        foregroundColor: Colors.white,
        title: const Text(
          '环境配置',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
        ),
      ),
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 当前环境提示
            Container(
              width: double.infinity,
              color: const Color(0xFF2C2C2E),
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Text(
                        '当前 Base URL',
                        style: TextStyle(color: Color(0xFF8E8E93), fontSize: 13, fontWeight: FontWeight.w600),
                      ),
                      if (_isCustom) ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFF9F0A).withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: const Text(
                            '自定义',
                            style: TextStyle(color: Color(0xFFFF9F0A), fontSize: 11, fontWeight: FontWeight.w600),
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    _activeUrl,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontFamily: 'monospace',
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // 预设环境列表
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Text(
                '预设环境',
                style: TextStyle(
                  color: Color(0xFF8E8E93),
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.5,
                ),
              ),
            ),
            ...ServerEnv.values.map((env) => _buildEnvTile(env)),

            const SizedBox(height: 12),

            // 自定义 URL
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Text(
                '自定义 URL',
                style: TextStyle(
                  color: Color(0xFF8E8E93),
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.5,
                ),
              ),
            ),
            _buildCustomUrlSection(),

            // 警告提示
            const Padding(
              padding: EdgeInsets.all(16),
              child: Row(
                children: [
                  Icon(Icons.warning_amber_rounded, color: Color(0xFFFF9F0A), size: 16),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '切换环境后需要重启应用才能完全生效',
                      style: TextStyle(color: Color(0xFFFF9F0A), fontSize: 13),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEnvTile(ServerEnv env) {
    final isSelected = !_isCustom && _currentEnv == env;
    final color = env == ServerEnv.production ? const Color(0xFFFF453A) : const Color(0xFF30D158);

    return GestureDetector(
      onTap: () => _switchEnv(env),
      behavior: HitTestBehavior.opaque,
      child: Container(
        color: const Color(0xFF2C2C2E),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            // 环境标签
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                env.consoleTips,
                style: TextStyle(
                  color: color,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            const SizedBox(width: 12),
            // 环境详情
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    env.name,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    env.host,
                    style: const TextStyle(
                      color: Color(0xFF8E8E93),
                      fontSize: 12,
                      fontFamily: 'monospace',
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            // 选中标识
            if (isSelected)
              const Icon(Icons.check_circle, color: Color(0xFF30D158), size: 22)
            else
              const Icon(Icons.radio_button_unchecked, color: Color(0xFF48484A), size: 22),
          ],
        ),
      ),
    );
  }

  /// 自定义 URL 输入区域
  Widget _buildCustomUrlSection() {
    return Container(
      color: const Color(0xFF2C2C2E),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Column(
        children: [
          Row(
            children: [
              // 自定义标签
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFFFF9F0A).withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Text(
                  '自定义',
                  style: TextStyle(
                    color: Color(0xFFFF9F0A),
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Text(
                  '输入任意 Base URL',
                  style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600),
                ),
              ),
              if (_isCustom)
                const Icon(Icons.check_circle, color: Color(0xFF30D158), size: 22)
              else
                const Icon(Icons.radio_button_unchecked, color: Color(0xFF48484A), size: 22),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _urlController,
                  style: const TextStyle(color: Colors.white, fontSize: 14, fontFamily: 'monospace'),
                  cursorColor: const Color(0xFF0A84FF),
                  decoration: InputDecoration(
                    hintText: 'https://your-server.com/v1',
                    hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.2)),
                    filled: true,
                    fillColor: const Color(0xFF1C1C1E),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: const BorderSide(color: Color(0xFF48484A)),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: const BorderSide(color: Color(0xFF48484A)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: const BorderSide(color: Color(0xFF0A84FF)),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              GestureDetector(
                onTap: _applyCustomUrl,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  decoration: BoxDecoration(
                    color: const Color(0xFF0A84FF),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text(
                    '应用',
                    style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _switchEnv(ServerEnv env) {
    if (!_isCustom && env == _currentEnv) return;

    HapticFeedback.mediumImpact();

    // 更新 App 单例中的环境
    App().serverEnv = env;

    // 更新 Dio baseUrl
    appDio.options.baseUrl = env.host;

    setState(() {
      _currentEnv = env;
      _isCustom = false;
      _customUrl = null;
    });

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('已切换到 ${env.consoleTips}（${env.name}）'),
        backgroundColor: const Color(0xFF30D158),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  void _applyCustomUrl() {
    final url = _urlController.text.trim();
    if (url.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('请输入 URL'),
          backgroundColor: Color(0xFFFF453A),
        ),
      );
      return;
    }

    HapticFeedback.mediumImpact();

    // 直接更新 Dio baseUrl
    appDio.options.baseUrl = url;

    setState(() {
      _isCustom = true;
      _customUrl = url;
    });

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('已应用自定义 URL：$url'),
        backgroundColor: const Color(0xFF30D158),
        duration: const Duration(seconds: 2),
      ),
    );
  }
}
