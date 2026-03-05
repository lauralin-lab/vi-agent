/**
 * QuizModule — interactive quiz with option selection and reveal.
 * Slots: question, options[], explanation, selected_option, revealed, image_url
 * options[]: { id, text, correct }
 */

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  GlassCard, GlassSection, GlassDivider, ModuleHeader,
} from './shared';

export default function QuizModule({ data, onAction }) {
  const {
    question, options = [], explanation,
    selected_option: initialSelected, revealed: initialRevealed,
    image_url,
  } = data || {};

  const [selectedId, setSelectedId] = useState(initialSelected || null);
  const [revealed, setRevealed] = useState(!!initialRevealed);

  const handleSelect = useCallback((optionId) => {
    if (revealed) return;
    setSelectedId(optionId);
    setRevealed(true);
    onAction?.({ type: 'option_selected', optionId });
  }, [revealed, onAction]);

  if (!data) return null;

  return (
    <GlassCard>
      <ModuleHeader title="Quiz" icon="❓" />

      {/* Question */}
      <p className="text-white/90 font-medium mb-4" style={{ fontSize: 'var(--text-lg)' }}>
        {question}
      </p>

      {/* Optional image */}
      {image_url && (
        <div className="rounded-xl overflow-hidden mb-4 border border-white/[0.06]">
          <img src={image_url} alt="Quiz" className="w-full h-auto object-cover" style={{ maxHeight: 200 }} />
        </div>
      )}

      {/* Options */}
      <div className="space-y-2">
        {options.map((option) => {
          const isSelected = selectedId === option.id;
          const isCorrect = option.correct;

          let borderClass = 'border-white/[0.08]';
          let bgClass = 'bg-white/[0.03] hover:bg-white/[0.06]';
          let textClass = 'text-white/80';

          if (revealed) {
            if (isCorrect) {
              borderClass = 'border-emerald-500/40';
              bgClass = 'bg-emerald-500/10';
              textClass = 'text-emerald-300';
            } else if (isSelected && !isCorrect) {
              borderClass = 'border-red-500/40';
              bgClass = 'bg-red-500/10';
              textClass = 'text-red-300';
            } else {
              bgClass = 'bg-white/[0.02]';
              textClass = 'text-white/30';
            }
          }

          return (
            <motion.button
              key={option.id}
              onClick={() => handleSelect(option.id)}
              disabled={revealed}
              whileTap={!revealed ? { scale: 0.98 } : {}}
              className={`
                w-full text-left rounded-xl p-3.5 border transition-all duration-200
                ${borderClass} ${bgClass}
                ${isSelected && revealed ? 'ring-2 ring-offset-0' : ''}
                ${isSelected && revealed && isCorrect ? 'ring-emerald-500/30' : ''}
                ${isSelected && revealed && !isCorrect ? 'ring-red-500/30' : ''}
                ${!revealed ? 'cursor-pointer' : 'cursor-default'}
              `}
            >
              <div className="flex items-center gap-3">
                {/* Option indicator */}
                <span
                  className={`
                    w-6 h-6 rounded-full border flex items-center justify-center shrink-0
                    ${revealed && isCorrect ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300' : ''}
                    ${revealed && isSelected && !isCorrect ? 'border-red-500/50 bg-red-500/20 text-red-300' : ''}
                    ${!revealed ? 'border-white/[0.12] bg-white/[0.04]' : ''}
                    ${revealed && !isCorrect && !isSelected ? 'border-white/[0.06] bg-transparent' : ''}
                  `}
                  style={{ fontSize: 'var(--text-xs)' }}
                >
                  {revealed && isCorrect ? '✓' : ''}
                  {revealed && isSelected && !isCorrect ? '✕' : ''}
                </span>

                <span className={textClass} style={{ fontSize: 'var(--text-sm)' }}>
                  {option.text}
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Explanation (shown after reveal) */}
      {revealed && explanation && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <GlassDivider />
          <GlassSection>
            <p className="text-white/40 font-medium uppercase tracking-wider mb-1" style={{ fontSize: 'var(--text-xs)' }}>
              Explanation
            </p>
            <p className="text-white/60" style={{ fontSize: 'var(--text-sm)' }}>
              {explanation}
            </p>
          </GlassSection>
        </motion.div>
      )}
    </GlassCard>
  );
}
