import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useSpring, useTransform, useMotionValue } from 'framer-motion';
import { ChevronLeft, ChevronRight, CheckCircle2, Circle, Sparkles, Loader2, ChevronDown, ChevronUp, Eye, MessageSquare, Target, ListTodo, Package, Play, Search, Cpu, Database, Globe, FileText, Zap, BarChart3, Plus, Send, Camera, ImageIcon } from 'lucide-react';

import bgImage from '../assets/camera/bg.jpg';
import bgImage1 from '../assets/camera/bg1.jpg';

// ─── Fallback mock data (used when coming from CameraView) ──────────────
const FALLBACK_MEDIA = [
    { type: 'photo', src: bgImage, label: 'Main shot' },
    { type: 'photo', src: bgImage1, label: 'Angle 2' },
    { type: 'photo', src: bgImage, label: 'Close-up' },
    { type: 'video', src: bgImage1, label: 'Video clip', duration: '0:04' },
];

const FALLBACK_TITLE = "Mango Analysis";

const FALLBACK_INTENTION = "Analyze full nutrition facts, calorie breakdown, and sugar content for this plate of mango. Then compare with daily recommended intake and suggest where to buy similar quality.";

const FALLBACK_CHIPS = [
    { label: "🔬 Nutrition Analysis" },
    { label: "📊 Calorie Breakdown" },
    { label: "🩺 Health Check" },
    { label: "🛒 Shopping" },
];

const FALLBACK_WHAT_I_CAUGHT = {
    visual: {
        description: <>I see <span className="text-white/90 font-medium">fresh sliced mango</span> on a golden tray — looks like <span className="text-white/90 font-medium">Thai Nam Dok Mai</span> variety, approximately 250g.</>,
        cropStyle: { transform: 'scale(2)', objectPosition: '40% 60%' }
    },
    voice: {
        description: <>You mentioned <span className="text-white/90 font-medium">calories</span>, and I also picked up interest in <span className="text-white/90 font-medium">shopping options</span> and <span className="text-white/90 font-medium">mango varieties</span>.</>
    }
};

const FALLBACK_TODOS = [
    {
        id: 1,
        text: "Deep Visual Analysis & Identification",
        substeps: [
            { text: "Provisioning GPU instance (A100, us-east-1)...", delay: 900 },
            { text: "Loading YOLOv8-food-xl model weights (847MB)...", delay: 1300 },
            { text: "Running batch inference on 4 frames...", delay: 1200 },
            { text: "Detected: mango_slice (94.7%), plate (99.1%), fork (97.3%)", delay: 900 },
            { text: "Volume estimation: 14 slices × ~18g avg = 252g ± 12g", delay: 800 },
            { text: "✓ Analysis complete — shutting down GPU instance", delay: 500 },
        ],
        completedSummary: "Thai Nam Dok Mai mango, ~252g, peak ripeness 9.2/10, 94.7% confidence"
    },
    {
        id: 2,
        text: "Nutrition & Health Analysis",
        substeps: [
            { text: "Connecting to USDA FoodData Central API v2...", delay: 800 },
            { text: "Scaling nutrient data from 100g reference → 252g serving", delay: 700 },
            { text: "Macros: 538 kcal · 68g carbs · 18g protein · 12g fat · 46g sugar", delay: 600 },
            { text: "Sugar check vs WHO guideline (25g/day): 184% — flagging as high", delay: 1000 },
            { text: "Generating pairing recommendation: +Greek yogurt or almonds", delay: 800 },
        ],
        completedSummary: "538 kcal · 46g sugar (184% WHO) · GI 51 · Pair with protein to balance"
    },
    {
        id: 3,
        text: "Shopping Research & Report Assembly",
        substeps: [
            { text: "Launching headless Chrome agent on cloud VM...", delay: 900 },
            { text: "Searching grocery APIs (10km radius)...", delay: 1100 },
            { text: "Price comparison: Thai Market $2.50 < Whole Foods $4.99 < Amazon $12.99/3pk", delay: 700 },
            { text: "Compiling multi-section report artifact...", delay: 700 },
            { text: "✓ Mango Nutrition Report assembled — 4 sections, 15 data points", delay: 500 },
        ],
        completedSummary: "3 sources found · Report assembled: 4 sections, 15 data points"
    }
];

const FALLBACK_ARTIFACT = {
    title: "Mango Nutrition Report",
    type: "Analysis Report",
    sections: "4 sections · 12 data points",
    preview: {
        calories: 538,
        verdict: "Healthy Choice",
        verdictColor: "bg-white/10 text-white/70 border border-white/10",
        breakdown: [
            { label: "Carbs", value: "68g", pct: 60, color: "bg-white/70" },
            { label: "Protein", value: "18g", pct: 25, color: "bg-white/50" },
            { label: "Fat", value: "12g", pct: 15, color: "bg-white/40" },
            { label: "Sugar", value: "46g", pct: 45, color: "bg-white/60" }
        ],
        shopping: [
            { store: "Thai Market", price: "$2.50/ea", note: "Best value" },
            { store: "Whole Foods", price: "$4.99/ea", note: "Organic" },
            { store: "Amazon Fresh", price: "$12.99/3pk", note: "Delivered" }
        ],
        note: "This is a nutrient-rich tropical fruit. The sugar content is high — I'd recommend pairing with protein (yogurt or nuts) to balance blood sugar response. GI of 51 means moderate impact."
    }
};

// ═══════════════════════════════════════════════════════════════════════════
export default function SessionView({ data, onBack }) {
    // Use data from props (use case) or fallback to hardcoded mango data
    const sessionTitle = data?.title || FALLBACK_TITLE;
    const sessionIntention = data?.intention || FALLBACK_INTENTION;
    const sessionChips = data?.intentionChips || FALLBACK_CHIPS;
    const sessionMedia = data?.media || FALLBACK_MEDIA;
    const sessionTodos = data?.todos || FALLBACK_TODOS;
    const sessionArtifact = data?.artifact || FALLBACK_ARTIFACT;
    const sessionWhatICaught = data?.whatICaught || FALLBACK_WHAT_I_CAUGHT;

    const [todos, setTodos] = useState(sessionTodos.map(t => ({ ...t, status: 'pending', activeSubstep: '' })));
    const [showArtifact, setShowArtifact] = useState(false);
    const [artifactExpanded, setArtifactExpanded] = useState(true);
    const [scrolledDown, setScrolledDown] = useState(false);
    const [activeImageIndex, setActiveImageIndex] = useState(0);
    const [chatText, setChatText] = useState(data?.query || sessionIntention);
    const [showPlusMenu, setShowPlusMenu] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [showIntention, setShowIntention] = useState(false);
    const [showTodos, setShowTodos] = useState(false);
    const [collapsedSections, setCollapsedSections] = useState(new Set());
    const scrollContainerRef = useRef(null);
    const imageScrollerRef = useRef(null);

    // Images from data
    const images = sessionMedia;

    // Get the first image src for visual crops
    const firstImageSrc = images.length > 0 ? images[0].src : bgImage;

    // ─── Scroll detection for collapsing header ─────────────────────────────
    const handleContentScroll = useCallback(() => {
        if (scrollContainerRef.current) {
            const scrollTop = scrollContainerRef.current.scrollTop;
            setScrolledDown(scrollTop > 30);
        }
    }, []);

    // ─── Image scroller index tracking ──────────────────────────────────────
    const handleImageScroll = () => {
        if (imageScrollerRef.current) {
            const scrollLeft = imageScrollerRef.current.scrollLeft;
            const width = imageScrollerRef.current.offsetWidth;
            setActiveImageIndex(Math.round(scrollLeft / width));
        }
    };

    // ─── Toggle section collapse ────────────────────────────────────────────
    const toggleSection = useCallback((sectionId) => {
        setCollapsedSections(prev => {
            const next = new Set(prev);
            if (next.has(sectionId)) next.delete(sectionId);
            else next.add(sectionId);
            return next;
        });
    }, []);

    // ─── Handle send: trigger sequential section reveal ────────────────────
    const handleSend = () => {
        if (!chatText.trim()) return;
        setHasSubmitted(true);
        setChatText('');

        // Reveal sections sequentially
        setTimeout(() => {
            setShowIntention(true);
            // Auto-fold "What I Caught" when intention appears
            setCollapsedSections(prev => new Set([...prev, 'whatICaught']));
        }, 400);
        setTimeout(() => setShowTodos(true), 1200);
    };

    // ─── Simulate TODO execution ONLY after submission ─────────────────────
    useEffect(() => {
        if (!showTodos) return;

        let baseDelay = 800;

        sessionTodos.forEach((todo, todoIndex) => {
            setTimeout(() => {
                setTodos(prev => prev.map((t, i) =>
                    i === todoIndex ? { ...t, status: 'active', activeSubstep: '' } : t
                ));
            }, baseDelay);

            let substepDelay = baseDelay + 300;
            todo.substeps.forEach((sub) => {
                setTimeout(() => {
                    setTodos(prev => prev.map((t, i) =>
                        i === todoIndex ? { ...t, activeSubstep: sub.text } : t
                    ));
                }, substepDelay);
                substepDelay += sub.delay;
            });

            setTimeout(() => {
                setTodos(prev => prev.map((t, i) =>
                    i === todoIndex ? { ...t, status: 'completed', activeSubstep: '' } : t
                ));
            }, substepDelay + 400);

            baseDelay = substepDelay + 800;
        });

        setTimeout(() => {
            setShowArtifact(true);
            // Auto-fold previous sections when artifact appears
            setCollapsedSections(prev => new Set([...prev, 'whatICaught', 'intention', 'todos']));
        }, baseDelay + 500);
    }, [showTodos]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="w-full h-full bg-[#0a0a0a] flex flex-col relative z-50 texture-grain"
        >
            {/* ══ Header: back + title ══════════════════════════════════════ */}
            <div className="w-full flex items-center px-5 pt-12 pb-2 shrink-0 relative z-10">
                <button
                    onClick={onBack}
                    className="p-2 rounded-full bg-white/[0.04] border border-white/[0.06] text-white/70 hover:bg-white/[0.08] active:scale-90 transition-all z-10"
                >
                    <ChevronLeft size={20} strokeWidth={1.8} />
                </button>
                <h1 className="absolute left-0 right-0 text-center text-white/85 font-semibold text-[14px] tracking-wide">
                    {sessionTitle}
                </h1>
            </div>

            {/* ══ Collapsible Image Gallery ═════════════════════════════════ */}
            <div
                className="w-full shrink-0 relative overflow-hidden transition-all duration-500 ease-out"
                style={{
                    height: scrolledDown ? '56px' : '240px',
                }}
            >
                {/* Full-size scrollable gallery */}
                <div
                    className={`absolute inset-0 transition-all duration-500 ease-out ${scrolledDown ? 'opacity-0 pointer-events-none scale-95' : 'opacity-100'}`}
                >
                    <div
                        ref={imageScrollerRef}
                        onScroll={handleImageScroll}
                        className="w-full h-full overflow-x-auto snap-x snap-mandatory flex no-scrollbar"
                        style={{ WebkitOverflowScrolling: 'touch' }}
                    >
                        {images.map((img, i) => (
                            <div key={i} className="w-full h-full shrink-0 snap-center relative">
                                <img src={img.src} alt="" className="w-full h-full object-cover" />
                                {/* Subtle cinematic letterbox overlay */}
                                <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/30 pointer-events-none" />
                                {img.type === 'video' && (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center shadow-lg">
                                            <Play size={16} className="text-white/90 ml-0.5" fill="white" fillOpacity={0.9} />
                                        </div>
                                        <span className="absolute bottom-2 right-3 text-white/70 text-[10px] font-mono tracking-wider bg-black/40 backdrop-blur-sm px-1.5 py-0.5 rounded-md border border-white/5">
                                            {img.duration}
                                        </span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                    {/* Dots — precision indicators */}
                    <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1.5">
                        {images.map((_, i) => (
                            <div
                                key={i}
                                className={`rounded-full transition-all duration-300 ${i === activeImageIndex
                                    ? 'bg-white/80 w-4 h-1.5'
                                    : 'bg-white/25 w-1.5 h-1.5'
                                    }`}
                            />
                        ))}
                    </div>
                </div>

                {/* Collapsed thumbnail strip */}
                <div
                    className={`absolute inset-0 flex items-center gap-1.5 px-5 transition-all duration-500 ease-out ${scrolledDown ? 'opacity-100' : 'opacity-0 pointer-events-none translate-y-2'}`}
                >
                    {images.map((img, i) => (
                        <div key={i} className="relative h-10 w-10 rounded-lg overflow-hidden shrink-0 border border-white/[0.06] bg-white/[0.02]">
                            <img src={img.src} alt="" className="w-full h-full object-cover opacity-70" />
                            {img.type === 'video' && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                    <Play size={8} className="text-white/80" fill="white" />
                                </div>
                            )}
                        </div>
                    ))}
                    <span className="text-white/20 text-[9px] font-mono ml-1.5 tracking-wider">{images.length} items</span>
                </div>
            </div>

            {/* ══ Scrollable Content ════════════════════════════════════════ */}
            <div
                ref={scrollContainerRef}
                onScroll={handleContentScroll}
                className="flex-1 overflow-y-auto px-5 pt-5 pb-24 space-y-5 precision-scroll"
            >
                {/* 1. Summary — Visual + Thinking */}
                <Section icon={<MessageSquare size={13} strokeWidth={1.8} />} label="What I Caught" delay={0.1} collapsed={collapsedSections.has('whatICaught')} onToggle={() => toggleSection('whatICaught')}>
                    {/* Visual observation cards — obviously tappable */}
                    <div className="space-y-3">
                        {/* Visual card */}
                        <motion.div
                            className="cursor-pointer group"
                            whileTap={{ scale: 0.96 }}
                            whileHover={{ scale: 1.01 }}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.4, delay: 0.2 }}
                        >
                            <div className="flex gap-3 items-stretch bg-white/[0.05] rounded-2xl border border-white/[0.10] overflow-hidden group-hover:bg-white/[0.08] group-hover:border-white/[0.18] group-active:bg-white/[0.10] transition-all duration-200 shadow-[0_2px_12px_rgba(0,0,0,0.3)]">
                                {/* Left accent bar */}
                                <div className="w-[3px] bg-white/20 group-hover:bg-white/40 transition-colors shrink-0" />
                                {/* Thumbnail */}
                                <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-white/[0.06] relative my-2.5 bg-white/[0.02]">
                                    <img src={firstImageSrc} alt="" className="absolute inset-0 w-full h-full object-cover" style={sessionWhatICaught.visual.cropStyle} />
                                </div>
                                {/* Text content */}
                                <div className="flex-1 py-2.5 pr-1 flex flex-col justify-center min-w-0">
                                    <p className="text-white/80 text-[12px] leading-relaxed">
                                        {sessionWhatICaught.visual.description}
                                    </p>
                                </div>
                                {/* Chevron — always visible */}
                                <div className="flex items-center pr-3 pl-1 shrink-0">
                                    <div className="w-6 h-6 rounded-full bg-white/[0.06] group-hover:bg-white/[0.12] flex items-center justify-center transition-all">
                                        <ChevronRight size={14} className="text-white/40 group-hover:text-white/70 transition-colors" />
                                    </div>
                                </div>
                            </div>
                        </motion.div>

                        {/* Voice card */}
                        <motion.div
                            className="cursor-pointer group"
                            whileTap={{ scale: 0.96 }}
                            whileHover={{ scale: 1.01 }}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.4, delay: 0.35 }}
                        >
                            <div className="flex gap-3 items-stretch bg-white/[0.05] rounded-2xl border border-white/[0.10] overflow-hidden group-hover:bg-white/[0.08] group-hover:border-white/[0.18] group-active:bg-white/[0.10] transition-all duration-200 shadow-[0_2px_12px_rgba(0,0,0,0.3)]">
                                {/* Left accent bar */}
                                <div className="w-[3px] bg-white/20 group-hover:bg-white/40 transition-colors shrink-0" />
                                {/* Waveform icon */}
                                <div className="w-12 h-12 rounded-lg shrink-0 bg-white/[0.03] border border-white/[0.06] flex items-center justify-center my-2.5">
                                    <div className="flex gap-[2px] items-end h-4">
                                        {[3, 5, 8, 6, 4, 7, 5, 3].map((h, i) => (
                                            <div key={i} className="w-[2px] bg-white/25 rounded-full" style={{ height: `${h * 1.6}px` }} />
                                        ))}
                                    </div>
                                </div>
                                {/* Text content */}
                                <div className="flex-1 py-2.5 pr-1 flex flex-col justify-center min-w-0">
                                    <p className="text-white/80 text-[12px] leading-relaxed">
                                        {sessionWhatICaught.voice.description}
                                    </p>
                                </div>
                                {/* Chevron — always visible */}
                                <div className="flex items-center pr-3 pl-1 shrink-0">
                                    <div className="w-6 h-6 rounded-full bg-white/[0.06] group-hover:bg-white/[0.12] flex items-center justify-center transition-all">
                                        <ChevronRight size={14} className="text-white/40 group-hover:text-white/70 transition-colors" />
                                    </div>
                                </div>
                            </div>
                        </motion.div>

                        {/* Tap hint — fades after 3s */}
                        <motion.p
                            initial={{ opacity: 0.6 }}
                            animate={{ opacity: 0 }}
                            transition={{ duration: 0.8, delay: 3 }}
                            className="text-white/25 text-[9px] font-mono tracking-wider text-center pt-0.5"
                        >
                            ↑ TAP TO DIVE DEEPER
                        </motion.p>
                    </div>
                </Section>

                {/* 2. Interpreted Intention — Visual (after send) */}
                <AnimatePresence>
                    {showIntention && (
                        <motion.div
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                        >
                            <Section icon={<Target size={13} strokeWidth={1.8} />} label="What I'll Do For You" delay={0} collapsed={collapsedSections.has('intention')} onToggle={() => toggleSection('intention')}>
                                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                                    {/* Intent chips */}
                                    <div className="flex flex-wrap gap-1.5 mb-3">
                                        {sessionChips.map(chip => (
                                            <span
                                                key={chip.label}
                                                className="text-[10px] font-medium px-2.5 py-1 rounded-lg bg-white/[0.04] text-white/70 border border-white/[0.05]"
                                            >
                                                {chip.label}
                                            </span>
                                        ))}
                                    </div>
                                    <p className="text-white/55 text-[11.5px] leading-relaxed">
                                        {sessionIntention}
                                    </p>
                                </div>
                            </Section>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* 3. TODO Plan — Cloud VM Agent steps (after send) */}
                <AnimatePresence>
                    {showTodos && (
                        <motion.div
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                        >
                            <Section icon={<ListTodo size={13} strokeWidth={1.8} />} label="My Work Plan" delay={0} collapsed={collapsedSections.has('todos')} onToggle={() => toggleSection('todos')}>
                                <div className="space-y-2">
                                    {todos.map((todo) => (
                                        <TodoItem key={todo.id} todo={todo} />
                                    ))}
                                </div>
                            </Section>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* 4. Artifact */}
                <AnimatePresence>
                    {showArtifact && (
                        <motion.div
                            initial={{ opacity: 0, y: 20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
                        >
                            <Section icon={<Package size={13} strokeWidth={1.8} />} label="Here's What I Made" delay={0} collapsed={collapsedSections.has('artifact')} onToggle={() => toggleSection('artifact')}>
                                <button
                                    onClick={() => setArtifactExpanded(!artifactExpanded)}
                                    className="w-full text-left"
                                >
                                    <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4 hover:border-white/[0.12] transition-all">
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                                <Sparkles size={13} className="text-white/50" />
                                                <span className="text-white/90 font-semibold text-[13px] tracking-wide">{sessionArtifact.title}</span>
                                            </div>
                                            <div className="flex items-center gap-1 text-white/35">
                                                <Eye size={11} strokeWidth={1.8} />
                                                <span className="text-[9px] font-mono tracking-wider">{artifactExpanded ? 'FOLD' : 'SHOW'}</span>
                                                {artifactExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                            </div>
                                        </div>
                                        <p className="text-white/30 text-[10px] font-mono tracking-wider">{sessionArtifact.type} · {sessionArtifact.sections}</p>
                                    </div>
                                </button>

                                <AnimatePresence>
                                    {artifactExpanded && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            transition={{ duration: 0.3 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="mt-2.5 bg-white/[0.02] border border-white/[0.05] rounded-xl p-4 space-y-4">
                                                {/* Calories / Primary Metric */}
                                                {sessionArtifact.preview.calories !== null && (
                                                    <div className="flex justify-between items-end border-b border-white/[0.05] pb-3">
                                                        <div>
                                                            <p className="text-white/35 text-[10px] font-mono tracking-wider uppercase">{sessionArtifact.preview.caloriesLabel || 'Total Calories'}</p>
                                                            <p className="text-[28px] font-bold text-white/90 tracking-tight leading-none mt-1">
                                                                {sessionArtifact.preview.caloriesUnit === '$' && '$'}
                                                                <AnimatedNumber value={sessionArtifact.preview.calories} />
                                                                {!sessionArtifact.preview.caloriesUnit && <span className="text-[12px] font-normal text-white/35 ml-1">kcal</span>}
                                                                {sessionArtifact.preview.caloriesUnit && sessionArtifact.preview.caloriesUnit !== '$' && (
                                                                    <span className="text-[12px] font-normal text-white/35 ml-1">{sessionArtifact.preview.caloriesUnit}</span>
                                                                )}
                                                            </p>
                                                        </div>
                                                        <motion.span
                                                            initial={{ opacity: 0, scale: 0.5, y: 5 }}
                                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                                            transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.6 }}
                                                            className={`${sessionArtifact.preview.verdictColor || 'bg-white/10 text-white/70 border border-white/10'} px-2.5 py-1 rounded-lg text-[10px] font-semibold tracking-wide`}
                                                        >
                                                            {sessionArtifact.preview.verdict}
                                                        </motion.span>
                                                    </div>
                                                )}
                                                {sessionArtifact.preview.calories === null && (
                                                    <div className="flex justify-end pb-1">
                                                        <motion.span
                                                            initial={{ opacity: 0, scale: 0.5 }}
                                                            animate={{ opacity: 1, scale: 1 }}
                                                            transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.4 }}
                                                            className={`${sessionArtifact.preview.verdictColor || 'bg-white/10 text-white/70 border border-white/10'} px-2.5 py-1 rounded-lg text-[10px] font-semibold tracking-wide`}
                                                        >
                                                            {sessionArtifact.preview.verdict}
                                                        </motion.span>
                                                    </div>
                                                )}

                                                {/* Bars — precision data visualization with staggered entrance */}
                                                <div className="space-y-3">
                                                    {sessionArtifact.preview.breakdown.map((item, barIdx) => (
                                                        <motion.div
                                                            key={item.label}
                                                            initial={{ opacity: 0, x: -12 }}
                                                            animate={{ opacity: 1, x: 0 }}
                                                            transition={{ duration: 0.4, delay: 0.3 + barIdx * 0.12, ease: [0.25, 0.1, 0.25, 1] }}
                                                        >
                                                            <div className="flex justify-between text-[10px] mb-1.5">
                                                                <span className="text-white/40 font-mono tracking-wider">{item.label}</span>
                                                                <motion.span
                                                                    initial={{ opacity: 0 }}
                                                                    animate={{ opacity: 1 }}
                                                                    transition={{ delay: 0.5 + barIdx * 0.12 }}
                                                                    className="text-white/80 font-semibold"
                                                                >
                                                                    {item.value}
                                                                </motion.span>
                                                            </div>
                                                            <div className="w-full bg-white/[0.04] h-1 rounded-full overflow-hidden">
                                                                <motion.div
                                                                    initial={{ scaleX: 0 }}
                                                                    animate={{ scaleX: 1 }}
                                                                    transition={{ duration: 0.7, delay: 0.4 + barIdx * 0.12, ease: [0.25, 0.1, 0.25, 1] }}
                                                                    style={{ width: `${item.pct}%`, transformOrigin: 'left' }}
                                                                    className={`h-full ${item.color} rounded-full opacity-80`}
                                                                />
                                                            </div>
                                                        </motion.div>
                                                    ))}
                                                </div>

                                                {/* Shopping / Key Info */}
                                                <div>
                                                    <p className="text-white/30 text-[9px] font-mono font-semibold mb-2.5 uppercase tracking-[0.15em]">Key Info</p>
                                                    <div className="space-y-1.5">
                                                        {sessionArtifact.preview.shopping.map(s => (
                                                            <div key={s.store} className="flex justify-between items-center bg-white/[0.02] border border-white/[0.04] rounded-lg px-3 py-2">
                                                                <span className="text-white/80 text-[11px] font-medium">{s.store}</span>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-white/30 text-[10px] font-mono">{s.note}</span>
                                                                    <span className="text-white/90 text-[11px] font-semibold">{s.price}</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Note */}
                                                <p className="text-white/45 text-[11px] leading-relaxed bg-white/[0.02] border border-white/[0.04] p-3 rounded-lg">
                                                    {sessionArtifact.preview.note}
                                                </p>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </Section>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ══ Floating Chat Input Bar — Industrial precision ════════════ */}
            <div className="absolute bottom-0 left-0 right-0 z-20">
                {/* Plus menu popover */}
                <AnimatePresence>
                    {showPlusMenu && (
                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
                            className="absolute bottom-full left-4 mb-2 bg-[#161616] border border-white/[0.06] rounded-xl overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.6)]"
                        >
                            <button
                                onClick={() => { setShowPlusMenu(false); }}
                                className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-white/[0.03] transition-colors border-b border-white/[0.04]"
                            >
                                <ImageIcon size={15} strokeWidth={1.8} className="text-white/50" />
                                <span className="text-white/70 text-[12px] tracking-wide">Upload from Gallery</span>
                            </button>
                            <button
                                onClick={() => { setShowPlusMenu(false); onBack(); }}
                                className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-white/[0.03] transition-colors"
                            >
                                <Camera size={15} strokeWidth={1.8} className="text-white/50" />
                                <span className="text-white/70 text-[12px] tracking-wide">Open Camera</span>
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Backdrop to close menu */}
                {showPlusMenu && (
                    <div className="fixed inset-0 z-[-1]" onClick={() => setShowPlusMenu(false)} />
                )}

                {/* Input bar — glass surface */}
                <div className="bg-[#0e0e0e]/95 backdrop-blur-2xl border-t border-white/[0.04] px-3 py-2.5 pb-7 flex items-center gap-2">
                    <button
                        onClick={() => setShowPlusMenu(!showPlusMenu)}
                        className={`p-2 rounded-full transition-all duration-200 shrink-0 ${showPlusMenu
                            ? 'bg-white/10 text-white/80 rotate-45'
                            : 'bg-white/[0.04] text-white/35 hover:bg-white/[0.07] hover:text-white/60'
                            }`}
                    >
                        <Plus size={16} strokeWidth={1.8} />
                    </button>

                    <div className="flex-1 relative">
                        <input
                            type="text"
                            value={chatText}
                            onChange={e => setChatText(e.target.value)}
                            placeholder="Follow up..."
                            className="
                                w-full bg-white/[0.03] border border-white/[0.06]
                                rounded-full px-4 py-2
                                text-white/85 text-[12px] tracking-wide
                                placeholder:text-white/20
                                focus:outline-none focus:border-white/[0.12] focus:bg-white/[0.05]
                                transition-all duration-300
                            "
                        />
                    </div>

                    <button
                        className={`p-2 rounded-full shrink-0 transition-all duration-200 ${chatText.trim()
                            ? 'bg-white/90 text-[#0a0a0a] shadow-[0_0_15px_rgba(255,255,255,0.08)]'
                            : 'bg-white/[0.04] text-white/15'
                            }`}
                        disabled={!chatText.trim()}
                        onClick={handleSend}
                    >
                        <Send size={14} strokeWidth={2} />
                    </button>
                </div>
            </div>
        </motion.div >
    );
}

// ─── Animated number counter ────────────────────────────────────────────────
function AnimatedNumber({ value }) {
    const numericValue = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.]/g, '')) : (value || 0);
    const isDecimal = String(value).includes('.');
    const motionValue = useMotionValue(0);
    const springValue = useSpring(motionValue, { stiffness: 80, damping: 20 });
    const display = useTransform(springValue, v => {
        if (isNaN(v)) return value;
        return isDecimal ? v.toFixed(1) : Math.round(v).toLocaleString();
    });

    useEffect(() => {
        motionValue.set(numericValue);
    }, [numericValue, motionValue]);

    return <motion.span>{display}</motion.span>;
}

// ─── Section wrapper — industrial section divider ───────────────────────────
function Section({ icon, label, delay, children, collapsed = false, onToggle }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25, delay }}
        >
            <button
                onClick={onToggle}
                className="flex items-center gap-2 mb-3 w-full group cursor-pointer"
            >
                <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 15, delay: delay + 0.1 }}
                    className="text-white/30"
                >
                    {icon}
                </motion.div>
                <span className="text-white/30 text-[9px] font-mono font-semibold uppercase tracking-[0.15em]">{label}</span>
                <div className="flex-1 h-px bg-white/[0.04] ml-2" />
                <motion.div
                    animate={{ rotate: collapsed ? 0 : 180 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className="text-white/15 group-hover:text-white/40 transition-colors"
                >
                    <ChevronUp size={13} strokeWidth={1.8} />
                </motion.div>
            </button>
            <AnimatePresence initial={false}>
                {!collapsed && (
                    <motion.div
                        key="section-body"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                        className="overflow-hidden"
                    >
                        {children}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ─── TODO item — industrial precision checklist ─────────────────────────────
function TodoItem({ todo }) {
    const isActive = todo.status === 'active';
    const isCompleted = todo.status === 'completed';

    return (
        <motion.div
            layout
            className={`rounded-xl border transition-all duration-300 ${isActive
                ? 'bg-white/[0.02] border-white/[0.08]'
                : isCompleted
                    ? 'bg-white/[0.01] border-white/[0.04]'
                    : 'bg-transparent border-white/[0.04]'
                }`}
        >
            <div className="flex items-start gap-2.5 px-3.5 py-2.5">
                {/* Icon */}
                <div className="mt-0.5 shrink-0">
                    {isCompleted ? (
                        <CheckCircle2 className="text-white/50 w-4 h-4" strokeWidth={1.8} />
                    ) : isActive ? (
                        <Loader2 className="text-white/60 w-4 h-4 animate-spin" strokeWidth={1.8} />
                    ) : (
                        <Circle className="text-white/10 w-4 h-4" strokeWidth={1.5} />
                    )}
                </div>

                <div className="flex-1 min-w-0">
                    {/* Title row */}
                    <div className="flex items-center gap-1.5">
                        <p className={`text-[12px] leading-snug tracking-wide ${isCompleted ? 'text-white/40' : isActive ? 'text-white/85' : 'text-white/20'}`}>
                            {todo.text}
                        </p>
                    </div>

                    {/* Active: streaming substep */}
                    <AnimatePresence mode="wait">
                        {isActive && todo.activeSubstep && (
                            <motion.div
                                key={todo.activeSubstep}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="mt-1.5 flex items-start gap-1.5"
                            >
                                <Cpu size={9} className="text-white/30 mt-0.5 shrink-0 animate-pulse" strokeWidth={2} />
                                <p className="text-white/35 text-[10px] leading-relaxed font-mono tracking-wide">
                                    {todo.activeSubstep}
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Completed: summary — slides in with spring */}
                    {isCompleted && (
                        <motion.p
                            initial={{ opacity: 0, x: -8, y: 4 }}
                            animate={{ opacity: 1, x: 0, y: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
                            className="text-white/40 text-[10px] mt-1 font-mono tracking-wide"
                        >
                            ✓ {todo.completedSummary}
                        </motion.p>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
