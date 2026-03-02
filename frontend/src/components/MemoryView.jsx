import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Edit3, Trash2, Save, X, FileText, Loader2
} from 'lucide-react';
import { api } from '../services/api';
import { renderMarkdown } from '../utils/markdown';

// Layer config
const LAYERS = [
  { key: null, label: 'All' },
  { key: 'identity', label: 'Identity' },
  { key: 'semantic', label: 'Semantic' },
  { key: 'episodic', label: 'Episodic' },
];

const LAYER_COLORS = {
  identity: 'text-amber-400',
  semantic: 'text-blue-400',
  episodic: 'text-green-400',
};

// ── Memory File Card ──
const MemoryCard = memo(function MemoryCard({ file, onEdit, onDelete, onView }) {
  const layerColor = LAYER_COLORS[file.layer] || 'text-white/40';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12, scale: 0.95 }}
      className="bg-white/[0.04] border border-white/[0.08] rounded-2xl overflow-hidden"
    >
      <button
        onClick={() => onView(file)}
        className="w-full text-left p-4 active:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2 mb-2">
          <FileText size={14} className="text-purple-400 shrink-0" />
          <span className="text-white/90 font-medium truncate" style={{ fontSize: 'var(--text-base)' }}>{file.filename}</span>
          <span className="ml-auto text-white/20 shrink-0" style={{ fontSize: 'var(--text-xs)' }}>
            {formatDate(file.updated_at)}
          </span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span className={`${layerColor} font-medium`} style={{ fontSize: 'var(--text-xs)' }}>
            {file.layer || 'semantic'}
          </span>
          {file.importance != null && (
            <div className="flex items-center gap-1">
              <div className="w-12 h-1 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500/60 rounded-full"
                  style={{ width: `${Math.round((file.importance || 0) * 100)}%` }}
                />
              </div>
              <span className="text-white/15" style={{ fontSize: '10px' }}>
                {Math.round((file.importance || 0) * 100)}
              </span>
            </div>
          )}
        </div>
        {file.preview && (
          <p className="text-white/40 line-clamp-2 leading-relaxed" style={{ fontSize: 'var(--text-sm)' }}>{file.preview}</p>
        )}
      </button>
      <div className="flex border-t border-white/[0.06]">
        <button
          onClick={() => onEdit(file)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-white/30 hover:text-white/60 hover:bg-white/5 transition-all"
          style={{ fontSize: 'var(--text-sm)' }}
        >
          <Edit3 size={12} /> Edit
        </button>
        <div className="w-px bg-white/[0.06]" />
        <button
          onClick={() => onDelete(file)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-white/30 hover:text-red-400 hover:bg-red-500/5 transition-all"
          style={{ fontSize: 'var(--text-sm)' }}
        >
          <Trash2 size={12} /> Delete
        </button>
      </div>
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

// ── Main MemoryView Component ──
export default function MemoryView({ onBack, livekit }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeLayer, setActiveLayer] = useState(null);  // null = all
  const [viewing, setViewing] = useState(null);       // { filename, content, updated_at, layer, ... }
  const [editing, setEditing] = useState(null);        // { filename, content, isNew }
  const [editContent, setEditContent] = useState('');
  const [editFilename, setEditFilename] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);      // filename to confirm delete
  const textareaRef = useRef(null);

  // Load memory files
  const loadFiles = useCallback(async () => {
    try {
      const data = await api.listMemory(activeLayer);
      setFiles(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load memories:', e);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [activeLayer]);

  useEffect(() => {
    setLoading(true);
    loadFiles();
  }, [loadFiles]);

  // Listen for memory_updated data channel events
  useEffect(() => {
    if (!livekit?.memoryUpdatedAt) return;
    loadFiles();
  }, [livekit?.memoryUpdatedAt, loadFiles]);

  // View a memory file
  const handleView = useCallback(async (file) => {
    try {
      const data = await api.getMemory(file.filename);
      setViewing(data);
    } catch (e) {
      console.error('Failed to load memory:', e);
    }
  }, []);

  // Start editing
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



  // Save
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

  // Delete
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

  // ── Edit Mode ──
  if (editing) {
    return (
      <motion.div
        key="memory-edit"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="w-full h-full bg-black text-white flex flex-col"
      >
        {/* Header */}
        <div className="shrink-0 flex items-center gap-3 px-4 pt-[env(safe-area-inset-top,20px)] pb-3 border-b border-white/[0.06]">
          <button onClick={() => setEditing(null)} className="p-1.5 -ml-1.5 rounded-full hover:bg-white/10 transition-colors">
            <X size={20} className="text-white/60" />
          </button>
          <span className="text-white/90 font-medium flex-1 truncate" style={{ fontSize: 'var(--text-base)' }}>
            {editing.isNew ? 'New Memory File' : editing.filename}
          </span>
          <button
            onClick={handleSave}
            disabled={saving || !editFilename.trim() || !editContent.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-500 text-white font-medium disabled:opacity-40 active:scale-95 transition-all" style={{ fontSize: 'var(--text-sm)' }}
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Save
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Filename input */}
          {editing.isNew && (
            <div>
              <label className="text-white/40 mb-1 block" style={{ fontSize: 'var(--text-sm)' }}>Filename</label>
              <input
                value={editFilename}
                onChange={e => setEditFilename(e.target.value)}
                placeholder="memory-name.md"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder:text-white/20 focus:outline-none focus:border-purple-500/40"
                style={{ fontSize: 'var(--text-base)' }}
              />
            </div>
          )}

          {/* Content editor */}
          <div className="flex-1">
            <label className="text-white/40 mb-1 block" style={{ fontSize: 'var(--text-sm)' }}>Content (Markdown)</label>
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              placeholder="Write your memory content..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder:text-white/20 focus:outline-none focus:border-purple-500/40 resize-none"
              style={{ minHeight: '300px', fontSize: 'var(--text-base)', fontFamily: 'var(--font-mono)' }}
            />
          </div>
        </div>
      </motion.div>
    );
  }

  // ── View Mode (single file) ──
  if (viewing) {
    const viewLayerColor = LAYER_COLORS[viewing.layer] || 'text-white/40';
    return (
      <motion.div
        key="memory-view"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        className="w-full h-full bg-black text-white flex flex-col"
      >
        {/* Header */}
        <div className="shrink-0 flex items-center gap-3 px-4 pt-[env(safe-area-inset-top,20px)] pb-3 border-b border-white/[0.06]">
          <button onClick={() => setViewing(null)} className="p-1.5 -ml-1.5 rounded-full hover:bg-white/10 transition-colors">
            <ChevronLeft size={20} className="text-white/60" />
          </button>
          <div className="flex-1 min-w-0">
            <span className="text-white/90 font-medium truncate block" style={{ fontSize: 'var(--text-base)' }}>{viewing.filename}</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`${viewLayerColor} font-medium`} style={{ fontSize: 'var(--text-xs)' }}>
                {viewing.layer || 'semantic'}
              </span>
              <span className="text-white/20" style={{ fontSize: 'var(--text-xs)' }}>
                {viewing.category || 'general'}
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              setEditing({ filename: viewing.filename, isNew: false });
              setEditContent(viewing.content);
              setEditFilename(viewing.filename);
              setViewing(null);
            }}
            className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
          >
            <Edit3 size={16} className="text-white/40" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {renderMarkdown(viewing.content)}
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
      className="w-full h-full bg-black text-white flex flex-col"
    >
      {/* Header */}
      <div className="safe-area-top shrink-0 flex items-center justify-between px-6 pb-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-full hover:bg-white/10 transition-colors">
            <ChevronLeft size={20} className="text-white/60" />
          </button>
          <h1 className="font-bold bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent" style={{ fontSize: 'var(--text-2xl)' }}>Memory</h1>
        </div>
      </div>

      {/* Layer Filter Tabs */}
      <div className="shrink-0 px-4 pb-3">
        <div className="flex gap-1 bg-white/[0.03] rounded-xl p-1">
          {LAYERS.map(({ key, label }) => (
            <button
              key={label}
              onClick={() => setActiveLayer(key)}
              className={`flex-1 py-1.5 rounded-lg font-medium transition-all ${activeLayer === key
                ? 'bg-white/10 text-white/90'
                : 'text-white/30 hover:text-white/50'
                }`}
              style={{ fontSize: 'var(--text-xs)' }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-white/20" />
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4" style={{ fontSize: 'var(--text-3xl)' }}>🧠</div>
            <p className="text-white/40 mb-2 font-medium" style={{ fontSize: 'var(--text-base)' }}>
              {activeLayer ? `No ${activeLayer} memories` : 'No memories yet'}
            </p>
            <p className="text-white/20 leading-relaxed px-6" style={{ fontSize: 'var(--text-sm)' }}>
              After chatting with AI, it will automatically remember your preferences and important info.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {files.map(file => (
                <MemoryCard
                  key={file.id || file.filename}
                  file={file}
                  onView={handleView}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      <AnimatePresence>
        {deleting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setDeleting(null)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm mx-4 mb-8 bg-neutral-900 border border-white/10 rounded-2xl overflow-hidden"
            >
              <div className="p-4 text-center">
                <p className="text-white/90 font-medium mb-1" style={{ fontSize: 'var(--text-base)' }}>Delete {deleting}?</p>
                <p className="text-white/40" style={{ fontSize: 'var(--text-sm)' }}>This action cannot be undone</p>
              </div>
              <div className="flex border-t border-white/10">
                <button
                  onClick={() => setDeleting(null)}
                  className="flex-1 py-3 text-white/60 font-medium hover:bg-white/5 transition-colors"
                  style={{ fontSize: 'var(--text-base)' }}
                >
                  Cancel
                </button>
                <div className="w-px bg-white/10" />
                <button
                  onClick={confirmDelete}
                  className="flex-1 py-3 text-red-400 font-medium hover:bg-red-500/10 transition-colors"
                  style={{ fontSize: 'var(--text-base)' }}
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
