import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../../app.dart';
import '../../../../../common/extension/ui_ext.dart';
import '../../../../../routing/router.dart';
import '../../../../../modules/widgets/empty_state_view.dart';
import '../../../../../modules/pages/memory/provider/memory_provider.dart';

/// Memory 页面
///
/// 显示 Agent 的长期记忆信息，使用 Markdown 格式渲染
class MemoryPage extends ConsumerStatefulWidget {
  const MemoryPage({super.key});

  @override
  ConsumerState<MemoryPage> createState() => _MemoryPageState();
}

class _MemoryPageState extends ConsumerState<MemoryPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(memoryProvider.notifier).loadMemory();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF2F2F3),
      body: Stack(
        children: [
          Positioned.fill(
            top: App().safeTop,
            left: 8.dpx,
            right: 8.dpx,
            child: _buildContent(context),
          ),
        ],
      ),
    );
  }

  /// 构建内容 - 使用 CustomScrollView + Sliver
  Widget _buildContent(BuildContext context) {
    return CustomScrollView(
      slivers: [
        // 头部卡片
        SliverToBoxAdapter(child: _buildHeader(context)),
        SliverToBoxAdapter(child: Gap(18.dpx)),

        // Markdown 内容区域
        SliverToBoxAdapter(child: _buildMemoryContent(context)),

        // 底部安全区域
        SliverToBoxAdapter(child: SizedBox(height: App().safeBottom + 20.dpx)),
      ],
    );
  }

  /// 渐变头部卡片
  Widget _buildHeader(BuildContext context) {
    return Container(
      height: 280.dpx,
      padding: EdgeInsets.only(left: 26.dpx, top: 20.dpx, right: 26.dpx),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.all(Radius.circular(36.dpx)),
        gradient: const LinearGradient(
          colors: [
            Color(0xFF060B0F),
            Color(0xFF3F5563),
            Color(0xFF8C908F),
            Color(0xFF888C8B),
          ],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 返回按钮
          GestureDetector(
            onTap: () => context.pop(),
            child: Container(
              width: 32.dpx,
              height: 32.dpx,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.2),
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.chevron_left,
                color: Colors.white,
                size: 20.dpx,
              ),
            ),
          ),
          Gap(48.dpx),
          // 标题
          Text(
            'Memory',
            style: TextStyle(
              fontSize: 20.dpx,
              color: Colors.white,
            ),
          ),
          Gap(8.dpx),
          // 描述
          Text(
            "Your agent's long-term mind. This is what your agent will remember and follow.",
            style: TextStyle(
              fontSize: 14.dpx,
              color: Colors.white.withValues(alpha: 0.6),
            ),
          ),
          const Spacer(),
          // 编辑按钮
          Center(
            child: GestureDetector(
              onTap: () => const EditMemoryRoute().push(context),
              child: Container(
                width: 44.dpx,
                height: 44.dpx,
                decoration: const BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  Icons.edit,
                  color: Colors.black,
                  size: 20.dpx,
                ),
              ),
            ),
          ),
          Gap(20.dpx),
        ],
      ),
    );
  }

  /// Markdown 内容卡片
  Widget _buildMemoryContent(BuildContext context) {
    final memoryState = ref.watch(memoryProvider);

    return Container(
      width: double.infinity,
      padding: EdgeInsets.all(20.dpx),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24.dpx),
      ),
      child: memoryState.isLoading
          ? const Center(child: CircularProgressIndicator())
          : memoryState.data.content.isEmpty
          ? const EmptyStateView(
              imageSize: 48,
              title: 'No memories yet',
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Markdown 渲染
                MarkdownBody(
                  data: memoryState.data.content,
                  selectable: true,
                  styleSheet: _buildMarkdownStyleSheet(),
                  onTapLink: (text, href, title) {
                    if (href != null) {
                      launchUrl(Uri.parse(href));
                    }
                  },
                ),
                SizedBox(height: 24.dpx),
                // Last updated
                if (memoryState.data.lastModified != null)
                  Text(
                    'Last updated: ${_formatDate(memoryState.data.lastModified!)}',
                    style: TextStyle(
                      fontSize: 14.dpx,
                      color: Colors.black.withValues(alpha: 0.4),
                    ),
                  ),
              ],
            ),
    );
  }

  /// 格式化日期
  String _formatDate(DateTime date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${months[date.month - 1]} ${date.day}, ${date.year}';
  }

  /// 构建 Markdown 样式
  MarkdownStyleSheet _buildMarkdownStyleSheet() {
    return MarkdownStyleSheet(
      h1: TextStyle(
        fontSize: 24.dpx,
        fontWeight: FontWeight.w700,
        color: Colors.black,
        height: 1.4,
      ),
      h2: TextStyle(
        fontSize: 18.dpx,
        fontWeight: FontWeight.w600,
        color: Colors.black,
        height: 1.4,
      ),
      h3: TextStyle(
        fontSize: 16.dpx,
        fontWeight: FontWeight.w600,
        color: Colors.black,
        height: 1.4,
      ),
      p: TextStyle(
        fontSize: 14.dpx,
        color: Colors.black87,
        height: 1.6,
      ),
      listBullet: TextStyle(
        fontSize: 14.dpx,
        color: Colors.black87,
      ),
      a: TextStyle(
        fontSize: 14.dpx,
        color: Colors.blue,
        decoration: TextDecoration.underline,
      ),
      code: TextStyle(
        fontSize: 13.dpx,
        color: const Color(0xFF333333),
        backgroundColor: const Color(0xFFF5F5F5),
      ),
      codeblockDecoration: BoxDecoration(
        color: const Color(0xFFF5F5F5),
        borderRadius: BorderRadius.circular(8.dpx),
      ),
      h2Padding: EdgeInsets.only(top: 16.dpx, bottom: 8.dpx),
      pPadding: EdgeInsets.only(bottom: 4.dpx),
      listIndent: 20.dpx,
    );
  }
}
