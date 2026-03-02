import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'provider/memory_provider.dart';
import '../../shared/empty_state_view.dart';

class MemoryPage extends ConsumerStatefulWidget {
  const MemoryPage({super.key});

  @override
  ConsumerState<MemoryPage> createState() => _MemoryPageState();
}

class _MemoryPageState extends ConsumerState<MemoryPage> {
  bool _isEditing = false;
  late final TextEditingController _editCtrl;

  @override
  void initState() {
    super.initState();
    // Mirror edit_memory_page: init from whatever the provider already holds
    _editCtrl = TextEditingController(
      text: ref.read(memoryProvider).data.content,
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(memoryProvider.notifier).loadMemory();
    });
  }

  @override
  void dispose() {
    _editCtrl.dispose();
    super.dispose();
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  String _formatDate(DateTime dt) {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return '${months[dt.month - 1]} ${dt.day}, ${dt.year}';
  }

  /// Dark-theme MarkdownStyleSheet matching the profile screen palette.
  MarkdownStyleSheet _buildMarkdownStyleSheet() {
    return MarkdownStyleSheet(
      h2: TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        color: Colors.white.withValues(alpha: 0.75),
        height: 1.4,
        letterSpacing: 0.2,
      ),
      h3: TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: Colors.white.withValues(alpha: 0.65),
        height: 1.4,
      ),
      p: TextStyle(
        fontSize: 13,
        color: Colors.white.withValues(alpha: 0.5),
        height: 1.55,
      ),
      listBullet: TextStyle(
        fontSize: 13,
        color: Colors.white.withValues(alpha: 0.35),
      ),
      a: TextStyle(
        fontSize: 13,
        color: Colors.blue.shade300,
        decoration: TextDecoration.underline,
      ),
      code: TextStyle(
        fontSize: 12,
        color: Colors.white.withValues(alpha: 0.6),
        backgroundColor: Colors.white.withValues(alpha: 0.06),
        fontFamily: 'Courier New',
      ),
      codeblockDecoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
      ),
      h2Padding: const EdgeInsets.only(top: 14, bottom: 6),
      pPadding: const EdgeInsets.only(bottom: 4),
      listIndent: 16,
    );
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  Future<void> _onSave() async {
    final ok = await ref.read(memoryProvider.notifier).saveMemory(_editCtrl.text);
    if (!mounted) return;
    if (ok) {
      setState(() => _isEditing = false);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Save failed, please try again')),
      );
    }
  }

  // ── Build ────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final memory = ref.watch(memoryProvider);

    // Sync controller when content arrives from server (not while user is editing)
    ref.listen<MemoryState>(memoryProvider, (prev, next) {
      if (!_isEditing && next.data.content.isNotEmpty && prev?.data.content != next.data.content) {
        _editCtrl.text = next.data.content;
      }
    });

    final lastUpdated = memory.data.lastModified != null
        ? 'Last updated: ${_formatDate(memory.data.lastModified!)}'
        : 'Last updated: Feb 3, 2026';

    return Scaffold(
      backgroundColor: const Color(0xFF0A0A0A),
      body: Column(
        children: [
          SafeArea(
            bottom: false,
            child: _buildHeader(context, memory),
          ),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.only(bottom: 40),
              child: Column(
                children: [
                  const SizedBox(height: 8),
                  _buildOverviewCard(),
                  const SizedBox(height: 16),
                  _buildMemoryContent(memory),
                  const SizedBox(height: 16),
                  Text(
                    lastUpdated,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.15),
                      fontSize: 10,
                      fontFamily: 'Courier New',
                      letterSpacing: 1.2,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Header ───────────────────────────────────────────────────────────────────

  Widget _buildHeader(BuildContext context, MemoryState memory) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Stack(
        alignment: Alignment.center,
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: GestureDetector(
              onTap: () {
                if (_isEditing) {
                  setState(() => _isEditing = false);
                } else {
                  context.pop();
                }
              },
              child: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.05),
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.08),
                  ),
                ),
                child: Icon(
                  Icons.chevron_left,
                  color: Colors.white.withValues(alpha: 0.6),
                  size: 24,
                ),
              ),
            ),
          ),

          Text(
            _isEditing ? 'Edit Memory' : 'Memory',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 17,
              fontWeight: FontWeight.w600,
            ),
          ),

          if (_isEditing)
            Align(
              alignment: Alignment.centerRight,
              child: GestureDetector(
                onTap: memory.isSaving ? null : _onSave,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
                  decoration: BoxDecoration(
                    color: memory.isSaving ? Colors.white.withValues(alpha: 0.5) : Colors.white,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: memory.isSaving
                      ? const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(
                            strokeWidth: 1.5,
                            valueColor: AlwaysStoppedAnimation(Colors.black54),
                          ),
                        )
                      : const Text(
                          'Save',
                          style: TextStyle(
                            color: Colors.black,
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  // ── Overview Card ─────────────────────────────────────────────────────────────

  Widget _buildOverviewCard() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: SizedBox(
          height: 220,
          child: Stack(
            fit: StackFit.expand,
            children: [
              // Dark gradient background
              Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    stops: [0, 0.3, 0.6, 1],
                    colors: [
                      Color(0xFF1a1535),
                      Color(0xFF15112e),
                      Color(0xFF0e0b20),
                      Color(0xFF080612),
                    ],
                  ),
                ),
              ),

              // Subtle warm image overlay
              Opacity(
                opacity: 0.25,
                child: CachedNetworkImage(
                  imageUrl:
                      'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?q=80&w=800&auto=format&fit=crop',
                  fit: BoxFit.cover,
                  errorWidget: (_, __, ___) => const SizedBox.shrink(),
                ),
              ),

              // Overlay gradient for readability
              Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.black.withValues(alpha: 0.3),
                      Colors.black.withValues(alpha: 0.5),
                    ],
                  ),
                ),
              ),

              // Glass border
              Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.06),
                  ),
                ),
              ),

              // Content
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 36, 24, 28),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      "Your agent's long-term mind.",
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.8),
                        fontSize: 16,
                        fontWeight: FontWeight.w400,
                        height: 1.5,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'This is what your agent will remember\nand follow.',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.8),
                        fontSize: 16,
                        fontWeight: FontWeight.w400,
                        height: 1.5,
                      ),
                    ),
                    const Spacer(),
                    if (!_isEditing)
                      Center(
                        child: GestureDetector(
                          onTap: () {
                            // Sync controller to latest provider content (mirrors edit_memory_page.dart)
                            _editCtrl.text = ref.read(memoryProvider).data.content;
                            setState(() => _isEditing = true);
                          },
                          child: Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.2),
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: Colors.white.withValues(alpha: 0.15),
                              ),
                            ),
                            child: const Icon(
                              Icons.edit_outlined,
                              color: Colors.white,
                              size: 18,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Memory Content ────────────────────────────────────────────────────────────

  Widget _buildMemoryContent(MemoryState memory) {
    // Loading
    if (memory.isLoading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 60),
        child: Center(
          child: CircularProgressIndicator(
            strokeWidth: 1.5,
            valueColor: AlwaysStoppedAnimation(Colors.white24),
          ),
        ),
      );
    }

    // Edit mode — same pattern as edit_memory_page.dart
    if (_isEditing) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Container(
          constraints: const BoxConstraints(minHeight: 320),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.03),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
          ),
          child: TextField(
            controller: _editCtrl,
            maxLines: null,
            textAlignVertical: TextAlignVertical.top,
            style: TextStyle(
              fontSize: 14,
              color: Colors.white.withValues(alpha: 0.7),
              height: 1.6,
            ),
            decoration: InputDecoration(
              contentPadding: const EdgeInsets.all(16),
              border: InputBorder.none,
              hintText: 'Enter your memory content...',
              hintStyle: TextStyle(
                color: Colors.white.withValues(alpha: 0.2),
                fontSize: 14,
              ),
            ),
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.02),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
        ),
        child: memory.data.content.isNotEmpty
            ? MarkdownBody(
                data: memory.data.content,
                selectable: true,
                styleSheet: _buildMarkdownStyleSheet(),
              )
            : const EmptyStateView(
                title: 'No memory yet',
              ),
      ),
    );
  }
}
