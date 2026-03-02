import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, RotateCcw, Zap, Image as ImageIcon, Mic, MicOff, Wifi, WifiOff, AlertTriangle, Loader2, WifiLow, Upload, Check, ScanLine, CheckCircle, CheckCircle2, ShoppingBag, Music, Film, FileText, Scissors } from 'lucide-react';
import Card from './Card';
import GalleryView from './GalleryView';
import OnboardingView from './OnboardingView';
import ScanningOverlay from './ScanningOverlay';

import bgImage from '../assets/camera/bg.jpg';
import selfieImage from '../assets/camera/selfie.jpeg';

const MOCK_BG_IMAGE = bgImage;
const SELFIE_IMAGE = selfieImage;

// Default alternative suggestions for Card correction mode
const DEFAULT_ALTERNATIVES = [
    { label: "🔬 Nutrition" },
    { label: "📖 Recipe" },
    { label: "🛒 Where to buy" },
    { label: "🌍 Translate" },
];

// Cold start inspiration items with result previews
const INSPIRATION_ITEMS = [
    { emoji: "📖", label: "A book on your shelf", result: "Recommend similar reads" },
    { emoji: "🥦", label: "Food in your kitchen", result: "Get nutrition info" },
    { emoji: "👕", label: "Clothes in your closet", result: "Style suggestions" },
    { emoji: "📦", label: "Something you bought", result: "Ingredient breakdown" },
];

// Prompt refinement snapshots — simulates iterative prompt building (from KC)
const REFINEMENT_STEPS = [
    "Listening...",
    "Ok...",
    "Nutrition...",
    "Nutrition for this...",
    "Nutrition for this mango...",
    "Take a front shot of the mango for better analysis",
    "Analyze nutrition for this mango",
    "Analyze nutrition and calories for this mango",
    "Analyze nutrition and calorie breakdown for this mango",
    "Analyze nutrition, calorie breakdown for this plate of sliced mango",
    "Analyze nutrition, calorie breakdown, and sugar content for this plate of sliced mango",
    "Ready to analyze? Let's go!",
];

export default function CameraView({ onTapCard, onOpenHistory, sessionCount = 0, isFirstTime = false, selectedTemplate = null, onClearTemplate }) {
    const [showCard, setShowCard] = useState(true);
    const [cardText, setCardText] = useState("Let's snap something first");
    const [capturedMedia, setCapturedMedia] = useState([]);

    const [showGallery, setShowGallery] = useState(false);

    // Mic toggle states (from KC)
    const [isMicOn, setIsMicOn] = useState(false);
    const [intentionPhase, setIntentionPhase] = useState(0);
    const intentionTimerRef = useRef(null);
    const [actionMode, setActionMode] = useState('idle'); // 'idle' | 'capture' | 'done'
    const [micCapturedPhoto, setMicCapturedPhoto] = useState(false);

    // Connection Status
    const [connectionStatus, setConnectionStatus] = useState('CONNECTING');
    const [isFlashOn, setIsFlashOn] = useState(false);
    const [isFrontCamera, setIsFrontCamera] = useState(false);

    // Shutter: tap = photo, long press = video
    const [isRecording, setIsRecording] = useState(false);
    const longPressTimerRef = useRef(null);
    const isLongPressRef = useRef(false);

    // Live recording timer
    const [recordingSeconds, setRecordingSeconds] = useState(0);
    const recordingTimerRef = useRef(null);

    // Animation states
    const [isScanning, setIsScanning] = useState(false);
    const [showCaptureAnim, setShowCaptureAnim] = useState(false);
    const [stackStatus, setStackStatus] = useState('IDLE');
    const [showShutterPulse, setShowShutterPulse] = useState(false);
    const [stackBounce, setStackBounce] = useState(false);
    const [stackExpanded, setStackExpanded] = useState(false);

    // Done button delay (PRD §7.3)
    const [hasCaptured, setHasCaptured] = useState(false);
    const [showDone, setShowDone] = useState(false);
    const [doneOpacity, setDoneOpacity] = useState(1);
    const doneTimerRef = useRef(null);

    // Cold start inspiration (PRD §11.5 — 8s instead of 15s)
    const [showInspiration, setShowInspiration] = useState(false);
    const inspirationTimerRef = useRef(null);

    // Guided First Shot overlay (PRD §11.7)
    const [showGuidedOverlay, setShowGuidedOverlay] = useState(isFirstTime);
    const [guidedStep, setGuidedStep] = useState(isFirstTime ? 1 : 0);
    const guidedTimerRef = useRef(null);

    // Card hint for swipe (PRD §5.5 — first 3 cards)
    const [cardShowCount, setCardShowCount] = useState(0);

    // AI card connected state
    const [cardConnected, setCardConnected] = useState(false);

    // Template onboarding state
    const [templateStep, setTemplateStep] = useState(0);
    const templateTimerRef = useRef(null);
    const isTemplateMode = !!selectedTemplate;

    // Default AI observation text
    const DEFAULT_OBSERVATION = "I see a plate of mango. What's next? Maybe Calories? Shopping? Specific mango genre?";
    const BYPASS_TEXT = "Capture and pass to my deep brain. I can directly do something for you.";

    // Cycle stack status after capture
    const triggerStackStatus = () => {
        setStackStatus('UPLOADING');
        setTimeout(() => {
            setStackStatus('ANALYZING');
            setTimeout(() => {
                setStackStatus('READY');
                setTimeout(() => setStackStatus('IDLE'), 1500);
            }, 1800);
        }, 1200);
    };

    // Simulate AI connection
    useEffect(() => {
        const timer = setTimeout(() => {
            setConnectionStatus('CONNECTED');
            setCardText(DEFAULT_OBSERVATION);
            setCardConnected(true);
            setCardShowCount(prev => prev + 1);
            setIsScanning(true);
            setTimeout(() => setIsScanning(false), 2000);
        }, 2500);
        return () => clearTimeout(timer);
    }, []);

    // ─── Template onboarding: auto-advance steps with duration ──────────
    useEffect(() => {
        if (!selectedTemplate) {
            setTemplateStep(0);
            return;
        }
        setTemplateStep(0);
        // Start at step 0 immediately
        const steps = selectedTemplate.onboardingSteps;
        if (steps && steps.length > 0 && steps[0].duration > 0) {
            templateTimerRef.current = setTimeout(() => {
                setTemplateStep(1);
            }, steps[0].duration);
        }
        return () => clearTimeout(templateTimerRef.current);
    }, [selectedTemplate]);

    // Auto-advance template steps when duration > 0
    useEffect(() => {
        if (!selectedTemplate || templateStep === 0) return;
        const steps = selectedTemplate.onboardingSteps;
        if (templateStep < steps.length) {
            const currentStep = steps[templateStep];
            if (currentStep.duration > 0) {
                templateTimerRef.current = setTimeout(() => {
                    setTemplateStep(prev => prev + 1);
                }, currentStep.duration);
            }
        }
        return () => clearTimeout(templateTimerRef.current);
    }, [templateStep, selectedTemplate]);

    const advanceTemplateStep = () => {
        if (!selectedTemplate) return;
        const steps = selectedTemplate.onboardingSteps;
        if (templateStep < steps.length - 1) {
            clearTimeout(templateTimerRef.current);
            setTemplateStep(prev => prev + 1);
        } else {
            // Last step → go to session
            clearTimeout(templateTimerRef.current);
            const templateBg = selectedTemplate.bgImage || MOCK_BG_IMAGE;
            onTapCard({
                image: templateBg,
                images: capturedMedia.length > 0 ? capturedMedia.map(m => m.src) : [templateBg],
                query: selectedTemplate.label,
                ...selectedTemplate.mockSessionData,
            });
            if (onClearTemplate) onClearTemplate();
        }
    };

    // Cold start: 8s no-action → show inspiration
    useEffect(() => {
        inspirationTimerRef.current = setTimeout(() => {
            if (!hasCaptured) {
                setShowInspiration(true);
            }
        }, 8000);
        return () => clearTimeout(inspirationTimerRef.current);
    }, []);

    // Auto-dismiss inspiration after 5s
    useEffect(() => {
        if (!showInspiration) return;
        const dismissTimer = setTimeout(() => setShowInspiration(false), 5000);
        return () => clearTimeout(dismissTimer);
    }, [showInspiration]);

    // Guided First Shot: auto-dismiss after 10s
    useEffect(() => {
        if (guidedStep === 1) {
            guidedTimerRef.current = setTimeout(() => {
                setShowGuidedOverlay(false);
                setGuidedStep(0);
            }, 10000);
        }
        return () => clearTimeout(guidedTimerRef.current);
    }, [guidedStep]);

    // Done button delay logic (PRD §7.3)
    useEffect(() => {
        if (!hasCaptured) return;
        clearTimeout(doneTimerRef.current);

        const isNewUser = sessionCount < 5;
        const cardIsVisible = cardConnected;

        if (isNewUser && cardIsVisible) {
            // Hide Done when Card is showing for new users
            setShowDone(false);
            setDoneOpacity(0.3);
            // Show Done at low opacity after 30s as safety net
            doneTimerRef.current = setTimeout(() => {
                setShowDone(true);
                setDoneOpacity(0.3);
            }, 30000);
        } else {
            // Normal: show Done immediately
            setShowDone(true);
            setDoneOpacity(1);
        }
    }, [hasCaptured, cardConnected, sessionCount]);

    // Live recording timer
    useEffect(() => {
        if (isRecording) {
            setRecordingSeconds(0);
            recordingTimerRef.current = setInterval(() => {
                setRecordingSeconds(prev => prev + 1);
            }, 1000);
        } else {
            clearInterval(recordingTimerRef.current);
        }
        return () => clearInterval(recordingTimerRef.current);
    }, [isRecording]);

    // Non-CONNECTED: show bypass text
    useEffect(() => {
        if (connectionStatus !== 'CONNECTED') {
            setCardText(BYPASS_TEXT);
        }
    }, [connectionStatus]);

    // ─── Mic-ON: Step through refinement snapshots (from KC) ────────────
    useEffect(() => {
        if (!isMicOn || !showCard) {
            clearTimeout(intentionTimerRef.current);
            return;
        }
        setMicCapturedPhoto(false);
        setActionMode('idle');
        const snapshots = REFINEMENT_STEPS;
        let step = 0;
        setIntentionPhase(1);
        setCardText(snapshots[0]);

        const advanceStep = () => {
            step++;
            if (step < snapshots.length) {
                setCardText(snapshots[step]);
                setIntentionPhase(step + 1);
                if (step === 5) setActionMode('capture');
                let delay;
                if (step < 3) delay = 600;
                else if (step < 5) delay = 900;
                else if (step === 5) delay = 2500;
                else if (step < 10) delay = 1200;
                else delay = 1500;
                intentionTimerRef.current = setTimeout(advanceStep, delay);
            }
        };
        intentionTimerRef.current = setTimeout(advanceStep, 800);
        return () => clearTimeout(intentionTimerRef.current);
    }, [isMicOn, showCard]);

    // Mic-ON photo captured + prompt far enough → mode = done
    useEffect(() => {
        if (isMicOn && micCapturedPhoto && intentionPhase >= 10) {
            setActionMode('done');
        }
    }, [isMicOn, micCapturedPhoto, intentionPhase]);

    // Mic-OFF + CONNECTED: show default observation
    useEffect(() => {
        if (!showCard || isMicOn || connectionStatus !== 'CONNECTED') return;
        if (intentionPhase === 0) {
            setCardText(DEFAULT_OBSERVATION);
        }
    }, [showCard, isMicOn, connectionStatus]);

    // Unified shutter handling
    const justStartedRecordingRef = useRef(false);

    const doCapture = () => {
        setShowShutterPulse(true);
        setTimeout(() => setShowShutterPulse(false), 400);
        setShowCaptureAnim(true);
        setHasCaptured(true);
        setShowInspiration(false);
        clearTimeout(inspirationTimerRef.current);

        // Close guided step 1, advance to step 2 after Card appears
        if (guidedStep === 1) {
            setShowGuidedOverlay(false);
            clearTimeout(guidedTimerRef.current);
            setTimeout(() => {
                if (cardConnected) {
                    setGuidedStep(2);
                    setShowGuidedOverlay(true);
                    guidedTimerRef.current = setTimeout(() => {
                        setShowGuidedOverlay(false);
                        setGuidedStep(0);
                    }, 5000);
                }
            }, 1500);
        }

        // If mic is on, mark photo as captured for refinement flow
        if (isMicOn) {
            setMicCapturedPhoto(true);
            if (intentionPhase >= 6) {
                setActionMode('idle');
            }
        }

        setTimeout(() => {
            setShowCaptureAnim(false);
            setCapturedMedia(prev => [{ type: 'photo', src: MOCK_BG_IMAGE }, ...prev].slice(0, 8));
            setStackBounce(true);
            setTimeout(() => setStackBounce(false), 400);
            triggerStackStatus();
        }, 600);
    };

    const handleShutterDown = () => {
        if (isRecording) return;
        isLongPressRef.current = false;
        longPressTimerRef.current = setTimeout(() => {
            isLongPressRef.current = true;
            justStartedRecordingRef.current = true;
            setIsRecording(true);
        }, 500);
    };

    const handleShutterUp = () => {
        clearTimeout(longPressTimerRef.current);
        if (isRecording) return;
        if (!isLongPressRef.current) {
            doCapture();
        }
        isLongPressRef.current = false;
    };

    const handleShutterClick = () => {
        if (justStartedRecordingRef.current) {
            justStartedRecordingRef.current = false;
            return;
        }
        if (isRecording) {
            setIsRecording(false);
            isLongPressRef.current = false;
            setShowCaptureAnim(true);
            setHasCaptured(true);
            setTimeout(() => {
                setShowCaptureAnim(false);
                setCapturedMedia(prev => [{ type: 'video', src: MOCK_BG_IMAGE }, ...prev].slice(0, 8));
                triggerStackStatus();
            }, 600);
        }
    };

    const handleGallerySelect = (imageSrc) => {
        setShowGallery(false);
        onTapCard({ image: imageSrc, images: capturedMedia.map(m => m.src), query: cardText });
    };

    const handleCardClick = () => {
        // Dismiss guided overlay
        if (guidedStep === 2) {
            setShowGuidedOverlay(false);
            setGuidedStep(0);
            clearTimeout(guidedTimerRef.current);
        }

        if (connectionStatus !== 'CONNECTED') {
            doCapture();
        } else {
            onTapCard({ image: MOCK_BG_IMAGE, images: capturedMedia.length > 0 ? capturedMedia.map(m => m.src) : [MOCK_BG_IMAGE], query: cardText });
        }
    };

    const handleAlternativeClick = (label) => {
        setCardText(`${label}: analyzing...`);
        setTimeout(() => {
            onTapCard({ image: MOCK_BG_IMAGE, images: capturedMedia.length > 0 ? capturedMedia.map(m => m.src) : [MOCK_BG_IMAGE], query: label });
        }, 500);
    };

    const handleTextSubmit = (text) => {
        setCardText(text);
        setTimeout(() => {
            onTapCard({ image: MOCK_BG_IMAGE, images: capturedMedia.length > 0 ? capturedMedia.map(m => m.src) : [MOCK_BG_IMAGE], query: text });
        }, 500);
    };

    // Cycle connection states for demo
    const cycleConnection = () => {
        const states = ['CONNECTING', 'CONNECTED', 'WEAK', 'DISCONNECTED'];
        const currentIndex = states.indexOf(connectionStatus);
        const nextState = states[(currentIndex + 1) % states.length];
        setConnectionStatus(nextState);
    };

    // Done handler: navigate to Session with prompt (from KC)
    const handleDone = () => {
        const query = cardText;
        const images = capturedMedia.length > 0 ? capturedMedia.map(m => m.src) : [MOCK_BG_IMAGE];
        onTapCard({ image: MOCK_BG_IMAGE, images, query });
        setIsMicOn(false);
    };

    // CTA text
    const ctaText = (() => {
        if (connectionStatus !== 'CONNECTED') return 'Snap First';
        return 'Deep Dive';
    })();

    // Card variant
    const cardVariant = connectionStatus !== 'CONNECTED' ? 'fallback' : 'normal';

    // ─── Glass button helper ──────────────────────────────────────────
    const GlassButton = ({ onClick, children, className = '', size = 'md', active = false, style = {} }) => {
        const sizeClasses = size === 'xs' ? 'w-8 h-8' : size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-[4.5rem] h-[4.5rem]' : 'w-12 h-12';
        return (
            <button
                onClick={onClick}
                style={style}
                className={`
                    ${sizeClasses} rounded-full
                    flex items-center justify-center
                    backdrop-blur-2xl
                    border
                    transition-all duration-200
                    active:scale-90
                    ${active
                        ? 'bg-white/20 border-white/25 shadow-[0_0_20px_rgba(255,255,255,0.08),inset_0_1px_0_rgba(255,255,255,0.1)]'
                        : 'bg-black/25 border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_-1px_0_rgba(0,0,0,0.2)] hover:bg-black/35 hover:border-white/[0.15]'
                    }
                    ${className}
                `}
            >
                {children}
            </button>
        );
    };


    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative w-full h-full bg-black"
        >
            <GalleryView
                isOpen={showGallery}
                onClose={() => setShowGallery(false)}
                onSelect={handleGallerySelect}
            />

            {/* ═══ Full-Bleed Camera Feed ═══ */}
            <div className="absolute inset-0 overflow-hidden rounded-[2rem]">
                <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-700"
                    style={{ backgroundImage: `url(${isTemplateMode && selectedTemplate.bgImage ? selectedTemplate.bgImage : (isFrontCamera ? SELFIE_IMAGE : MOCK_BG_IMAGE)})` }}
                />
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%)' }}
                />
                <div
                    className="absolute bottom-0 left-0 right-0 h-[45%] pointer-events-none"
                    style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 40%, transparent 100%)' }}
                />
                <div
                    className="absolute top-0 left-0 right-0 h-28 pointer-events-none"
                    style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, transparent 100%)' }}
                />
            </div>

            {/* ═══ Top Controls ═══ */}
            <div className="absolute top-0 left-0 right-0 z-30 pt-14 px-5 flex items-start justify-between">
                <GlassButton onClick={onOpenHistory} size="sm">
                    <ArrowLeft size={15} strokeWidth={2} className="text-white/90" />
                </GlassButton>

                {/* Right controls — compact camera-style */}
                <div className="flex items-center gap-1.5">
                    <GlassButton onClick={() => setIsFlashOn(!isFlashOn)} size="sm" active={isFlashOn}>
                        <Zap size={14} strokeWidth={2} fill={isFlashOn ? 'currentColor' : 'none'} className={isFlashOn ? 'text-white' : 'text-white/60'} />
                    </GlassButton>
                    <GlassButton onClick={() => setIsFrontCamera(prev => !prev)} size="sm" active={isFrontCamera}>
                        <RotateCcw size={14} strokeWidth={2} className={isFrontCamera ? 'text-white' : 'text-white/60'} />
                    </GlassButton>
                </div>
            </div>

            {/* AI Signal — absolutely centered on screen */}
            <motion.button
                onClick={cycleConnection}
                initial={{ opacity: 0, scale: 0.8, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25, delay: 0.3 }}
                className="absolute top-14 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 h-8 rounded-full bg-black/25 backdrop-blur-2xl border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] active:scale-95 transition-all"
            >
                {connectionStatus === 'CONNECTING' && <Loader2 size={14} className="text-white/70 animate-spin" />}
                {connectionStatus === 'CONNECTED' && (
                    <motion.div key="connected" initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500 }}>
                        <Wifi size={14} strokeWidth={2.5} className="text-white/80" />
                    </motion.div>
                )}
                {connectionStatus === 'WEAK' && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse">
                        <path d="M5 12.55a11 11 0 0 1 14.08 0" stroke="rgba(255,255,255,0.1)" />
                        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" stroke="rgba(255,255,255,0.5)" />
                        <line x1="12" y1="20" x2="12.01" y2="20" stroke="rgba(255,255,255,0.5)" strokeWidth="3" />
                    </svg>
                )}
                {connectionStatus === 'DISCONNECTED' && <WifiOff size={14} strokeWidth={2.5} className="text-white/30" />}
                <motion.span
                    key={connectionStatus}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-[10px] font-semibold tracking-wider text-white/50 uppercase"
                >
                    {connectionStatus === 'CONNECTING' && 'Linking'}
                    {connectionStatus === 'CONNECTED' && 'Live'}
                    {connectionStatus === 'WEAK' && 'Weak'}
                    {connectionStatus === 'DISCONNECTED' && 'Offline'}
                </motion.span>
            </motion.button>

            {/* ═══ Status Banner ═══ */}
            <AnimatePresence>
                {connectionStatus !== 'CONNECTED' && connectionStatus !== 'CONNECTING' && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="absolute top-28 left-1/2 -translate-x-1/2 z-30 px-5 py-2 bg-black/30 backdrop-blur-2xl rounded-full border border-white/[0.08]"
                    >
                        <span className="text-white/70 text-[11px] font-semibold tracking-widest uppercase">
                            {connectionStatus === 'WEAK' && "Weak AI Signal"}
                            {connectionStatus === 'DISCONNECTED' && "AI Offline"}
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══ Media Stack — float + bounce ═══ */}
            <AnimatePresence mode="wait">
                {capturedMedia.length > 0 && !stackExpanded && (
                    <motion.div
                        key="media-stack"
                        initial={{ opacity: 0, scale: 0.5, y: 20 }}
                        animate={{
                            opacity: 1,
                            scale: stackBounce ? [1, 1.15, 0.95, 1.05, 1] : 1,
                            y: 0
                        }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                        onClick={() => {
                            if (capturedMedia.length > 1) {
                                setStackExpanded(true);
                            } else {
                                onTapCard({ image: MOCK_BG_IMAGE, images: capturedMedia.map(m => m.src), query: cardText });
                            }
                        }}
                        className="absolute top-28 right-5 w-11 h-11 cursor-pointer z-30 float-drift"
                    >
                        {capturedMedia.slice(0, 4).map((item, index) => (
                            <div
                                key={index}
                                className="absolute top-0 right-0 w-11 h-11 rounded-xl border border-white/20 bg-black/30 backdrop-blur-md overflow-hidden shadow-lg flex items-center justify-center"
                                style={{
                                    transform: `rotate(${index * 4}deg) scale(${1 - index * 0.05})`,
                                    zIndex: 4 - index,
                                }}
                            >
                                <img src={item.src} alt="Stack" className="w-full h-full object-cover opacity-80 absolute inset-0" />
                            </div>
                        ))}

                        {/* Delete button — only show when single item */}
                        {capturedMedia.length === 1 && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setCapturedMedia([]);
                                }}
                                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center z-20 hover:bg-black/80 active:scale-90 transition-all"
                            >
                                <span className="text-white/80 text-[10px] font-bold leading-none">✕</span>
                            </button>
                        )}

                        <motion.div
                            key={capturedMedia.length}
                            initial={{ scale: 0.5 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', stiffness: 500 }}
                            className="absolute -bottom-1 -right-1 bg-white text-black text-[9px] font-bold w-4.5 h-4.5 rounded-full flex items-center justify-center z-10 shadow-md border border-black/10 min-w-[18px] min-h-[18px]"
                        >
                            {capturedMedia.length}
                        </motion.div>

                        {/* Stack Status Indicator */}
                        <AnimatePresence mode="wait">
                            {stackStatus === 'UPLOADING' && (
                                <motion.div key="uploading" initial={{ opacity: 0, scale: 0.5, rotate: -90 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ type: 'spring', stiffness: 400 }}
                                    className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-white/70 backdrop-blur-md flex items-center justify-center z-20 shadow-md border border-white/30">
                                    <Upload size={10} strokeWidth={3} className="text-black animate-bounce" />
                                </motion.div>
                            )}
                            {stackStatus === 'ANALYZING' && (
                                <motion.div key="analyzing" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ type: 'spring', stiffness: 400 }}
                                    className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-white/50 backdrop-blur-md flex items-center justify-center z-20 shadow-md border border-white/20">
                                    <ScanLine size={10} strokeWidth={3} className="text-black animate-pulse" />
                                </motion.div>
                            )}
                            {stackStatus === 'READY' && (
                                <motion.div key="ready" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: [1, 1.3, 1] }} exit={{ opacity: 0, scale: 0.5 }} transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                                    className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-white/90 backdrop-blur-md flex items-center justify-center z-20 shadow-md border border-white/30">
                                    <Check size={10} strokeWidth={3} className="text-black" />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══ Expanded Media Strip ═══ */}
            <AnimatePresence>
                {stackExpanded && capturedMedia.length > 0 && (
                    <motion.div
                        key="expanded-strip"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="absolute top-24 right-0 left-0 z-40 px-5"
                    >
                        {/* Backdrop to close */}
                        <div
                            className="fixed inset-0 z-[-1]"
                            onClick={() => setStackExpanded(false)}
                        />

                        <motion.div
                            initial={{ opacity: 0, y: -10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.95 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                            className="flex gap-2 overflow-x-auto no-scrollbar p-2 rounded-2xl bg-black/50 backdrop-blur-2xl border border-white/[0.1]"
                        >
                            {capturedMedia.map((item, index) => (
                                <motion.div
                                    key={index}
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: index * 0.05, type: 'spring', stiffness: 400 }}
                                    className="relative shrink-0 w-14 h-14 rounded-xl border border-white/20 bg-black/30 overflow-hidden"
                                >
                                    <img src={item.src} alt={`Capture ${index + 1}`} className="w-full h-full object-cover" />
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setCapturedMedia(prev => prev.filter((_, i) => i !== index));
                                            if (capturedMedia.length <= 2) setStackExpanded(false);
                                        }}
                                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black/70 backdrop-blur-md border border-white/20 flex items-center justify-center z-10 hover:bg-red-500/60 active:scale-90 transition-all"
                                    >
                                        <span className="text-white/90 text-[9px] font-bold leading-none">✕</span>
                                    </button>
                                </motion.div>
                            ))}

                            {/* Collapse button */}
                            <button
                                onClick={() => setStackExpanded(false)}
                                className="shrink-0 w-14 h-14 rounded-xl border border-white/10 bg-white/[0.05] flex items-center justify-center hover:bg-white/[0.1] active:scale-90 transition-all"
                            >
                                <span className="text-white/50 text-[10px] font-medium">Done</span>
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══ Persistent Dot Grid + AI Scanning Sweep ═══ */}
            <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden rounded-[2rem]">
                <ScanningOverlay scanning={isScanning} duration={2500} />
            </div>

            {/* Recording Indicator */}
            {isRecording && (
                <div className="absolute top-28 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-black/30 backdrop-blur-2xl px-4 py-1.5 rounded-full border border-red-500/20">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-white/90 text-xs font-mono tracking-wider">
                        {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:{String(recordingSeconds % 60).padStart(2, '0')}
                    </span>
                </div>
            )}

            {/* ═══ Capture Genie Animation ═══ */}
            <AnimatePresence>
                {showCaptureAnim && (
                    <>
                        <motion.div
                            initial={{ opacity: 0.6 }}
                            animate={{ opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            className="absolute inset-0 bg-white z-50 pointer-events-none rounded-[2rem]"
                        />
                        <motion.div
                            initial={{ top: '40%', left: '30%', width: '40%', height: '30%', borderRadius: '12px', opacity: 1 }}
                            animate={{
                                top: ['40%', '12%', '6%'],
                                left: ['30%', '65%', '80%'],
                                width: ['40%', '16%', '8%'],
                                height: ['30%', '12%', '6%'],
                                borderRadius: ['12px', '8px', '6px'],
                                opacity: [1, 0.8, 0],
                            }}
                            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1], times: [0, 0.6, 1] }}
                            className="absolute z-40 overflow-hidden shadow-2xl border border-white/20 pointer-events-none"
                        >
                            <img src={MOCK_BG_IMAGE} alt="Captured" className="w-full h-full object-cover" />
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* ═══ Cold Start Inspiration Overlay (PRD §11.5 — 8s) ═══ */}
            <AnimatePresence>
                {showInspiration && !isTemplateMode && !isRecording && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ type: "spring", stiffness: 300, damping: 28 }}
                        className="absolute top-[6.5rem] left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm z-35 pointer-events-auto"
                    >
                        <div className="bg-black/50 backdrop-blur-2xl border border-white/[0.10] rounded-2xl p-4 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
                            <p className="text-white/70 text-[12px] font-medium mb-3">Snap anything around you</p>
                            <div className="space-y-2">
                                {INSPIRATION_ITEMS.map((item, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.1 }}
                                        className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
                                    >
                                        <span className="text-white/60 text-[11px]">
                                            {item.emoji} {item.label}
                                        </span>
                                        <span className="text-white/30 text-[10px] font-mono">
                                            → {item.result}
                                        </span>
                                    </motion.div>
                                ))}
                            </div>
                            <button
                                onClick={() => setShowInspiration(false)}
                                className="w-full text-center text-white/25 text-[10px] mt-3 tracking-wider uppercase"
                            >
                                Dismiss
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══ Template-Specific Onboarding Overlay ═══ */}
            <AnimatePresence>
                {isTemplateMode && selectedTemplate?.onboardingSteps && templateStep < selectedTemplate.onboardingSteps.length && (
                    <motion.div
                        key={`template-overlay-${templateStep}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.35 }}
                        className="absolute inset-0 z-[45] pointer-events-auto"
                        onClick={advanceTemplateStep}
                    >
                        {(() => {
                            const step = selectedTemplate.onboardingSteps[templateStep];
                            if (!step) return null;

                            if (step.type === 'tap_prompt') {
                                return (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <div className="absolute inset-0 bg-black/45" />
                                        <motion.div
                                            initial={{ opacity: 0, y: -16 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.2, type: 'spring', stiffness: 300, damping: 22 }}
                                            className="text-center relative z-10 px-8"
                                        >
                                            {/* Template icon */}
                                            <motion.div
                                                initial={{ scale: 0.5, opacity: 0 }}
                                                animate={{ scale: 1, opacity: 1 }}
                                                transition={{ delay: 0.1, type: 'spring', stiffness: 400, damping: 18 }}
                                                className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-white/[0.08] border border-white/[0.12] backdrop-blur-xl flex items-center justify-center shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
                                            >
                                                {(() => {
                                                    const TEMPLATE_ICONS = { ShoppingBag, Music, Film, FileText, Scissors };
                                                    const Icon = TEMPLATE_ICONS[selectedTemplate.icon];
                                                    return Icon ? <Icon size={28} strokeWidth={1.5} className="text-white/80" /> : null;
                                                })()}
                                            </motion.div>
                                            <p className="text-white/95 text-[18px] font-semibold mb-1.5 tracking-tight">{step.title}</p>
                                            <p className="text-white/50 text-[13px] font-light">{step.subtitle}</p>
                                        </motion.div>

                                        {/* Animated tap indicator */}
                                        <motion.div
                                            animate={{ y: [0, 10, 0] }}
                                            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                                            className="relative z-10 mt-8"
                                        >
                                            <div className="w-10 h-10 rounded-full border-2 border-white/25 flex items-center justify-center">
                                                <div className="w-3 h-3 rounded-full bg-white/50" />
                                            </div>
                                        </motion.div>

                                        {/* Tap to continue hint */}
                                        <motion.p
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: 1.5 }}
                                            className="relative z-10 text-white/25 text-[10px] font-mono tracking-widest mt-6 uppercase"
                                        >
                                            Tap to continue
                                        </motion.p>
                                    </div>
                                );
                            }

                            if (step.type === 'focus_state') {
                                return (
                                    <div className="absolute inset-0">
                                        <div className="absolute inset-0 bg-black/30" />
                                        {/* Focus bracket corners */}
                                        <motion.div
                                            initial={{ opacity: 0, scale: 1.3 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ type: 'spring', stiffness: 200, damping: 18 }}
                                            className="absolute top-[28%] left-[18%] right-[18%] bottom-[38%] z-10"
                                        >
                                            {/* Corner brackets */}
                                            <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white/60 rounded-tl-sm" />
                                            <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white/60 rounded-tr-sm" />
                                            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white/60 rounded-bl-sm" />
                                            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white/60 rounded-br-sm" />

                                            {/* Scanning line */}
                                            <motion.div
                                                animate={{ y: ['0%', '100%', '0%'] }}
                                                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                                                className="absolute left-1 right-1 h-[1px] bg-gradient-to-r from-transparent via-white/50 to-transparent"
                                            />
                                        </motion.div>

                                        {/* Status label */}
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.3 }}
                                            className="absolute top-[21%] left-0 right-0 flex flex-col items-center z-10"
                                        >
                                            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/50 backdrop-blur-xl border border-white/[0.10]">
                                                <motion.div
                                                    animate={{ rotate: 360 }}
                                                    transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                                                    className="w-3 h-3 border-2 border-white/40 border-t-white/80 rounded-full"
                                                />
                                                <span className="text-white/80 text-[11px] font-semibold tracking-wider">{step.title}</span>
                                            </div>
                                            <p className="text-white/40 text-[10px] mt-2">{step.subtitle}</p>
                                        </motion.div>
                                    </div>
                                );
                            }

                            if (step.type === 'results_panel') {
                                return (
                                    <div className="absolute inset-0">
                                        <div className="absolute inset-0 bg-black/20" />
                                        {/* Results panel slides up from bottom */}
                                        <motion.div
                                            initial={{ y: '100%' }}
                                            animate={{ y: 0 }}
                                            transition={{ type: 'spring', stiffness: 250, damping: 28 }}
                                            className="absolute bottom-0 left-0 right-0 bg-[#0e0e0e]/95 backdrop-blur-2xl border-t border-white/[0.08] rounded-t-3xl overflow-hidden"
                                            style={{ maxHeight: '55%' }}
                                        >
                                            {/* Drag handle */}
                                            <div className="flex justify-center pt-3 pb-2">
                                                <div className="w-9 h-1 rounded-full bg-white/15" />
                                            </div>

                                            {/* Header */}
                                            <div className="px-5 pb-3">
                                                <p className="text-white/90 text-[15px] font-semibold tracking-tight">{step.title}</p>
                                                <p className="text-white/35 text-[11px] mt-0.5">{step.subtitle}</p>
                                            </div>

                                            {/* Results list */}
                                            <div className="px-5 pb-8 space-y-2.5 overflow-y-auto" style={{ maxHeight: 'calc(55vh - 100px)' }}>
                                                {(step.results || []).map((item, idx) => (
                                                    <motion.div
                                                        key={idx}
                                                        initial={{ opacity: 0, x: -12 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        transition={{ delay: 0.15 + idx * 0.1, type: 'spring', stiffness: 300, damping: 22 }}
                                                        className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.07] transition-colors cursor-pointer group"
                                                    >
                                                        {/* Thumbnail */}
                                                        <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-white/[0.03]">
                                                            <img src={item.image} alt={item.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                                        </div>
                                                        {/* Info */}
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-white/85 text-[12px] font-medium truncate">{item.name}</p>
                                                            <p className="text-white/35 text-[10px] font-mono">{item.store}</p>
                                                        </div>
                                                        {/* Price/Value */}
                                                        <span className="text-white/70 text-[12px] font-semibold shrink-0">{item.price}</span>
                                                    </motion.div>
                                                ))}
                                            </div>

                                            {/* CTA */}
                                            <div className="px-5 pb-6">
                                                <motion.button
                                                    initial={{ opacity: 0, y: 8 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: 0.5 }}
                                                    onClick={advanceTemplateStep}
                                                    className="w-full py-3 rounded-xl bg-white/90 text-[#0a0a0a] text-[13px] font-semibold tracking-wide active:scale-[0.97] transition-transform shadow-[0_4px_20px_rgba(255,255,255,0.08)]"
                                                >
                                                    Deep Dive →
                                                </motion.button>
                                            </div>
                                        </motion.div>
                                    </div>
                                );
                            }

                            return null;
                        })()}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══ Guided First Shot Overlay (PRD §11.7) ═══ */}
            <AnimatePresence>
                {showGuidedOverlay && guidedStep > 0 && !isTemplateMode && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4 }}
                        className="absolute inset-0 z-40 pointer-events-none"
                    >
                        {/* Semi-transparent overlay */}
                        <div className="absolute inset-0 bg-black/40" />

                        {guidedStep === 1 && (
                            /* Step 1: Prompt to snap */
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3 }}
                                    className="text-center mb-4 px-8"
                                >
                                    <p className="text-white/90 text-[16px] font-semibold mb-1">Snap anything below</p>
                                    <p className="text-white/50 text-[12px]">See what AI can do with it</p>
                                </motion.div>

                                {/* Arrow pointing down to shutter */}
                                <motion.div
                                    animate={{ y: [0, 8, 0] }}
                                    transition={{ duration: 1.5, repeat: Infinity }}
                                    className="text-white/60"
                                >
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="12" y1="5" x2="12" y2="19" />
                                        <polyline points="19,12 12,19 5,12" />
                                    </svg>
                                </motion.div>
                            </div>
                        )}

                        {guidedStep === 2 && (
                            /* Step 2: Highlight the Card */
                            <div className="absolute bottom-28 left-4 right-4 flex flex-col items-center">
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2 }}
                                    className="bg-white/95 backdrop-blur-xl rounded-xl px-4 py-2.5 shadow-2xl mb-2"
                                >
                                    <p className="text-black text-[13px] font-semibold text-center">Tap the card to start ↑</p>
                                </motion.div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══ Bottom Controls ═══ */}
            <div className="absolute bottom-0 left-0 right-0 z-30 pb-8 px-5 flex flex-col items-center gap-4">
                {/* Intention Card */}
                <div className="w-full max-w-sm">
                    <Card
                        isVisible={showCard && !isTemplateMode}
                        text={cardText}
                        ctaText={ctaText}
                        variant={cardVariant}
                        showHint={cardShowCount <= 3 && cardConnected}
                        alternatives={DEFAULT_ALTERNATIVES}
                        onClick={handleCardClick}
                        onAlternativeClick={handleAlternativeClick}
                        onTextSubmit={handleTextSubmit}
                        isMicOn={isMicOn}
                    />
                </div>

                {/* Shutter Row: Mic — Shutter — Contextual Done */}
                <div className="flex items-center justify-center gap-6 w-full max-w-[280px]">
                    {/* Mic Toggle — bottom-left */}
                    <GlassButton
                        onClick={() => {
                            if (isMicOn) {
                                setIsMicOn(false);
                                setActionMode('idle');
                                if (connectionStatus === 'CONNECTED') {
                                    setCardText(DEFAULT_OBSERVATION);
                                }
                            } else {
                                setIsMicOn(true);
                                setIntentionPhase(0);
                            }
                        }}
                        size="md"
                        active={isMicOn}
                    >
                        {isMicOn
                            ? <Mic size={18} strokeWidth={1.8} className="text-white/90" />
                            : <MicOff size={18} strokeWidth={1.8} className="text-white/50" />
                        }
                    </GlassButton>

                    {/* ═══ Shutter Button ═══ */}
                    <div className="relative">
                        {/* Ambient glow + breathe + guided pulse */}
                        <div className={`
                            absolute inset-[-6px] rounded-full
                            transition-all duration-500
                            ${isRecording
                                ? 'bg-red-500/20 shadow-[0_0_30px_rgba(239,68,68,0.3)]'
                                : guidedStep === 1
                                    ? 'bg-white/[0.08] shadow-[0_0_30px_rgba(255,255,255,0.15)] animate-pulse'
                                    : isMicOn && actionMode === 'capture'
                                        ? 'bg-white/[0.08] shadow-[0_0_25px_rgba(255,255,255,0.12)] animate-pulse'
                                        : connectionStatus === 'CONNECTED'
                                            ? 'shutter-breathe bg-white/[0.04] shadow-[0_0_25px_rgba(255,255,255,0.06)]'
                                            : 'bg-white/[0.02]'
                            }
                        `} />

                        {/* Pulse ring on shutter press */}
                        {showShutterPulse && (
                            <div className="absolute inset-[-8px] rounded-full border-2 border-white/30 pulse-ring" />
                        )}

                        {isMicOn && actionMode === 'done' ? (
                            /* Done mode: green checkmark button replaces shutter */
                            <button
                                onClick={handleDone}
                                className="
                                    relative group w-[4.5rem] h-[4.5rem] rounded-full
                                    border-[3px] border-white/20 flex items-center justify-center
                                    bg-black/15 backdrop-blur-2xl
                                    transition-all duration-200 select-none touch-none
                                    active:scale-90 hover:border-white/30
                                "
                            >
                                <motion.div
                                    initial={{ scale: 0.5, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                                    className="w-[3.2rem] h-[3.2rem] rounded-full bg-white/15 flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.08)]"
                                >
                                    <CheckCircle2 size={24} strokeWidth={1.8} className="text-white/90" />
                                </motion.div>
                            </button>
                        ) : isMicOn && actionMode === 'idle' ? (
                            /* Mic ON + idle: Empty ring (waiting for prompt to build) */
                            <div className="w-[4.5rem] h-[4.5rem] rounded-full border-[3px] border-white/10 flex items-center justify-center transition-all duration-500" />
                        ) : (
                            /* Normal shutter button */
                            <button
                                onClick={handleShutterClick}
                                onPointerDown={handleShutterDown}
                                onPointerUp={handleShutterUp}
                                onPointerLeave={() => { if (!isRecording) clearTimeout(longPressTimerRef.current); }}
                                className={`
                                    relative group w-[4.5rem] h-[4.5rem] rounded-full
                                    border-[3px] flex items-center justify-center
                                    bg-black/15 backdrop-blur-2xl
                                    transition-all duration-200 select-none touch-none
                                    ${isRecording
                                        ? 'border-red-500/50 scale-110'
                                        : 'border-white/30 hover:border-white/50'
                                    }
                                    active:scale-90
                                `}
                            >
                                <motion.div
                                    animate={{
                                        width: isRecording ? 24 : 62,
                                        height: isRecording ? 24 : 62,
                                        borderRadius: isRecording ? 6 : 31,
                                    }}
                                    transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                                    className={`
                                        ${isRecording
                                            ? 'bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]'
                                            : 'bg-white/90 shadow-[0_0_20px_rgba(255,255,255,0.2)]'
                                        }
                                    `}
                                />
                            </button>
                        )}
                    </div>

                    {/* Contextual Right Button: Done (mic-off captured) or spacer */}
                    <AnimatePresence>
                        {!isMicOn && hasCaptured && showDone ? (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: doneOpacity, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                            >
                                <GlassButton
                                    onClick={() => {
                                        onTapCard({
                                            image: MOCK_BG_IMAGE,
                                            images: capturedMedia.map(m => m.src),
                                            query: cardText,
                                            viaDone: true,
                                        });
                                    }}
                                    size="md"
                                    active={true}
                                    style={{ opacity: doneOpacity }}
                                >
                                    <CheckCircle size={20} strokeWidth={1.5} className="text-white/80" />
                                </GlassButton>
                            </motion.div>
                        ) : (
                            <div className="w-12 h-12" />
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </motion.div>
    );
}
