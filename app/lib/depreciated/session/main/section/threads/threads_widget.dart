import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../routing/router.dart';
import '../../../../../modules/widgets/empty_state_view.dart';
import 'data/thread_model.dart';
import '../../../../../modules/pages/center/provider/thread_provider.dart';
import 'widget/timeline/timeline.dart';

class ThreadsSection extends ConsumerStatefulWidget {
  final Axis axis;
  final List<ThreadDataGroup>? data;
  final Color bgColor;
  final bool isLoading;
  final VoidCallback? onNewSession;

  const ThreadsSection({
    super.key,
    this.data,
    this.axis = Axis.horizontal,
    this.bgColor = Colors.white,
    this.isLoading = false,
    this.onNewSession,
  });

  @override
  ConsumerState<ThreadsSection> createState() => _ThreadsSectionState();
}

class _ThreadsSectionState extends ConsumerState<ThreadsSection> {
  @override
  void initState() {
    super.initState();
    if (widget.data == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ref.read(threadListProvider.notifier).loadSessions();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    // 优先使用外部传入的数据，否则从 httpThreadListProvider 获取
    final List<ThreadDataGroup> displayData;
    final bool loading;

    if (widget.data != null) {
      displayData = widget.data!;
      loading = widget.isLoading;
    } else {
      final threadState = ref.watch(threadListProvider);
      displayData = ThreadDataConverter.groupByDate(threadState.sessions);
      loading = threadState.isLoading;
    }

    // 检查是否为空
    final isEmpty = displayData.isEmpty || displayData.every((group) => group.items.isEmpty);

    final content = loading && isEmpty
        ? const Center(child: CircularProgressIndicator())
        : isEmpty
        ? const EmptyStateView(
            imageSize: 48,
            title: 'No sessions yet',
          )
        : ThreadTimeline(
            axis: widget.axis,
            data: displayData,
            onChipTap: (item, index, title) {
              final key = item.sessionKey ?? '';
              SessionDetailRoute(sessionKey: key).push(context);
            },
          );

    return Container(
      height: 330,
      decoration: BoxDecoration(
        color: widget.bgColor,
        borderRadius: BorderRadius.circular(40),
      ),
      clipBehavior: Clip.antiAlias,
      padding: const EdgeInsets.symmetric(vertical: 20),
      child: Stack(
        children: [
          content,
          if (widget.onNewSession != null)
            Positioned(
              right: 20,
              bottom: 4,
              child: GestureDetector(
                onTap: widget.onNewSession,
                child: Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.15),
                        blurRadius: 8,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: const Icon(
                    Icons.add,
                    color: Colors.black,
                    size: 20,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
