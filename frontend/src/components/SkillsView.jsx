import { useState, useEffect, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { IOS_SPRING } from '../constants';

// ── Skill Card ──
const SkillCard = memo(function SkillCard({ skill, onToggle, index }) {
  const isEnabled = skill.enabled !== false;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12, scale: 0.95 }}
      transition={{ delay: index * 0.04, ...IOS_SPRING }}
      className="flex items-center gap-4"
      style={{
        background: '#fff',
        borderRadius: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.04)',
        padding: '16px 18px',
      }}
    >
      {/* Icon */}
      <div
        className="w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center"
        style={{
          background: skill.ui?.card_color || 'rgba(0,0,0,0.04)',
          fontSize: 22,
        }}
      >
        {skill.icon || '...'}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p
          className="font-semibold truncate"
          style={{ fontSize: 16, color: '#000', letterSpacing: '-0.01em' }}
        >
          {skill.name}
        </p>
        {skill.description && (
          <p
            className="truncate mt-0.5"
            style={{ fontSize: 13, color: 'rgba(0,0,0,0.35)' }}
          >
            {skill.description}
          </p>
        )}
        {skill.category && (
          <span
            className="inline-block mt-1 px-2 py-0.5 rounded-full"
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: 'rgba(0,0,0,0.3)',
              background: 'rgba(0,0,0,0.03)',
            }}
          >
            {skill.category}
          </span>
        )}
      </div>

      {/* Toggle */}
      <button
        onClick={() => onToggle(skill)}
        className="shrink-0 relative transition-colors duration-200"
        style={{
          width: 48,
          height: 28,
          borderRadius: 14,
          background: isEnabled ? '#000' : 'rgba(0,0,0,0.08)',
        }}
      >
        <motion.div
          layout
          className="absolute top-1 rounded-full bg-white"
          style={{
            width: 20,
            height: 20,
            left: isEnabled ? 24 : 4,
            boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
          }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      </button>
    </motion.div>
  );
});

// ── Main SkillsView Component ──
export default function SkillsView() {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadSkills = useCallback(async () => {
    try {
      const data = await api.request('/api/skills');
      setSkills(Array.isArray(data) ? data : (data?.skills || []));
    } catch (e) {
      console.error('Failed to load skills:', e);
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadSkills();
  }, [loadSkills]);

  const handleToggle = useCallback(async (skill) => {
    const slug = skill.slug;
    const isEnabled = skill.enabled !== false;
    try {
      if (isEnabled) {
        await api.request(`/api/skills/${encodeURIComponent(slug)}/disable`, { method: 'POST' });
      } else {
        await api.request(`/api/skills/${encodeURIComponent(slug)}/enable`, { method: 'POST' });
      }
      // Optimistic update
      setSkills(prev =>
        prev.map(s => s.slug === slug ? { ...s, enabled: !isEnabled } : s)
      );
    } catch (e) {
      console.error('Failed to toggle skill:', e);
    }
  }, []);

  // Split into installed/enabled vs available
  const mySkills = skills.filter(s => s.enabled !== false);
  const availableSkills = skills.filter(s => s.enabled === false);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin" style={{ color: 'rgba(0,0,0,0.15)' }} />
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
        <p className="font-semibold mb-1" style={{ fontSize: 16, color: 'rgba(0,0,0,0.55)' }}>
          No skills available
        </p>
        <p className="leading-relaxed" style={{ fontSize: 14, color: 'rgba(0,0,0,0.3)' }}>
          Skills will appear here once the system is configured with available capabilities.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 pb-24 flex flex-col">
      {/* My Skills section */}
      {mySkills.length > 0 && (
        <div className="mb-5">
          <p
            className="font-semibold uppercase tracking-wide px-2 mb-2"
            style={{ fontSize: 11, color: 'rgba(0,0,0,0.25)', letterSpacing: '0.06em' }}
          >
            My Skills
          </p>
          <div className="space-y-2.5">
            <AnimatePresence>
              {mySkills.map((skill, index) => (
                <SkillCard
                  key={skill.slug || skill.name}
                  skill={skill}
                  index={index}
                  onToggle={handleToggle}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Available Skills section */}
      {availableSkills.length > 0 && (
        <div>
          <p
            className="font-semibold uppercase tracking-wide px-2 mb-2"
            style={{ fontSize: 11, color: 'rgba(0,0,0,0.25)', letterSpacing: '0.06em' }}
          >
            Available Skills
          </p>
          <div className="space-y-2.5">
            <AnimatePresence>
              {availableSkills.map((skill, index) => (
                <SkillCard
                  key={skill.slug || skill.name}
                  skill={skill}
                  index={index}
                  onToggle={handleToggle}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
