/**
 * ChecklistModule — interactive shopping/todo list with checkboxes.
 * Supports category grouping, select-all, copy, and share.
 */

import { useState, useMemo, useCallback } from 'react';
import { CheckSquare, Copy, Share2, ListChecks } from 'lucide-react';
import {
  GlassCard, GlassSection, GlassChip, GlassButton,
  GlassDivider, ModuleHeader, CheckboxItem, AccentBar,
} from './shared';

export default function ChecklistModule({ data, onAction }) {
  if (!data) return null;

  const { title, items: initialItems = [] } = data;
  const [checkedMap, setCheckedMap] = useState(() => {
    const map = {};
    initialItems.forEach((item, i) => {
      map[i] = !!item.checked;
    });
    return map;
  });

  const toggle = useCallback((idx) => {
    setCheckedMap((prev) => ({ ...prev, [idx]: !prev[idx] }));
  }, []);

  const checkedCount = useMemo(
    () => Object.values(checkedMap).filter(Boolean).length,
    [checkedMap],
  );

  const allChecked = checkedCount === initialItems.length && initialItems.length > 0;

  const toggleAll = useCallback(() => {
    const newVal = !allChecked;
    setCheckedMap((prev) => {
      const next = { ...prev };
      initialItems.forEach((_, i) => { next[i] = newVal; });
      return next;
    });
  }, [allChecked, initialItems]);

  // Group items by category
  const grouped = useMemo(() => {
    const groups = {};
    initialItems.forEach((item, i) => {
      const cat = item.category || '';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push({ ...item, _idx: i });
    });
    return groups;
  }, [initialItems]);

  const categoryKeys = Object.keys(grouped);
  const hasCategories = categoryKeys.length > 1 || (categoryKeys.length === 1 && categoryKeys[0] !== '');

  const copyList = useCallback(() => {
    const text = initialItems
      .map((item, i) => `${checkedMap[i] ? '[x]' : '[ ]'} ${item.text}`)
      .join('\n');
    navigator.clipboard?.writeText(text);
    onAction?.({ type: 'copy' });
  }, [initialItems, checkedMap, onAction]);

  const shareList = useCallback(() => {
    const text = initialItems.map((item) => `- ${item.text}`).join('\n');
    if (navigator.share) {
      navigator.share({ title: title || 'Checklist', text });
    }
    onAction?.({ type: 'share' });
  }, [initialItems, title, onAction]);

  return (
    <GlassCard>
      <ModuleHeader
        title={title || 'Checklist'}
        subtitle={`${checkedCount} of ${initialItems.length} done`}
        icon="✅"
      >
        <button
          onClick={toggleAll}
          className="text-white/40 hover:text-purple-400 transition-colors p-1"
          title={allChecked ? 'Uncheck all' : 'Check all'}
        >
          <ListChecks size={18} />
        </button>
      </ModuleHeader>

      {/* Progress bar */}
      <div className="h-1 bg-white/[0.06] rounded-full mb-4 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-300"
          style={{ width: `${initialItems.length > 0 ? (checkedCount / initialItems.length) * 100 : 0}%` }}
        />
      </div>

      {/* Items */}
      <div className="space-y-1">
        {hasCategories
          ? categoryKeys.map((cat) => (
              <div key={cat}>
                {cat && (
                  <p
                    className="text-white/40 font-medium uppercase tracking-wider mt-3 mb-1 first:mt-0"
                    style={{ fontSize: 'var(--text-xs)' }}
                  >
                    {cat}
                  </p>
                )}
                {grouped[cat].map((item) => (
                  <CheckboxItem
                    key={item._idx}
                    checked={!!checkedMap[item._idx]}
                    onToggle={() => toggle(item._idx)}
                  >
                    <span>{item.text}</span>
                    {item.note && (
                      <span className="block text-white/30 mt-0.5" style={{ fontSize: 'var(--text-xs)' }}>
                        {item.note}
                      </span>
                    )}
                  </CheckboxItem>
                ))}
              </div>
            ))
          : initialItems.map((item, i) => (
              <CheckboxItem
                key={i}
                checked={!!checkedMap[i]}
                onToggle={() => toggle(i)}
              >
                <span>{item.text}</span>
                {item.note && (
                  <span className="block text-white/30 mt-0.5" style={{ fontSize: 'var(--text-xs)' }}>
                    {item.note}
                  </span>
                )}
              </CheckboxItem>
            ))
        }
      </div>

      <GlassDivider />

      {/* Actions */}
      <div className="flex gap-2">
        <GlassButton icon={Copy} onClick={copyList} className="flex-1">
          Copy
        </GlassButton>
        <GlassButton icon={Share2} onClick={shareList} className="flex-1">
          Share
        </GlassButton>
      </div>
    </GlassCard>
  );
}
