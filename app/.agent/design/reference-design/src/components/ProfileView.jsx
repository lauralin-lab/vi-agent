import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Pencil, Check } from 'lucide-react';
import MEMORY_DATA from '../data/memoryData.jsx';

// Build initial markdown string from structured data
const initialMarkdown = MEMORY_DATA.categories
    .map(cat => `## ${cat.title}\n${cat.items.map(item => `- ${item}`).join('\n')}`)
    .join('\n\n');

// Parse markdown string back into structured sections
function parseMarkdown(md) {
    const sections = [];
    const lines = md.split('\n');
    let current = null;

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('## ')) {
            if (current) sections.push(current);
            current = { title: trimmed.slice(3).trim(), items: [] };
        } else if (trimmed.startsWith('- ') && current) {
            current.items.push(trimmed.slice(2).trim());
        }
    }
    if (current) sections.push(current);
    return sections;
}

export default function ProfileView({ onBack }) {
    const [markdown, setMarkdown] = useState(initialMarkdown);
    const [isEditing, setIsEditing] = useState(false);
    const [editBuffer, setEditBuffer] = useState(markdown);

    const sections = parseMarkdown(markdown);

    const handleEdit = () => {
        setEditBuffer(markdown);
        setIsEditing(true);
    };

    const handleSave = () => {
        setMarkdown(editBuffer);
        setIsEditing(false);
    };

    return (
        <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="w-full h-full bg-[#0a0a0a] text-white relative z-40 overflow-hidden"
        >
            {/* ═══ Scrollable content ═══ */}
            <div className="w-full h-full overflow-y-auto precision-scroll pb-16">

                {/* ═══ Header ═══ */}
                <div className="px-5 pt-16 pb-4 flex items-center relative">
                    <button
                        onClick={isEditing ? () => setIsEditing(false) : onBack}
                        className="w-9 h-9 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center hover:bg-white/[0.08] active:scale-90 transition-all"
                    >
                        <ChevronLeft size={18} strokeWidth={1.8} className="text-white/60" />
                    </button>
                    <h1 className="absolute left-1/2 -translate-x-1/2 text-[17px] font-semibold tracking-tight text-white/90">
                        {isEditing ? 'Edit Memory' : 'Memory'}
                    </h1>
                    {isEditing && (
                        <motion.button
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            onClick={handleSave}
                            className="absolute right-5 text-[13px] font-semibold text-black active:scale-90 transition-all px-4 py-1.5 rounded-lg bg-white border border-white/80 shadow-sm"
                        >
                            Save
                        </motion.button>
                    )}
                </div>

                {/* ═══ Overview Card — matches PromotionBlock style ═══ */}
                <div className="px-5 mb-5">
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ delay: 0.15, type: 'spring', stiffness: 180, damping: 22 }}
                        className="relative overflow-hidden rounded-3xl"
                        style={{
                            background: 'linear-gradient(155deg, #1a1535 0%, #15112e 25%, #0e0b20 50%, #0c0918 75%, #080612 100%)',
                            boxShadow: '0 8px 40px rgba(100, 60, 255, 0.08), 0 2px 12px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
                        }}
                    >
                        {/* Video background */}
                        <div className="absolute inset-0 overflow-hidden pointer-events-none">
                            <video
                                autoPlay
                                loop
                                muted
                                playsInline
                                className="absolute inset-0 w-full h-full object-cover"
                                style={{ opacity: 0.55 }}
                            >
                                <source src="/d7a534d1d2f9d9798947b2e2ea8f19e9.mp4" type="video/mp4" />
                            </video>
                            <div
                                className="absolute inset-0"
                                style={{
                                    background: `
                                        linear-gradient(180deg, rgba(10, 8, 20, 0.4) 0%, rgba(10, 8, 20, 0.2) 40%, rgba(10, 8, 20, 0.5) 100%),
                                        radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(10, 8, 20, 0.4) 100%)
                                    `,
                                }}
                            />
                        </div>

                        {/* Glass border */}
                        <div
                            className="absolute inset-0 rounded-3xl pointer-events-none"
                            style={{
                                border: '1px solid rgba(255, 255, 255, 0.06)',
                                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), inset 0 -1px 0 rgba(255, 255, 255, 0.02)',
                            }}
                        />

                        <div className="relative px-6 pt-10 pb-8 flex flex-col items-start text-left">
                            <motion.p
                                initial={{ opacity: 0, y: 14 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.25, duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
                                className="text-[16px] text-white/80 leading-relaxed font-normal tracking-tight"
                            >
                                Your agent's long-term mind.
                            </motion.p>
                            <motion.p
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.35, duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
                                className="text-[16px] text-white/80 leading-relaxed font-normal tracking-tight"
                            >
                                This is what your agent will remember and follow.
                            </motion.p>

                            {/* Edit button — white 20% transparent, backdrop blur */}
                            {!isEditing && (
                                <motion.button
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: 0.45, type: 'spring', stiffness: 300, damping: 20 }}
                                    onClick={handleEdit}
                                    className="mt-5 self-center w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-xl border border-white/[0.15] active:scale-90 transition-all"
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.2)',
                                    }}
                                >
                                    <Pencil size={16} strokeWidth={1.8} className="text-white" />
                                </motion.button>
                            )}
                        </div>
                    </motion.div>
                </div>

                {/* ═══ Memory Content ═══ */}
                <AnimatePresence mode="wait">
                    {isEditing ? (
                        /* ─── Edit Mode: raw markdown textarea ─── */
                        <motion.div
                            key="edit"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.25 }}
                            className="mx-5 mb-4"
                        >
                            <textarea
                                value={editBuffer}
                                onChange={(e) => setEditBuffer(e.target.value)}
                                className="
                                    w-full min-h-[320px] rounded-xl border border-white/[0.08] bg-white/[0.03]
                                    p-4 text-[13px] text-white/70 leading-relaxed font-mono
                                    focus:outline-none focus:border-white/[0.15] focus:bg-white/[0.05]
                                    resize-y transition-all duration-200
                                    placeholder:text-white/20
                                "
                                placeholder="## Section title&#10;- Item one&#10;- Item two"
                                spellCheck={false}
                            />
                        </motion.div>
                    ) : (
                        /* ─── Display Mode: Notion-like structured view ─── */
                        <motion.div
                            key="display"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.25 }}
                            className="mx-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-4 mb-4"
                        >
                            {sections.map((section, index) => (
                                <motion.div
                                    key={index}
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{
                                        delay: 0.15 + index * 0.06,
                                        type: 'spring',
                                        stiffness: 300,
                                        damping: 26,
                                    }}
                                >
                                    {/* Section heading — Notion-style */}
                                    <h3 className="text-[14px] font-semibold text-white/75 tracking-wide mb-2">
                                        {section.title}
                                    </h3>

                                    {/* Items */}
                                    <div className="space-y-1 pl-1">
                                        {section.items.map((item, i) => (
                                            <div key={i} className="flex items-start gap-2.5">
                                                <div className="w-1.5 h-1.5 rounded-full bg-white/15 mt-[7px] flex-shrink-0" />
                                                <span className="text-[13px] text-white/50 leading-relaxed">{item}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Divider — except last */}
                                    {index < sections.length - 1 && (
                                        <div className="mt-4 border-t border-white/[0.04]" />
                                    )}
                                </motion.div>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ═══ Last Updated ═══ */}
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-center text-[10px] text-white/15 font-mono tracking-wider mt-3 mb-8"
                >
                    Last updated: {MEMORY_DATA.lastUpdated}
                </motion.p>
            </div>
        </motion.div>
    );
}
