import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { IFRAME_DESIGN_CSS } from './iframeDesignSystem';

/**
 * PersistentHtmlRenderer — single pre-warmed iframe per session lifetime.
 *
 * Instead of creating a new iframe + loading Tailwind CDN for every HTML block,
 * this component maintains ONE iframe that:
 *   1. Pre-loads Tailwind CDN once on mount
 *   2. Receives HTML chunks via postMessage (O(1) append, no re-parse)
 *   3. Reports height changes via ResizeObserver
 *   4. Forwards data-action button clicks to parent
 *
 * Props:
 *   streamingChunks: string[]  — cumulative array of HTML chunks
 *   isStreaming: boolean       — whether stream is active
 *   onAction: (data) => void   — callback for data-action button clicks
 *   className: string          — wrapper className
 */

// The iframe srcdoc — loaded once, never recreated.
// Contains: Tailwind CDN, bridge script, ResizeObserver, action bridge.
const IFRAME_SRCDOC = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"><\/script>
  <style>${IFRAME_DESIGN_CSS}
    #streaming-indicator {
      position: sticky;
      top: 0;
      z-index: 10;
      height: 2px;
      background: linear-gradient(90deg, transparent, #a855f7, transparent);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite linear;
      display: none;
    }
    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
  </style>
  <style id="extra-css"></style>
  <script>
    var lastSentChunkCount = 0;

    function notifyHeight() {
      var h = document.documentElement.scrollHeight;
      parent.postMessage({ type: 'vi_resize', height: h }, '*');
    }

    // PostMessage Bridge
    window.addEventListener('message', function(e) {
      var d = e.data;
      if (!d || !d.type) return;

      if (d.type === 'append') {
        document.getElementById('root').insertAdjacentHTML('beforeend', d.html);
        notifyHeight();
      } else if (d.type === 'reset') {
        document.getElementById('root').innerHTML = '';
        lastSentChunkCount = 0;
        notifyHeight();
      } else if (d.type === 'stream_start') {
        document.getElementById('streaming-indicator').style.display = 'block';
      } else if (d.type === 'stream_end') {
        document.getElementById('streaming-indicator').style.display = 'none';
        notifyHeight();
      } else if (d.type === 'styles') {
        document.getElementById('extra-css').textContent = d.css || '';
      } else if (d.type === 'vi_toggle' && d.target) {
        var el = document.getElementById(d.target);
        if (el) el.classList.toggle('hidden');
      }
    });

    // ResizeObserver for auto height
    new ResizeObserver(function() { notifyHeight(); }).observe(document.documentElement);

    // Action Bridge — forward data-action button clicks
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.preventDefault();
      var payload = { type: 'vi_action', action: btn.dataset.action };
      for (var key in btn.dataset) {
        if (key !== 'action') payload[key] = btn.dataset[key];
      }
      parent.postMessage(payload, '*');
      var original = btn.innerHTML;
      btn.innerHTML = '\\u2713';
      btn.style.opacity = '0.7';
      setTimeout(function() { btn.innerHTML = original; btn.style.opacity = '1'; }, 1500);
    });

    // Signal ready
    parent.postMessage({ type: 'vi_ready' }, '*');
  <\/script>
</head>
<body>
  <div id="streaming-indicator"></div>
  <div id="root"></div>
</body>
</html>`;

export default function PersistentHtmlRenderer({ streamingChunks, isStreaming, onAction, className }) {
  const iframeRef = useRef(null);
  const [iframeHeight, setIframeHeight] = useState(100);
  const [iframeReady, setIframeReady] = useState(false);
  const sentChunkCountRef = useRef(0);
  const prevStreamingRef = useRef(false);
  const pendingChunksRef = useRef([]);

  // Listen for iframe messages (resize, action, ready)
  useEffect(() => {
    const handler = (e) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const data = e.data;
      if (!data || !data.type) return;

      if (data.type === 'vi_resize') {
        const newHeight = Math.max(data.height + 16, 100);
        setIframeHeight(newHeight);
      } else if (data.type === 'vi_action') {
        onAction?.(data);
      } else if (data.type === 'vi_ready') {
        setIframeReady(true);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onAction]);

  // Helper to post a message to the iframe
  const postToIframe = useCallback((msg) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(msg, '*');
    }
  }, []);

  // Flush any pending chunks that arrived before iframe was ready
  useEffect(() => {
    if (!iframeReady) return;
    if (pendingChunksRef.current.length > 0) {
      for (const chunk of pendingChunksRef.current) {
        postToIframe({ type: 'append', html: chunk });
      }
      pendingChunksRef.current = [];
    }
  }, [iframeReady, postToIframe]);

  // Send new chunks incrementally as they arrive
  useEffect(() => {
    if (!streamingChunks || streamingChunks.length === 0) return;

    const newChunks = streamingChunks.slice(sentChunkCountRef.current);
    if (newChunks.length === 0) return;

    if (!iframeReady) {
      // Queue chunks until iframe is ready
      pendingChunksRef.current.push(...newChunks);
      sentChunkCountRef.current = streamingChunks.length;
      return;
    }

    for (const chunk of newChunks) {
      postToIframe({ type: 'append', html: chunk });
    }
    sentChunkCountRef.current = streamingChunks.length;
  }, [streamingChunks, iframeReady, postToIframe]);

  // Handle streaming state transitions
  useEffect(() => {
    if (!iframeReady) return;

    if (isStreaming && !prevStreamingRef.current) {
      postToIframe({ type: 'stream_start' });
    } else if (!isStreaming && prevStreamingRef.current) {
      postToIframe({ type: 'stream_end' });
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, iframeReady, postToIframe]);

  // Reset method exposed via ref if needed — also callable internally
  const reset = useCallback(() => {
    sentChunkCountRef.current = 0;
    pendingChunksRef.current = [];
    if (iframeReady) {
      postToIframe({ type: 'reset' });
    }
  }, [iframeReady, postToIframe]);

  // Reset when chunks array is emptied (new block cycle)
  useEffect(() => {
    if (streamingChunks && streamingChunks.length === 0 && sentChunkCountRef.current > 0) {
      reset();
    }
  }, [streamingChunks, reset]);

  // Height transition — smooth only when NOT streaming
  const heightStyle = useMemo(() => ({
    height: `${iframeHeight}px`,
    border: 'none',
    transition: isStreaming ? 'none' : 'height 0.2s ease',
  }), [iframeHeight, isStreaming]);

  return (
    <div className={className}>
      <iframe
        ref={iframeRef}
        srcDoc={IFRAME_SRCDOC}
        className="w-full bg-transparent"
        style={heightStyle}
        sandbox="allow-scripts allow-popups"
        title="Agent content"
      />
    </div>
  );
}
