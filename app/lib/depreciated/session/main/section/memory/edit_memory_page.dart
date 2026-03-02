import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../common/extension/ui_ext.dart';
import '../../../../../modules/pages/memory/provider/memory_provider.dart';
import '../../../../../modules/widgets/app_bar.dart';
import '../../../../../modules/widgets/app_button.dart';

/// Edit Memory 页面
///
/// 编辑 Agent 的长期记忆信息
/// 使用 Markdown 格式编辑
class EditMemoryPage extends ConsumerStatefulWidget {
  const EditMemoryPage({super.key});

  @override
  ConsumerState<EditMemoryPage> createState() => _EditMemoryPageState();
}

class _EditMemoryPageState extends ConsumerState<EditMemoryPage> {
  late TextEditingController _controller;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    // 从 memoryProvider 获取当前内容
    final currentContent = ref.read(memoryProvider).data.content;
    _controller = TextEditingController(text: currentContent);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF2F2F3),
      appBar: TopAppBar(
        title: Text(
          'Edit Memory',
          style: TextStyle(
            fontSize: 18.dpx,
            fontWeight: FontWeight.w500,
            color: Colors.black,
          ),
        ),
        centerTitle: true,
        backIcon: AppbarBackIcon.backRound,
        backIconColor: Colors.black54,
      ),
      body: SafeArea(
        child: Column(
          children: [
            // 编辑区域
            Expanded(
              child: _buildEditor(),
            ),
            // 保存按钮
            _buildSaveButton(),
          ],
        ),
      ),
    );
  }

  /// 编辑区域
  Widget _buildEditor() {
    return Container(
      margin: EdgeInsets.all(20.dpx),
      padding: EdgeInsets.all(20.dpx),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24.dpx),
      ),
      child: TextField(
        controller: _controller,
        maxLines: null,
        expands: true,
        textAlignVertical: TextAlignVertical.top,
        style: TextStyle(
          fontSize: 14.dpx,
          color: Colors.black87,
          height: 1.6,
        ),
        decoration: InputDecoration(
          border: InputBorder.none,
          contentPadding: EdgeInsets.zero,
          hintText: 'Enter your memory content...',
          hintStyle: TextStyle(
            fontSize: 14.dpx,
            color: Colors.black38,
          ),
        ),
      ),
    );
  }

  /// 保存按钮
  Widget _buildSaveButton() {
    return Container(
      padding: EdgeInsets.fromLTRB(20.dpx, 12.dpx, 20.dpx, 20.dpx),
      child: AppButton.label(
        label: _isSaving ? 'Saving...' : 'Save',
        fontSize: 14.dpx,
        fontWeight: FontWeight.w500,
        visualStyle: VisualStyle.black,
        height: 50.dpx,
        widthFactor: 1,
        colors: const [
          Color(0xFF060B0F),
          Color(0xFF3F5563),
          Color(0xFF8C908F),
        ],
        onPressed: _isSaving ? null : _onSave,
      ),
    );
  }

  /// 保存操作
  Future<void> _onSave() async {
    final content = _controller.text;

    setState(() => _isSaving = true);

    final success = await ref.read(memoryProvider.notifier).saveMemory(content);

    setState(() => _isSaving = false);

    if (success && mounted) {
      context.pop();
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Save failed, please try again')),
      );
    }
  }
}
