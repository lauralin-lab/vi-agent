import 'package:flutter/material.dart';

import '../../../common/network/mock_interceptor.dart';

/// HTTP Mock 管理页面（二级页面）
class MockToolsPage extends StatefulWidget {
  const MockToolsPage({super.key});

  @override
  State<MockToolsPage> createState() => _MockToolsPageState();
}

class _MockToolsPageState extends State<MockToolsPage> {
  final _store = MockStore.instance;

  @override
  void initState() {
    super.initState();
    _store.addListener(_onStoreChanged);
  }

  @override
  void dispose() {
    _store.removeListener(_onStoreChanged);
    super.dispose();
  }

  void _onStoreChanged() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1C1C1E),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1C1C1E),
        foregroundColor: Colors.white,
        title: const Text(
          'HTTP Mock',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_rounded),
            onPressed: () => _showRuleEditor(context),
          ),
        ],
      ),
      body: Column(
        children: [
          _buildGlobalSwitch(),
          const Divider(color: Color(0xFF38383A), height: 1),
          _buildTemplatesSection(),
          const Divider(color: Color(0xFF38383A), height: 1),
          Expanded(child: _buildRulesList()),
        ],
      ),
    );
  }

  /// 全局开关
  Widget _buildGlobalSwitch() {
    return Container(
      color: const Color(0xFF2C2C2E),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: _store.globalEnabled ? const Color(0xFF30D158) : const Color(0xFF48484A),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(
              _store.globalEnabled ? Icons.wifi_tethering : Icons.wifi_tethering_off,
              color: Colors.white,
              size: 18,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Mock 全局开关',
                  style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600),
                ),
                Text(
                  _store.globalEnabled ? '所有匹配规则生效中' : '已关闭，所有请求走真实接口',
                  style: const TextStyle(color: Color(0xFF8E8E93), fontSize: 13),
                ),
              ],
            ),
          ),
          Switch.adaptive(
            value: _store.globalEnabled,
            activeColor: const Color(0xFF30D158),
            onChanged: (v) => _store.globalEnabled = v,
          ),
        ],
      ),
    );
  }

  /// 快速模板数据
  static final List<_MockTemplate> _templates = [
    _MockTemplate(
      name: '用户信息',
      icon: Icons.person_outline,
      color: const Color(0xFF0A84FF),
      rule: MockRule(
        id: 'tpl_user_profile',
        pathPattern: '/users/me',
        method: 'GET',
        statusCode: 200,
        responseBody: '''{
  "data": {
    "id": "mock-firebase-uid-001",
    "custom_uid": "mock-uuid-abc123",
    "package_name": "com.collov.camera",
    "user_name": "MockUser",
    "display_name": "Mock Display",
    "email": "mock@example.com",
    "photo_url": "",
    "sign_in_provider": "anonymous",
    "tier": "free",
    "balance": "0",
    "livekit": {
      "token": "mock-livekit-token-xyz",
      "url": "wss://livekit.mock.collov.ai",
      "room_name": "room-mock-001",
      "participant_name": "participant-mock-001"
    }
  }
}''',
      ),
    ),
    _MockTemplate(
      name: 'VPS 信息',
      icon: Icons.dns_outlined,
      color: const Color(0xFF30D158),
      rule: MockRule(
        id: 'tpl_vps_info',
        pathPattern: '/users/me/vps',
        method: 'GET',
        statusCode: 200,
        responseBody: '''{
  "success": true,
  "data": {
    "status": "initialized",
    "ip": "10.0.0.1",
    "port": 18789,
    "gateway_token": "mock-gateway-token-abc",
    "workspace_url": "https://workspace.mock.collov.ai",
    "els_fingerprint": "mock-fingerprint",
    "created_at": "2025-01-01T00:00:00Z"
  }
}''',
      ),
    ),
    _MockTemplate(
      name: 'LiveKit Token',
      icon: Icons.videocam_outlined,
      color: const Color(0xFFFF9F0A),
      rule: MockRule(
        id: 'tpl_livekit_token',
        pathPattern: '/collov/livekit/token',
        method: 'POST',
        statusCode: 200,
        responseBody: '''{
  "url": "wss://livekit.mock.collov.ai",
  "token": "mock-room-token-xyz789",
  "roomName": "room-mock-001",
  "thread_id": "thread-mock-001",
  "participantName": "participant-mock-001"
}''',
      ),
    ),
    _MockTemplate(
      name: 'Gateway Join',
      icon: Icons.login_rounded,
      color: const Color(0xFFBF5AF2),
      rule: MockRule(
        id: 'tpl_gateway_join',
        pathPattern: '/collov/livekit/gateway/join',
        method: 'POST',
        statusCode: 200,
        responseBody: '{}',
      ),
    ),
  ];

  /// 快速模板区域
  Widget _buildTemplatesSection() {
    return Container(
      color: const Color(0xFF2C2C2E),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.bolt_rounded, color: Color(0xFFFF9F0A), size: 16),
              const SizedBox(width: 6),
              const Text(
                '快速模板',
                style: TextStyle(
                  color: Color(0xFF8E8E93),
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.5,
                ),
              ),
              const Spacer(),
              GestureDetector(
                onTap: _applyAllTemplates,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFF0A84FF).withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Text(
                    '全部添加',
                    style: TextStyle(color: Color(0xFF0A84FF), fontSize: 12, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _templates.map((t) => _buildTemplateChip(t)).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildTemplateChip(_MockTemplate template) {
    final exists = _store.rules.any((r) => r.id == template.rule.id);
    return GestureDetector(
      onTap: exists ? null : () => _applyTemplate(template),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: exists ? template.color.withValues(alpha: 0.08) : template.color.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: exists ? template.color.withValues(alpha: 0.1) : template.color.withValues(alpha: 0.3),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(template.icon, color: exists ? const Color(0xFF48484A) : template.color, size: 15),
            const SizedBox(width: 6),
            Text(
              template.name,
              style: TextStyle(
                color: exists ? const Color(0xFF48484A) : template.color,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
            if (exists) ...[
              const SizedBox(width: 4),
              const Icon(Icons.check_circle, color: Color(0xFF48484A), size: 13),
            ],
          ],
        ),
      ),
    );
  }

  void _applyTemplate(_MockTemplate template) {
    _store.addRule(template.rule);
  }

  void _applyAllTemplates() {
    for (final t in _templates) {
      if (!_store.rules.any((r) => r.id == t.rule.id)) {
        _store.addRule(t.rule);
      }
    }
  }

  /// 规则列表
  Widget _buildRulesList() {
    final rules = _store.rules;

    if (rules.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.inbox_rounded, size: 48, color: Colors.white.withValues(alpha: 0.15)),
            const SizedBox(height: 12),
            Text(
              '暂无 Mock 规则',
              style: TextStyle(color: Colors.white.withValues(alpha: 0.35), fontSize: 15),
            ),
            const SizedBox(height: 4),
            Text(
              '点击右上角 + 添加',
              style: TextStyle(color: Colors.white.withValues(alpha: 0.2), fontSize: 13),
            ),
          ],
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.only(bottom: 34),
      itemCount: rules.length,
      separatorBuilder: (_, __) => const Divider(color: Color(0xFF38383A), height: 1, indent: 16),
      itemBuilder: (context, index) => _RuleCard(
        rule: rules[index],
        onToggle: () => _store.toggleRule(rules[index].id),
        onEdit: () => _showRuleEditor(context, rule: rules[index]),
        onDelete: () => _store.removeRule(rules[index].id),
      ),
    );
  }

  /// 弹出规则编辑器
  void _showRuleEditor(BuildContext context, {MockRule? rule}) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _MockRuleEditor(
        rule: rule,
        onSave: (newRule) {
          if (rule != null) {
            _store.updateRule(rule.id, newRule);
          } else {
            _store.addRule(newRule);
          }
        },
      ),
    );
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////

/// 规则卡片
class _RuleCard extends StatelessWidget {
  const _RuleCard({
    required this.rule,
    required this.onToggle,
    required this.onEdit,
    required this.onDelete,
  });

  final MockRule rule;
  final VoidCallback onToggle;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final methodColor = switch (rule.method?.toUpperCase()) {
      'GET' => const Color(0xFF30D158),
      'POST' => const Color(0xFF0A84FF),
      'PUT' => const Color(0xFFFF9F0A),
      'DELETE' => const Color(0xFFFF453A),
      _ => const Color(0xFF8E8E93),
    };

    return Dismissible(
      key: ValueKey(rule.id),
      direction: DismissDirection.endToStart,
      onDismissed: (_) => onDelete(),
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        color: const Color(0xFFFF453A),
        child: const Icon(Icons.delete_outline, color: Colors.white),
      ),
      child: GestureDetector(
        onTap: onEdit,
        child: Container(
          color: const Color(0xFF2C2C2E),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              // 方法标签
              Container(
                width: 52,
                padding: const EdgeInsets.symmetric(vertical: 4),
                decoration: BoxDecoration(
                  color: methodColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Center(
                  child: Text(
                    rule.method?.toUpperCase() ?? 'ALL',
                    style: TextStyle(
                      color: methodColor,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.5,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              // 路径和状态码
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      rule.pathPattern,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w500,
                        fontFamily: 'monospace',
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        _StatusBadge(statusCode: rule.statusCode),
                        if (rule.delay > Duration.zero) ...[
                          const SizedBox(width: 8),
                          Text(
                            '⏱ ${rule.delay.inMilliseconds}ms',
                            style: const TextStyle(color: Color(0xFF8E8E93), fontSize: 12),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              // 开关
              Switch.adaptive(
                value: rule.enabled,
                activeColor: const Color(0xFF30D158),
                onChanged: (_) => onToggle(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 状态码标签
class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.statusCode});

  final int statusCode;

  @override
  Widget build(BuildContext context) {
    final color = statusCode >= 200 && statusCode < 300
        ? const Color(0xFF30D158)
        : statusCode >= 400
        ? const Color(0xFFFF453A)
        : const Color(0xFFFF9F0A);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        '$statusCode',
        style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600),
      ),
    );
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////

/// Mock 规则编辑器
class _MockRuleEditor extends StatefulWidget {
  const _MockRuleEditor({this.rule, required this.onSave});

  final MockRule? rule;
  final ValueChanged<MockRule> onSave;

  @override
  State<_MockRuleEditor> createState() => _MockRuleEditorState();
}

class _MockRuleEditorState extends State<_MockRuleEditor> {
  late final TextEditingController _pathController;
  late final TextEditingController _statusCodeController;
  late final TextEditingController _responseBodyController;
  late final TextEditingController _delayController;
  String? _selectedMethod;

  static const _methods = [null, 'GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

  bool get _isEditing => widget.rule != null;

  @override
  void initState() {
    super.initState();
    final rule = widget.rule;
    _pathController = TextEditingController(text: rule?.pathPattern ?? '');
    _statusCodeController = TextEditingController(text: '${rule?.statusCode ?? 200}');
    _responseBodyController = TextEditingController(text: rule?.responseBody ?? '{}');
    _delayController = TextEditingController(text: '${rule?.delay.inMilliseconds ?? 0}');
    _selectedMethod = rule?.method;
  }

  @override
  void dispose() {
    _pathController.dispose();
    _statusCodeController.dispose();
    _responseBodyController.dispose();
    _delayController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      child: Container(
        color: const Color(0xFF1C1C1E),
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 标题
              Center(
                child: Container(
                  width: 36,
                  height: 5,
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: const Color(0xFF5A5A5E),
                    borderRadius: BorderRadius.circular(2.5),
                  ),
                ),
              ),
              Text(
                _isEditing ? '编辑 Mock 规则' : '新建 Mock 规则',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 20),

              // HTTP 方法选择
              const _SectionTitle('HTTP 方法'),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                children: _methods.map((m) {
                  final selected = _selectedMethod == m;
                  return GestureDetector(
                    onTap: () => setState(() => _selectedMethod = m),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      decoration: BoxDecoration(
                        color: selected ? const Color(0xFF0A84FF) : const Color(0xFF2C2C2E),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: selected ? const Color(0xFF0A84FF) : const Color(0xFF48484A),
                        ),
                      ),
                      child: Text(
                        m ?? 'ALL',
                        style: TextStyle(
                          color: selected ? Colors.white : const Color(0xFF8E8E93),
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: 20),

              // 路径
              const _SectionTitle('匹配路径'),
              const SizedBox(height: 8),
              _InputField(
                controller: _pathController,
                hintText: '/collov/livekit/token',
                prefixIcon: Icons.link_rounded,
              ),
              const SizedBox(height: 20),

              // 状态码 + 延迟
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const _SectionTitle('状态码'),
                        const SizedBox(height: 8),
                        _InputField(
                          controller: _statusCodeController,
                          hintText: '200',
                          keyboardType: TextInputType.number,
                          prefixIcon: Icons.numbers_rounded,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const _SectionTitle('延迟 (ms)'),
                        const SizedBox(height: 8),
                        _InputField(
                          controller: _delayController,
                          hintText: '0',
                          keyboardType: TextInputType.number,
                          prefixIcon: Icons.timer_outlined,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // 响应 Body
              const _SectionTitle('Response Body (JSON)'),
              const SizedBox(height: 8),
              _InputField(
                controller: _responseBodyController,
                hintText: '{"key": "value"}',
                maxLines: 6,
                prefixIcon: Icons.data_object_rounded,
              ),
              const SizedBox(height: 24),

              // 保存按钮
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  onPressed: _onSave,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF0A84FF),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
                  ),
                  child: Text(_isEditing ? '保存修改' : '添加规则'),
                ),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }

  void _onSave() {
    final path = _pathController.text.trim();
    if (path.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('请填写匹配路径'), backgroundColor: Color(0xFFFF453A)),
      );
      return;
    }

    final rule = MockRule(
      id: widget.rule?.id ?? DateTime.now().microsecondsSinceEpoch.toRadixString(36),
      pathPattern: path,
      method: _selectedMethod,
      statusCode: int.tryParse(_statusCodeController.text) ?? 200,
      responseBody: _responseBodyController.text,
      delay: Duration(milliseconds: int.tryParse(_delayController.text) ?? 0),
      enabled: widget.rule?.enabled ?? true,
    );

    widget.onSave(rule);
    Navigator.pop(context);
  }
}

/// 小标题
class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        color: Color(0xFF8E8E93),
        fontSize: 13,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.5,
      ),
    );
  }
}

/// 输入框
class _InputField extends StatelessWidget {
  const _InputField({
    required this.controller,
    this.hintText,
    this.maxLines = 1,
    this.keyboardType,
    this.prefixIcon,
  });

  final TextEditingController controller;
  final String? hintText;
  final int maxLines;
  final TextInputType? keyboardType;
  final IconData? prefixIcon;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      maxLines: maxLines,
      keyboardType: keyboardType,
      style: const TextStyle(color: Colors.white, fontSize: 15, fontFamily: 'monospace'),
      cursorColor: const Color(0xFF0A84FF),
      decoration: InputDecoration(
        hintText: hintText,
        hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.2)),
        filled: true,
        fillColor: const Color(0xFF2C2C2E),
        prefixIcon: prefixIcon != null ? Icon(prefixIcon, color: const Color(0xFF8E8E93), size: 20) : null,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: Color(0xFF48484A)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: Color(0xFF48484A)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: Color(0xFF0A84FF)),
        ),
      ),
    );
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////

/// Mock 模板数据模型
class _MockTemplate {
  const _MockTemplate({
    required this.name,
    required this.icon,
    required this.color,
    required this.rule,
  });

  final String name;
  final IconData icon;
  final Color color;
  final MockRule rule;
}
