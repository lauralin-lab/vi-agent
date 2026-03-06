import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Loader2, Edit3, Trash2, Save, X } from 'lucide-react';
import { api } from '../services/api';
import { renderMarkdown } from '../utils/markdown';
import { IOS_SPRING } from '../constants';

const MAX_SKILLS_PREVIEW = 5;

const PROVIDERS = [
  { key: 'google', name: 'Google', icon: 'G', iconBg: 'rgba(66,133,244,0.08)', iconColor: '#4285F4', scopes: ['Calendar', 'Drive', 'Gmail'] },
  { key: 'notion', name: 'Notion', icon: 'N', iconBg: 'rgba(0,0,0,0.06)', iconColor: '#000', scopes: ['Pages', 'Databases'] },
  { key: 'slack', name: 'Slack', icon: 'S', iconBg: 'rgba(74,21,75,0.08)', iconColor: '#4A154B', scopes: ['Messages', 'Channels'] },
];

// ── Skill Row ──
function SkillRow({ skill, onToggle, isLast }) {
  const isEnabled = skill.enabled !== false;
  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      style={{ borderBottom: isLast ? 'none' : '1px solid rgba(0,0,0,0.06)' }}
    >
      <div className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center"
        style={{ background: skill.ui?.card_color || 'rgba(0,0,0,0.04)', fontSize: 20 }}>
        {skill.icon || '...'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate" style={{ fontSize: 15, color: '#000' }}>{skill.name}</p>
        {skill.description && (
          <p className="truncate" style={{ fontSize: 13, color: 'rgba(0,0,0,0.35)' }}>{skill.description}</p>
        )}
      </div>
      <button onClick={() => onToggle(skill)} className="shrink-0 relative transition-colors duration-200"
        style={{ width: 48, height: 28, borderRadius: 14, background: isEnabled ? '#000' : 'rgba(0,0,0,0.08)' }}>
        <div className="absolute top-1 rounded-full bg-white pointer-events-none transition-all duration-200"
          style={{ width: 20, height: 20, left: isEnabled ? 24 : 4, boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }} />
      </button>
    </div>
  );
}

// ── Memory Row (clickable) ──
function MemoryRow({ file, onClick, isLast }) {
  return (
    <button
      onClick={() => onClick(file)}
      className="w-full text-left px-4 py-3 active:bg-black/[0.02] transition-colors flex items-center gap-2"
      style={{ borderBottom: isLast ? 'none' : '1px solid rgba(0,0,0,0.06)' }}
    >
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate" style={{ fontSize: 15, color: '#000' }}>
          {file.filename?.replace(/\.md$/, '').replace(/[-_]/g, ' ') || file.filename}
        </p>
        {file.preview && (
          <p className="truncate mt-0.5" style={{ fontSize: 13, color: 'rgba(0,0,0,0.35)' }}>{file.preview}</p>
        )}
      </div>
      <ChevronRight size={14} strokeWidth={2} style={{ color: 'rgba(0,0,0,0.15)' }} className="shrink-0" />
    </button>
  );
}

// ── Connection Row ──
function ConnectionRow({ provider, status, onConnect, onDisconnect, connecting, isLast }) {
  const isConnected = status?.connected === true;
  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      style={{ borderBottom: isLast ? 'none' : '1px solid rgba(0,0,0,0.06)' }}
    >
      <div className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center font-bold"
        style={{ background: provider.iconBg, color: provider.iconColor, fontSize: 18 }}>
        {provider.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold truncate" style={{ fontSize: 15, color: '#000' }}>{provider.name}</p>
          {isConnected && (
            <span className="inline-block px-2 py-0.5 rounded-full font-medium"
              style={{ fontSize: 10, color: 'rgba(52,199,89,0.8)', background: 'rgba(52,199,89,0.08)' }}>
              Connected
            </span>
          )}
        </div>
        <p className="truncate" style={{ fontSize: 13, color: 'rgba(0,0,0,0.35)' }}>{provider.scopes.join(', ')}</p>
      </div>
      {isConnected ? (
        <button onClick={() => onDisconnect(provider.key)}
          className="shrink-0 px-3 py-1.5 rounded-full font-medium active:scale-95 transition-all"
          style={{ fontSize: 12, color: 'rgba(255,59,48,0.7)', background: 'rgba(255,59,48,0.06)' }}>
          Disconnect
        </button>
      ) : (
        <button onClick={() => onConnect(provider.key)} disabled={connecting === provider.key}
          className="shrink-0 px-3 py-1.5 rounded-full font-semibold active:scale-95 transition-all disabled:opacity-50"
          style={{ fontSize: 12, color: '#fff', background: '#000' }}>
          {connecting === provider.key ? <Loader2 size={12} className="animate-spin" /> : 'Connect'}
        </button>
      )}
    </div>
  );
}

// ── Section Header ──
function SectionHeader({ label }) {
  return (
    <p className="font-medium px-1 mb-2" style={{ fontSize: 13, color: 'rgba(0,0,0,0.35)' }}>{label}</p>
  );
}

// ── Grouped Card wrapper ──
function GroupedCard({ children, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, ...IOS_SPRING }}
      className="mb-6 overflow-hidden"
      style={{
        background: '#fff',
        borderRadius: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 0 0 0.5px rgba(0,0,0,0.03)',
      }}
    >
      {children}
    </motion.div>
  );
}

export default function SettingsView({ onBack, livekit }) {
  // ── Skills state ──
  const [skills, setSkills] = useState([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [showAllSkills, setShowAllSkills] = useState(false);

  // ── Memory state ──
  const [memoryFiles, setMemoryFiles] = useState([]);
  const [memoryLoading, setMemoryLoading] = useState(true);
  const [viewingMemory, setViewingMemory] = useState(null); // full memory file data
  const [editingMemory, setEditingMemory] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [editFilename, setEditFilename] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  // ── Connections state ──
  const [connStatuses, setConnStatuses] = useState({});
  const [connLoading, setConnLoading] = useState(true);
  const [connecting, setConnecting] = useState(null);
  const [disconnecting, setDisconnecting] = useState(null);

  // ── Load skills ──
  const loadSkills = useCallback(async () => {
    try {
      const viUserId = api.getViUserId();
      const qs = viUserId ? `?vi_user_id=${encodeURIComponent(viUserId)}` : '';
      const data = await api.request(`/api/skills${qs}`);
      setSkills(Array.isArray(data) ? data : (data?.skills || []));
    } catch (e) {
      console.error('Failed to load skills:', e);
      setSkills([]);
    } finally {
      setSkillsLoading(false);
    }
  }, []);

  // ── Load memory ──
  const loadMemory = useCallback(async () => {
    try {
      const data = await api.listMemory(null);
      setMemoryFiles(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load memories:', e);
      setMemoryFiles([]);
    } finally {
      setMemoryLoading(false);
    }
  }, []);

  // ── Load connection statuses ──
  const loadConnections = useCallback(async () => {
    try {
      const results = await Promise.allSettled(
        PROVIDERS.map(p => api.getTokenStatus(p.key))
      );
      const newStatuses = {};
      PROVIDERS.forEach((p, i) => {
        newStatuses[p.key] = results[i].status === 'fulfilled' ? results[i].value : { connected: false };
      });
      setConnStatuses(newStatuses);
    } catch (e) {
      console.error('Failed to load connection statuses:', e);
    } finally {
      setConnLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSkills();
    loadMemory();
    loadConnections();
  }, [loadSkills, loadMemory, loadConnections]);

  useEffect(() => {
    if (!livekit?.memoryUpdatedAt) return;
    loadMemory();
  }, [livekit?.memoryUpdatedAt, loadMemory]);

  // ── Skill toggle ──
  const handleToggle = useCallback(async (skill) => {
    const slug = skill.slug;
    if (!slug) return;
    const isEnabled = skill.enabled !== false;
    // Flip immediately
    setSkills(prev => prev.map(s => s.slug === slug ? { ...s, enabled: !isEnabled } : s));
    // Only call API for user skills (shared skills can't be toggled server-side)
    if (skill.source === 'shared') return;
    const viUserId = api.getViUserId();
    const qs = viUserId ? `?vi_user_id=${encodeURIComponent(viUserId)}` : '';
    try {
      await api.request(`/api/skills/${encodeURIComponent(slug)}/${isEnabled ? 'disable' : 'enable'}${qs}`, { method: 'POST' });
    } catch (e) {
      console.error('Failed to toggle skill:', e);
      setSkills(prev => prev.map(s => s.slug === slug ? { ...s, enabled: isEnabled } : s));
    }
  }, []);

  // ── Memory click → view detail ──
  const handleMemoryClick = useCallback(async (file) => {
    try {
      const data = await api.getMemory(file.filename);
      setViewingMemory(data);
    } catch (e) {
      console.error('Failed to load memory:', e);
    }
  }, []);

  const handleMemorySave = useCallback(async () => {
    const fname = editFilename.trim();
    if (!fname || !editContent.trim()) return;
    const filename = fname.endsWith('.md') ? fname : fname + '.md';
    setSaving(true);
    try {
      await api.upsertMemory(filename, editContent);
      setEditingMemory(null);
      setViewingMemory(null);
      await loadMemory();
    } catch (e) {
      console.error('Failed to save memory:', e);
    } finally {
      setSaving(false);
    }
  }, [editFilename, editContent, loadMemory]);

  const confirmDelete = useCallback(async () => {
    if (!deleting) return;
    try {
      await api.deleteMemory(deleting);
      setDeleting(null);
      if (viewingMemory?.filename === deleting) setViewingMemory(null);
      await loadMemory();
    } catch (e) {
      console.error('Failed to delete memory:', e);
    }
  }, [deleting, viewingMemory, loadMemory]);

  // ── Connection handlers ──
  const handleConnect = useCallback(async (provider) => {
    setConnecting(provider);
    try {
      const data = await api.connectToken(provider);
      if (data?.authorization_url) window.open(data.authorization_url, '_blank');
    } catch (e) {
      console.error('Failed to connect provider:', e);
    } finally {
      setConnecting(null);
    }
  }, []);

  const handleDisconnect = useCallback(async (provider) => {
    setDisconnecting(provider);
  }, []);

  const confirmDisconnect = useCallback(async () => {
    if (!disconnecting) return;
    try {
      await api.disconnectToken(disconnecting);
      setConnStatuses(prev => ({ ...prev, [disconnecting]: { connected: false } }));
    } catch (e) {
      console.error('Failed to disconnect provider:', e);
    } finally {
      setDisconnecting(null);
    }
  }, [disconnecting]);

  // ── Derived ──
  const visibleSkills = showAllSkills ? skills : skills.slice(0, MAX_SKILLS_PREVIEW);
  const hasMoreSkills = skills.length > MAX_SKILLS_PREVIEW;
  const sortedMemory = [...memoryFiles].sort((a, b) => {
    const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    return tb - ta;
  });
  const isLoading = skillsLoading && memoryLoading && connLoading;

  // ═══ Memory Edit sub-page ═══
  if (editingMemory) {
    return (
      <motion.div key="mem-edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="w-full h-full flex flex-col" style={{ background: '#F2F2F7', color: '#000' }}>
        <div className="shrink-0 flex items-center gap-3 px-5 pt-[env(safe-area-inset-top,20px)] pb-3"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <button onClick={() => setEditingMemory(null)} className="p-1.5 -ml-1.5 rounded-full hover:bg-black/[0.04] transition-colors">
            <X size={20} style={{ color: 'rgba(0,0,0,0.4)' }} />
          </button>
          <span className="font-semibold flex-1 truncate" style={{ fontSize: 16 }}>{editingMemory.filename}</span>
          <button onClick={handleMemorySave}
            disabled={saving || !editFilename.trim() || !editContent.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full font-semibold disabled:opacity-40 active:scale-95 transition-all"
            style={{ fontSize: 13, background: '#000', color: '#fff' }}>
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
            placeholder="Write your memory content..."
            className="w-full px-4 py-3 focus:outline-none resize-none"
            style={{ minHeight: 300, fontSize: 16, background: '#fff', borderRadius: 20,
              border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.04)',
              fontFamily: 'ui-monospace, SFMono-Regular, monospace' }} />
        </div>
      </motion.div>
    );
  }

  // ═══ Memory View sub-page ═══
  if (viewingMemory) {
    return (
      <motion.div key="mem-view" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }} transition={IOS_SPRING}
        className="w-full h-full flex flex-col" style={{ background: '#F2F2F7', color: '#000' }}>
        <div className="safe-area-top shrink-0 flex items-center gap-3 px-5 pt-5 pb-3"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <button onClick={() => setViewingMemory(null)} className="p-1.5 -ml-1.5 rounded-full hover:bg-black/[0.04] transition-colors">
            <ChevronLeft size={20} style={{ color: 'rgba(0,0,0,0.4)' }} />
          </button>
          <div className="flex-1 min-w-0">
            <span className="font-semibold truncate block" style={{ fontSize: 16 }}>{viewingMemory.filename}</span>
            <span className="font-medium" style={{ fontSize: 11, color: 'rgba(0,0,0,0.3)' }}>
              {(viewingMemory.layer || 'semantic').charAt(0).toUpperCase() + (viewingMemory.layer || 'semantic').slice(1)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => {
              setEditingMemory({ filename: viewingMemory.filename });
              setEditContent(viewingMemory.content);
              setEditFilename(viewingMemory.filename);
            }} className="p-1.5 rounded-full hover:bg-black/[0.04] transition-colors">
              <Edit3 size={16} style={{ color: 'rgba(0,0,0,0.3)' }} />
            </button>
            <button onClick={() => setDeleting(viewingMemory.filename)}
              className="p-1.5 rounded-full hover:bg-black/[0.04] transition-colors">
              <Trash2 size={16} style={{ color: 'rgba(0,0,0,0.3)' }} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div style={{ background: '#fff', borderRadius: 24, padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.04)',
            fontSize: 16, lineHeight: 1.6 }}>
            {renderMarkdown(viewingMemory.content)}
          </div>
        </div>

        {/* Delete confirmation */}
        <AnimatePresence>
          {deleting && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] flex items-end justify-center"
              style={{ background: 'rgba(0,0,0,0.25)' }} onClick={() => setDeleting(null)}>
              <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} transition={IOS_SPRING}
                onClick={e => e.stopPropagation()}
                className="w-full max-w-sm mx-4 mb-8 overflow-hidden"
                style={{ borderRadius: 20, background: '#fff', boxShadow: '0 -4px 40px rgba(0,0,0,0.12)' }}>
                <div className="p-5 text-center">
                  <p className="font-semibold mb-1" style={{ fontSize: 16 }}>Delete {deleting}?</p>
                  <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.4)' }}>This action cannot be undone</p>
                </div>
                <div className="flex" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                  <button onClick={() => setDeleting(null)}
                    className="flex-1 py-3.5 font-medium hover:bg-black/[0.02] transition-colors"
                    style={{ fontSize: 14, color: 'rgba(0,0,0,0.4)' }}>Cancel</button>
                  <div style={{ width: 1, background: 'rgba(0,0,0,0.06)' }} />
                  <button onClick={confirmDelete}
                    className="flex-1 py-3.5 font-semibold hover:bg-black/[0.02] transition-colors"
                    style={{ fontSize: 14, color: '#000' }}>Delete</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  // ═══ Main Profile page ═══
  return (
    <motion.div key="profile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="w-full h-full flex flex-col" style={{ background: '#F2F2F7' }}>

      {/* Header */}
      <div className="safe-area-top shrink-0 px-6 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-full hover:bg-black/[0.04] transition-colors">
            <ChevronLeft size={20} style={{ color: 'rgba(0,0,0,0.4)' }} />
          </button>
          <h1 className="font-semibold" style={{ fontSize: 20, color: '#000' }}>Profile</h1>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 pb-24">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin" style={{ color: 'rgba(0,0,0,0.15)' }} />
          </div>
        ) : (
          <>
            {/* ═══ Skills Section ═══ */}
            {skills.length > 0 && (
              <div className="mb-6">
                <SectionHeader label="Skills" />
                <GroupedCard>
                  {visibleSkills.map((skill, idx) => (
                    <SkillRow key={skill.slug || skill.name} skill={skill} onToggle={handleToggle}
                      isLast={idx === visibleSkills.length - 1 && !hasMoreSkills} />
                  ))}
                  {hasMoreSkills && (
                    <button onClick={() => setShowAllSkills(prev => !prev)}
                      className="w-full py-2.5 text-center font-medium hover:bg-black/[0.02] transition-colors"
                      style={{ fontSize: 14, color: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                      {showAllSkills ? 'Show less' : 'See all'}
                    </button>
                  )}
                </GroupedCard>
              </div>
            )}

            {/* ═══ Memory Section ═══ */}
            {sortedMemory.length > 0 && (
              <div className="mb-6">
                <SectionHeader label="Memory" />
                <GroupedCard delay={0.06}>
                  {sortedMemory.map((file, idx) => (
                    <MemoryRow key={file.id || file.filename} file={file}
                      onClick={handleMemoryClick} isLast={idx === sortedMemory.length - 1} />
                  ))}
                </GroupedCard>
              </div>
            )}

            {/* ═══ Connections Section ═══ */}
            <div className="mb-6">
              <SectionHeader label="Connections" />
              <GroupedCard delay={0.12}>
                {PROVIDERS.map((provider, idx) => (
                  <ConnectionRow key={provider.key} provider={provider}
                    status={connStatuses[provider.key]} onConnect={handleConnect}
                    onDisconnect={handleDisconnect} connecting={connecting}
                    isLast={idx === PROVIDERS.length - 1} />
                ))}
              </GroupedCard>
            </div>
          </>
        )}
      </div>

      {/* ═══ Disconnect confirmation ═══ */}
      <AnimatePresence>
        {disconnecting && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end justify-center"
            style={{ background: 'rgba(0,0,0,0.25)' }} onClick={() => setDisconnecting(null)}>
            <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} transition={IOS_SPRING}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm mx-4 mb-8 overflow-hidden"
              style={{ borderRadius: 20, background: '#fff', boxShadow: '0 -4px 40px rgba(0,0,0,0.12)' }}>
              <div className="p-5 text-center">
                <p className="font-semibold mb-1" style={{ fontSize: 16 }}>
                  Disconnect {PROVIDERS.find(p => p.key === disconnecting)?.name}?
                </p>
                <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.4)' }}>The agent will lose access to this service</p>
              </div>
              <div className="flex" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <button onClick={() => setDisconnecting(null)}
                  className="flex-1 py-3.5 font-medium hover:bg-black/[0.02] transition-colors"
                  style={{ fontSize: 14, color: 'rgba(0,0,0,0.4)' }}>Cancel</button>
                <div style={{ width: 1, background: 'rgba(0,0,0,0.06)' }} />
                <button onClick={confirmDisconnect}
                  className="flex-1 py-3.5 font-semibold hover:bg-black/[0.02] transition-colors"
                  style={{ fontSize: 14, color: 'rgba(255,59,48,0.8)' }}>Disconnect</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
