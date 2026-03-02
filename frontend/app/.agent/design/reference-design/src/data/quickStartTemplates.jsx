// Each template uses its own contextual background image

// ─── Quick Start Template Definitions ─────────────────────────────────
// Each template defines a use case shortcut with dedicated onboarding flow

const QUICK_START_TEMPLATES = [
    {
        id: 'search_similar',
        icon: 'ShoppingBag',
        label: 'Search Similar',
        description: 'Find similar items to buy',
        bgImage: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=800&auto=format&fit=crop',
        onboardingSteps: [
            {
                type: 'tap_prompt',
                title: 'Tap on something',
                subtitle: 'Select the item you want to search for',
                duration: 0,
            },
            {
                type: 'focus_state',
                title: 'Live Focus',
                subtitle: 'Analyzing item...',
                duration: 2000,
            },
            {
                type: 'results_panel',
                title: 'Similar Items Found',
                subtitle: '3 matches from nearby stores',
                duration: 0,
                results: [
                    { name: 'Oversized Wool Jacket', store: 'Zara', price: '$89.90', image: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?q=80&w=200&auto=format&fit=crop' },
                    { name: 'Classic Blazer', store: 'H&M', price: '$64.99', image: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?q=80&w=200&auto=format&fit=crop' },
                    { name: 'Minimalist Coat', store: 'COS', price: '$175.00', image: 'https://images.unsplash.com/photo-1539533113208-f6df8cc8b543?q=80&w=200&auto=format&fit=crop' },
                ],
            },
        ],
        mockSessionData: {
            title: 'Visual Search',
            intention: 'Find visually similar items available for purchase nearby and online.',
            intentionChips: [{ label: '🔍 Visual Match' }, { label: '🛒 Shopping' }, { label: '💲 Compare' }],
            media: [{ type: 'photo', src: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=800&auto=format&fit=crop', label: 'Search target' }],
        },
    },
    {
        id: 'music_maker',
        icon: 'Music',
        label: 'Music Maker',
        description: 'Create music from your surroundings',
        bgImage: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?q=80&w=800&auto=format&fit=crop',
        onboardingSteps: [
            {
                type: 'tap_prompt',
                title: 'Point at your environment',
                subtitle: 'I\'ll create music inspired by what I see',
                duration: 3000,
            },
            {
                type: 'focus_state',
                title: 'Composing...',
                subtitle: 'Extracting visual mood & rhythm',
                duration: 2500,
            },
            {
                type: 'results_panel',
                title: '🎶 Track Generated',
                subtitle: 'Ambient · 120 BPM · Warm tones',
                duration: 0,
                results: [
                    { name: 'Golden Hour Vibes', store: 'Ambient', price: '2:34', image: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?q=80&w=200&auto=format&fit=crop' },
                    { name: 'Tropical Drift', store: 'Lo-Fi', price: '3:12', image: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?q=80&w=200&auto=format&fit=crop' },
                ],
            },
        ],
        mockSessionData: {
            title: 'Music Maker',
            intention: 'Generate music tracks inspired by the visual environment captured by the camera.',
            intentionChips: [{ label: '🎵 Compose' }, { label: '🎧 Mood' }, { label: '🎹 Ambient' }],
            media: [{ type: 'photo', src: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?q=80&w=800&auto=format&fit=crop', label: 'Environment' }],
        },
    },
    {
        id: 'cinematic_memory',
        icon: 'Film',
        label: 'Cinematic Memory',
        description: 'Turn moments into cinematic clips',
        bgImage: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=800&auto=format&fit=crop',
        onboardingSteps: [
            {
                type: 'tap_prompt',
                title: 'Frame your moment',
                subtitle: 'Hold steady — I\'ll add cinematic magic',
                duration: 3000,
            },
            {
                type: 'focus_state',
                title: 'Applying Cinematic Filter',
                subtitle: 'Film grain · Letterbox · Color grade',
                duration: 2500,
            },
            {
                type: 'results_panel',
                title: '✨ Memory Created',
                subtitle: 'Cinematic · 16:9 · Film Look',
                duration: 0,
                results: [
                    { name: 'Kodak Portra 400', store: 'Filter', price: 'Applied', image: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=200&auto=format&fit=crop' },
                    { name: 'Anamorphic Flare', store: 'Effect', price: 'Added', image: 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?q=80&w=200&auto=format&fit=crop' },
                ],
            },
        ],
        mockSessionData: {
            title: 'Cinematic Memory',
            intention: 'Transform the captured moment into a cinematic-quality visual memory with film effects.',
            intentionChips: [{ label: '🎬 Cinematic' }, { label: '🎞️ Film Look' }, { label: '✨ Effects' }],
            media: [{ type: 'photo', src: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=800&auto=format&fit=crop', label: 'Scene' }],
        },
    },
    {
        id: 'doc_reader',
        icon: 'FileText',
        label: 'Doc Reader',
        description: 'Scan and extract text from documents',
        bgImage: 'https://images.unsplash.com/photo-1568667256549-094345857637?q=80&w=800&auto=format&fit=crop',
        onboardingSteps: [
            {
                type: 'tap_prompt',
                title: 'Point at a document',
                subtitle: 'I\'ll scan and extract the text for you',
                duration: 3000,
            },
            {
                type: 'focus_state',
                title: 'Scanning Document',
                subtitle: 'OCR processing · Extracting text...',
                duration: 2500,
            },
            {
                type: 'results_panel',
                title: '📋 Text Extracted',
                subtitle: '2 pages · 347 words · 99.2% accuracy',
                duration: 0,
                results: [
                    { name: 'Full Text Extract', store: 'Document', price: '347 words', image: 'https://images.unsplash.com/photo-1568667256549-094345857637?q=80&w=200&auto=format&fit=crop' },
                    { name: 'Summary Generated', store: 'AI Summary', price: '3 key points', image: 'https://images.unsplash.com/photo-1456324504439-367cee3b3c32?q=80&w=200&auto=format&fit=crop' },
                ],
            },
        ],
        mockSessionData: {
            title: 'Doc Reader',
            intention: 'Scan the document, extract all text via OCR, summarize key points, and make it searchable.',
            intentionChips: [{ label: '📄 OCR' }, { label: '📝 Extract' }, { label: '📊 Summarize' }],
            media: [{ type: 'photo', src: 'https://images.unsplash.com/photo-1568667256549-094345857637?q=80&w=800&auto=format&fit=crop', label: 'Document' }],
        },
    },
    {
        id: 'removal',
        icon: 'Scissors',
        label: 'Removal',
        description: 'Remove objects from photos',
        bgImage: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop',
        onboardingSteps: [
            {
                type: 'tap_prompt',
                title: 'Tap on what to remove',
                subtitle: 'Select the object you want to erase',
                duration: 0,
            },
            {
                type: 'focus_state',
                title: 'Processing Removal',
                subtitle: 'Inpainting selected region...',
                duration: 2500,
            },
            {
                type: 'results_panel',
                title: '✅ Object Removed',
                subtitle: 'Clean result · No artifacts',
                duration: 0,
                results: [
                    { name: 'Before → After', store: 'Comparison', price: 'Clean', image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=200&auto=format&fit=crop' },
                ],
            },
        ],
        mockSessionData: {
            title: 'Object Removal',
            intention: 'Remove the selected object from the photo using AI inpainting while preserving the background.',
            intentionChips: [{ label: '✂️ Remove' }, { label: '🖌️ Inpaint' }, { label: '✨ Clean' }],
            media: [{ type: 'photo', src: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop', label: 'Original' }],
        },
    },
];

export default QUICK_START_TEMPLATES;
