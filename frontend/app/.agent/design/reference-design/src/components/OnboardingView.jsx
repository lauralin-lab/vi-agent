import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, RotateCcw, Zap, Image as ImageIcon, Wifi, Loader2 } from 'lucide-react';
import Card from './Card';

import bgImage from '../assets/camera/bg.JPG';

// ─── Onboarding Steps ────────────────────────────────────────────────────────
// V0.9: Simplified to 3 steps. Screen 2 rewritten as Card interaction demo.
const STEPS = [
    {
        id: 'splash',
        title: "The World's First Camera\nThat Thinks Before It Sees",
        subtitle: 'Tap anywhere to begin',
        type: 'fullscreen',
    },
    {
        id: 'card-demo',
        title: 'AI suggests, you tap',
        subtitle: 'Point your camera at anything — AI will propose what to do. Just tap the card.',
        type: 'spotlight',
        spotlightY: 72,  // card area — the main interaction
        tooltipPosition: 'top',
    },
    {
        id: 'controls',
        title: 'Capture · Explore',
        subtitle: 'Take photos to start. The AI does the rest.',
        type: 'spotlight',
        spotlightY: 90,
        tooltipPosition: 'top',
    },
];

// Mini-loop demo states for Screen 2
const DEMO_STATES = [
    { text: "Scanning...", cta: "Wait", phase: "scanning" },
    { text: "I see a plate of mango. Analyze nutrition and calories?", cta: "Deep Dive", phase: "card" },
    { text: "538 kcal · Healthy Choice ✓", cta: "Done!", phase: "result" },
];

export default function OnboardingView({ onComplete }) {
    const [step, setStep] = useState(0);
    const [connectionAnim, setConnectionAnim] = useState('CONNECTING');
    const [demoState, setDemoState] = useState(0);

    // Simulate AI connecting
    useEffect(() => {
        const timer = setTimeout(() => setConnectionAnim('CONNECTED'), 2200);
        return () => clearTimeout(timer);
    }, []);

    // Mini-loop demo animation cycle for Screen 2
    useEffect(() => {
        if (STEPS[step]?.id !== 'card-demo') return;

        setDemoState(0);
        const timers = [];

        // Scanning → Card appears
        timers.push(setTimeout(() => setDemoState(1), 1500));
        // Card → Result
        timers.push(setTimeout(() => setDemoState(2), 4500));
        // Result → Reset loop
        timers.push(setTimeout(() => setDemoState(0), 7000));
        // Loop: Scanning → Card
        timers.push(setTimeout(() => setDemoState(1), 8500));
        timers.push(setTimeout(() => setDemoState(2), 11500));

        return () => timers.forEach(clearTimeout);
    }, [step]);

    const currentStep = STEPS[step];
    const isLastStep = step === STEPS.length - 1;
    const isSplash = currentStep.type === 'fullscreen';
    const isCardDemo = currentStep.id === 'card-demo';

    const handleTap = () => {
        if (isLastStep) {
            onComplete();
        } else {
            setStep(prev => prev + 1);
        }
    };

    const currentDemo = DEMO_STATES[demoState];

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="relative w-full h-full flex flex-col bg-black overflow-hidden"
        >
            {/* ── Real Camera UI (non-interactive backdrop) ──── */}
            <div className="absolute inset-0 pointer-events-none">
                {/* Dynamic Island */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 z-50">
                    <div className="w-[126px] h-[36px] rounded-b-[20px] border border-t-0 border-neutral-600/80"
                        style={{ background: '#111', boxShadow: 'inset 0 -3px 8px rgba(255,255,255,0.03), 0 2px 10px rgba(0,0,0,0.5)' }} />
                </div>

                {/* Top Controls */}
                <div className="w-full pt-14 pb-2 px-6 flex justify-between items-start z-20 shrink-0 h-20">
                    <button className="p-2 rounded-full text-white/90">
                        <ArrowLeft size={22} strokeWidth={2.5} />
                    </button>

                    {/* AI Connection Signal */}
                    <div className="absolute top-16 left-1/2 -translate-x-1/2 flex flex-col items-center justify-center z-20">
                        <AnimatePresence mode="wait">
                            {connectionAnim === 'CONNECTING' ? (
                                <motion.div key="connecting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                    <Loader2 size={24} className="text-white animate-spin drop-shadow-md" />
                                </motion.div>
                            ) : (
                                <motion.div key="connected" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
                                    <Wifi size={24} strokeWidth={2.5} className="text-white drop-shadow-md" />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className="flex items-center gap-3 mt-1">
                        <div className="flex items-center gap-1 px-2 py-1.5 rounded-full text-white/90">
                            <Zap size={18} strokeWidth={2.5} />
                            <span className="text-[10px] font-bold tracking-wide text-white/50">OFF</span>
                        </div>
                        <button className="p-2 rounded-full text-white/90">
                            <RotateCcw size={22} strokeWidth={2.5} />
                        </button>
                    </div>
                </div>

                {/* Main Viewfinder */}
                <div className="relative w-full flex-1 flex flex-col justify-center px-0 overflow-hidden"
                    style={{ position: 'absolute', top: '80px', left: 0, right: 0, bottom: '180px' }}>
                    <div className="relative w-full h-full bg-neutral-900 overflow-hidden shadow-2xl rounded-sm">
                        <div
                            className="absolute inset-0 bg-cover bg-center"
                            style={{ backgroundImage: `url(${bgImage})` }}
                        />

                        {/* AI Scan Line */}
                        <AnimatePresence>
                            {connectionAnim === 'CONNECTED' && step >= 1 && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 z-20 pointer-events-none overflow-hidden"
                                >
                                    <motion.div
                                        initial={{ top: '0%' }}
                                        animate={{ top: '100%' }}
                                        transition={{ duration: 1.8, ease: 'linear' }}
                                        className="absolute left-0 right-0 h-[2px]"
                                        style={{
                                            background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.6), rgba(147,197,253,0.9), rgba(59,130,246,0.6), transparent)',
                                            boxShadow: '0 0 20px 4px rgba(59,130,246,0.3), 0 0 60px 8px rgba(59,130,246,0.15)'
                                        }}
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Mini result flash for demo */}
                        <AnimatePresence>
                            {isCardDemo && demoState === 2 && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    className="absolute inset-0 z-20 flex items-center justify-center"
                                >
                                    <div className="bg-black/60 backdrop-blur-md rounded-2xl px-6 py-4 border border-white/10">
                                        <p className="text-white/90 text-[18px] font-bold text-center">538 kcal</p>
                                        <p className="text-white/50 text-[11px] text-center mt-1">Healthy Choice ✓</p>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Card Area — shows demo card for Screen 2 */}
                <div className="absolute left-0 right-0 z-30" style={{ bottom: '100px' }}>
                    <div className="relative w-full h-20 flex items-start justify-center px-4 pt-1">
                        <AnimatePresence>
                            {step >= 1 && (
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3 }}
                                    className="w-full"
                                >
                                    <Card
                                        isVisible={true}
                                        text={isCardDemo ? currentDemo.text : "I see a plate of mango. What's next? Maybe Calories? Shopping?"}
                                        ctaText={isCardDemo ? currentDemo.cta : "Deep Dive"}
                                        variant={isCardDemo && demoState === 0 ? "fallback" : "normal"}
                                        onClick={() => { }}
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Bottom Controls — V0.9: no Mic button */}
                <div className="absolute bottom-4 left-0 right-0 z-30">
                    <div className="w-full flex items-center justify-center gap-8 px-10 pt-4 pb-0">
                        <div className="w-12 h-12 rounded-full bg-neutral-900/50 text-white/80 border border-white/5 flex items-center justify-center backdrop-blur-md">
                            <ImageIcon size={24} strokeWidth={1.5} />
                        </div>
                        <div className="relative w-[4.5rem] h-[4.5rem] rounded-full border-[4px] border-white/40 flex items-center justify-center bg-transparent">
                            <div className="w-[3.5rem] h-[3.5rem] rounded-full bg-white shadow-[0_0_20px_rgba(255,255,255,0.3)]" />
                        </div>
                        {/* Placeholder where Mic used to be — now empty for V0.9 */}
                        <div className="w-12 h-12" />
                    </div>
                    <div className="w-full h-8 shrink-0" />
                </div>
            </div>

            {/* ── Onboarding Overlay (Interactive) ──────────────────────────── */}
            <div
                className="absolute inset-0 z-40"
                onClick={handleTap}
            >
                <AnimatePresence mode="wait">
                    {/* ─── Stage 1: Full-screen splash ─── */}
                    {isSplash && (
                        <motion.div
                            key="splash"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.6 }}
                            className="absolute inset-0 flex flex-col justify-end"
                        >
                            <div className="absolute inset-0"
                                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 35%, rgba(0,0,0,0.2) 65%, rgba(0,0,0,0.1) 100%)' }}
                            />

                            <motion.div
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.4, duration: 0.8 }}
                                className="relative z-10 px-8 pb-8"
                            >
                                <h1 className="text-white text-[26px] font-bold leading-tight tracking-tight whitespace-pre-line drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
                                    {currentStep.title}
                                </h1>
                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 1.2 }}
                                    className="mt-3 text-white/50 text-[14px] font-medium"
                                >
                                    {currentStep.subtitle}
                                </motion.p>
                            </motion.div>
                        </motion.div>
                    )}

                    {/* ─── Coach-mark spotlight steps ─── */}
                    {!isSplash && (
                        <motion.div
                            key={currentStep.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.35 }}
                            className="absolute inset-0"
                        >
                            <div className="absolute inset-0 bg-black/60" />

                            {/* Spotlight cutout */}
                            <div
                                className="absolute left-4 right-4 rounded-2xl"
                                style={{
                                    top: `${currentStep.spotlightY - 10}%`,
                                    height: '20%',
                                    background: 'rgba(255,255,255,0.06)',
                                    border: '1px solid rgba(255,255,255,0.12)',
                                    backdropFilter: 'blur(0px)',
                                    boxShadow: '0 0 60px 20px rgba(0,0,0,0.3)',
                                }}
                            />

                            {/* Tooltip */}
                            <motion.div
                                initial={{ opacity: 0, y: currentStep.tooltipPosition === 'top' ? 20 : -20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2, duration: 0.4 }}
                                className="absolute left-6 right-6"
                                style={{
                                    top: currentStep.tooltipPosition === 'top'
                                        ? `${currentStep.spotlightY - 24}%`
                                        : `${currentStep.spotlightY + 14}%`,
                                }}
                            >
                                <div className="bg-white/95 backdrop-blur-xl rounded-2xl px-5 py-4 shadow-2xl">
                                    <h3 className="text-black text-[17px] font-bold leading-snug">
                                        {currentStep.title}
                                    </h3>
                                    <p className="text-neutral-500 text-[13px] mt-1 leading-relaxed">
                                        {currentStep.subtitle}
                                    </p>

                                    {/* Card demo mini-loop indicator */}
                                    {isCardDemo && (
                                        <div className="flex items-center gap-2 mt-3">
                                            {DEMO_STATES.map((_, i) => (
                                                <div
                                                    key={i}
                                                    className={`h-1 rounded-full transition-all duration-500 ${i === demoState
                                                        ? 'w-6 bg-black/70'
                                                        : i < demoState
                                                            ? 'w-2 bg-black/30'
                                                            : 'w-2 bg-black/10'
                                                        }`}
                                                />
                                            ))}
                                            <span className="text-black/30 text-[9px] ml-1">
                                                {demoState === 0 ? 'Scanning...' : demoState === 1 ? 'Card appears ↑' : 'Result!'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </motion.div>

                            {/* Step indicator + CTA */}
                            <div className="absolute bottom-10 left-0 right-0 flex flex-col items-center gap-3">
                                <div className="flex gap-2">
                                    {STEPS.slice(1).map((_, i) => (
                                        <div
                                            key={i}
                                            className={`h-1.5 rounded-full transition-all duration-300 ${i === step - 1
                                                ? 'w-5 bg-white'
                                                : 'w-1.5 bg-white/30'
                                                }`}
                                        />
                                    ))}
                                </div>
                                <p className="text-white/40 text-[12px] font-medium">
                                    {isLastStep ? 'Tap to get started' : 'Tap to continue'}
                                </p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}
