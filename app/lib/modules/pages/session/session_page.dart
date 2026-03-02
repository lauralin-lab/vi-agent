import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../common/utils/photo_utils.dart';

import '../../../service/session/http/function/file_http_service.dart';
import '../../../service/session/http/function/web_http_service.dart';
import '../../models/pending_image.dart';
import '../../shared/bridge/scroll_bridge.dart';
import '../../shared/bridge/session_bridge.dart';
import '../../shared/collov_webview.dart';
import '../../shared/mixins.dart';
import '../center/provider/thread_provider.dart';
import 'widgets/chat_input.dart';

// ─── Mock data ────────────────────────────────────────────────────────────────

const _fallbackTitle = 'Mango Analysis';
const _fallbackIntention =
    'Analyze full nutrition facts, calorie breakdown, and sugar content for this plate of mango. Then compare with daily recommended intake and suggest where to buy similar quality.';

const _mockImages = [
  'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1571945153237-4929e783af4a?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1525562723836-dca67a71d5f1?q=80&w=800&auto=format&fit=crop',
];

// ─── Main Widget ──────────────────────────────────────────────────────────────

class SessionPage extends ConsumerStatefulWidget {
  final String sessionKey;
  final String? prompt;
  final List<String> imageUrls;

  const SessionPage({
    super.key,
    required this.sessionKey,
    this.prompt,
    this.imageUrls = const [],
  });

  @override
  ConsumerState<SessionPage> createState() => _SessionPageState();
}

class _SessionPageState extends ConsumerState<SessionPage> with TimerMixin {
  // Gallery
  int _activeImageIndex = 0;
  bool _scrolledDown = false;
  final _pageCtrl = PageController();

  // Chat input
  final _chatCtrl = TextEditingController();
  final List<PendingImage> _pendingImages = [];

  // WebView
  final _webCtrl = CollovWebViewController();

  // Bridges
  late final ScrollBridge _scrollBridge;
  late final SessionBridge _sessionBridge;

  // web http service
  final _webHttpService = const WebHttpService();

  // 导航栏高度 (padding top 12 + icon 36 + padding bottom 8)
  static const double _headerHeight = 56;

  // 是否已自动发送过初始消息
  bool _hasSentInitial = false;

  // 初始图片上传: 本地路径 -> workspace path (null 表示上传失败)
  final Map<String, String?> _uploadedPaths = {};
  bool _isUploadingInitialImages = false;
  bool _webReady = false;

  List<String> get _images {
    if (widget.imageUrls.isNotEmpty) return widget.imageUrls;
    final session = ref.read(threadListProvider.notifier).getThreadSessionByKey(widget.sessionKey);
    if (session != null && session.files.isNotEmpty) {
      // session.files 存的是服务端路径（如 /uploads/xxx.jpg），需要转成完整 URL
      return session.files
          .map((f) => FileHttpService.instance.buildWorkspaceUrl(f))
          .toList();
    }
    return _mockImages;
  }

  @override
  void initState() {
    super.initState();

    _scrollBridge = ScrollBridge(
      onScrollChanged: (scrolled) {
        if (scrolled != _scrolledDown) setState(() => _scrolledDown = scrolled);
      },
    );

    _sessionBridge = SessionBridge();
    _sessionBridge.attach(_webCtrl);
  }

  /// 上传 widget.imageUrls 中的本地文件，完成后尝试发送初始消息
  Future<void> _uploadInitialImages() async {
    _isUploadingInitialImages = true;

    await Future.wait(widget.imageUrls.map((localPath) async {
      try {
        final result = await FileHttpService.instance.uploadFile(File(localPath));
        _uploadedPaths[localPath] = (result.success && result.path != null) ? result.path : null;
      } catch (_) {
        _uploadedPaths[localPath] = null;
      }
    }));

    if (!mounted) return;
    setState(() => _isUploadingInitialImages = false);
    _trySendInitialMessage();
  }

  @override
  void dispose() {
    _sessionBridge.detach();
    _chatCtrl.dispose();
    _pageCtrl.dispose();
    super.dispose();
  }

  void _handleSend() {
    final text = _chatCtrl.text.trim();
    if (text.isEmpty && _pendingImages.isEmpty) return;

    // 收集上传成功的图片路径，拼成 [file:path] 标签
    final fileTags = _pendingImages
        .where((p) => p.workspacePath != null)
        .map((p) => '[file:${p.workspacePath}]')
        .toList();

    // 图片标签放在消息最前面
    final finalMessage = fileTags.isNotEmpty ? '${fileTags.join('\n')}\n$text' : text;

    _sessionBridge.dispatchMessage(finalMessage);

    setState(() {
      _chatCtrl.clear();
      _pendingImages.clear();
    });
  }

  Future<void> _pickImage() async {
    final result = await PhotoUtils().pickerPhoto(context);
    if (result != null && mounted) {
      final pending = PendingImage(file: result.file, isUploading: true);
      setState(() => _pendingImages.add(pending));

      // 立即调用上传
      final uploadResult = await FileHttpService.instance.uploadFile(result.file);
      if (mounted) {
        setState(() {
          if (uploadResult.success && uploadResult.path != null) {
            pending.workspacePath = uploadResult.path;
            pending.isUploading = false;
          } else {
            pending.error = uploadResult.error ?? 'Upload failed';
            pending.isUploading = false;
          }
        });
      }
    }
  }

  void _handleGallery() => _pickImage();

  void _handleCamera() => _pickImage();

  /// sessionKey 用于 SSE 连接
  String get _sessionKey => widget.sessionKey;

  /// 注入 --viewport-height CSS 变量到 WebView
  void _injectViewportHeight() {
    final screenHeight = MediaQuery.of(context).size.height;
    final safeTop = MediaQuery.of(context).padding.top;
    final viewportHeight = screenHeight - safeTop - _headerHeight;
    _webCtrl.runJavaScript(
      'document.documentElement.style.setProperty("--viewport-height", "${viewportHeight}px")',
    );
  }

  /// WebView 加载完成后标记就绪，尝试发送初始消息
  void _onPageReady(String url) {
    _injectViewportHeight();
    _webReady = true;
    _trySendInitialMessage();
  }

  /// 当 WebView 就绪后，先上传图片再发送初始消息
  Future<void> _trySendInitialMessage() async {
    if (_hasSentInitial || !_webReady) return;
    _hasSentInitial = true;

    final prompt = widget.prompt;
    if ((prompt == null || prompt.trim().isEmpty) && widget.imageUrls.isEmpty) return;

    // 先上传本地图片
    if (widget.imageUrls.isNotEmpty && _uploadedPaths.isEmpty) {
      await _uploadInitialImages();
    }

    // 用上传后的 workspace path 拼接 [file:] 标签
    final fileTags = _uploadedPaths.values
        .where((p) => p != null)
        .map((p) => '[file:$p]')
        .toList();

    final text = prompt ?? '';
    final message = fileTags.isNotEmpty ? '${fileTags.join('\n')}\n$text' : text;

    _sessionBridge.dispatchMessage(message);
  }

  // ─── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(threadListProvider.notifier).getThreadSessionByKey(widget.sessionKey);
    final title = session?.title ?? _fallbackTitle;

    return Scaffold(
      backgroundColor: const Color(0xFF0A0A0A),
      resizeToAvoidBottomInset: true,
      body: Column(
        children: [
          SafeArea(
            bottom: false,
            child: _buildHeader(context, title),
          ),
          _buildImageGallery(),
          Expanded(
            child: CollovWebView(
              controller: _webCtrl,
              url: _webHttpService.getContentStreamUrl(sessionKey: _sessionKey),
              enableZoom: false,
              errorWidgetBuilder: _buildErrorWidget,
              onPageFinished: _onPageReady,
              channels: [
                ..._scrollBridge.channels,
                ..._sessionBridge.channels,
              ],
            ),
          ),
          // Chat input at bottom, not overlapping webview
          SessionChatInput(
            controller: _chatCtrl,
            onSend: _handleSend,
            onGalleryOpen: _handleGallery,
            onCameraOpen: _handleCamera,
            onFocus: _sessionBridge.scrollToBottom,
            pickedImages: _pendingImages,
            onRemoveImage: (i) => setState(() => _pendingImages.removeAt(i)),
          ),
        ],
      ),
    );
  }

  // ─── Error Widget ──────────────────────────────────────────────────────────

  Widget _buildErrorWidget(VoidCallback onRetry) {
    return Container(
      color: const Color(0xFF0A0A0A),
      padding: const EdgeInsets.symmetric(horizontal: 40),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.04),
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
              ),
              child: Icon(
                Icons.cloud_off_outlined,
                color: Colors.white.withValues(alpha: 0.2),
                size: 28,
              ),
            ),
            const SizedBox(height: 24),
            Text(
              'Connection Lost',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.85),
                fontSize: 16,
                fontWeight: FontWeight.w600,
                letterSpacing: 0.3,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'We encountered a problem loading the session view. Please check your network and try again.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.45),
                fontSize: 13,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 32),
            GestureDetector(
              onTap: onRetry,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.refresh_rounded,
                      color: Colors.white.withValues(alpha: 0.85),
                      size: 16,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'Retry Now',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.85),
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ─── Header ────────────────────────────────────────────────────────────────

  Widget _buildHeader(BuildContext context, String title) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
      child: Stack(
        alignment: Alignment.center,
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: GestureDetector(
              onTap: () => context.pop(),
              child: Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.04),
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
                ),
                child: Icon(
                  Icons.chevron_left,
                  color: Colors.white.withValues(alpha: 0.7),
                  size: 20,
                ),
              ),
            ),
          ),
          Text(
            title,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.85),
              fontSize: 14,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.3,
            ),
          ),
        ],
      ),
    );
  }

  /// 根据路径类型构建图片 Widget（本地文件 or 网络 URL）
  Widget _buildImage(String path, {BoxFit fit = BoxFit.cover, Color? color, BlendMode? colorBlendMode}) {
    if (path.startsWith('/') || path.startsWith('file://')) {
      return Image.file(
        File(path.replaceFirst('file://', '')),
        fit: fit,
        color: color,
        colorBlendMode: colorBlendMode,
        errorBuilder: (_, __, ___) => Container(
          color: const Color(0xFF111111),
          child: Center(
            child: Icon(Icons.image_outlined, color: Colors.white.withValues(alpha: 0.2), size: 40),
          ),
        ),
      );
    }
    return CachedNetworkImage(
      imageUrl: path,
      httpHeaders: FileHttpService.instance.authHeaders,
      fit: fit,
      color: color,
      colorBlendMode: colorBlendMode,
      placeholder: (_, __) => Container(color: const Color(0xFF111111)),
      errorWidget: (_, __, ___) => Container(
        color: const Color(0xFF111111),
        child: Center(
          child: Icon(Icons.image_outlined, color: Colors.white.withValues(alpha: 0.2), size: 40),
        ),
      ),
    );
  }

  // ─── Image Gallery (collapsible) ───────────────────────────────────────────

  Widget _buildImageGallery() {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 500),
      curve: Curves.easeOut,
      height: _scrolledDown ? 56 : 240,
      width: double.infinity,
      child: Stack(
        children: [
          // Full gallery
          AnimatedOpacity(
            duration: const Duration(milliseconds: 500),
            opacity: _scrolledDown ? 0 : 1,
            child: IgnorePointer(
              ignoring: _scrolledDown,
              child: Stack(
                children: [
                  PageView.builder(
                    controller: _pageCtrl,
                    itemCount: _images.length,
                    onPageChanged: (i) => setState(() => _activeImageIndex = i),
                    itemBuilder: (_, i) => Stack(
                      fit: StackFit.expand,
                      children: [
                        _buildImage(_images[i]),
                        Container(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [
                                Colors.black.withValues(alpha: 0.2),
                                Colors.transparent,
                                Colors.black.withValues(alpha: 0.3),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  // Dots
                  Positioned(
                    bottom: 10,
                    left: 0,
                    right: 0,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: List.generate(_images.length, (i) {
                        final active = i == _activeImageIndex;
                        return AnimatedContainer(
                          duration: const Duration(milliseconds: 300),
                          width: active ? 16 : 6,
                          height: 6,
                          margin: const EdgeInsets.symmetric(horizontal: 3),
                          decoration: BoxDecoration(
                            color: active ? Colors.white.withValues(alpha: 0.8) : Colors.white.withValues(alpha: 0.25),
                            borderRadius: BorderRadius.circular(3),
                          ),
                        );
                      }),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Collapsed thumbnail strip
          AnimatedOpacity(
            duration: const Duration(milliseconds: 500),
            opacity: _scrolledDown ? 1 : 0,
            child: IgnorePointer(
              ignoring: !_scrolledDown,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Row(
                  children: [
                    ..._images.map(
                      (url) => Container(
                        width: 40,
                        height: 40,
                        margin: const EdgeInsets.only(right: 6),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: _buildImage(
                            url,
                            color: Colors.white.withValues(alpha: 0.7),
                            colorBlendMode: BlendMode.modulate,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      '${_images.length} items',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.2),
                        fontSize: 9,
                        fontFamily: 'Courier New',
                        letterSpacing: 1.2,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
