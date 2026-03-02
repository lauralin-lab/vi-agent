import { motion } from 'framer-motion';
import { ShoppingBag, Music, Film, FileText, Scissors } from 'lucide-react';

// Map icon name strings to Lucide components
const ICON_MAP = {
    ShoppingBag,
    Music,
    Film,
    FileText,
    Scissors,
};

export default function QuickStartTemplates({ templates, onSelectTemplate }) {
    if (!templates || templates.length === 0) return null;

    return (
        <div className="px-5 mb-5">
            {/* Section label */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2.8, duration: 0.5 }}
                className="flex items-center gap-2 mb-3 px-1"
            >
                <span className="text-[10px] font-mono font-semibold text-white/30 tracking-[0.2em] uppercase">
                    Quick Start
                </span>
            </motion.div>

            {/* Horizontal scrollable row */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 3.0, duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                className="flex gap-3 overflow-x-auto no-scrollbar pb-1"
                style={{ WebkitOverflowScrolling: 'touch' }}
            >
                {templates.map((template, index) => {
                    const IconComponent = ICON_MAP[template.icon];
                    return (
                        <motion.button
                            key={template.id}
                            initial={{ opacity: 0, y: 12, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{
                                delay: 3.1 + index * 0.08,
                                type: 'spring',
                                stiffness: 300,
                                damping: 22,
                            }}
                            whileTap={{ scale: 0.92 }}
                            whileHover={{ scale: 1.04 }}
                            onClick={() => onSelectTemplate(template)}
                            className="
                                relative overflow-hidden
                                min-w-[72px] w-[72px] h-[88px]
                                rounded-2xl
                                bg-white/[0.04] border border-white/[0.07]
                                backdrop-blur-sm
                                hover:bg-white/[0.08] hover:border-white/[0.14]
                                active:bg-white/[0.10]
                                transition-all duration-200
                                shrink-0
                                group
                            "
                        >
                            {/* Subtle shimmer on hover */}
                            <motion.div
                                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                                style={{
                                    background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 50%, rgba(255,255,255,0.02) 100%)',
                                }}
                            />

                            {/* Icon — pinned to center of upper area */}
                            <div
                                className="absolute left-0 right-0 flex items-center justify-center text-white/50 group-hover:text-white/70 transition-colors"
                                style={{ top: '22px' }}
                            >
                                {IconComponent && <IconComponent size={20} strokeWidth={1.5} />}
                            </div>

                            {/* Label — pinned to fixed Y position (10px below icon center) */}
                            <span
                                className="absolute left-0 right-0 text-[9px] font-medium text-white/50 text-center leading-tight tracking-wide px-1 group-hover:text-white/70 transition-colors"
                                style={{ top: '55px' }}
                            >
                                {template.label}
                            </span>
                        </motion.button>
                    );
                })}
            </motion.div>
        </div>
    );
}
