/**
 * RecipeModule — recipe card with ingredients, steps, and hero image.
 * Reuses CheckboxItem for checkable ingredients list.
 */

import { useState, useCallback } from 'react';
import { Clock, Users, Copy, ChefHat } from 'lucide-react';
import {
  GlassCard, GlassSection, GlassButton, GlassDivider,
  ModuleHeader, CheckboxItem, AccentBar,
} from './shared';

export default function RecipeModule({ data, onAction }) {
  if (!data) return null;

  const {
    title, image_url, prep_time, cook_time,
    servings, ingredients = [], steps = [],
  } = data;

  const [checkedIngredients, setCheckedIngredients] = useState({});

  const toggleIngredient = useCallback((idx) => {
    setCheckedIngredients((prev) => ({ ...prev, [idx]: !prev[idx] }));
  }, []);

  const copyIngredients = useCallback(() => {
    const text = ingredients
      .map((ing) => typeof ing === 'string' ? ing : `${ing.amount ? ing.amount + ' ' : ''}${ing.item || ing.name || ''}`)
      .join('\n');
    navigator.clipboard?.writeText(text);
    onAction?.({ type: 'copy_ingredients' });
  }, [ingredients, onAction]);

  return (
    <GlassCard padding={false}>
      {/* Hero Image */}
      {image_url && (
        <div className="relative h-[180px] overflow-hidden">
          <img src={image_url} alt={title || 'Recipe'} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        </div>
      )}

      <div className="p-4">
        <ModuleHeader title={title || 'Recipe'} icon="🍳" />

        {/* Time & Servings Row */}
        {(prep_time || cook_time || servings != null) && (
          <div className="flex flex-wrap gap-3 mb-4">
            {prep_time && (
              <div className="flex items-center gap-1.5 text-black/40" style={{ fontSize: 'var(--text-xs)' }}>
                <Clock size={13} className="text-purple-400/70" />
                <span>Prep {prep_time}</span>
              </div>
            )}
            {cook_time && (
              <div className="flex items-center gap-1.5 text-black/40" style={{ fontSize: 'var(--text-xs)' }}>
                <Clock size={13} className="text-amber-400/70" />
                <span>Cook {cook_time}</span>
              </div>
            )}
            {servings != null && (
              <div className="flex items-center gap-1.5 text-black/40" style={{ fontSize: 'var(--text-xs)' }}>
                <Users size={13} className="text-black/30" />
                <span>{servings} serving{servings !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        )}

        <AccentBar className="mb-4" />

        {/* Ingredients */}
        {ingredients.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <p
                className="text-black/30 font-medium uppercase tracking-wider"
                style={{ fontSize: 'var(--text-xs)' }}
              >
                Ingredients
              </p>
              <button
                onClick={copyIngredients}
                className="text-black/25 hover:text-black/50 transition-colors"
                title="Copy ingredients"
              >
                <Copy size={14} />
              </button>
            </div>
            <GlassSection>
              <div className="space-y-0.5">
                {ingredients.map((ing, i) => {
                  // Handle both string ("1 cup flour") and object ({amount, item}) formats
                  const isString = typeof ing === 'string';
                  return (
                    <CheckboxItem
                      key={i}
                      checked={!!checkedIngredients[i]}
                      onToggle={() => toggleIngredient(i)}
                    >
                      {isString ? ing : (
                        <>
                          {ing.amount && (
                            <span className="text-purple-300/80 mr-1.5">{ing.amount}</span>
                          )}
                          {ing.item || ing.name || ''}
                        </>
                      )}
                    </CheckboxItem>
                  );
                })}
              </div>
            </GlassSection>
          </div>
        )}

        {/* Steps */}
        {steps.length > 0 && (
          <div>
            <p
              className="text-black/30 font-medium uppercase tracking-wider mb-2"
              style={{ fontSize: 'var(--text-xs)' }}
            >
              Instructions
            </p>
            <div className="space-y-3">
              {steps.map((step, i) => {
                const text = typeof step === 'string' ? step : (step.description || step.text || step.title || '');
                return (
                  <div key={i} className="flex gap-3">
                    <span
                      className="w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center shrink-0 text-purple-300 font-medium"
                      style={{ fontSize: 'var(--text-xs)' }}
                    >
                      {i + 1}
                    </span>
                    <p className="text-white/75 pt-0.5" style={{ fontSize: 'var(--text-sm)' }}>
                      {text}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </GlassCard>
  );
}
