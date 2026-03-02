import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../common/extension/ui_ext.dart';
import '../../../../../common/utils/log_utils.dart';
import '../../../../../routing/router.dart';
import '../../../../../modules/pages/center/provider/thread_provider.dart';
import '../../../../../modules/widgets/app_bar_blur.dart';
import '../../../../../modules/widgets/app_overlay_menu.dart';
import '../../../../../modules/widgets/empty_state_view.dart';
import 'components/dashed_line_painter.dart';
import 'data/thread_model.dart';

import 'widget/delete_session_dialog.dart';
import 'widget/timeline/thread_card.dart';
import 'components/timeline_dot.dart';
import 'widget/timeline/timeline.dart';

/// All Threads page showing grouped sessions with swipe-to-delete
class AllThreadsPage extends ConsumerStatefulWidget {
  const AllThreadsPage({super.key});

  @override
  ConsumerState<AllThreadsPage> createState() => _AllThreadsPageState();
}

class _AllThreadsPageState extends ConsumerState<AllThreadsPage> {
  /// 时间线配置 - 匹配 Figma 设计稿
  static const _dotSize = 20.0; // Timeline dot 尺寸
  static const _dotLineGap = 6.0; // Dot 与虚线间距
  static const _timelineWidth = 20.0; // 时间线列宽度
  static const _timelineCardGap = 8.0; // 时间线与卡片间距

  @override
  Widget build(BuildContext context) {
    final isLoading = ref.watch(isLoadingThreadsProvider);
    final sessions = ref.watch(threadSessionsProvider);
    final groups = ref.watch(threadGroupsProvider);

    return Scaffold(
      backgroundColor: const Color(0xFFF5F5F7),
      appBar: TransitionNavigationBar(
        title: 'All Threads',
        onBack: () {
          Navigator.pop(context);
        },
      ),
      body: Hero(
        tag: 'threads_section',
        child: Material(
          color: Colors.transparent,
          child: Container(
            decoration: BoxDecoration(
              color: Theme.of(context).scaffoldBackgroundColor,
              borderRadius: BorderRadius.circular(40),
            ),
            clipBehavior: Clip.antiAlias,
            child: Builder(
              builder: (context) {
                // 如果正在加载且列表为空，显示 loading
                if (isLoading && sessions.isEmpty) {
                  return const Center(child: CircularProgressIndicator());
                }

                // 空状态
                if (sessions.isEmpty) {
                  return const EmptyStateView(
                    title: 'No sessions yet',
                  );
                }

                return ListView.builder(
                  padding: EdgeInsets.symmetric(horizontal: 16.dpx, vertical: 16.dpx),
                  itemCount: groups.length,
                  itemBuilder: (context, index) => _buildDateGroup(
                    groups[index],
                    isFirst: index == 0,
                    isLast: index == groups.length - 1,
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }

  /// Build a date group with timeline
  Widget _buildDateGroup(ThreadDataGroup group, {bool isFirst = false, bool isLast = false}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Date header with timeline dot
        _buildDateHeader(group.dateLabel, showLineAbove: !isFirst),
        // Thread cards with timeline
        ...group.items.asMap().entries.map((entry) {
          final isLastItem = entry.key == group.items.length - 1 && isLast && group.items.isNotEmpty;
          return _buildTimelineCard(entry.value, isLastItem, '${group.dateLabel}_${entry.key}');
        }),
        // If no items, just show space with connecting line to next date
        if (group.items.isEmpty && !isLast) _buildEmptyConnector(),
      ],
    );
  }

  /// Build date header with layered gradient timeline dot
  Widget _buildDateHeader(String dateLabel, {bool showLineAbove = false}) {
    return SizedBox(
      height: 36.dpx,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          // Timeline column with dot
          SizedBox(
            width: _timelineWidth.dpx,
            child: Column(
              children: [
                // Line above dot (if not first)
                if (showLineAbove)
                  const Expanded(
                    child: DashedLine(
                      axis: Axis.vertical,
                      color: Color(0xFFD1D1D6),
                    ),
                  )
                else
                  const Spacer(),
                // Layered gradient dot
                TimelineDot(size: _dotSize.dpx),
              ],
            ),
          ),
          SizedBox(width: _timelineCardGap.dpx),
          // Date label - 与 dot 底部对齐
          Padding(
            padding: EdgeInsets.only(bottom: 2.dpx),
            child: Text(
              dateLabel,
              style: TextStyle(
                color: const Color(0xFF8E8E93),
                fontSize: 12.dpx,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Build card with dashed timeline line
  Widget _buildTimelineCard(ThreadData data, bool isLast, String uniqueKey) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Timeline column with dashed line
          SizedBox(
            width: _timelineWidth.dpx,
            child: Column(
              children: [
                // 上方间距 - dot 与虚线不连接
                SizedBox(height: _dotLineGap.dpx),
                // 虚线
                if (!isLast)
                  const Expanded(
                    child: DashedLine(
                      axis: Axis.vertical,
                      color: Color(0xFFD1D1D6),
                    ),
                  )
                else
                  const Expanded(child: SizedBox.shrink()),
              ],
            ),
          ),
          SizedBox(width: _timelineCardGap.dpx),
          // Swipeable card
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(top: 8.dpx, bottom: 8.dpx),
              child: _buildSwipeableCard(data, uniqueKey),
            ),
          ),
        ],
      ),
    );
  }

  /// Build empty connector line between date groups with no items
  Widget _buildEmptyConnector() {
    return SizedBox(
      height: 20.dpx,
      child: Row(
        children: [
          SizedBox(
            width: _timelineWidth.dpx,
            child: Column(
              children: [
                SizedBox(height: _dotLineGap.dpx),
                const Expanded(
                  child: DashedLine(
                    axis: Axis.vertical,
                    color: Color(0xFFD1D1D6),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Build card with long press to show delete option
  Widget _buildSwipeableCard(ThreadData data, String uniqueKey) {
    return Builder(
      builder: (context) {
        return GestureDetector(
          onLongPress: () => AppOverlayMenu.show(
            context: context,
            items: [
              AppOverlayMenuItem(
                icon: Icons.edit_outlined,
                label: 'Rename Session',
                onTap: () => _onRenamePressed(data),
              ),
              AppOverlayMenuItem(
                icon: Icons.delete_outline,
                label: 'Delete Session',
                onTap: () => _onDeletePressed(data),
                color: const Color(0xFFFF3B30),
              ),
            ],
          ),
          child: ThreadCard(
            data: data,
            title: data.title,
            onTap: () {
              AppOverlayMenu.dismiss();
              _onCardTap(data);
            },
          ),
        );
      },
    );
  }

  /// Handle rename button pressed
  Future<void> _onRenamePressed(ThreadData data) async {
    if (data.sessionKey == null) return;

    final currentName = data.title;
    final newName = await _showRenameDialog(currentName);
    if (newName != null && newName.trim().isNotEmpty && newName != currentName) {
      await ref.read(threadListProvider.notifier).renameThreadSession(data.sessionKey!, newName.trim());
      await refreshThreads(ref);
    }
  }

  /// 显示重命名对话框
  Future<String?> _showRenameDialog(String currentName) async {
    final controller = TextEditingController(text: currentName);
    final result = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Rename Session'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(
            hintText: 'Enter new name',
            border: OutlineInputBorder(),
          ),
          onSubmitted: (value) => Navigator.pop(ctx, value),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, controller.text),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    controller.dispose();
    return result;
  }

  /// Handle delete button pressed
  Future<void> _onDeletePressed(ThreadData data) async {
    final result = await DeleteSessionDialog.show(context);
    if (result == true && data.sessionKey != null) {
      await _deleteSession(data.sessionKey!);
    }
  }

  /// 删除 session
  Future<void> _deleteSession(String sessionKey) async {
    try {
      await ref.read(threadListProvider.notifier).deleteThreadSession(sessionKey);
      await refreshThreads(ref);
    } catch (e) {
      Log.d('[AllThreadsPage] Delete session failed: $e');
    }
  }

  /// Handle card tap - navigate to session detail
  void _onCardTap(ThreadData data) {
    final key = data.sessionKey ?? '';
    SessionDetailRoute(sessionKey: key).push(context);
  }

  @override
  void dispose() {
    AppOverlayMenu.dismiss();
    super.dispose();
  }
}
