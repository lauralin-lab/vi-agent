import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Edit3, Trash2, Save, X, Loader2, SlidersHorizontal
} from 'lucide-react';
import { api } from '../services/api';
import { renderMarkdown } from '../utils/markdown';
import SkillsView from './SkillsView';
import ConnectionsView from './ConnectionsView';

const IOS_SPRING = { type: 'spring', stiffness: 340, damping: 32 };

const PROFILE_TABS = [
  { key: 'skills', label: 'Skills' },
  { key: 'memory', label: 'Memory' },
  { key: 'connections', label: 'Connections' },
];

// ── Memory Block Card (like the reference image) ──
const MemoryCard = memo(function MemoryCard({ file, onEdit, onDelete, onView, index }) {
  const layerLabel = (file.layer || 'semantic').charAt(0).toUpperCase() + (file.layer || 'semantic').slice(1);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12, scale: 0.95 }}
      transition={{ delay: index * 0.04, ...IOS_SPRING }}
      onClick={() => onView(file)}
      className="cursor-pointer active:scale-[0.98] transition-transform"
      style={{
        background: '#fff',
        borderRadius: 28,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.04)',
        overflow: 'hidden',
        padding: '20px 22px',
      }}
    >
      {/* Layer tag — like the date tag in reference image */}
      <span
        className="font-medium"
        style={{ fontSize: 13, color: 'rgba(0,0,0,0.35)' }}
      >
        {layerLabel}
      </span>

      {/* Title / filename — big bold like reference */}
      <p
        className="font-bold leading-snug mt-1 line-clamp-2"
        style={{ fontSize: 22, color: '#000', letterSpacing: '-0.01em' }}
      >
        {file.filename?.replace(/\.md$/, '').replace(/[-_]/g, ' ') || file.filename}
      </p>

      {/* Preview text */}
      {file.preview && (
        <p className="line-clamp-2 leading-relaxed mt-2" style={{ fontSize: 15, color: 'rgba(0,0,0,0.4)' }}>
          {file.preview}
        </p>
      )}
    </motion.div>
  );
});

function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

// ── Memory Tab Content (inner component) ──
function MemoryTabContent({ livekit }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [editFilename, setEditFilename] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [sortBy, setSortBy] = useState('updated');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const textareaRef = useRef(null);

  // Load memory files
  const loadFiles = useCallback(async () => {
    try {
      const data = await api.listMemory(null);
      setFiles(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load memories:', e);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    if (!livekit?.memoryUpdatedAt) return;
    loadFiles();
  }, [livekit?.memoryUpdatedAt, loadFiles]);

  const handleView = useCallback(async (file) => {
    try {
      const data = await api.getMemory(file.filename);
      setViewing(data);
    } catch (e) {
      console.error('Failed to load memory:', e);
    }
  }, []);

  const handleEdit = useCallback(async (file) => {
    try {
      const data = await api.getMemory(file.filename);
      setEditing({ filename: data.filename, isNew: false });
      setEditContent(data.content);
      setEditFilename(data.filename);
      setViewing(null);
    } catch (e) {
      console.error('Failed to load memory for edit:', e);
    }
  }, []);

  const handleSave = useCallback(async () => {
    const fname = editFilename.trim();
    if (!fname || !editContent.trim()) return;
    const filename = fname.endsWith('.md') ? fname : fname + '.md';
    setSaving(true);
    try {
      await api.upsertMemory(filename, editContent);
      setEditing(null);
      setViewing(null);
      await loadFiles();
    } catch (e) {
      console.error('Failed to save memory:', e);
    } finally {
      setSaving(false);
    }
  }, [editFilename, editContent, loadFiles]);

  const handleDelete = useCallback(async (file) => {
    setDeleting(file.filename);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleting) return;
    try {
      await api.deleteMemory(deleting);
      setDeleting(null);
      if (viewing?.filename === deleting) setViewing(null);
      await loadFiles();
    } catch (e) {
      console.error('Failed to delete memory:', e);
    }
  }, [deleting, viewing, loadFiles]);

  // Sort/filter files
  const sortedFiles = (() => {
    let result = [...files];
    // If a type is selected, filter by that layer
    if (['identity', 'semantic', 'episodic'].includes(sortBy)) {
      result = result.filter(f => (f.layer || 'semantic') === sortBy);
    }
    // Always sort by last updated
    result.sort((a, b) => {
      const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return tb - ta;
    });
    return result;
  })();

  // ── Edit Mode ──
  if (editing) {
    return (
      <motion.div
        key="memory-edit"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="w-full h-full flex flex-col"
        style={{ background: '#F2F2F7', color: '#000' }}
      >
        <div className="shrink-0 flex items-center gap-3 px-5 pt-[env(safe-area-inset-top,20px)] pb-3"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <button onClick={() => setEditing(null)} className="p-1.5 -ml-1.5 rounded-full hover:bg-black/[0.04] transition-colors">
            <X size={20} style={{ color: 'rgba(0,0,0,0.4)' }} />
          </button>
          <span className="font-semibold flex-1 truncate" style={{ fontSize: 16, color: '#000' }}>
            {editing.isNew ? 'New Memory File' : editing.filename}
          </span>
          <button
            onClick={handleSave}
            disabled={saving || !editFilename.trim() || !editContent.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full font-semibold disabled:opacity-40 active:scale-95 transition-all"
            style={{ fontSize: 13, background: '#000', color: '#fff' }}
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Save
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {editing.isNew && (
            <div>
              <label className="mb-1 block font-medium" style={{ fontSize: 13, color: 'rgba(0,0,0,0.4)' }}>Filename</label>
              <input
                value={editFilename}
                onChange={e => setEditFilename(e.target.value)}
                placeholder="memory-name.md"
                className="w-full px-4 py-3 focus:outline-none"
                style={{
                  fontSize: 16, color: '#000', background: '#fff', borderRadius: 20,
                  border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.04)',
                }}
              />
            </div>
          )}
          <div className="flex-1">
            <label className="mb-1 block font-medium" style={{ fontSize: 13, color: 'rgba(0,0,0,0.4)' }}>Content (Markdown)</label>
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              placeholder="Write your memory content..."
              className="w-full px-4 py-3 focus:outline-none resize-none"
              style={{
                minHeight: 300, fontSize: 16, color: '#000', background: '#fff', borderRadius: 20,
                border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.04)',
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              }}
            />
          </div>
        </div>
      </motion.div>
    );
  }

  // ── View Mode (single file) ──
  if (viewing) {
    return (
      <motion.div
        key="memory-view"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={IOS_SPRING}
        className="w-full h-full flex flex-col"
        style={{ background: '#F2F2F7', color: '#000' }}
      >
        <div className="shrink-0 flex items-center gap-3 px-5 pt-[env(safe-area-inset-top,20px)] pb-3"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <button onClick={() => setViewing(null)} className="p-1.5 -ml-1.5 rounded-full hover:bg-black/[0.04] transition-colors">
            <ChevronLeft size={20} style={{ color: 'rgba(0,0,0,0.4)' }} />
          </button>
          <div className="flex-1 min-w-0">
            <span className="font-semibold truncate block" style={{ fontSize: 16, color: '#000' }}>{viewing.filename}</span>
            <span className="font-medium" style={{ fontSize: 11, color: 'rgba(0,0,0,0.3)' }}>
              {(viewing.layer || 'semantic').charAt(0).toUpperCase() + (viewing.layer || 'semantic').slice(1)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setEditing({ filename: viewing.filename, isNew: false });
                setEditContent(viewing.content);
                setEditFilename(viewing.filename);
                setViewing(null);
              }}
              className="p-1.5 rounded-full hover:bg-black/[0.04] transition-colors"
            >
              <Edit3 size={16} style={{ color: 'rgba(0,0,0,0.3)' }} />
            </button>
            <button
              onClick={() => setDeleting(viewing.filename)}
              className="p-1.5 rounded-full hover:bg-black/[0.04] transition-colors"
            >
              <Trash2 size={16} style={{ color: 'rgba(0,0,0,0.3)' }} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div style={{
            background: '#fff', borderRadius: 24, padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.04)',
            color: '#000', fontSize: 16, lineHeight: 1.6,
          }}>
            {renderMarkdown(viewing.content)}
          </div>
        </div>
      </motion.div>
    );
  }

  // ── File List (main view) ──
  return (
    <motion.div
      key="memory-list"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full h-full flex flex-col relative"
      style={{ background: '#F2F2F7', color: '#000' }}
    >
      {/* Header */}
      <div className="safe-area-top shrink-0 flex items-center justify-between px-6 pb-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-full hover:bg-black/[0.04] transition-colors">
            <ChevronLeft size={20} style={{ color: 'rgba(0,0,0,0.4)' }} />
          </button>
          <h1 className="font-bold" style={{ fontSize: 28, color: '#000' }}>Memory</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 pb-24 flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin" style={{ color: 'rgba(0,0,0,0.15)' }} />
          </div>
        ) : sortedFiles.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <p className="font-semibold mb-1" style={{ fontSize: 16, color: 'rgba(0,0,0,0.55)' }}>
              No memories yet
            </p>
            <p className="leading-relaxed px-6" style={{ fontSize: 14, color: 'rgba(0,0,0,0.3)' }}>
              After chatting with AI, it will automatically remember your preferences and important info.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {sortedFiles.map((file, index) => (
                <MemoryCard
                  key={file.id || file.filename}
                  file={file}
                  index={index}
                  onView={handleView}
                  onEdit={(f) => handleEdit(f)}
                  onDelete={handleDelete}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ═══ Bottom sorting button — round like camera FAB ═══ */}
      <div className="absolute z-50" style={{ bottom: 'max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1rem))', right: '1.25rem' }}>
        <motion.button
          onClick={() => setShowSortMenu(true)}
          whileTap={{ scale: 0.88 }}
          className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{
            background: '#000',
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          }}
        >
          <SlidersHorizontal size={20} strokeWidth={2} className="text-white" />
        </motion.button>
      </div>

      {/* ═══ Sort menu bottom sheet ═══ */}
      <AnimatePresence>
        {showSortMenu && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end justify-center"
            style={{ background: 'rgba(0,0,0,0.25)' }}
            onClick={() => setShowSortMenu(false)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              transition={IOS_SPRING}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm mx-4 mb-8 overflow-hidden"
              style={{ borderRadius: 20, background: '#fff', boxShadow: '0 -4px 40px rgba(0,0,0,0.12)' }}
            >
              <div className="p-4 pb-2">
                <p className="font-semibold text-center" style={{ fontSize: 15, color: '#000' }}>Sort by</p>
              </div>
              <button
                onClick={() => { setSortBy('updated'); setShowSortMenu(false); }}
                className="w-full px-5 py-3.5 text-left flex items-center justify-between hover:bg-black/[0.02] transition-colors"
                style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}
              >
                <span style={{ fontSize: 15, color: sortBy === 'updated' ? '#000' : 'rgba(0,0,0,0.5)' }}
                  className={sortBy === 'updated' ? 'font-semibold' : ''}>
                  Last Updated
                </span>
                {sortBy === 'updated' && <div className="w-2 h-2 rounded-full" style={{ background: '#000' }} />}
              </button>
              <div className="px-5 pt-3 pb-1" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <span className="font-semibold uppercase tracking-wide" style={{ fontSize: 10, color: 'rgba(0,0,0,0.3)', letterSpacing: '0.06em' }}>Type</span>
              </div>
              {['identity', 'semantic', 'episodic'].map((type) => (
                <button
                  key={type}
                  onClick={() => { setSortBy(type); setShowSortMenu(false); }}
                  className="w-full px-5 py-3 text-left flex items-center justify-between hover:bg-black/[0.02] transition-colors"
                >
                  <span style={{ fontSize: 15, color: sortBy === type ? '#000' : 'rgba(0,0,0,0.5)' }}
                    className={sortBy === type ? 'font-semibold' : ''}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </span>
                  {sortBy === type && <div className="w-2 h-2 rounded-full" style={{ background: '#000' }} />}
                </button>
              ))}
              <button
                onClick={() => setShowSortMenu(false)}
                className="w-full py-3.5 font-medium hover:bg-black/[0.02] transition-colors"
                style={{ fontSize: 14, color: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(0,0,0,0.06)' }}
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ Delete confirmation bottom sheet ═══ */}
      <AnimatePresence>
        {deleting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end justify-center"
            style={{ background: 'rgba(0,0,0,0.25)' }}
            onClick={() => setDeleting(null)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              transition={IOS_SPRING}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm mx-4 mb-8 overflow-hidden"
              style={{ borderRadius: 20, background: '#fff', boxShadow: '0 -4px 40px rgba(0,0,0,0.12)' }}
            >
              <div className="p-5 text-center">
                <p className="font-semibold mb-1" style={{ fontSize: 16, color: '#000' }}>Delete {deleting}?</p>
                <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.4)' }}>This action cannot be undone</p>
              </div>
              <div className="flex" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <button
                  onClick={() => setDeleting(null)}
                  className="flex-1 py-3.5 font-medium hover:bg-black/[0.02] transition-colors"
                  style={{ fontSize: 14, color: 'rgba(0,0,0,0.4)' }}
                >
                  Cancel
                </button>
                <div style={{ width: 1, background: 'rgba(0,0,0,0.06)' }} />
                <button
                  onClick={confirmDelete}
                  className="flex-1 py-3.5 font-semibold hover:bg-black/[0.02] transition-colors"
                  style={{ fontSize: 14, color: '#000' }}
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── ProfileView — tabbed container (Skills + Memory) ──
// Exported as default; replaces the old MemoryView in App.jsx routing.
export default function MemoryView({ onBack, livekit }) {
  const [activeTab, setActiveTab] = useState('skills');

  return (
    <motion.div
      key="profile"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full h-full flex flex-col"
      style={{ background: '#F2F2F7' }}
    >
      {/* Header */}
      <div className="safe-area-top shrink-0 px-6 pb-2">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-full hover:bg-black/[0.04] transition-colors">
            <ChevronLeft size={20} style={{ color: 'rgba(0,0,0,0.4)' }} />
          </button>
          <h1 className="font-bold" style={{ fontSize: 28, color: '#000' }}>Profile</h1>
        </div>

        {/* Tab bar */}
        <div
          className="flex rounded-xl p-0.5"
          style={{ background: 'rgba(0,0,0,0.04)' }}
        >
          {PROFILE_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 py-2 rounded-lg font-medium transition-all duration-200"
              style={{
                fontSize: 14,
                color: activeTab === tab.key ? '#000' : 'rgba(0,0,0,0.35)',
                background: activeTab === tab.key ? '#fff' : 'transparent',
                boxShadow: activeTab === tab.key
                  ? '0 1px 3px rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.04)'
                  : 'none',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden pt-2">
        {activeTab === 'skills' ? (
          <SkillsView />
        ) : activeTab === 'connections' ? (
          <ConnectionsView />
        ) : (
          <MemoryTabContent livekit={livekit} />
        )}
      </div>
    </motion.div>
  );
}
