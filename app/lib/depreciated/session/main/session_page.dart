import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';

import '../../../app.dart';
import '../../../common/extension/ui_ext.dart';
import '../../../routing/router.dart';
import '../../../modules/widgets/app_page_refresh.dart';
import '../../../modules/pages/center/provider/thread_provider.dart';
import 'section/threads/threads_widget.dart';
import 'section/skills/skills_section.dart';
import 'widget/slide_to_capture_button.dart';

class SessionPage extends ConsumerStatefulWidget {
  const SessionPage({super.key});

  @override
  ConsumerState<SessionPage> createState() => _SessionPageState();
}

class _SessionPageState extends ConsumerState<SessionPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(threadListProvider.notifier).loadSessions();
    });
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: Material(
        child: Stack(
          children: [
            Positioned.fill(
              top: App().safeTop,
              left: 8.dpx,
              right: 8.dpx,
              child: _buildContent(context),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContent(BuildContext context) {
    return AppRefresh(
      onRefresh: () async {
        await ref.read(threadListProvider.notifier).loadSessions();
      },
      child: CustomScrollView(
        slivers: [
          // 头部
          SliverToBoxAdapter(child: _buildHeader(context)),
          SliverToBoxAdapter(child: Gap(18.dpx)),

          // THREADS
          _buildSectionHeader(context, 'THREADS', [
            GestureDetector(
              onTap: () {
                HapticFeedback.mediumImpact();
                const ThreadRoute().push(context);
              },
              child: const Image(image: AssetImage('assets/images/ic_sort.webp'), width: 20, height: 20),
            ),
          ]),
          SliverPadding(
            padding: EdgeInsets.only(bottom: App().safeBottom),
            sliver: _buildThreads(context),
          ),

          // SKILLS
          // _buildSectionHeader(context, 'SKILLS', null),
          // SliverToBoxAdapter(
          //   child: Padding(
          //     padding: EdgeInsets.only(bottom: 16.dpx),
          //     child: const SkillsSection(),
          //   ),
          // ),

          // MEMORY
          _buildSectionHeader(context, 'MEMORY', null),
          SliverPadding(
            padding: EdgeInsets.only(bottom: App().safeBottom),
            sliver: _buildMemory(context),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Container(
      height: 280.dpx,
      padding: EdgeInsets.only(left: 26.dpx, top: 50.dpx, right: 26.dpx),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.all(Radius.circular(36.dpx)),
        gradient: const LinearGradient(
          colors: [Color(0xFF060B0F), Color(0xFF3F5563), Color(0xFF8C908F), Color(0xFF888C8B)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: Column(
        children: [
          Text(
            "The World's First Camera That Thinks Before It Sees",
            style: TextStyle(
              color: Colors.white,
              fontSize: 18.dpx,
              height: 22.dpx / 18.dpx,
            ),
          ),
          const Spacer(),
          const SlideToCaptureButton(),
          Gap(30.dpx),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(BuildContext context, String title, List<Widget>? actions) {
    return PinnedHeaderSliver(
      child: Container(
        width: double.infinity,
        padding: EdgeInsets.only(left: 19.dpx, right: 19.dpx, bottom: 12.dpx),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              title,
              style: TextStyle(fontSize: 14.dpx, letterSpacing: -0.43),
            ),
            const Spacer(),
            if (actions != null && actions.isNotEmpty) ...actions,
          ],
        ),
      ),
    );
  }

  Widget _buildThreads(BuildContext context) {
    final threadState = ref.watch(threadListProvider);

    // 转换数据格式
    final groups = ThreadDataConverter.groupByDate(threadState.sessions);

    return SliverToBoxAdapter(
      child: Hero(
        tag: 'threads_section',
        child: Material(
          color: Colors.transparent,
          child: ThreadsSection(
            axis: Axis.horizontal,
            data: groups,
            isLoading: threadState.isLoading,
            onNewSession: () async {
              HapticFeedback.mediumImpact();
              await ref.read(threadListProvider.notifier).newThreadSession();
            },
          ),
        ),
      ),
    );
  }

  Widget _buildMemory(BuildContext context) {
    return SliverToBoxAdapter(
      child: GestureDetector(
        onTap: () {
          const MemoryRoute().push(context);
        },
        child: Container(
          height: 50.dpx,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.all(Radius.circular(20.dpx)),
            color: Colors.white,
          ),
          padding: EdgeInsets.only(left: 15.dpx, right: 15.dpx),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                "Manage memories",
                style: TextStyle(
                  fontSize: 15.dpx,
                  letterSpacing: -0.43,
                ),
              ),
              Icon(Icons.arrow_forward_ios, size: 12.dpx),
            ],
          ),
        ),
      ),
    );
  }
}
