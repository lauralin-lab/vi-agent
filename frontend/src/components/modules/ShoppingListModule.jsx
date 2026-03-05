/**
 * ShoppingListModule — interactive shopping list with category grouping.
 * Slots: title, items[], total_estimate, store_suggestion
 * items[]: { name, quantity, category, checked, price_estimate }
 */

import { useState, useMemo, useCallback } from 'react';
import { Copy, ListChecks } from 'lucide-react';
import {
  GlassCard, GlassSection, GlassChip, GlassButton,
  GlassDivider, ModuleHeader, CheckboxItem, AccentBar,
} from './shared';

export default function ShoppingListModule({ data, onAction }) {
  const { title, items: initialItems = [], total_estimate, store_suggestion } = data || {};

  const [checkedMap, setCheckedMap] = useState(() => {
    const map = {};
    initialItems.forEach((item, i) => { map[i] = !!item.checked; });
    return map;
  });

  const toggle = useCallback((idx) => {
    setCheckedMap((prev) => {
      const next = { ...prev, [idx]: !prev[idx] };
      onAction?.({ type: 'item_checked', index: idx, checked: next[idx] });
      return next;
    });
  }, [onAction]);

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
      .map((item, i) => `${checkedMap[i] ? '[x]' : '[ ]'} ${item.name}${item.quantity ? ` (${item.quantity})` : ''}`)
      .join('\n');
    navigator.clipboard?.writeText(text);
    onAction?.({ type: 'copy' });
  }, [initialItems, checkedMap, onAction]);

  if (!data) return null;

  return (
    <GlassCard>
      <ModuleHeader
        title={title || 'Shopping List'}
        subtitle={`${checkedCount} of ${initialItems.length} items`}
        icon="🛒"
      >
        <button
          onClick={toggleAll}
          className="text-black/30 hover:text-purple-400 transition-colors p-1"
          title={allChecked ? 'Uncheck all' : 'Check all'}
        >
          <ListChecks size={18} />
        </button>
      </ModuleHeader>

      {/* Progress bar */}
      <div className="h-1 bg-black/[0.06] rounded-full mb-4 overflow-hidden">
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
                    className="text-black/30 font-medium uppercase tracking-wider mt-3 mb-1 first:mt-0"
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
                    <span className="flex items-center gap-2 w-full">
                      <span className="flex-1">{item.name}</span>
                      {item.quantity && (
                        <span className="text-black/25 shrink-0" style={{ fontSize: 'var(--text-xs)' }}>
                          {item.quantity}
                        </span>
                      )}
                      {item.price_estimate && (
                        <span className="text-emerald-400/60 shrink-0" style={{ fontSize: 'var(--text-xs)' }}>
                          {item.price_estimate}
                        </span>
                      )}
                    </span>
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
                <span className="flex items-center gap-2 w-full">
                  <span className="flex-1">{item.name}</span>
                  {item.quantity && (
                    <span className="text-black/25 shrink-0" style={{ fontSize: 'var(--text-xs)' }}>
                      {item.quantity}
                    </span>
                  )}
                  {item.price_estimate && (
                    <span className="text-emerald-400/60 shrink-0" style={{ fontSize: 'var(--text-xs)' }}>
                      {item.price_estimate}
                    </span>
                  )}
                </span>
              </CheckboxItem>
            ))
        }
      </div>

      {/* Total + Store suggestion */}
      {(total_estimate || store_suggestion) && (
        <>
          <GlassDivider />
          <GlassSection>
            {total_estimate && (
              <div className="flex justify-between items-center">
                <span className="text-black/40" style={{ fontSize: 'var(--text-sm)' }}>Estimated Total</span>
                <span className="text-emerald-300 font-medium" style={{ fontSize: 'var(--text-sm)' }}>
                  {total_estimate}
                </span>
              </div>
            )}
            {store_suggestion && (
              <p className="text-black/30 mt-1" style={{ fontSize: 'var(--text-xs)' }}>
                {store_suggestion}
              </p>
            )}
          </GlassSection>
        </>
      )}

      <GlassDivider />

      {/* Actions */}
      <div className="flex gap-2">
        <GlassButton icon={Copy} onClick={copyList} className="flex-1">
          Copy List
        </GlassButton>
      </div>
    </GlassCard>
  );
}
