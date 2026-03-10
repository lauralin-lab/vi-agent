/**
 * PlaygroundView — React port of the NanoClaw Dashboard layout.
 *
 * Mirrors the dashboard's structure: left nav sidebar, Chat page (session sidebar +
 * chat area), Cards page (template sidebar + 3-col detail). Uses React ModuleRenderer
 * for native card rendering instead of dashboard's iframe-based card-embed.html.
 */

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react';
import ModuleRenderer, { extractModuleTitle } from './modules/ModuleRenderer';
import { StreamingContext } from './modules/StreamingContext';
import { api } from '../services/api';

// ── Dashboard CSS variables (inline, to avoid class conflicts with main app) ──

const V = {
  bg: '#f5f5f7',
  bgCard: '#ffffff',
  bgHover: '#eeeef0',
  border: '#d8d8dc',
  text: '#1d1d1f',
  textDim: '#6e6e73',
  accent: '#5856d6',
  accentDim: '#eeedf5',
  green: '#34c759',
  red: '#ff3b30',
  yellow: '#ff9500',
  blue: '#007aff',
  purple: '#af52de',
  font: "'SF Mono', 'Cascadia Code', 'JetBrains Mono', monospace",
  fontUi: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
};

// ── NanoClaw API helpers (proxied via /nanoclaw) ──

async function fetchSessionHistory() {
  const res = await fetch('/nanoclaw/api/dashboard/sessions/history');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.sessions || [];
}

async function fetchTemplates() {
  const res = await fetch('/nanoclaw/api/dashboard/templates');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.templates || [];
}

// ── Card dedup: keep only the LAST version of each cardId across all tasks ──

function deduplicateCards(tasks) {
  const allCards = {};
  const cardTaskMap = {};
  const sorted = [...tasks].sort((a, b) => (a.ts || 0) - (b.ts || 0));
  for (const task of sorted) {
    const taskCards = task.cards || {};
    for (const [id, card] of Object.entries(taskCards)) {
      if (!allCards[id] || card.status === 'finalized') {
        allCards[id] = { cardId: id, ...card };
        cardTaskMap[id] = task;
      }
    }
  }
  return { allCards, cardTaskMap, sortedTasks: sorted };
}

// ── Group flat task list into sessions ──

function groupIntoSessions(tasks) {
  const map = {};
  for (const t of tasks) {
    const sid = t.sessionId || 'unknown';
    if (!map[sid]) map[sid] = { sessionId: sid, tasks: [], latestTs: 0 };
    map[sid].tasks.push(t);
    if ((t.ts || 0) > map[sid].latestTs) map[sid].latestTs = t.ts || 0;
  }
  return Object.values(map).sort((a, b) => b.latestTs - a.latestTs);
}

// ── Format helpers ──

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDateTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms) {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatSkillTag(slug) {
  if (!slug) return '';
  return slug.replace(/^agent:/, '');
}

// ── Shared: render a card via ModuleRenderer ──

function CardRenderer({ card }) {
  return (
    <StreamingContext.Provider value={false}>
      <Suspense fallback={<div style={{ padding: 16, color: V.textDim, fontSize: 13 }}>Loading...</div>}>
        <ModuleRenderer module_type={card.template} data={card.data || {}} />
      </Suspense>
    </StreamingContext.Provider>
  );
}

// ══════════════════════════════════════════════════════════════════════
// NAV SIDEBAR — mirrors dashboard .sidebar
// ══════════════════════════════════════════════════════════════════════

function NavSidebar({ activePage, onPageChange }) {
  const pages = [
    { id: 'chat', icon: '\u2709', label: 'Chat' },
    { id: 'cards', icon: '\u25A6', label: 'Cards' },
  ];
  return (
    <aside style={{
      width: 200, background: V.bgCard, borderRight: `1px solid ${V.border}`,
      display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      <div style={{ padding: '16px 14px', borderBottom: `1px solid ${V.border}` }}>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', color: V.text }}>
          Playground
        </div>
        <div style={{ fontSize: 11, color: V.textDim, marginTop: 4 }}>
          Card Browser
        </div>
      </div>
      <nav style={{ padding: 6, flex: 1, overflowY: 'auto' }}>
        {pages.map(p => {
          const isActive = p.id === activePage;
          return (
            <a
              key={p.id}
              onClick={() => onPageChange(p.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                fontSize: 12, textDecoration: 'none',
                background: isActive ? V.accent : 'transparent',
                color: isActive ? '#fff' : V.textDim,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = V.bgHover; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ fontSize: 14, width: 18, textAlign: 'center' }}>{p.icon}</span>
              {p.label}
            </a>
          );
        })}
      </nav>
      <div style={{
        padding: '12px 14px', borderTop: `1px solid ${V.border}`,
        fontSize: 11, color: V.textDim,
      }}>
        <span style={{
          display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
          background: V.green, marginRight: 6, verticalAlign: 'middle',
        }} />
        Connected
      </div>
    </aside>
  );
}

// ══════════════════════════════════════════════════════════════════════
// CHAT PAGE — mirrors dashboard chat-layout
// ══════════════════════════════════════════════════════════════════════

// ── ChatInputBar — iOS-style floating pill (matching LiveSessionView) ──

function ChatInputBar({ onSend, disabled }) {
  const [text, setText] = useState('');
  const [images, setImages] = useState([]);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const fileRef = useRef(null);
  const inputRef = useRef(null);

  const handleSend = useCallback(() => {
    if (!text.trim() && images.length === 0) return;
    onSend(text.trim(), images.map(i => i.url));
    setText('');
    setImages([]);
  }, [text, images, onSend]);

  const handleFileSelect = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    setShowAddMenu(false);
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const uploaded = await api.uploadDataUrl(ev.target.result);
          if (uploaded?.url) setImages(prev => [...prev, { url: uploaded.url, name: file.name }]);
        } catch (err) { console.error('Upload failed:', err); }
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const hasContent = text.trim() || images.length > 0;

  return (
    <div style={{ padding: '8px 16px 12px', background: V.bgCard }}>
      {/* Image preview strip */}
      {images.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', padding: '0 4px' }}>
          {images.map((img, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img src={img.url} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover' }} />
              <button
                onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                style={{
                  position: 'absolute', top: -6, right: -6, width: 20, height: 20,
                  borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none',
                  fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backdropFilter: 'blur(4px)',
                }}
              >×</button>
            </div>
          ))}
        </div>
      )}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 8px', borderRadius: 28,
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.06), 0 4px 24px rgba(0,0,0,0.06)',
      }}>
        {/* + button */}
        <button
          onClick={() => { setShowAddMenu(prev => !prev); fileRef.current?.click(); }}
          style={{
            width: 36, height: 36, borderRadius: '50%', border: 'none',
            background: showAddMenu ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.04)',
            color: showAddMenu ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.25)',
            cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.3s',
            transform: showAddMenu ? 'rotate(45deg)' : 'none',
          }}
        >+</button>
        {/* Text input */}
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Ask anything..."
          disabled={disabled}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            fontSize: 15, fontWeight: 400, color: '#000', letterSpacing: '-0.01em', minWidth: 0,
          }}
        />
        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!hasContent || disabled}
          style={{
            width: 36, height: 36, borderRadius: '50%', border: 'none',
            background: hasContent ? '#000' : 'rgba(0,0,0,0.08)',
            color: hasContent ? '#fff' : 'rgba(0,0,0,0.3)',
            cursor: hasContent ? 'pointer' : 'default',
            fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s',
            boxShadow: hasContent ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
          }}
        >↑</button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFileSelect} />
    </div>
  );
}

// ── LiveCardBlock — renders a streaming card from nanoClaw ──

function LiveCardBlock({ card }) {
  return (
    <div style={{
      background: V.bg, border: `1px solid ${V.border}`,
      borderRadius: 8, overflow: 'hidden', marginTop: 6,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', fontSize: 11, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.04em',
        color: V.textDim, borderBottom: `1px solid ${V.border}`, background: V.bg,
      }}>
        {card.template || 'card'}
        <span style={{
          background: card.status === 'finalized' ? 'rgba(52,199,89,0.12)' : 'rgba(255,149,0,0.12)',
          color: card.status === 'finalized' ? V.green : V.yellow,
          padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 500, marginLeft: 'auto',
        }}>
          {card.status === 'finalized' ? 'done' : 'streaming'}
        </span>
      </div>
      <div style={{ background: '#fff', color: '#111' }}>
        <CardRenderer card={card} />
      </div>
    </div>
  );
}

function ChatPage({ nanoClaw }) {
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [liveBlocks, setLiveBlocks] = useState([]);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tasks = await fetchSessionHistory();
      setSessions(groupIntoSessions(tasks));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Send message via NanoClaw ──
  const handleSend = useCallback(async (text, mediaUrls) => {
    setSending(true);
    // Add user bubble to live blocks immediately
    setLiveBlocks(prev => [...prev, {
      type: 'user', text, mediaUrls: mediaUrls || [], ts: Date.now(),
    }]);
    try {
      // If no session selected, dispatch without sessionId to start a new conversation
      const opts = {
        prompt: text,
        mediaUrls: mediaUrls?.length ? mediaUrls : undefined,
      };
      if (selectedSessionId) opts.sessionId = selectedSessionId;
      await api.dispatchExec(opts);
      // Refresh sessions after sending to pick up new session
      if (!selectedSessionId) {
        setTimeout(async () => {
          try {
            const tasks = await fetchSessionHistory();
            setSessions(groupIntoSessions(tasks));
          } catch {}
        }, 2000);
      }
    } catch (err) {
      console.error('dispatchExec failed:', err);
      setLiveBlocks(prev => [...prev, { type: 'error', text: err.message, ts: Date.now() }]);
    } finally {
      setSending(false);
    }
    // Scroll to bottom
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [selectedSessionId]);

  // ── Stream live cards from nanoClaw ──
  useEffect(() => {
    if (!nanoClaw?.cards || !selectedSessionId) return;
    const liveCards = [];
    const orderedIds = nanoClaw.orderedCardIds || [];
    for (const cardId of orderedIds) {
      const card = nanoClaw.cards[cardId];
      if (card) liveCards.push({ type: 'card', card: { cardId, ...card }, ts: Date.now() });
    }
    if (liveCards.length > 0) {
      setLiveBlocks(prev => {
        // Merge: keep user blocks, replace card blocks with latest
        const userBlocks = prev.filter(b => b.type !== 'card');
        return [...userBlocks, ...liveCards];
      });
    }
  }, [nanoClaw?.cards, nanoClaw?.orderedCardIds, selectedSessionId]);

  // Clear live blocks when switching sessions
  useEffect(() => { setLiveBlocks([]); }, [selectedSessionId]);

  const selectedSession = sessions.find(s => s.sessionId === selectedSessionId);
  const { allCards, cardTaskMap, sortedTasks } = selectedSession
    ? deduplicateCards(selectedSession.tasks)
    : { allCards: {}, cardTaskMap: {}, sortedTasks: [] };

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      {/* ── Session Sidebar (chat-sidebar) ── */}
      <div style={{
        width: 220, background: V.bgCard, borderRight: `1px solid ${V.border}`,
        display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 12px', borderBottom: `1px solid ${V.border}`,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: V.text }}>Sessions</span>
          <button onClick={loadData} style={{
            background: 'none', border: `1px solid ${V.border}`, borderRadius: 4,
            color: V.textDim, cursor: 'pointer', fontSize: 13, padding: '2px 6px',
          }} title="Refresh">↻</button>
        </div>

        {/* Session list */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {loading && <div style={{ padding: 16, fontSize: 12, color: V.textDim }}>Loading...</div>}
          {error && <div style={{ padding: 16, fontSize: 12, color: V.red }}>Error: {error}</div>}
          {!loading && !error && sessions.length === 0 && (
            <div style={{ padding: 16, fontSize: 12, color: V.textDim }}>No sessions found</div>
          )}
          {sessions.map(session => {
            const isActive = session.sessionId === selectedSessionId;
            const firstPrompt = session.tasks[0]?.prompt || '(no prompt)';
            const firstSkill = session.tasks[0]?.skillSlug;
            return (
              <div
                key={session.sessionId}
                onClick={() => setSelectedSessionId(session.sessionId)}
                style={{
                  padding: '8px 12px', cursor: 'pointer',
                  borderBottom: `1px solid ${V.border}`,
                  background: isActive ? V.accentDim : 'transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = V.bgHover; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? V.accentDim : 'transparent'; }}
              >
                <div style={{
                  fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap', color: isActive ? V.accent : V.text,
                }}>
                  {firstPrompt}
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  marginTop: 3, fontSize: 10, color: V.textDim,
                }}>
                  {firstSkill && (
                    <span style={{
                      background: 'rgba(175,82,222,0.12)', color: V.purple,
                      padding: '0 5px', borderRadius: 3, fontSize: 10,
                    }}>
                      {formatSkillTag(firstSkill)}
                    </span>
                  )}
                  <span>{session.tasks.length} task{session.tasks.length > 1 ? 's' : ''}</span>
                  <span>{formatTime(session.latestTs)}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Session info panel */}
        <div style={{
          height: 180, borderTop: `1px solid ${V.border}`, overflowY: 'auto',
          padding: '10px 12px', fontSize: 12, flexShrink: 0, color: V.text,
        }}>
          {!selectedSession ? (
            <div style={{ color: V.textDim, fontSize: 11, padding: '8px 0', textAlign: 'center' }}>
              Select a session for details
            </div>
          ) : (
            <>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: V.textDim, marginBottom: 2 }}>
                Session ID
              </div>
              <div style={{ wordBreak: 'break-all', fontSize: 12 }}>
                {selectedSession.sessionId}
              </div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: V.textDim, marginTop: 8, marginBottom: 2 }}>
                Tasks ({selectedSession.tasks.length})
              </div>
              {selectedSession.tasks.map((t, i) => (
                <div key={i} style={{
                  padding: '4px 0', borderBottom: `1px solid ${V.border}`,
                  fontSize: 11, color: V.textDim,
                }}>
                  {(t.prompt || '').slice(0, 40)}{(t.prompt || '').length > 40 ? '…' : ''}
                  {t.durationMs ? ` (${formatDuration(t.durationMs)})` : ''}
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── Chat Area (chat-area) ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {!selectedSession ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              height: '100%', color: V.textDim, fontSize: 14, gap: 8,
            }}>
              <span style={{ fontSize: 28, opacity: 0.3 }}>💬</span>
              <span>Start a new conversation or select a session</span>
            </div>
          ) : sortedTasks.length === 0 ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '100%', color: V.textDim, fontSize: 14,
            }}>
              No messages in this session
            </div>
          ) : (
            sortedTasks.map((task, i) => {
              const taskCardIds = Object.keys(task.cards || {}).filter(id => cardTaskMap[id] === task);
              const hasAnyCards = Object.keys(task.cards || {}).length > 0;

              return (
                <div key={task.taskId || i}>
                  {/* User message — right-aligned bubble */}
                  <div style={{ marginBottom: 16, maxWidth: '80%', marginLeft: 'auto' }}>
                    <div style={{
                      padding: '12px 16px', borderRadius: 12, fontSize: 14,
                      lineHeight: 1.5, wordBreak: 'break-word',
                      background: V.accent, color: '#fff',
                      borderBottomRightRadius: 4,
                    }}>
                      {task.mediaUrls?.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          {task.mediaUrls.map((url, j) => (
                            <img key={j} src={url} alt="" style={{
                              maxWidth: 200, maxHeight: 150, borderRadius: 8, margin: 2,
                            }} onError={e => { e.target.style.display = 'none'; }} />
                          ))}
                        </div>
                      )}
                      {task.prompt || ''}
                    </div>
                    <div style={{ fontSize: 11, color: V.textDim, marginTop: 4, padding: '0 4px', textAlign: 'right' }}>
                      {task.skillSlug && (
                        <span style={{
                          background: 'rgba(175,82,222,0.12)', color: V.purple,
                          padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                          marginRight: 6,
                        }}>
                          {formatSkillTag(task.skillSlug)}
                        </span>
                      )}
                      {formatDateTime(task.ts)}
                    </div>
                  </div>

                  {/* Assistant cards — left-aligned */}
                  {taskCardIds.length > 0 && (
                    <div style={{ marginBottom: 16, maxWidth: '80%', marginRight: 'auto' }}>
                      <div style={{ marginTop: 8 }}>
                        {taskCardIds.map(id => {
                          const card = allCards[id];
                          const statusBadge = card.status === 'finalized'
                            ? { bg: 'rgba(52,199,89,0.12)', color: V.green, text: 'done' }
                            : { bg: 'rgba(255,149,0,0.12)', color: V.yellow, text: 'streaming' };
                          return (
                            <div key={id} style={{
                              background: V.bg, border: `1px solid ${V.border}`,
                              borderRadius: 8, overflow: 'hidden', marginTop: 6,
                            }}>
                              {/* Card header — matches dashboard .chat-card-header */}
                              <div style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '8px 12px', fontSize: 11, fontWeight: 600,
                                textTransform: 'uppercase', letterSpacing: '0.04em',
                                color: V.textDim, borderBottom: `1px solid ${V.border}`,
                                background: V.bg,
                              }}>
                                {card.template || 'card'}
                                <span style={{
                                  background: statusBadge.bg, color: statusBadge.color,
                                  padding: '2px 8px', borderRadius: 6, fontSize: 10,
                                  fontWeight: 500, marginLeft: 'auto',
                                }}>
                                  {statusBadge.text}
                                </span>
                              </div>
                              {/* Rendered card content — React ModuleRenderer */}
                              <div style={{ background: '#fff', color: '#111' }}>
                                <CardRenderer card={card} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ fontSize: 11, color: V.textDim, marginTop: 4, padding: '0 4px' }}>
                        {formatDuration(task.durationMs)}
                      </div>
                    </div>
                  )}

                  {/* Assistant text result — only if NO cards at all */}
                  {task.result && !hasAnyCards && (
                    <div style={{ marginBottom: 16, maxWidth: '80%', marginRight: 'auto' }}>
                      <div style={{
                        padding: '12px 16px', borderRadius: 12, fontSize: 14,
                        lineHeight: 1.5, wordBreak: 'break-word',
                        background: V.bgCard, border: `1px solid ${V.border}`,
                        borderBottomLeftRadius: 4, color: V.text,
                        whiteSpace: 'pre-wrap',
                      }}>
                        {task.result}
                      </div>
                      <div style={{ fontSize: 11, color: V.textDim, marginTop: 4, padding: '0 4px' }}>
                        {formatDuration(task.durationMs)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
          {/* ── Live blocks (new messages + streaming cards) ── */}
          {liveBlocks.map((block, i) => {
            if (block.type === 'user') return (
              <div key={`live-u-${i}`} style={{ marginBottom: 16, maxWidth: '80%', marginLeft: 'auto' }}>
                <div style={{
                  padding: '12px 16px', borderRadius: 12, fontSize: 14,
                  lineHeight: 1.5, wordBreak: 'break-word',
                  background: V.accent, color: '#fff', borderBottomRightRadius: 4,
                }}>
                  {block.mediaUrls?.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      {block.mediaUrls.map((url, j) => (
                        <img key={j} src={url} alt="" style={{ maxWidth: 200, maxHeight: 150, borderRadius: 8, margin: 2 }}
                          onError={e => { e.target.style.display = 'none'; }} />
                      ))}
                    </div>
                  )}
                  {block.text}
                </div>
              </div>
            );
            if (block.type === 'card') return (
              <div key={`live-c-${block.card.cardId}`} style={{ marginBottom: 16, maxWidth: '80%', marginRight: 'auto' }}>
                <LiveCardBlock card={block.card} />
              </div>
            );
            if (block.type === 'error') return (
              <div key={`live-e-${i}`} style={{ marginBottom: 16, maxWidth: '80%', marginRight: 'auto' }}>
                <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,59,48,0.1)', color: V.red, fontSize: 13 }}>
                  Error: {block.text}
                </div>
              </div>
            );
            return null;
          })}

          <div ref={messagesEndRef} />
        </div>

        {/* ── Chat Input Bar — always visible for new or continued chat ── */}
        <ChatInputBar onSend={handleSend} disabled={sending} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// CARDS PAGE — mirrors dashboard tpl-layout (templates page)
// ══════════════════════════════════════════════════════════════════════

const CARD_ICONS = {
  'freeform-html': '\u{1F310}', 'nutrition-card': '\u{1F957}', 'shopping-list': '\u{1F6D2}',
  'comparison-table': '\u2696\uFE0F', 'hero-image': '\u{1F5BC}\uFE0F', 'image-analysis': '\u{1F50D}',
  'calendar-event': '\u{1F4C5}', 'map-pins': '\u{1F4CD}', 'quiz': '\u2753',
  'conversation': '\u{1F4AC}', 'thinking-process': '\u{1F9E0}', 'place-card': '\u{1F3EA}',
  'info-card': '\u2139\uFE0F', 'checklist': '\u2705', 'recipe': '\u{1F373}',
  'weather': '\u2600\uFE0F', 'steps-guide': '\u{1F4CB}', 'image-gallery': '\u{1F5BC}\uFE0F',
  'text-result': '\u{1F4DD}',
};

function CardsPage() {
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [testData, setTestData] = useState('');
  const [testCard, setTestCard] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tpls = await fetchTemplates();
      setTemplates(tpls);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Filter templates
  const filtered = filter
    ? templates.filter(t =>
        (t.$id || '').toLowerCase().includes(filter.toLowerCase()) ||
        (t.description || '').toLowerCase().includes(filter.toLowerCase()) ||
        (t.category || '').toLowerCase().includes(filter.toLowerCase())
      )
    : templates;

  // Group by category
  const groups = {};
  for (const t of filtered) {
    const cat = t.category || 'other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(t);
  }

  const selectedTpl = templates.find(t => t.$id === selectedId);

  // Generate sample data when template selected
  useEffect(() => {
    if (!selectedTpl) return;
    const data = generateSampleData(selectedTpl);
    setTestData(JSON.stringify(data, null, 2));
    setTestCard({
      cardId: 'preview-' + selectedTpl.$id,
      template: selectedTpl.$id,
      data: data,
      status: 'finalized',
    });
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleRender() {
    if (!selectedTpl) return;
    try {
      const data = JSON.parse(testData);
      setTestCard({
        cardId: 'preview-' + selectedTpl.$id,
        template: selectedTpl.$id,
        data: data,
        status: 'finalized',
      });
    } catch (e) {
      alert('Invalid JSON: ' + e.message);
    }
  }

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      {/* ── Template Sidebar (tpl-sidebar) ── */}
      <div style={{
        width: 220, background: V.bgCard, borderRight: `1px solid ${V.border}`,
        display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 12px', borderBottom: `1px solid ${V.border}`,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: V.text }}>Cards</span>
          <button onClick={loadData} style={{
            background: 'none', border: `1px solid ${V.border}`, borderRadius: 4,
            color: V.textDim, cursor: 'pointer', fontSize: 13, padding: '2px 6px',
          }} title="Refresh">↻</button>
        </div>
        <div style={{ padding: '8px 10px' }}>
          <input
            type="text"
            placeholder="Filter..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{
              width: '100%', padding: '6px 10px', background: V.bg,
              border: `1px solid ${V.border}`, borderRadius: 6,
              color: V.text, fontSize: 12, outline: 'none',
            }}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {loading && <div style={{ padding: 16, fontSize: 12, color: V.textDim }}>Loading...</div>}
          {error && <div style={{ padding: 16, fontSize: 12, color: V.red }}>Error: {error}</div>}
          {Object.entries(groups).map(([cat, items]) => (
            <div key={cat}>
              <div style={{
                padding: '10px 12px 4px', fontSize: 10, fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.06em', color: V.textDim,
              }}>
                {cat}
              </div>
              {items.map(t => {
                const isActive = t.$id === selectedId;
                return (
                  <div
                    key={t.$id}
                    onClick={() => setSelectedId(t.$id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 12px', cursor: 'pointer',
                      background: isActive ? V.accentDim : 'transparent',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = V.bgHover; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? V.accentDim : 'transparent'; }}
                  >
                    <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>
                      {CARD_ICONS[t.$id] || '\u{1F4C4}'}
                    </span>
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: isActive ? V.accent : V.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.$id}
                      </div>
                      {t.description && (
                        <div style={{ fontSize: 10, color: V.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.description}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Template Main (tpl-main) ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24, color: V.text }}>
        {!selectedTpl ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%', color: V.textDim, fontSize: 14,
          }}>
            Select a card to view details
          </div>
        ) : (
          <div>
            {/* Header */}
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{selectedTpl.$id}</h3>
              <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ background: 'rgba(0,122,255,0.1)', color: V.blue, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500 }}>
                  {selectedTpl.category || '-'}
                </span>
                <span style={{ background: 'rgba(175,82,222,0.1)', color: V.purple, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500 }}>
                  {selectedTpl.renderer || 'html'}
                </span>
                {selectedTpl.streamable && (
                  <span style={{ background: 'rgba(52,199,89,0.1)', color: V.green, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500 }}>streamable</span>
                )}
              </div>
              {selectedTpl.description && (
                <p style={{ marginTop: 8, color: V.textDim, fontSize: 13 }}>{selectedTpl.description}</p>
              )}
            </div>

            {/* 3-column layout: Example Data | Raw Card | Rendered */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12,
              minHeight: 300,
            }}>
              {/* Column 1: Example Data (editable) */}
              <div style={{
                background: V.bgCard, border: `1px solid ${V.border}`,
                borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column',
              }}>
                <div style={{
                  padding: '8px 12px', fontSize: 11, fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  color: V.textDim, borderBottom: `1px solid ${V.border}`,
                }}>
                  Example Data
                </div>
                <div style={{ padding: 8, flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <textarea
                    value={testData}
                    onChange={e => setTestData(e.target.value)}
                    style={{
                      flex: 1, width: '100%', minHeight: 200, resize: 'vertical',
                      background: V.bg, border: `1px solid ${V.border}`, borderRadius: 6,
                      color: V.text, padding: 8, fontSize: 12, fontFamily: V.font,
                      lineHeight: 1.5, outline: 'none',
                    }}
                  />
                  <button
                    onClick={handleRender}
                    style={{
                      marginTop: 6, width: '100%', padding: '6px 12px',
                      background: V.accent, color: '#fff', border: 'none',
                      borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500,
                    }}
                  >
                    Render
                  </button>
                </div>
              </div>

              {/* Column 2: Raw Card JSON */}
              <div style={{
                background: V.bgCard, border: `1px solid ${V.border}`,
                borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column',
              }}>
                <div style={{
                  padding: '8px 12px', fontSize: 11, fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  color: V.textDim, borderBottom: `1px solid ${V.border}`,
                }}>
                  Raw Card
                </div>
                <pre style={{
                  flex: 1, margin: 0, padding: 8, fontSize: 12, fontFamily: V.font,
                  lineHeight: 1.5, overflowY: 'auto', color: V.text,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                }}>
                  {testCard ? JSON.stringify(testCard, null, 2) : ''}
                </pre>
              </div>

              {/* Column 3: Rendered preview */}
              <div style={{
                background: V.bgCard, border: `1px solid ${V.border}`,
                borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column',
              }}>
                <div style={{
                  padding: '8px 12px', fontSize: 11, fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  color: V.textDim, borderBottom: `1px solid ${V.border}`,
                }}>
                  Rendered
                </div>
                <div style={{ flex: 1, overflowY: 'auto', background: '#fff', color: '#111' }}>
                  {testCard ? <CardRenderer card={testCard} /> : (
                    <div style={{ padding: 16, color: '#999', fontSize: 13 }}>Click Render to preview</div>
                  )}
                </div>
              </div>
            </div>

            {/* Slots info */}
            {selectedTpl.slots && Object.keys(selectedTpl.slots).length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{
                  fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: '0.05em', color: V.textDim, marginBottom: 8,
                }}>
                  Slots ({Object.keys(selectedTpl.slots).length})
                </div>
                <div style={{
                  background: V.bgCard, border: `1px solid ${V.border}`,
                  borderRadius: 8, overflow: 'hidden',
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: V.textDim, borderBottom: `1px solid ${V.border}`, fontWeight: 500 }}>Name</th>
                        <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: V.textDim, borderBottom: `1px solid ${V.border}`, fontWeight: 500 }}>Type</th>
                        <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: V.textDim, borderBottom: `1px solid ${V.border}`, fontWeight: 500 }}>Required</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(selectedTpl.slots).map(([name, slot]) => (
                        <tr key={name}>
                          <td style={{ padding: '8px 14px', borderBottom: `1px solid ${V.border}`, color: V.text, fontFamily: V.font, fontSize: 12 }}>{name}</td>
                          <td style={{ padding: '8px 14px', borderBottom: `1px solid ${V.border}`, color: V.textDim }}>{slot.type || '-'}</td>
                          <td style={{ padding: '8px 14px', borderBottom: `1px solid ${V.border}`, color: V.textDim }}>{slot.required ? 'yes' : 'no'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sample data generator (ported from dashboard.js generateSampleData) ──

function generateSampleData(tpl) {
  const id = tpl.$id || '';
  const slots = tpl.slots || {};
  // Fallback: generate from slot types
  const data = {};
  for (const [name, slot] of Object.entries(slots)) {
    if (slot.type === 'string') {
      if (name.includes('title') || name.includes('name')) data[name] = 'Sample Card';
      else if (name.includes('description') || name.includes('desc')) data[name] = 'A brief description of the content displayed in this card.';
      else if (name.includes('url') || name.includes('image')) data[name] = 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&q=80';
      else if (name.includes('html')) data[name] = '<p>Hello from <strong>' + id + '</strong> template.</p>';
      else data[name] = 'Sample ' + name;
    } else if (slot.type === 'number') data[name] = 42;
    else if (slot.type === 'boolean') data[name] = true;
    else if (slot.type === 'array') data[name] = ['Item 1', 'Item 2', 'Item 3'];
    else data[name] = null;
  }
  return data;
}

// ══════════════════════════════════════════════════════════════════════
// MAIN — PlaygroundView
// ══════════════════════════════════════════════════════════════════════

export default function PlaygroundView({ nanoClaw }) {
  const [activePage, setActivePage] = useState('chat');

  return (
    <div style={{
      display: 'flex', height: '100vh',
      fontFamily: V.fontUi, background: V.bg, color: V.text,
      overflow: 'hidden',
    }}>
      <NavSidebar activePage={activePage} onPageChange={setActivePage} />
      <main style={{ flex: 1, overflow: 'hidden' }}>
        {activePage === 'chat' && <ChatPage nanoClaw={nanoClaw} />}
        {activePage === 'cards' && <CardsPage />}
      </main>
    </div>
  );
}
