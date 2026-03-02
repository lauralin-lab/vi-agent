import { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Search, User, Aperture, Camera, Eye, ChevronDown, ChevronRight, X } from 'lucide-react';
import USE_CASES from '../data/useCaseData.jsx';
import PromotionBlock from './PromotionBlock.jsx';
import QuickStartTemplates from './QuickStartTemplates.jsx';
import QUICK_START_TEMPLATES from '../data/quickStartTemplates.jsx';

// ─── Timeline grouping helper ─────────────────────────────
function getTimelineGroup(dateStr) {
    const d = dateStr.toLowerCase().trim();
    if (d.includes('just now') || d.includes('min') || d.includes('hour') && !d.includes('hours')) {
        return 'Today';
    }
    if (d.includes('hours')) {
        const hours = parseInt(d);
        if (hours && hours <= 12) return 'Today';
        return 'Today';
    }
    if (d === 'yesterday') return 'Yesterday';
    if (d.includes('day') || d.includes('days')) {
        const days = parseInt(d);
        if (days && days <= 7) return 'This Week';
        return 'Earlier';
    }
    if (d.includes('week')) return 'Earlier';
    if (d.includes('month') || d.includes('year')) return 'Earlier';
    return 'Earlier';
}

const GROUP_ORDER = ['Today', 'Yesterday', 'This Week', 'Earlier'];

export default function HistoryView({ onBack, onSelectSession, onOpenProfile, onSelectTemplate, isEmpty = false }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchOpen, setSearchOpen] = useState(false);
    const searchInputRef = useRef(null);
    const [expandedGroups, setExpandedGroups] = useState({ 'Today': true });

    const hasItems = !isEmpty && USE_CASES.length > 0;

    // Filter use cases by search query
    const filteredCases = useMemo(() => {
        if (!searchQuery.trim()) return USE_CASES;
        const q = searchQuery.toLowerCase();
        return USE_CASES.filter(uc =>
            uc.title.toLowerCase().includes(q) ||
            uc.category.toLowerCase().includes(q)
        );
    }, [searchQuery]);

    // Group filtered cases by timeline
    const groupedCases = useMemo(() => {
        const groups = {};
        filteredCases.forEach(uc => {
            const group = getTimelineGroup(uc.date);
            if (!groups[group]) groups[group] = [];
            groups[group].push(uc);
        });
        return groups;
    }, [filteredCases]);

    const toggleGroup = (groupName) => {
        setExpandedGroups(prev => ({
            ...prev,
            [groupName]: !prev[groupName]
        }));
    };

    const expandAll = () => {
        const all = {};
        GROUP_ORDER.forEach(g => { if (groupedCases[g]) all[g] = true; });
        setExpandedGroups(all);
    };

    const toggleSearch = () => {
        if (searchOpen) {
            setSearchQuery('');
            setSearchOpen(false);
        } else {
            setSearchOpen(true);
            setTimeout(() => searchInputRef.current?.focus(), 100);
        }
    };

    return (
        <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="w-full h-full bg-[#0a0a0a] text-white relative z-40 texture-grain overflow-hidden"
        >
            {/* ═══ Scrollable content area ═══ */}
            <div className="w-full h-full overflow-y-auto precision-scroll pb-28 pt-12">

                {/* ═══ Promotion Block ═══ */}
                <PromotionBlock onCameraClick={onBack} onOpenProfile={onOpenProfile} />

                {/* ═══ Quick Start Templates ═══ */}
                <QuickStartTemplates
                    templates={QUICK_START_TEMPLATES}
                    onSelectTemplate={onSelectTemplate}
                />

                {/* ═══ THREADS section header with icon actions ═══ */}
                {hasItems && (
                    <div className="px-6 mb-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono font-semibold text-white/30 tracking-[0.2em] uppercase">
                                    History
                                </span>
                                <span className="text-[10px] font-mono text-white/15">
                                    · {filteredCases.length}
                                </span>
                            </div>
                            <button
                                onClick={toggleSearch}
                                className="flex items-center justify-center text-white/30 hover:text-white/50 active:scale-90 transition-all duration-200"
                            >
                                {searchOpen ? <X size={14} strokeWidth={1.8} /> : <Search size={14} strokeWidth={1.8} />}
                            </button>
                        </div>

                        {/* Inline search input — expands on tap */}
                        <AnimatePresence>
                            {searchOpen && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0, marginTop: 0 }}
                                    animate={{ height: 'auto', opacity: 1, marginTop: 10 }}
                                    exit={{ height: 0, opacity: 0, marginTop: 0 }}
                                    transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                                    className="overflow-hidden"
                                >
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={13} strokeWidth={2} />
                                        <input
                                            ref={searchInputRef}
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="Search threads..."
                                            className="
                                                w-full bg-white/[0.03] border border-white/[0.06]
                                                rounded-lg py-2 pl-8 pr-8
                                                text-[12px] text-white/80
                                                placeholder:text-white/20
                                                font-light tracking-wide
                                                focus:outline-none focus:bg-white/[0.05] focus:border-white/[0.12]
                                                transition-all duration-200
                                            "
                                        />
                                        {searchQuery && (
                                            <button
                                                onClick={() => setSearchQuery('')}
                                                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                                            >
                                                <X size={9} strokeWidth={2.5} className="text-white/50" />
                                            </button>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}

                {/* ═══ Content: Timeline or Empty State ═══ */}
                {hasItems ? (
                    <div className="px-5 pb-4">
                        {filteredCases.length === 0 ? (
                            /* No search results */
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex flex-col items-center py-16"
                            >
                                <Search size={28} strokeWidth={1.2} className="text-white/10 mb-4" />
                                <p className="text-[13px] text-white/25 font-light">
                                    No results for "{searchQuery}"
                                </p>
                            </motion.div>
                        ) : (
                            /* Timeline groups */
                            <div className="space-y-2">
                                {GROUP_ORDER.map(groupName => {
                                    const items = groupedCases[groupName];
                                    if (!items || items.length === 0) return null;
                                    const isExpanded = !!expandedGroups[groupName];

                                    return (
                                        <motion.div
                                            key={groupName}
                                            initial={{ opacity: 0, y: 12 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                                            className="rounded-2xl bg-white/[0.02] border border-white/[0.05] overflow-hidden"
                                        >
                                            {/* Group header — tap to toggle */}
                                            <button
                                                onClick={() => toggleGroup(groupName)}
                                                className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] active:bg-white/[0.05] transition-colors"
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <span className="text-[12px] font-semibold text-white/70 tracking-wide">
                                                        {groupName}
                                                    </span>
                                                    <span className="text-[10px] font-mono text-white/20 bg-white/[0.04] px-1.5 py-0.5 rounded-md">
                                                        {items.length}
                                                    </span>
                                                </div>
                                                <motion.div
                                                    animate={{ rotate: isExpanded ? 0 : -90 }}
                                                    transition={{ duration: 0.2 }}
                                                >
                                                    <ChevronDown size={14} strokeWidth={2} className="text-white/25" />
                                                </motion.div>
                                            </button>

                                            {/* Group items — animated expand/collapse */}
                                            <AnimatePresence initial={false}>
                                                {isExpanded && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div className="px-1 pb-1.5">
                                                            {items.map((useCase, index) => (
                                                                <motion.div
                                                                    key={useCase.id}
                                                                    initial={{ opacity: 0, x: -8 }}
                                                                    animate={{ opacity: 1, x: 0 }}
                                                                    transition={{
                                                                        delay: index * 0.04,
                                                                        duration: 0.3,
                                                                        ease: [0.23, 1, 0.32, 1]
                                                                    }}
                                                                    onClick={() => onSelectSession && onSelectSession(useCase.sessionData)}
                                                                    className="
                                                                        flex items-center gap-3.5 px-3 py-2.5 mx-1 rounded-xl
                                                                        hover:bg-white/[0.04] active:scale-[0.98]
                                                                        cursor-pointer transition-all duration-200
                                                                        group
                                                                    "
                                                                >
                                                                    {/* Thumbnail */}
                                                                    <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 relative bg-white/[0.04]">
                                                                        <img
                                                                            src={useCase.thumbnail}
                                                                            alt={useCase.title}
                                                                            className="w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity duration-300"
                                                                        />
                                                                        {/* Subtle inner border */}
                                                                        <div className="absolute inset-0 rounded-xl border border-white/[0.06]" />
                                                                    </div>

                                                                    {/* Text content */}
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-[13px] font-medium text-white/85 truncate tracking-wide leading-tight">
                                                                            {useCase.title}
                                                                        </p>
                                                                        <div className="flex items-center gap-2 mt-1">
                                                                            <span className={`
                                                                                text-[8px] font-mono font-semibold uppercase tracking-[0.1em]
                                                                                px-1.5 py-0.5 rounded-md
                                                                                ${useCase.categoryColor}
                                                                            `}>
                                                                                {useCase.category}
                                                                            </span>
                                                                            <span className="text-[10px] font-mono text-white/20">
                                                                                {useCase.date}
                                                                            </span>
                                                                        </div>
                                                                    </div>

                                                                    {/* Arrow indicator */}
                                                                    <ChevronRight size={14} strokeWidth={1.8} className="text-white/10 group-hover:text-white/30 flex-shrink-0 transition-colors" />
                                                                </motion.div>
                                                            ))}
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ) : (
                    /* ═══ Empty State — «The World's First Camera» ═══ */
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 1, delay: 0.3 }}
                        className="flex flex-col items-center justify-center px-8 pt-10 pb-24 relative"
                    >
                        {/* Background glow for empty state */}
                        <motion.div
                            className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] rounded-full pointer-events-none"
                            style={{
                                background: 'radial-gradient(circle, rgba(100, 60, 255, 0.04) 0%, transparent 70%)',
                            }}
                            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
                            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                        />

                        {/* Animated eye with concentric rings */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.3 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.4, type: 'spring', stiffness: 180, damping: 18 }}
                            className="relative mb-10"
                        >
                            {/* Outermost ring */}
                            <motion.div
                                className="absolute inset-[-24px] rounded-full"
                                style={{ border: '1px solid rgba(140, 120, 255, 0.06)' }}
                                animate={{ scale: [1, 1.08, 1], opacity: [0.3, 0.6, 0.3] }}
                                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                            />
                            {/* Middle ring */}
                            <motion.div
                                className="absolute inset-[-12px] rounded-full"
                                style={{ border: '1px solid rgba(140, 120, 255, 0.1)' }}
                                animate={{ scale: [1, 1.05, 1], opacity: [0.4, 0.8, 0.4] }}
                                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                            />

                            {/* Core circle */}
                            <div
                                className="w-24 h-24 rounded-full flex items-center justify-center relative overflow-hidden"
                                style={{
                                    background: 'linear-gradient(145deg, rgba(120, 90, 255, 0.08), rgba(60, 40, 150, 0.04))',
                                    border: '1px solid rgba(140, 120, 255, 0.12)',
                                    boxShadow: '0 0 30px rgba(100, 60, 255, 0.06), inset 0 0 20px rgba(100, 60, 255, 0.03)',
                                }}
                            >
                                <motion.div
                                    animate={{ scale: [1, 1.1, 1] }}
                                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                                >
                                    <Eye size={36} strokeWidth={1} className="text-purple-300/25" />
                                </motion.div>
                            </div>

                            {/* Orbiting dot 1 */}
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                                className="absolute inset-[-16px]"
                            >
                                <motion.div
                                    className="w-2 h-2 rounded-full absolute top-0 left-1/2 -translate-x-1/2"
                                    style={{
                                        background: 'radial-gradient(circle, rgba(140, 120, 255, 0.6), transparent)',
                                        boxShadow: '0 0 8px rgba(140, 120, 255, 0.3)',
                                    }}
                                    animate={{ opacity: [0.4, 1, 0.4] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                />
                            </motion.div>
                            {/* Orbiting dot 2 — counter-rotate */}
                            <motion.div
                                animate={{ rotate: -360 }}
                                transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
                                className="absolute inset-[-28px]"
                            >
                                <motion.div
                                    className="w-1.5 h-1.5 rounded-full absolute bottom-0 left-1/2 -translate-x-1/2"
                                    style={{
                                        background: 'radial-gradient(circle, rgba(80, 160, 255, 0.5), transparent)',
                                        boxShadow: '0 0 6px rgba(80, 160, 255, 0.2)',
                                    }}
                                    animate={{ opacity: [0.3, 0.8, 0.3] }}
                                    transition={{ duration: 3, repeat: Infinity }}
                                />
                            </motion.div>
                        </motion.div>

                        {/* Tagline — with word reveal animation */}
                        <motion.p
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.55, duration: 0.7, ease: [0.23, 1, 0.32, 1] }}
                            className="text-[20px] font-bold text-center leading-snug tracking-tight max-w-[280px] mb-4"
                            style={{
                                background: 'linear-gradient(145deg, rgba(255,255,255,0.6), rgba(180,170,255,0.4), rgba(255,255,255,0.35))',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                backgroundClip: 'text',
                            }}
                        >
                            The World's First Camera That Thinks Before It Sees
                        </motion.p>

                        <motion.p
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.65, duration: 0.6 }}
                            className="text-[12px] text-white/22 text-center font-light leading-relaxed max-w-[240px] mb-10"
                        >
                            Your visual explorations and AI sessions will appear here. Start by pointing your camera at something interesting.
                        </motion.p>

                        {/* Start exploring button — glowing */}
                        <motion.button
                            onClick={onBack}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.75, type: 'spring', stiffness: 200, damping: 18 }}
                            whileTap={{ scale: 0.9 }}
                            whileHover={{ scale: 1.04 }}
                            className="
                                flex items-center gap-2.5 px-6 py-3
                                rounded-full relative overflow-hidden
                                transition-all duration-300
                            "
                            style={{
                                background: 'linear-gradient(135deg, rgba(120, 90, 255, 0.12), rgba(60, 140, 255, 0.08))',
                                border: '1px solid rgba(140, 120, 255, 0.18)',
                                boxShadow: '0 4px 20px rgba(100, 60, 255, 0.08), 0 0 0 1px rgba(140, 120, 255, 0.05)',
                            }}
                        >
                            {/* Button shimmer */}
                            <motion.div
                                className="absolute inset-0"
                                style={{
                                    background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)',
                                }}
                                animate={{ x: ['-100%', '200%'] }}
                                transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 3, ease: 'easeInOut' }}
                            />
                            <Camera size={15} strokeWidth={1.8} className="text-purple-300/60 relative z-10" />
                            <span className="text-[12px] font-medium text-purple-200/60 tracking-wide relative z-10">
                                Start exploring
                            </span>
                        </motion.button>
                    </motion.div>
                )}
            </div>

            {/* ═══ Back FAB — precision-engineered button ═══ */}
            <div className="absolute bottom-8 right-6 z-50">
                <motion.button
                    onClick={onBack}
                    initial={{ opacity: 0, scale: 0.5, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.5 }}
                    whileTap={{ scale: 0.85 }}
                    whileHover={{ scale: 1.08 }}
                    className="
                        w-14 h-14 rounded-full
                        bg-white/[0.9] text-[#0a0a0a]
                        flex items-center justify-center
                        shadow-[0_4px_20px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.1)]
                        transition-shadow duration-200
                    "
                >
                    <Aperture size={22} strokeWidth={1.8} />
                </motion.button>
            </div>

            {/* ═══ Bottom fade ═══ */}
            <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#0a0a0a] to-transparent pointer-events-none z-40" />
        </motion.div>
    );
}
