import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Sparkles, Loader2, Mic, MicOff,
  X, Maximize2, ChevronDown, ChevronUp, Plus, ArrowUp,
  Camera, ImagePlus as ImageIcon, MessageCircle
} from 'lucide-react';
import { api } from '../services/api';
import useSound from '../hooks/useSound';
import { getShortTitle } from '../utils/text';
import PersistentHtmlRenderer from './PersistentHtmlRenderer';
import ModuleRenderer, { extractModuleTitle } from './modules/ModuleRenderer';
import { IFRAME_DESIGN_CSS } from './iframeDesignSystem';

// ═══════════════════════════════════════════════════════════
// Canvas-First Session View
//
// Design principles:
//   1. Canvas zone dominates — HTML artifacts are the hero content
//   2. Conversation is transient — floating pill, not inline clutter
//   3. Actions are prominent — agent-driven bar above input
//   4. Progress is subtle — hidden for quick results, minimal for slow ones
// ═══════════════════════════════════════════════════════════

// ── Toast Component ──
function Toast({ message, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2000); return () => clearTimeout(t); }, [onDone]);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[9999] px-5 py-2.5 rounded-full font-medium shadow-lg"
      style={{ fontSize: 'var(--text-sm)', background: '#000', color: '#fff', willChange: 'transform, opacity' }}
    >
      {message}
    </motion.div>
  );
}

// ── Default spinner HTML for reserved gateway blocks ──
const GATEWAY_SPINNER_HTML = '<div style="display:flex;align-items:center;gap:8px;padding:16px;color:rgba(255,255,255,0.5);font-family:system-ui,sans-serif;font-size:14px;"><div style="width:16px;height:16px;border:2px solid rgba(255,255,255,0.15);border-top-color:rgba(168,85,247,0.7);border-radius:50%;animation:spin 0.8s linear infinite;"></div> Preparing...</div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>';

// ── ICS download helper ──
function downloadICS({ title, start, location, end }) {
  const dtStart = (start || '').replace(/[-:]/g, '').replace('T', 'T');
  const dtEnd = end ? end.replace(/[-:]/g, '').replace('T', 'T') : '';
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
    `DTSTART:${dtStart}`,
    dtEnd ? `DTEND:${dtEnd}` : '',
    `SUMMARY:${title || 'Event'}`,
    location ? `LOCATION:${location}` : '',
    'END:VEVENT', 'END:VCALENDAR'
  ].filter(Boolean).join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(title || 'event').replace(/\s+/g, '_')}.ics`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── File download helper ──
function triggerDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  a.target = '_blank';
  a.click();
}

// ── Extract title/summary from HTML content ──
function extractFromHtml(html) {
  if (!html) return { title: 'Result', summary: '' };
  // Strip spinner/error HTML
  if (html.includes('animation:spin') || html.length < 60) return { title: 'Loading...', summary: '' };
  // Try heading tags
  const hMatch = html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
  const title = hMatch ? hMatch[1].replace(/<[^>]+>/g, '').trim() : null;
  // Try first paragraph
  const pMatch = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const summary = pMatch ? pMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 120) : '';
  if (title) return { title: title.slice(0, 60), summary };
  // Fallback: stripped text
  const stripped = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return { title: stripped.slice(0, 50) || 'Result', summary: '' };
}


// ═══════════════════════════════════════════════════════════
// Block Renderers (Canvas Zone)
// ═══════════════════════════════════════════════════════════

// ── StaticHtmlBlock: completed block rendered as a plain iframe ──
function StaticHtmlBlock({ block, onAction }) {
  const iframeRef = useRef(null);
  const [iframeHeight, setIframeHeight] = useState(300);

  const bridgeScript = `
<script>
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.preventDefault();
    var action = btn.dataset.action;
    var payload = { type: 'vi_action', action: action };
    for (var key in btn.dataset) {
      if (key !== 'action') payload[key] = btn.dataset[key];
    }
    parent.postMessage(payload, '*');
    var original = btn.innerHTML;
    btn.innerHTML = '\\u2713';
    btn.style.opacity = '0.7';
    setTimeout(function() { btn.innerHTML = original; btn.style.opacity = '1'; }, 1500);
  });
  var ro = new ResizeObserver(function() {
    parent.postMessage({ type: 'vi_resize', height: document.documentElement.scrollHeight }, '*');
  });
  ro.observe(document.documentElement);
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'vi_toggle' && e.data.target) {
      var el = document.getElementById(e.data.target);
      if (el) el.classList.toggle('hidden');
    }
  });
<\/script>`;

  const wrappedHtml = useMemo(() => {
    if (!block.content) return '';
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"><\/script>
  <style>${IFRAME_DESIGN_CSS}</style>
  ${bridgeScript}
</head>
<body>${block.content}</body>
</html>`;
  }, [block.content]);

  useEffect(() => {
    const handler = (e) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (e.data?.type === 'vi_resize') {
        setIframeHeight(Math.min(Math.max(e.data.height + 16, 100), 800));
      }
      if (e.data?.type === 'vi_action') {
        onAction?.(e.data);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onAction]);

  return (
    <div className="rounded-xl overflow-hidden relative">
      <iframe
        ref={iframeRef}
        srcDoc={wrappedHtml}
        className="w-full bg-transparent"
        style={{ height: `${iframeHeight}px`, border: 'none' }}
        sandbox="allow-scripts allow-popups"
        title="Agent content"
      />
    </div>
  );
}

// ── ActiveHtmlBlock: streaming block using PersistentHtmlRenderer ──
function ActiveHtmlBlock({ block, onAction, streamingChunks }) {
  const isStreaming = block.status !== 'done';

  return (
    <div className="rounded-xl overflow-hidden relative">
      {isStreaming && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/5 overflow-hidden z-10">
          <motion.div
            className="h-full bg-gradient-to-r from-purple-500 to-blue-500"
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: [0.4, 0, 0.2, 1] }}
            style={{ width: '40%', willChange: 'transform' }}
          />
        </div>
      )}
      <PersistentHtmlRenderer
        streamingChunks={streamingChunks}
        isStreaming={isStreaming}
        onAction={onAction}
      />
    </div>
  );
}

// ── HtmlBlock: dispatcher ──
function HtmlBlock({ block, onAction, isActive, streamingChunks, isPlaceholder }) {
  if (isPlaceholder) {
    return (
      <div className="px-3 py-2" style={{ borderRadius: 16, background: '#fff', border: '1px solid rgba(0,0,0,0.04)' }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'rgba(0,0,0,0.2)' }}>Content rendered earlier</span>
      </div>
    );
  }
  if (isActive && streamingChunks) {
    return <ActiveHtmlBlock block={block} onAction={onAction} streamingChunks={streamingChunks} />;
  }
  return <StaticHtmlBlock block={block} onAction={onAction} />;
}

// ── ImageBlock ──
function ImageBlock({ block }) {
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="relative rounded-xl overflow-hidden border border-white/10 cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      {!loaded && (
        <div className="w-full h-48 bg-white/5 animate-pulse flex items-center justify-center">
          <Loader2 size={20} className="text-white/20 animate-spin" />
        </div>
      )}
      <img
        src={block.content}
        alt=""
        className={`w-full object-cover transition-all duration-300 ${loaded ? '' : 'h-0'} ${expanded ? 'max-h-[80vh]' : 'max-h-64'}`}
        onLoad={() => setLoaded(true)}
      />
      {loaded && !expanded && (
        <button className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 backdrop-blur-sm text-white/70 hover:text-white transition-colors">
          <Maximize2 size={12} />
        </button>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// Canvas Card — wrapper for artifacts with collapse/expand
// ═══════════════════════════════════════════════════════════

function CanvasCard({ block, expanded, onToggle, onAction, isActive, streamingChunks, isPlaceholder, isLatest }) {
  const isModule = block.type === 'module';
  const { title, summary } = useMemo(() => {
    if (isModule) {
      return { title: extractModuleTitle(block.module_type, block.data), summary: '' };
    }
    return extractFromHtml(block.content);
  }, [block.content, block.type, block.module_type, block.data, isModule]);
  const isDone = block.status === 'done';

  // Collapsed view: title + one-line summary
  if (!expanded && !isLatest) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="mb-2"
        style={{ willChange: 'transform, opacity' }}
      >
        <button
          onClick={onToggle}
          className="w-full text-left px-4 py-3 hover:bg-black/[0.02] transition-colors"
          style={{ borderRadius: 20, background: '#fff', border: '1px solid rgba(0,0,0,0.04)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate" style={{ fontSize: 'var(--text-sm)', color: 'rgba(0,0,0,0.6)' }}>
                {title}
              </p>
              {summary && (
                <p className="truncate mt-0.5" style={{ fontSize: 'var(--text-xs)', color: 'rgba(0,0,0,0.25)' }}>
                  {summary}
                </p>
              )}
            </div>
            <ChevronDown size={14} style={{ color: 'rgba(0,0,0,0.15)' }} className="shrink-0" />
          </div>
        </button>
      </motion.div>
    );
  }

  // Expanded view: full content
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className="mb-3"
      style={{ willChange: 'transform, opacity' }}
    >
      {/* Collapse button for non-latest expanded cards */}
      {!isLatest && isDone && (
        <button
          onClick={onToggle}
          className="flex items-center gap-1 mb-1.5 hover:opacity-70 transition-colors"
          style={{ fontSize: 'var(--text-xs)', color: 'rgba(0,0,0,0.25)' }}
        >
          <ChevronUp size={12} />
          <span>Collapse</span>
        </button>
      )}

      {isModule ? (
        <ModuleRenderer
          module_type={block.module_type}
          data={block.data}
          onAction={onAction}
        />
      ) : block.type === 'image' ? (
        <ImageBlock block={block} />
      ) : (
        <HtmlBlock
          block={block}
          onAction={onAction}
          isActive={isActive}
          streamingChunks={streamingChunks}
          isPlaceholder={isPlaceholder}
        />
      )}
    </motion.div>
  );
}


// ═══════════════════════════════════════════════════════════
// Chat Popups — 弹幕 that auto-dismiss after 3 seconds
// ═══════════════════════════════════════════════════════════

function ChatPopups({ messages }) {
  const [visible, setVisible] = useState([]);
  const prevLenRef = useRef(messages.length);

  useEffect(() => {
    if (messages.length > prevLenRef.current) {
      const newMsgs = messages.slice(prevLenRef.current);
      setVisible((v) => [...v, ...newMsgs.map((m) => m.id)]);
      const ids = newMsgs.map((m) => m.id);
      setTimeout(() => {
        setVisible((v) => v.filter((id) => !ids.includes(id)));
      }, 3000);
    }
    prevLenRef.current = messages.length;
  }, [messages]);

  const shown = messages.filter((m) => visible.includes(m.id));
  if (shown.length === 0) return null;

  return (
    <div className="absolute left-4 right-16 z-10 flex flex-col gap-1.5 pointer-events-none"
      style={{ bottom: 80 }}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {shown.map((msg) => (
          <motion.div
            key={msg.id}
            layout
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className="max-w-[75%] pointer-events-auto"
              style={{
                padding: '8px 14px',
                borderRadius: 16,
                background: msg.role === 'user'
                  ? 'rgba(0,0,0,0.45)'
                  : 'rgba(255,255,255,0.55)',
                backdropFilter: 'blur(40px) saturate(180%)',
                WebkitBackdropFilter: 'blur(40px) saturate(180%)',
                border: msg.role === 'user'
                  ? '1px solid rgba(255,255,255,0.1)'
                  : '1px solid rgba(255,255,255,0.6)',
                boxShadow: msg.role === 'user'
                  ? '0 4px 24px rgba(0,0,0,0.12)'
                  : '0 4px 24px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.4)',
              }}
            >
              <p style={{
                fontSize: 'var(--text-sm)',
                lineHeight: 'var(--leading-normal)',
                color: msg.role === 'user' ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.65)',
                margin: 0,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}>
                {msg.content}
              </p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// Chat Panel — expandable fixed-height conversation history
// ═══════════════════════════════════════════════════════════

function ChatPanel({ messages, open, onClose, scrollRef }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: '35vh', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 35 }}
          className="shrink-0 flex flex-col overflow-hidden"
          style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 shrink-0">
            <div className="flex items-center gap-2">
              <MessageCircle size={13} style={{ color: 'rgba(0,0,0,0.2)' }} />
              <span className="font-medium" style={{ fontSize: 'var(--text-xs)', color: 'rgba(0,0,0,0.3)' }}>
                Conversation
              </span>
              <span style={{ fontSize: 'var(--text-2xs)', color: 'rgba(0,0,0,0.2)' }}>
                {messages.length}
              </span>
            </div>
            <button onClick={onClose} className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.04)' }}>
              <X size={12} style={{ color: 'rgba(0,0,0,0.35)' }} />
            </button>
          </div>

          {/* Scrollable messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-3 space-y-1.5"
            style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className="max-w-[80%]" style={{
                  padding: '6px 12px',
                  borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: msg.role === 'user'
                    ? 'rgba(0,0,0,0.06)'
                    : 'rgba(0,0,0,0.02)',
                  border: msg.role === 'user'
                    ? 'none'
                    : '1px solid rgba(0,0,0,0.04)',
                }}>
                  <p className="font-medium" style={{
                    fontSize: 'var(--text-2xs)',
                    color: msg.role === 'user' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.22)',
                    marginBottom: 1,
                  }}>
                    {msg.role === 'user' ? 'You' : 'Agent'}
                  </p>
                  <p style={{
                    fontSize: 'var(--text-sm)',
                    lineHeight: 'var(--leading-relaxed)',
                    color: msg.role === 'user' ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.55)',
                    margin: 0,
                  }}>
                    {msg.content}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}


// ═══════════════════════════════════════════════════════════
// Action Bar — agent-driven actions above chat input
// ═══════════════════════════════════════════════════════════

function ActionBar({ actionCard, onSelect }) {
  if (!actionCard || !actionCard.options?.length) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
      className="px-4 pb-2"
      style={{ willChange: 'transform, opacity' }}
    >
      {actionCard.title && (
        <p className="mb-1.5 font-medium" style={{ fontSize: 'var(--text-xs)', color: 'rgba(0,0,0,0.3)' }}>
          {actionCard.title}
        </p>
      )}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {actionCard.options.slice(0, 4).map((option, i) => (
          <button
            key={i}
            onClick={() => onSelect(option)}
            className="shrink-0 px-4 py-2 rounded-full hover:opacity-80 transition-all active:scale-95"
            style={{ fontSize: 'var(--text-sm)', background: '#fff', border: '1px solid rgba(0,0,0,0.06)', color: 'rgba(0,0,0,0.6)' }}
          >
            {option}
          </button>
        ))}
      </div>
    </motion.div>
  );
}


// ═══════════════════════════════════════════════════════════
// Progress Pill — delayed appearance for slow operations
// ═══════════════════════════════════════════════════════════

function ProgressPill({ hasCanvasContent, taskProgress, infoBar, sessionTimedOut }) {
  const [showProgress, setShowProgress] = useState(false);
  useEffect(() => {
    if (hasCanvasContent || sessionTimedOut) { setShowProgress(false); return; }
    const timer = setTimeout(() => setShowProgress(true), 4000);
    return () => clearTimeout(timer);
  }, [hasCanvasContent, sessionTimedOut]);
  if (!showProgress) return null;
  const message = taskProgress?.message || infoBar?.message || 'Analyzing...';
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="flex items-center justify-center gap-2.5 py-8"
      style={{ willChange: 'transform, opacity' }}
    >
      <div className="flex items-center gap-2 px-4 py-2 rounded-full" style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.04)' }}>
        <Loader2 size={14} className="animate-spin" style={{ color: 'rgba(0,0,0,0.3)' }} />
        <span className="font-light" style={{ fontSize: 'var(--text-sm)', color: 'rgba(0,0,0,0.35)' }}>
          {message}
        </span>
      </div>
    </motion.div>
  );
}


// ═══════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════

export default function LiveSessionView({ result, photos, intention, onBack, livekit, sessionData, onAddPhoto, sessionCacheRef }) {
  const { play } = useSound();
  const scrollContainerRef = useRef(null);
  const headerRef = useRef(null);
  const chatScrollRef = useRef(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const imageScrollerRef = useRef(null);
  const fromHome = sessionData?.fromHome;
  const cacheKey = sessionData?.sessionId;

  // ── Chat Input ──
  const [chatText, setChatText] = useState('');
  const [chatImages, setChatImages] = useState([]);
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const chatInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // ── Blocks (restored from session cache if available) ──
  const [blocks, setBlocks] = useState(() => {
    if (cacheKey && sessionCacheRef?.current) {
      const cached = sessionCacheRef.current.get(cacheKey);
      if (cached?.blocks) return cached.blocks;
    }
    return [];
  });

  // Ref mirror of blocks for read-only access in effects
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  // ── Canvas card expand/collapse ──
  const [expandedCardIds, setExpandedCardIds] = useState(new Set());

  // ── Streaming chunks for PersistentHtmlRenderer ──
  const streamingChunksRef = useRef(new Map());
  const [streamingChunksVersion, setStreamingChunksVersion] = useState(0);

  // Source priority: vi-gateway > gateway_html_stream > lastResult > sessionRichText
  const activeSourceRef = useRef(null);

  // ── Session timeout detection ──
  const [sessionTimedOut, setSessionTimedOut] = useState(false);
  useEffect(() => {
    if (blocks.length > 0) { setSessionTimedOut(false); return; }
    const timer = setTimeout(() => setSessionTimedOut(true), 60000);
    return () => clearTimeout(timer);
  }, [blocks.length]);

  // Save blocks to session cache on unmount
  useEffect(() => {
    return () => {
      if (cacheKey && sessionCacheRef?.current) {
        const existing = sessionCacheRef.current.get(cacheKey) || {};
        sessionCacheRef.current.set(cacheKey, { ...existing, blocks, _ts: Date.now() });
      }
    };
  }, [blocks, cacheKey]);

  // ── iOS keyboard fix: only keep header pinned when keyboard opens ──
  // On iOS Safari, the keyboard pushes fixed containers up. We counter-
  // transform just the header so it stays visible; content scrolls naturally.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const el = headerRef.current;
      if (!el) return;
      el.style.transform = `translateY(${vv.offsetTop}px)`;
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  // ── Toast ──
  const [toast, setToast] = useState(null);
  const showToast = useCallback((msg) => setToast(msg), []);

  // ── Sticky gallery ──
  const [scrolledDown, setScrolledDown] = useState(false);

  // ── Core: upsertBlock ──
  const upsertBlock = useCallback((incoming) => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === incoming.id);
      if (idx === -1) return [...prev, { ...incoming, _ts: Date.now() }];
      const updated = [...prev];
      updated[idx] = { ...updated[idx], ...incoming, _ts: Date.now() };
      return updated;
    });
  }, []);

  // ── Send message handler ──
  const handleSendMessage = useCallback(async () => {
    const text = chatText.trim();
    const images = chatImages.map(img => img.s3Url).filter(Boolean);
    if (!text && images.length === 0) return;
    play('nav.forward');
    setChatText('');
    setChatImages([]);

    if (text) {
      upsertBlock({
        id: `user_msg_${Date.now()}`,
        type: 'bubble',
        status: 'done',
        content: text,
        role: 'user',
        collapsible: true,
      });
    }

    try {
      const result = await livekit?.sendMessage?.(text, images);
      if (result && typeof result === 'string') {
        try {
          const parsed = JSON.parse(result);
          if (parsed.ok === false) {
            upsertBlock({
              id: `error_${Date.now()}`,
              type: 'bubble',
              status: 'done',
              content: `Failed to send: ${parsed.error || 'Unknown error'}`,
              role: 'system',
            });
          }
        } catch { /* not JSON */ }
      }
    } catch (e) {
      console.error('[Session] Failed to send message:', e);
      upsertBlock({
        id: `error_${Date.now()}`,
        type: 'bubble',
        status: 'done',
        content: 'Message failed to send. Please try again.',
        role: 'system',
      });
    }
  }, [chatText, chatImages, livekit, play, upsertBlock]);

  // ── File select handler ──
  const handleFileSelect = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target.result;
        setChatImages(prev => [...prev, { preview: dataUrl, s3Url: null }]);
        try {
          const s3Url = await api.uploadDataUrl(dataUrl);
          setChatImages(prev => prev.map(img =>
            img.preview === dataUrl ? { ...img, s3Url } : img
          ));
        } catch (err) {
          console.error('[Session] Upload failed:', err);
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  }, []);


  // ══════════════════════════════════════════
  // Listen to livekit state → blocks
  // (All existing data ingestion unchanged)
  // ══════════════════════════════════════════

  // Legacy: last result → html block
  useEffect(() => {
    if (!livekit.lastResult) return;
    if (activeSourceRef.current === 'vi-gateway') return;
    const currentBlocks = blocksRef.current;
    const streamBlock = currentBlocks.find(b => b.id === 'streaming_html');
    if (streamBlock && streamBlock.content) return;
    const hasGatewayDone = currentBlocks.some(b => (b.id.startsWith('gateway_') || b.id.startsWith('gw_')) && b.status === 'done');
    if (hasGatewayDone) return;
    const hasGwBlock = currentBlocks.some(b => b.id.startsWith('gw_'));
    if (hasGwBlock) return;

    upsertBlock({
      id: 'result_main',
      type: 'html',
      status: 'done',
      content: typeof livekit.lastResult.content === 'string'
        ? livekit.lastResult.content
        : `<div style="color:white;font-family:var(--font-primary);padding:8px;">${JSON.stringify(livekit.lastResult)}</div>`,
    });
  }, [livekit.lastResult, upsertBlock]);

  // Legacy: streaming HTML → html block with chunk tracking
  const prevStreamingHtmlLenRef = useRef(0);
  useEffect(() => {
    if (livekit.streamingHtml) {
      if (activeSourceRef.current === 'vi-gateway') return;
      activeSourceRef.current = 'legacy-stream';
      const hasGwBlocks = blocksRef.current.some(b => b.id.startsWith('gw_'));
      if (hasGwBlocks) return;

      const blockId = 'streaming_html';
      const fullContent = livekit.streamingHtml;
      const prevLen = prevStreamingHtmlLenRef.current;

      if (fullContent.length > prevLen) {
        const newChunk = fullContent.slice(prevLen);
        const chunks = streamingChunksRef.current.get(blockId) || [];
        chunks.push(newChunk);
        streamingChunksRef.current.set(blockId, chunks);
        prevStreamingHtmlLenRef.current = fullContent.length;
        setStreamingChunksVersion(v => v + 1);
      }

      if (fullContent.length < prevLen) {
        streamingChunksRef.current.set(blockId, [fullContent]);
        prevStreamingHtmlLenRef.current = fullContent.length;
        setStreamingChunksVersion(v => v + 1);
      }

      upsertBlock({
        id: blockId,
        type: 'html',
        status: livekit.isHtmlStreaming ? 'streaming' : 'done',
        content: fullContent,
      });

      if (!livekit.isHtmlStreaming) {
        prevStreamingHtmlLenRef.current = 0;
      }
    }
  }, [livekit.isHtmlStreaming, livekit.streamingHtml, upsertBlock]);

  // Legacy: streamed text → html block
  useEffect(() => {
    if (livekit.streamedText) {
      // Skip if a higher-priority source (vi-gateway) is active
      if (activeSourceRef.current === 'vi-gateway') return;
      // Skip if gateway blocks already exist (they contain the proper HTML)
      const currentBlocks = blocksRef.current;
      const hasGwBlock = currentBlocks.some(b => b.id.startsWith('gw_'));
      if (hasGwBlock) return;

      upsertBlock({
        id: 'streamed_text',
        type: 'html',
        status: livekit.isTextStreaming ? 'streaming' : 'done',
        content: `<div style="color:white;font-family:var(--font-primary);padding:12px;white-space:pre-wrap;">${livekit.streamedText}</div>`,
      });
    }
  }, [livekit.isTextStreaming, livekit.streamedText, upsertBlock]);

  // Legacy: session plan → bubble blocks
  useEffect(() => {
    if (livekit.sessionPlan && livekit.sessionPlan.length > 0) {
      livekit.sessionPlan.forEach((step, i) => {
        upsertBlock({
          id: `plan_${step.id || i}`,
          type: 'bubble',
          status: 'done',
          content: `${step.emoji || '\u{1F4CB}'} ${step.text}`,
          collapsible: true,
        });
      });
    }
  }, [livekit.sessionPlan, upsertBlock]);

  // Legacy: session rich text → html block
  useEffect(() => {
    if (!livekit.sessionRichText) return;
    if (activeSourceRef.current) return;
    const currentBlocks = blocksRef.current;
    const streamBlock = currentBlocks.find(b => b.id === 'streaming_html');
    if (streamBlock && streamBlock.content) return;
    const hasGatewayDone = currentBlocks.some(b => (b.id.startsWith('gateway_') || b.id.startsWith('gw_')) && b.status === 'done');
    if (hasGatewayDone) return;
    const hasGwBlock = currentBlocks.some(b => b.id.startsWith('gw_'));
    if (hasGwBlock) return;

    upsertBlock({
      id: 'rich_text_summary',
      type: 'html',
      status: 'done',
      content: `<div style="color:white;font-family:var(--font-primary);padding:12px;">${livekit.sessionRichText}</div>`,
    });
  }, [livekit.sessionRichText, upsertBlock]);

  // Gateway block lifecycle — legacy single block
  useEffect(() => {
    if (!livekit.gatewayBlock) return;
    if (activeSourceRef.current === 'vi-gateway') return;
    const { id, status, html } = livekit.gatewayBlock;
    const blockId = `gateway_${id}`;

    if (status === 'reserved') {
      upsertBlock({ id: blockId, type: 'html', status: 'loading', content: html || GATEWAY_SPINNER_HTML });
    } else if (status === 'loading') {
      upsertBlock({ id: blockId, type: 'html', status: 'loading', content: html || GATEWAY_SPINNER_HTML });
    } else if (status === 'done') {
      upsertBlock({ id: blockId, type: 'html', status: 'done', content: html });
    }
  }, [livekit.gatewayBlock, upsertBlock]);

  // vi-gateway DataChannel: per-session gateway blocks
  const prevGatewayBlocksRef = useRef(new Map());
  const prevGatewayContentLenRef = useRef(new Map());
  useEffect(() => {
    if (!livekit.gatewayBlocks || livekit.gatewayBlocks.size === 0) return;

    activeSourceRef.current = 'vi-gateway';
    let chunksChanged = false;

    for (const [sessionId, block] of livekit.gatewayBlocks) {
      const prev = prevGatewayBlocksRef.current.get(sessionId);
      if (prev && prev._ts === block._ts) continue;

      const blockId = `gw_${sessionId}`;

      if (block.status === 'loading') {
        upsertBlock({
          id: blockId,
          type: 'html',
          status: 'loading',
          content: block.content || GATEWAY_SPINNER_HTML,
          source: 'vi-gateway',
        });
        if (!streamingChunksRef.current.has(blockId)) {
          streamingChunksRef.current.set(blockId, []);
          prevGatewayContentLenRef.current.set(blockId, 0);
        }
      } else if (block.status === 'streaming') {
        const prevLen = prevGatewayContentLenRef.current.get(blockId) || 0;
        const fullContent = block.content || '';
        if (fullContent.length > prevLen) {
          const newChunk = fullContent.slice(prevLen);
          const chunks = streamingChunksRef.current.get(blockId) || [];
          chunks.push(newChunk);
          streamingChunksRef.current.set(blockId, chunks);
          prevGatewayContentLenRef.current.set(blockId, fullContent.length);
          chunksChanged = true;
        }
        upsertBlock({
          id: blockId,
          type: 'html',
          status: 'streaming',
          content: block.content,
          source: 'vi-gateway',
        });
      } else if (block.status === 'done') {
        const prevLen = prevGatewayContentLenRef.current.get(blockId) || 0;
        const fullContent = block.content || '';
        if (fullContent.length > prevLen) {
          const newChunk = fullContent.slice(prevLen);
          const chunks = streamingChunksRef.current.get(blockId) || [];
          chunks.push(newChunk);
          streamingChunksRef.current.set(blockId, chunks);
          chunksChanged = true;
        }
        prevGatewayContentLenRef.current.delete(blockId);
        upsertBlock({
          id: blockId,
          type: 'html',
          status: 'done',
          content: block.content,
          source: 'vi-gateway',
        });
      } else if (block.status === 'error') {
        streamingChunksRef.current.delete(blockId);
        prevGatewayContentLenRef.current.delete(blockId);
        upsertBlock({
          id: blockId,
          type: 'html',
          status: 'done',
          content: `<div style="color:#f87171;font-family:system-ui;padding:16px;border:1px solid rgba(248,113,113,0.3);border-radius:12px;background:rgba(248,113,113,0.05);">${block.error || 'Session failed'}</div>`,
          source: 'vi-gateway',
        });
      }
    }

    prevGatewayBlocksRef.current = new Map(livekit.gatewayBlocks);
    if (chunksChanged) {
      setStreamingChunksVersion(v => v + 1);
    }
  }, [livekit.gatewayBlocks, upsertBlock]);

  // Legacy: agent text → bubble (deduplicate by content)
  const lastAgentBubbleRef = useRef('');
  const recentBubblesRef = useRef(new Set());
  useEffect(() => {
    if (livekit.lastAgentText && livekit.lastAgentText !== lastAgentBubbleRef.current) {
      if (recentBubblesRef.current.has(livekit.lastAgentText)) return;
      lastAgentBubbleRef.current = livekit.lastAgentText;
      recentBubblesRef.current.add(livekit.lastAgentText);
      if (recentBubblesRef.current.size > 50) {
        const first = recentBubblesRef.current.values().next().value;
        recentBubblesRef.current.delete(first);
      }
      upsertBlock({
        id: `bubble_${Date.now()}`,
        type: 'bubble',
        status: 'done',
        content: livekit.lastAgentText,
        role: 'agent',
        collapsible: true,
      });
    }
  }, [livekit.lastAgentText, upsertBlock]);

  // User speech transcripts → bubble blocks (deduplicate by content)
  const prevTranscriptCountRef = useRef(0);
  const recentUserBubblesRef = useRef(new Set());
  useEffect(() => {
    const transcripts = livekit.transcripts || [];
    if (transcripts.length <= prevTranscriptCountRef.current) {
      prevTranscriptCountRef.current = transcripts.length;
      return;
    }
    // Process only new entries
    const newEntries = transcripts.slice(prevTranscriptCountRef.current);
    prevTranscriptCountRef.current = transcripts.length;

    for (const entry of newEntries) {
      if (entry.type !== 'user') continue; // agent transcripts already handled by lastAgentText
      if (!entry.content) continue;
      if (recentUserBubblesRef.current.has(entry.content)) continue;
      // Also skip if the same text was already typed by user (handleSendMessage)
      if (recentBubblesRef.current.has(entry.content)) continue;

      recentUserBubblesRef.current.add(entry.content);
      if (recentUserBubblesRef.current.size > 50) {
        const first = recentUserBubblesRef.current.values().next().value;
        recentUserBubblesRef.current.delete(first);
      }

      upsertBlock({
        id: `user_speech_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'bubble',
        status: 'done',
        content: entry.content,
        role: 'user',
        collapsible: true,
      });
    }
  }, [livekit.transcripts, upsertBlock]);

  // ── Initial result from Home navigation ──
  useEffect(() => {
    if (!fromHome) return;

    // If blocks were restored from session cache, skip reconstruction —
    // the cached blocks already contain the correct live-session content.
    const initialBlocks = blocksRef.current;
    if (initialBlocks.length > 0) return;

    // Reconstruct conversation timeline from persisted data.
    // Only include user and agent messages; skip gateway entries since
    // their content is already in the HTML result block (canvas card).
    const timeline = sessionData?.timeline || [];
    if (timeline.length > 0) {
      timeline
        .sort((a, b) => (a.ts || 0) - (b.ts || 0))
        .forEach((entry, i) => {
          // Skip gateway responses — they duplicate the HTML canvas content
          if (entry.type === 'gateway') return;
          const role = entry.type === 'user' ? 'user' : 'agent';
          upsertBlock({
            id: `tl_${i}`,
            type: 'bubble',
            status: 'done',
            content: entry.content,
            role,
            collapsible: true,
          });
        });
    }

    // Add the final HTML result artifact
    if (sessionData?.result_html) {
      upsertBlock({ id: 'home_result', type: 'html', status: 'done', content: sessionData.result_html });
      return;
    }

    // Fallback: Use result object (structured result with content)
    const r = sessionData?.result;
    if (r) {
      if (r.type === 'html' && r.content) {
        upsertBlock({ id: 'home_result', type: 'html', status: 'done', content: r.content });
      } else if (typeof r === 'string') {
        upsertBlock({ id: 'home_result', type: 'html', status: 'done', content: `<div style="color:white;font-family:var(--font-primary);padding:12px;white-space:pre-wrap;">${r}</div>` });
      } else if (r.content || r.raw || r.summary) {
        const text = r.content || r.raw || r.summary || JSON.stringify(r);
        upsertBlock({ id: 'home_result', type: 'html', status: 'done', content: `<div style="color:white;font-family:var(--font-primary);padding:12px;white-space:pre-wrap;">${text}</div>` });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Action Runtime ──
  const handleAction = useCallback((data) => {
    const { action, ...payload } = data;
    switch (action) {
      case 'open_url':
        window.open(payload.url, '_blank');
        showToast('Opening...');
        break;
      case 'copy_text':
        navigator.clipboard.writeText(payload.text).catch(e => console.warn('[clipboard] Copy failed:', e.message));
        showToast('Copied');
        break;
      case 'add_calendar':
        downloadICS(payload);
        showToast('Calendar event added');
        break;
      case 'download_file':
        triggerDownload(payload.url, payload.filename);
        showToast('Downloading...');
        break;
      case 'share':
        if (navigator.share) {
          navigator.share({ title: payload.title, text: payload.text, url: payload.url }).catch(() => {
            navigator.clipboard.writeText(payload.text || payload.url || '');
            showToast('Copied');
          });
        } else {
          navigator.clipboard.writeText(payload.text || payload.url || '');
          showToast('Copied');
        }
        break;
      case 'deep_link':
        window.location.href = payload.href;
        break;
      case 'toggle':
        break;
      default:
        showToast('Done');
    }
  }, [showToast]);

  // ── Action card handler ──
  const handleActionSelect = useCallback((option) => {
    livekit?.sendMessage?.(option);
  }, [livekit]);

  // ── Scroll handling ──
  const handleContentScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      const st = scrollContainerRef.current.scrollTop;
      // Hysteresis: enter scrolled at >30, exit only near top (<5)
      // Prevents gallery height oscillation feedback loop
      setScrolledDown(prev => prev ? st >= 5 : st > 30);
    }
  }, []);

  const handleImageScroll = () => {
    if (imageScrollerRef.current) {
      const scrollLeft = imageScrollerRef.current.scrollLeft;
      const width = imageScrollerRef.current.offsetWidth;
      setActiveImageIndex(Math.round(scrollLeft / width));
    }
  };

  // ── Toggle canvas card expand/collapse ──
  const toggleCardExpanded = useCallback((id) => {
    setExpandedCardIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Photo gallery data ──
  const allPhotos = photos?.length ? photos : (fromHome && sessionData?.photos?.length ? sessionData.photos : []);
  const images = allPhotos.map((p, i) => ({
    type: p.type || 'photo',
    src: typeof p === 'string' ? p : (p.s3Url || p.src),
    label: `Capture ${i + 1}`,
  }));

  // ── Split blocks into canvas vs conversation ──
  const canvasBlocks = useMemo(() => {
    const all = blocks.filter(b => b.type === 'html' || b.type === 'image' || b.type === 'module');
    // When proper gateway HTML blocks exist, filter out legacy/fallback text blocks
    // that duplicate the same content as raw text.
    const hasGatewayBlocks = all.some(b => b.id.startsWith('gw_'));
    if (hasGatewayBlocks) {
      const legacyIds = new Set(['streamed_text', 'rich_text_summary', 'home_result']);
      return all.filter(b => !legacyIds.has(b.id));
    }
    return all;
  },
    [blocks]
  );
  const conversationMessages = useMemo(() =>
    blocks.filter(b => b.type === 'bubble'),
    [blocks]
  );
  const hasCanvasContent = canvasBlocks.some(b => b.type === 'module' || b.status !== 'loading' || (b.content && !b.content.includes('animation:spin')));

  // Auto-scroll on new canvas blocks
  useEffect(() => {
    if (scrollContainerRef.current) {
      const el = scrollContainerRef.current;
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
      if (isNearBottom) {
        requestAnimationFrame(() => {
          el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        });
      }
    }
  }, [canvasBlocks]);

  // Auto-scroll conversation pane on new messages
  useEffect(() => {
    if (chatScrollRef.current) {
      requestAnimationFrame(() => {
        chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
      });
    }
  }, [conversationMessages]);


  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  // Compute active HTML block and iframe limits for canvas
  const htmlCanvasBlocks = canvasBlocks.filter(b => b.type === 'html');
  const activeHtmlBlock = htmlCanvasBlocks.find(b => b.status !== 'done') || null;
  const activeBlockId = activeHtmlBlock?.id || null;
  const staticHtmlBlocks = htmlCanvasBlocks.filter(b => b.id !== activeBlockId && b.status === 'done');
  const MAX_STATIC_IFRAMES = 3;
  const staticWithIframes = new Set(
    staticHtmlBlocks.slice(-MAX_STATIC_IFRAMES).map(b => b.id)
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
      className="absolute inset-0 flex flex-col z-50"
      style={{ background: '#fff', willChange: 'transform, opacity' }}
    >
      {/* Header — pinned at top via visualViewport on iOS */}
      <div ref={headerRef} className="safe-area-top w-full flex items-center px-4 pb-2 shrink-0 z-30" style={{ background: '#fff' }}>
        <button
          onClick={() => { play('nav.back'); onBack(); }}
          className="p-2 rounded-full hover:bg-black/[0.04] transition-colors z-10"
          style={{ color: 'rgba(0,0,0,0.4)' }}
        >
          <ChevronLeft size={22} />
        </button>
        <h1 className="absolute left-0 right-0 text-center font-semibold tracking-wide pointer-events-none" style={{ fontSize: 'var(--text-base)', color: '#000' }}>
          {getShortTitle(livekit?.sessionHeader?.title || intention)}
        </h1>
      </div>

      {/* ═══ SCROLLABLE AREA: Photo Gallery + Canvas ═══ */}
      <div
        ref={scrollContainerRef}
        onScroll={handleContentScroll}
        className="flex-1 overflow-y-auto pb-28"
        style={{ overscrollBehavior: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        {/* Photo Gallery — inside scroll area so it scrolls with content */}
        {images.length > 0 && (
          <div className="px-4 pb-3" style={{ zIndex: 5 }}>
            <div
              className="relative overflow-hidden"
              style={{ borderRadius: 24, border: '1px solid rgba(0,0,0,0.04)', background: '#f0f0f0' }}
            >
              {/* Carousel scroller */}
              <div
                ref={imageScrollerRef}
                onScroll={handleImageScroll}
                className="w-full overflow-x-auto no-scrollbar"
                style={{
                  scrollSnapType: 'x mandatory',
                  scrollbarWidth: 'none',
                  WebkitOverflowScrolling: 'touch',
                }}
              >
                <div className="flex" style={{ width: `${images.length * 100}%` }}>
                  {images.map((img, i) => (
                    <div
                      key={i}
                      className="relative"
                      style={{ width: `${100 / images.length}%`, scrollSnapAlign: 'start', aspectRatio: '4/3', background: '#e8e8e8' }}
                    >
                      {/* Skeleton shimmer while image loads */}
                      <div
                        className="absolute inset-0"
                        style={{
                          background: 'linear-gradient(90deg, #e8e8e8 25%, #f5f5f5 50%, #e8e8e8 75%)',
                          backgroundSize: '200% 100%',
                          animation: 'shimmer 1.5s infinite',
                        }}
                      />
                      <img
                        src={img.src}
                        alt=""
                        className="w-full h-full object-cover relative"
                        loading={i === 0 ? 'eager' : 'lazy'}
                        style={{ opacity: 0, transition: 'opacity 0.3s ease' }}
                        onLoad={(e) => { e.target.style.opacity = '1'; }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Photo counter badge */}
              {images.length > 1 && (
                <div
                  className="absolute top-3 right-3 px-2.5 py-1 rounded-full backdrop-blur-sm"
                  style={{ fontSize: 'var(--text-xs)', background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.06)' }}
                >
                  <span className="font-medium" style={{ color: 'rgba(0,0,0,0.7)' }}>{activeImageIndex + 1}</span>
                  <span style={{ color: 'rgba(0,0,0,0.3)' }}> / {images.length}</span>
                </div>
              )}

              {/* Dot indicators */}
              {images.length > 1 && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                  {images.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        imageScrollerRef.current?.scrollTo({
                          left: i * imageScrollerRef.current.offsetWidth,
                          behavior: 'smooth',
                        });
                      }}
                      className={`rounded-full transition-all duration-300 ${i === activeImageIndex
                        ? 'w-6 h-1.5 bg-white/90'
                        : 'w-1.5 h-1.5 bg-white/50 hover:bg-white/70'
                        }`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      {/* ═══ CANVAS ZONE ═══ */}
        <div className="px-5 pt-4">
        {/* Canvas cards: stacked artifacts */}
        <AnimatePresence initial={false}>
          {canvasBlocks.map((block, i) => {
            const isLatest = i === canvasBlocks.length - 1;
            const isExpanded = isLatest || expandedCardIds.has(block.id);
            const isActive = block.type === 'html' && block.id === activeBlockId;
            const isDone = block.type === 'html' && block.status === 'done';
            const isPlaceholder = isDone && !isActive && !staticWithIframes.has(block.id);
            const chunks = isActive ? (streamingChunksRef.current.get(block.id) || []) : null;

            return (
              <CanvasCard
                key={block.id}
                block={block}
                expanded={isExpanded}
                isLatest={isLatest}
                onToggle={() => toggleCardExpanded(block.id)}
                onAction={handleAction}
                isActive={isActive}
                streamingChunks={chunks}
                isPlaceholder={isPlaceholder}
              />
            );
          })}
        </AnimatePresence>

        {/* Progress Pill — delayed appearance */}
        <AnimatePresence>
          <ProgressPill
            hasCanvasContent={hasCanvasContent}
            taskProgress={livekit.taskProgress}
            infoBar={livekit.infoBar}
            sessionTimedOut={sessionTimedOut}
          />
        </AnimatePresence>

        {/* Empty state — no canvas content and timed out */}
        {canvasBlocks.length === 0 && !hasCanvasContent && sessionTimedOut && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ background: 'rgba(255,59,48,0.08)' }}>
              <X size={24} style={{ color: 'rgba(255,59,48,0.5)' }} />
            </div>
            <p className="font-light" style={{ fontSize: 'var(--text-base)', color: 'rgba(255,59,48,0.6)' }}>Connection issue</p>
            <p className="mt-1" style={{ fontSize: 'var(--text-sm)', color: 'rgba(0,0,0,0.2)' }}>Go back and try again</p>
          </div>
        )}

        {/* Empty canvas — waiting state (before progress pill kicks in) */}
        {canvasBlocks.length === 0 && !sessionTimedOut && (
          <div className="flex flex-col items-center justify-center py-20">
            <Sparkles size={28} className="mb-3 animate-pulse" style={{ color: 'rgba(0,0,0,0.15)' }} />
            <p className="font-light" style={{ fontSize: 'var(--text-sm)', color: 'rgba(0,0,0,0.25)' }}>Waiting for results...</p>
          </div>
        )}

        </div>
      </div>

      {/* ═══ CHAT POPUPS — 弹幕 (auto-dismiss after 3s) ═══ */}
      {!chatDrawerOpen && <ChatPopups messages={conversationMessages} />}

      {/* ═══ CHAT BUBBLE BUTTON — opens full conversation ═══ */}
      {!chatDrawerOpen && conversationMessages.length > 0 && (
        <button
          onClick={() => setChatDrawerOpen(true)}
          className="absolute z-20 flex items-center justify-center"
          style={{
            bottom: 80,
            right: 16,
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.06)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(0,0,0,0.06)',
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          }}
        >
          <MessageCircle size={18} style={{ color: 'rgba(0,0,0,0.4)' }} />
          <span
            className="absolute -top-1 -right-1 flex items-center justify-center font-semibold"
            style={{
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              fontSize: 'var(--text-2xs)',
              background: 'rgba(0,0,0,0.55)',
              color: '#fff',
              padding: '0 5px',
            }}
          >
            {conversationMessages.length}
          </span>
        </button>
      )}

      {/* ═══ CHAT PANEL — expandable full conversation ═══ */}
      <ChatPanel
        messages={conversationMessages}
        open={chatDrawerOpen}
        onClose={() => setChatDrawerOpen(false)}
        scrollRef={chatScrollRef}
      />

      {/* Toast */}
      <AnimatePresence>
        {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      </AnimatePresence>

      {/* ═══ BOTTOM AREA: Siri-like floating chat bar ═══ */}
      <div className="absolute bottom-0 left-0 right-0 z-20"
        style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>

        {/* Action Bar — agent-driven */}
        <AnimatePresence>
          <ActionBar actionCard={livekit.actionCard} onSelect={handleActionSelect} />
        </AnimatePresence>

        {/* Attached images preview */}
        {chatImages.length > 0 && (
          <div className="flex gap-2 mb-2 px-5">
            {chatImages.map((img, i) => (
              <div key={i} className="relative w-14 h-14 overflow-hidden" style={{ borderRadius: 16, border: '1px solid rgba(0,0,0,0.06)' }}>
                <img src={img.preview} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={() => setChatImages(prev => prev.filter((_, j) => j !== i))}
                  className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}
                >
                  <X size={10} className="text-white" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add-photo popover */}
        <AnimatePresence>
          {showAddMenu && (
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 550, damping: 35 }}
              className="absolute bottom-full left-4 mb-2 backdrop-blur-xl overflow-hidden shadow-2xl"
              style={{ borderRadius: 22, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(40px)', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}
            >
              <button
                onClick={() => { setShowAddMenu(false); onAddPhoto?.(); }}
                className="flex items-center gap-3 px-5 py-3.5 w-full text-left hover:bg-black/[0.02] transition-colors"
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#000' }}>
                  <Camera size={14} className="text-white" />
                </div>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(0,0,0,0.7)' }}>Take Photo</span>
              </button>
              <div className="h-px mx-4" style={{ background: 'rgba(0,0,0,0.06)' }} />
              <button
                onClick={() => { setShowAddMenu(false); fileInputRef.current?.click(); }}
                className="flex items-center gap-3 px-5 py-3.5 w-full text-left hover:bg-black/[0.02] transition-colors"
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}>
                  <ImageIcon size={14} className="text-white" />
                </div>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(0,0,0,0.7)' }}>Choose from Album</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Siri-like floating input pill */}
        <div className="px-3 py-1.5">
          <motion.div
            className="relative overflow-hidden"
            style={{
              borderRadius: 28,
              background: 'rgba(255,255,255,0.85)',
              backdropFilter: 'blur(40px)',
              WebkitBackdropFilter: 'blur(40px)',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.06), 0 4px 24px rgba(0,0,0,0.06)',
            }}
          >

            <div className="relative flex items-center gap-1.5 px-2 py-1.5">
              {/* + button */}
              <button
                onClick={() => setShowAddMenu(prev => !prev)}
                className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center transition-all duration-300 ${showAddMenu ? 'rotate-45' : ''}`}
                style={{
                  background: showAddMenu ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.04)',
                  color: showAddMenu ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.25)',
                }}
              >
                <Plus size={18} strokeWidth={2} />
              </button>

              {/* Text input */}
              <input
                ref={chatInputRef}
                type="text"
                value={chatText}
                onChange={e => setChatText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                placeholder="Ask anything..."
                className="flex-1 bg-transparent outline-none min-w-0"
                style={{
                  fontSize: 15,
                  fontWeight: 400,
                  color: '#000',
                  letterSpacing: '-0.01em',
                }}
              />

              {/* Send button — always visible, prominent */}
              <button
                onClick={handleSendMessage}
                disabled={!chatText.trim() && chatImages.length === 0}
                className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center transition-all duration-200"
                style={{
                  background: (chatText.trim() || chatImages.length > 0) ? '#000' : 'rgba(0,0,0,0.08)',
                  color: (chatText.trim() || chatImages.length > 0) ? '#fff' : 'rgba(0,0,0,0.3)',
                  boxShadow: (chatText.trim() || chatImages.length > 0) ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
                }}
              >
                <ArrowUp size={18} strokeWidth={2.5} />
              </button>
            </div>
          </motion.div>
        </div>

        {/* Hidden file input for album upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>
    </motion.div>
  );
}
