import 'package:flutter/material.dart';

import '../../../models/pending_image.dart';

/// Bottom chat input bar for SessionScreen.
///
/// Manages its own plus-menu visibility state.
/// [onSend] is called when the send button is tapped or keyboard submitted.
/// [onCameraOpen] is called when "Open Camera" is selected from the plus menu.
class SessionChatInput extends StatefulWidget {
  final TextEditingController controller;
  final VoidCallback onSend;
  final VoidCallback? onCameraOpen;
  final VoidCallback? onGalleryOpen;
  final VoidCallback? onFocus;
  final List<PendingImage> pickedImages;
  final void Function(int index)? onRemoveImage;

  const SessionChatInput({
    super.key,
    required this.controller,
    required this.onSend,
    this.onCameraOpen,
    this.onGalleryOpen,
    this.onFocus,
    this.pickedImages = const [],
    this.onRemoveImage,
  });

  @override
  State<SessionChatInput> createState() => _SessionChatInputState();
}

class _SessionChatInputState extends State<SessionChatInput> {
  bool _showPlusMenu = false;
  final _plusButtonKey = GlobalKey();
  final _focusNode = FocusNode();
  OverlayEntry? _overlayEntry;

  @override
  void initState() {
    super.initState();
    _focusNode.addListener(() {
      if (_focusNode.hasFocus) widget.onFocus?.call();
    });
  }

  @override
  void dispose() {
    _focusNode.dispose();
    _overlayEntry?.remove();
    _overlayEntry = null;
    super.dispose();
  }

  // ── Overlay menu ────────────────────────────────────────────────────────────

  void _toggleMenu() => _showPlusMenu ? _hideMenu() : _showMenu();

  void _showMenu() {
    final box = _plusButtonKey.currentContext?.findRenderObject() as RenderBox?;
    if (box == null) return;
    final pos = box.localToGlobal(Offset.zero);
    final screenHeight = MediaQuery.of(context).size.height;

    _overlayEntry = OverlayEntry(
      builder: (_) => Stack(
        children: [
          // Tap-outside barrier
          Positioned.fill(
            child: GestureDetector(
              onTap: _hideMenu,
              behavior: HitTestBehavior.opaque,
              child: const SizedBox.expand(),
            ),
          ),
          // Menu positioned above the plus button
          Positioned(
            left: pos.dx,
            bottom: screenHeight - pos.dy + 8,
            child: Material(
              color: Colors.transparent,
              child: _buildMenuContent(),
            ),
          ),
        ],
      ),
    );

    Overlay.of(context).insert(_overlayEntry!);
    setState(() => _showPlusMenu = true);
  }

  void _hideMenu() {
    _overlayEntry?.remove();
    _overlayEntry = null;
    if (mounted) setState(() => _showPlusMenu = false);
  }

  // ── Build ────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return _buildInputBar();
  }

  Widget _buildInputBar() {
    final bottomPad = MediaQuery.of(context).padding.bottom;
    return Container(
      padding: EdgeInsets.fromLTRB(12, 10, 12, 10 + bottomPad),
      decoration: BoxDecoration(
        color: const Color(0xFF0E0E0E).withValues(alpha: 0.95),
        border: Border(top: BorderSide(color: Colors.white.withValues(alpha: 0.04))),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (widget.pickedImages.isNotEmpty) _buildImageStrip(),
          Row(
            children: [
              // Plus button
              GestureDetector(
                key: _plusButtonKey,
                onTap: _toggleMenu,
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: _showPlusMenu ? Colors.white.withValues(alpha: 0.1) : Colors.white.withValues(alpha: 0.04),
                    shape: BoxShape.circle,
                  ),
                  child: AnimatedRotation(
                    turns: _showPlusMenu ? 0.125 : 0,
                    duration: const Duration(milliseconds: 200),
                    child: Icon(
                      Icons.add_rounded,
                      color: _showPlusMenu ? Colors.white.withValues(alpha: 0.8) : Colors.white.withValues(alpha: 0.35),
                      size: 18,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              // Text field
              Expanded(
                child: Container(
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.03),
                    borderRadius: BorderRadius.circular(22),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
                  ),
                  child: TextField(
                    focusNode: _focusNode,
                    controller: widget.controller,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.85),
                      fontSize: 12,
                      letterSpacing: 0.2,
                    ),
                    decoration: InputDecoration(
                      hintText: 'Follow up...',
                      hintStyle: TextStyle(
                        color: Colors.white.withValues(alpha: 0.2),
                        fontSize: 12,
                      ),
                      border: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                      isDense: true,
                    ),
                    onSubmitted: (_) => widget.onSend(),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              // Send button
              ValueListenableBuilder<TextEditingValue>(
                valueListenable: widget.controller,
                builder: (_, val, __) {
                  final hasContent = val.text.trim().isNotEmpty || widget.pickedImages.isNotEmpty;
                  return GestureDetector(
                    onTap: widget.onSend,
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: hasContent ? Colors.white.withValues(alpha: 0.9) : Colors.white.withValues(alpha: 0.04),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        Icons.send_rounded,
                        size: 15,
                        color: hasContent ? Colors.black : Colors.white.withValues(alpha: 0.15),
                      ),
                    ),
                  );
                },
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildImageStrip() {
    return SizedBox(
      height: 68,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.only(left: 44, bottom: 10),
        itemCount: widget.pickedImages.length,
        itemBuilder: (context, i) {
          final pending = widget.pickedImages[i];
          return Container(
            margin: const EdgeInsets.only(right: 8),
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Stack(
                    children: [
                      Image.file(
                        pending.file,
                        width: 54,
                        height: 54,
                        fit: BoxFit.cover,
                      ),
                      if (pending.isUploading)
                        Container(
                          width: 54,
                          height: 54,
                          color: Colors.black.withValues(alpha: 0.4),
                          child: const Center(
                            child: SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ),
                      if (pending.hasError)
                        Container(
                          width: 54,
                          height: 54,
                          color: Colors.red.withValues(alpha: 0.4),
                          child: const Center(
                            child: Icon(Icons.error_outline, color: Colors.white, size: 20),
                          ),
                        ),
                    ],
                  ),
                ),
                Positioned(
                  top: -4,
                  right: -4,
                  child: GestureDetector(
                    onTap: () => widget.onRemoveImage?.call(i),
                    child: Container(
                      width: 18,
                      height: 18,
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.75),
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white.withValues(alpha: 0.2), width: 0.5),
                      ),
                      child: Icon(Icons.close, color: Colors.white.withValues(alpha: 0.9), size: 11),
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildMenuContent() {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF161616),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.6),
            blurRadius: 40,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _menuItem(
            icon: Icons.image_outlined,
            label: 'Upload from Gallery',
            onTap: () {
              _hideMenu();
              widget.onGalleryOpen?.call();
            },
            divider: true,
          ),
          _menuItem(
            icon: Icons.camera_alt_outlined,
            label: 'Open Camera',
            onTap: () {
              _hideMenu();
              widget.onCameraOpen?.call();
            },
            divider: false,
          ),
        ],
      ),
    );
  }

  Widget _menuItem({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
    required bool divider,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          border: divider ? Border(bottom: BorderSide(color: Colors.white.withValues(alpha: 0.04))) : null,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: Colors.white.withValues(alpha: 0.5), size: 15),
            const SizedBox(width: 12),
            Text(
              label,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.7),
                fontSize: 12,
                letterSpacing: 0.3,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
