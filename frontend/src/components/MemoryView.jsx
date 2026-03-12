import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import { Plus, Check, X, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { parseMemoryMarkdown, serializeMemoryCards } from '../utils/memory-parser';
import { IOS_SPRING } from '../constants';

// ── Memory Cards (dynamic card UI parsed from MEMORY.md) ──
// Used standalone AND embedded in SettingsView profile page.

export default function MemoryContent({ livekit }) {
  const [sections, setSections] = useState([]);
  const [rawContent, setRawContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load + parse MEMORY.md
  const loadMemory = useCallback(async () => {
    try {
      const data = await api.getMemory('MEMORY.md');
      const content = data?.content || '';
      setRawContent(content);
      setSections(parseMemoryMarkdown(content));
    } catch (e) {
      console.error('Failed to load MEMORY.md:', e);
      setRawContent('');
      setSections([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadMemory();
  }, [loadMemory]);

  // Reload when livekit signals memory update
  useEffect(() => {
    if (!livekit?.memoryUpdatedAt) return;
    loadMemory();
  }, [livekit?.memoryUpdatedAt, loadMemory]);

  // Save: serialize sections → markdown → API
  const saveMemory = useCallback(async (newSections) => {
    setSaving(true);
    try {
      const md = serializeMemoryCards(newSections);
      await api.upsertMemory('MEMORY.md', md, 'long_term');
      setRawContent(md);
      setSections(newSections);
    } catch (e) {
      console.error('Failed to save MEMORY.md:', e);
    } finally {
      setSaving(false);
    }
  }, []);

  // ── Item operations ──
  const handleEditItem = useCallback((sectionIdx, itemIdx, newValue) => {
    setSections(prev => {
      const next = prev.map((s, si) => si === sectionIdx
        ? { ...s, items: s.items.map((item, ii) => ii === itemIdx ? newValue : item) }
        : s
      );
      saveMemory(next);
      return next;
    });
  }, [saveMemory]);

  const handleDeleteItem = useCallback((sectionIdx, itemIdx) => {
    setSections(prev => {
      const next = prev.map((s, si) => si === sectionIdx
        ? { ...s, items: s.items.filter((_, ii) => ii !== itemIdx) }
        : s
      ).filter(s => s.items.length > 0); // remove empty sections
      saveMemory(next);
      return next;
    });
  }, [saveMemory]);

  const handleAddItem = useCallback((sectionIdx, value) => {
    setSections(prev => {
      const next = prev.map((s, si) => si === sectionIdx
        ? { ...s, items: [...s.items, value] }
        : s
      );
      saveMemory(next);
      return next;
    });
  }, [saveMemory]);

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin" style={{ color: 'rgba(0,0,0,0.15)' }} />
      </div>
    );
  }

  // ── Empty state ──
  if (sections.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center py-16 px-6">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
          style={{ background: 'rgba(0,0,0,0.04)' }}>
          <span style={{ fontSize: 28 }}>🧠</span>
        </div>
        <p className="font-semibold mb-1" style={{ fontSize: 16, color: 'rgba(0,0,0,0.55)' }}>
          No memories yet
        </p>
        <p className="leading-relaxed" style={{ fontSize: 14, color: 'rgba(0,0,0,0.3)' }}>
          After chatting with AI, it will automatically remember your preferences and important info.
        </p>
      </div>
    );
  }

  // ── Card View ──
  return (
    <div className="space-y-3">
      {saving && (
        <div className="flex items-center justify-center gap-2 py-1.5">
          <Loader2 size={12} className="animate-spin" style={{ color: 'rgba(0,0,0,0.3)' }} />
          <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.3)' }}>Saving...</span>
        </div>
      )}
      {sections.map((section, sectionIdx) => (
        <SectionCard
          key={section.title}
          section={section}
          sectionIdx={sectionIdx}
          onEditItem={handleEditItem}
          onDeleteItem={handleDeleteItem}
          onAddItem={handleAddItem}
        />
      ))}
    </div>
  );
}

// ── Section Card ──
function SectionCard({ section, sectionIdx, onEditItem, onDeleteItem, onAddItem }) {
  const [adding, setAdding] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: sectionIdx * 0.04, ...IOS_SPRING }}
      style={{
        background: '#fff',
        borderRadius: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 0 0 0.5px rgba(0,0,0,0.03)',
        overflow: 'hidden',
      }}
    >
      {/* Section header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="font-semibold" style={{ fontSize: 15, color: '#000' }}>
          {section.title}
        </span>
        <button
          onClick={() => setAdding(true)}
          className="p-1 rounded-full hover:bg-black/[0.04] transition-colors"
          style={{ color: 'rgba(0,0,0,0.3)' }}
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Items */}
      <div className="px-4 pb-3">
        <AnimatePresence initial={false}>
          {section.items.map((item, itemIdx) => (
            <MemoryItem
              key={`${item}-${itemIdx}`}
              value={item}
              onEdit={(val) => onEditItem(sectionIdx, itemIdx, val)}
              onDelete={() => onDeleteItem(sectionIdx, itemIdx)}
            />
          ))}
        </AnimatePresence>

        {/* Add new item inline */}
        <AnimatePresence>
          {adding && (
            <AddItemInput
              onSubmit={(val) => {
                onAddItem(sectionIdx, val);
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ── Single Memory Item (swipe-to-delete + tap-to-edit) ──
const DELETE_ZONE_WIDTH = 72;
const SWIPE_THRESHOLD = 40;

function MemoryItem({ value, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [showDelete, setShowDelete] = useState(false);
  const inputRef = useRef(null);
  const dragX = useMotionValue(0);
  const deleteOpacity = useTransform(dragX, [-DELETE_ZONE_WIDTH, -SWIPE_THRESHOLD, 0], [1, 0.5, 0]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== value) {
      onEdit(trimmed);
    }
    setEditing(false);
  };

  const handleDragEnd = (_, info) => {
    if (info.offset.x < -SWIPE_THRESHOLD) {
      // Snap open to reveal delete zone
      animate(dragX, -DELETE_ZONE_WIDTH, { type: 'spring', stiffness: 400, damping: 35 });
      setShowDelete(true);
    } else {
      // Snap back
      animate(dragX, 0, { type: 'spring', stiffness: 400, damping: 35 });
      setShowDelete(false);
    }
  };

  const handleDeleteConfirm = () => {
    onDelete();
    setShowDelete(false);
  };

  const handleCloseSwipe = () => {
    animate(dragX, 0, { type: 'spring', stiffness: 400, damping: 35 });
    setShowDelete(false);
  };

  if (editing) {
    return (
      <motion.div
        layout
        className="flex items-center gap-2 py-1.5"
        style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}
      >
        <input
          ref={inputRef}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.target.blur(); }
            if (e.key === 'Escape') { setEditValue(value); setEditing(false); }
          }}
          className="flex-1 px-2 py-1 rounded-lg focus:outline-none"
          style={{
            fontSize: 14, color: '#000', background: 'rgba(0,0,0,0.03)',
            border: '1px solid rgba(0,122,255,0.3)',
          }}
        />
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={handleSave}
          className="shrink-0 px-2 py-0.5 rounded-md active:opacity-70 transition-opacity"
          style={{ color: 'rgb(0,122,255)', fontSize: 14, fontWeight: 500 }}
        >
          Done
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
      transition={IOS_SPRING}
      style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid rgba(0,0,0,0.04)' }}
    >
      {/* Delete zone (behind content) */}
      <motion.div
        style={{
          position: 'absolute', right: 0, top: 0, bottom: 0,
          width: DELETE_ZONE_WIDTH,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          background: 'rgba(255,59,48,0.9)',
          borderRadius: '0 0 0 0',
          opacity: deleteOpacity,
        }}
      >
        <button
          onClick={handleDeleteConfirm}
          className="flex items-center justify-center w-full h-full"
          style={{ color: '#fff', fontSize: 13, fontWeight: 500 }}
        >
          Delete
        </button>
      </motion.div>

      {/* Swipeable content row */}
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -DELETE_ZONE_WIDTH, right: 0 }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        style={{ x: dragX, background: '#fff', position: 'relative', zIndex: 1 }}
        className="flex items-center gap-2 py-1.5"
        onClick={() => {
          // Only enter edit if not swiped open
          if (!showDelete) {
            setEditValue(value);
            setEditing(true);
          } else {
            handleCloseSwipe();
          }
        }}
      >
        <span className="shrink-0" style={{ color: 'rgba(0,0,0,0.2)', fontSize: 10 }}>●</span>
        <span
          className="flex-1 cursor-pointer select-none"
          style={{ fontSize: 14, color: 'rgba(0,0,0,0.75)', lineHeight: 1.5 }}
        >
          {value}
        </span>
      </motion.div>
    </motion.div>
  );
}

// ── Add Item Input ──
function AddItemInput({ onSubmit, onCancel }) {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
    else onCancel();
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={IOS_SPRING}
      className="flex items-center gap-2 pt-2"
    >
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') handleSubmit();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="Add new item..."
        className="flex-1 px-2 py-1 rounded-lg focus:outline-none"
        style={{
          fontSize: 14, color: '#000', background: 'rgba(0,0,0,0.03)',
          border: '1px solid rgba(0,0,0,0.08)',
        }}
      />
      <button onClick={handleSubmit}
        className="p-1 rounded-full hover:bg-black/[0.04] transition-colors"
        style={{ color: 'rgba(52,199,89,0.8)' }}>
        <Check size={14} />
      </button>
      <button onClick={onCancel}
        className="p-1 rounded-full hover:bg-black/[0.04] transition-colors"
        style={{ color: 'rgba(0,0,0,0.3)' }}>
        <X size={14} />
      </button>
    </motion.div>
  );
}
