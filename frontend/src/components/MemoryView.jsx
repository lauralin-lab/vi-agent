import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Edit3, Save, X, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { renderMarkdown } from '../utils/markdown';
import { IOS_SPRING } from '../constants';

// ── Memory Content (standalone — used by SettingsView) ──
export default function MemoryContent({ livekit }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef(null);

  // Load MEMORY.md
  const loadMemory = useCallback(async () => {
    try {
      const data = await api.getMemory('MEMORY.md');
      setContent(data?.content || '');
    } catch (e) {
      console.error('Failed to load MEMORY.md:', e);
      setContent('');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadMemory();
  }, [loadMemory]);

  useEffect(() => {
    if (!livekit?.memoryUpdatedAt) return;
    loadMemory();
  }, [livekit?.memoryUpdatedAt, loadMemory]);

  const handleStartEdit = useCallback(() => {
    setEditContent(content);
    setEditing(true);
  }, [content]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await api.upsertMemory('MEMORY.md', editContent, 'long_term');
      setContent(editContent);
      setEditing(false);
    } catch (e) {
      console.error('Failed to save MEMORY.md:', e);
    } finally {
      setSaving(false);
    }
  }, [editContent]);

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
          <button onClick={() => setEditing(false)} className="p-1.5 -ml-1.5 rounded-full hover:bg-black/[0.04] transition-colors">
            <X size={20} style={{ color: 'rgba(0,0,0,0.4)' }} />
          </button>
          <span className="font-semibold flex-1 truncate" style={{ fontSize: 16, color: '#000' }}>
            Edit Memory
          </span>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full font-semibold disabled:opacity-40 active:scale-95 transition-all"
            style={{ fontSize: 13, background: '#000', color: '#fff' }}
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Save
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <textarea
            ref={textareaRef}
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            placeholder="Your memory profile will appear here after chatting..."
            className="w-full px-4 py-3 focus:outline-none resize-none"
            style={{
              minHeight: 400, fontSize: 16, color: '#000', background: '#fff', borderRadius: 20,
              border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.04)',
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              lineHeight: 1.6,
            }}
          />
        </div>
      </motion.div>
    );
  }

  // ── View Mode ──
  return (
    <motion.div
      key="memory-view"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full h-full flex flex-col relative"
      style={{ background: '#F2F2F7', color: '#000' }}
    >
      <div className="flex-1 overflow-y-auto px-3 pb-24 flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin" style={{ color: 'rgba(0,0,0,0.15)' }} />
          </div>
        ) : !content ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <p className="font-semibold mb-1" style={{ fontSize: 16, color: 'rgba(0,0,0,0.55)' }}>
              No memories yet
            </p>
            <p className="leading-relaxed px-6" style={{ fontSize: 14, color: 'rgba(0,0,0,0.3)' }}>
              After chatting with AI, it will automatically remember your preferences and important info.
            </p>
          </div>
        ) : (
          <div style={{
            background: '#fff', borderRadius: 24, padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.04)',
            color: '#000', fontSize: 16, lineHeight: 1.6,
            marginTop: 8,
          }}>
            {renderMarkdown(content)}
          </div>
        )}
      </div>

      {/* Edit button */}
      {content && (
        <div className="absolute z-50" style={{ bottom: 'max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1rem))', right: '1.25rem' }}>
          <motion.button
            onClick={handleStartEdit}
            whileTap={{ scale: 0.88 }}
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{
              background: '#000',
              boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            }}
          >
            <Edit3 size={20} strokeWidth={2} className="text-white" />
          </motion.button>
        </div>
      )}
    </motion.div>
  );
}
