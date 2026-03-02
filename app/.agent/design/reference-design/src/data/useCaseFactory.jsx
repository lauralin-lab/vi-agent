import bgImage from '../assets/camera/bg.jpg';
import bgImage1 from '../assets/camera/bg1.jpg';

// Category color map — monochromatic palette
export const CAT_COLORS = {
    Health: "bg-white/10 text-white/60",
    Finance: "bg-white/10 text-white/60",
    STEM: "bg-white/10 text-white/60",
    Nature: "bg-white/10 text-white/60",
    Productivity: "bg-white/10 text-white/60",
    Creativity: "bg-white/10 text-white/60",
    Shopping: "bg-white/10 text-white/60",
    DIY: "bg-white/10 text-white/60",
    Education: "bg-white/10 text-white/60",
    Travel: "bg-white/10 text-white/60",
    Professional: "bg-white/10 text-white/60",
    Memory: "bg-white/10 text-white/60",
    AR: "bg-white/10 text-white/60",
};

// Monochromatic bar opacities for visual distinction
const BAR_COLORS = ["bg-white/70", "bg-white/50", "bg-white/40", "bg-white/60"];

// Build a use case from compact spec
export function makeUseCase(id, spec) {
    const {
        title, date, category, thumb,
        sTitle, intention, chips,
        visualDesc, voiceDesc,
        todos, // [{text, steps:[{t,d}], summary}]
        artifact, // {title, type, sections, verdict, verdictColor, calories, calLabel, calUnit, breakdown:[{l,v,p,c}], info:[{s,p,n}], note}
    } = spec;

    return {
        id,
        title,
        date,
        category,
        categoryColor: CAT_COLORS[category] || "bg-white/10 text-white/60",
        thumbnail: thumb,
        sessionData: {
            title: sTitle || title,
            media: [
                { type: 'photo', src: thumb, label: 'Main shot' },
                { type: 'photo', src: thumb, label: 'Detail' },
            ],
            intention,
            intentionChips: chips.map(l => ({ label: l })),
            whatICaught: {
                visual: {
                    description: visualDesc,
                    cropStyle: { transform: 'scale(1.5)', objectPosition: '50% 50%' }
                },
                voice: { description: voiceDesc }
            },
            todos: todos.map((t, i) => ({
                id: i + 1,
                text: t.text,
                substeps: t.steps.map(s => ({ text: s.t, delay: s.d || 800 })),
                completedSummary: t.summary,
            })),
            artifact: {
                title: artifact.title,
                type: artifact.type,
                sections: artifact.sections,
                preview: {
                    calories: artifact.calories ?? null,
                    caloriesLabel: artifact.calLabel,
                    caloriesUnit: artifact.calUnit,
                    verdict: artifact.verdict,
                    verdictColor: "bg-white/10 text-white/70 border border-white/10",
                    breakdown: (artifact.breakdown || []).map((b, i) => ({ label: b.l, value: b.v, pct: b.p, color: BAR_COLORS[i % BAR_COLORS.length] })),
                    shopping: (artifact.info || []).map(s => ({ store: s.s, price: s.p, note: s.n })),
                    note: artifact.note,
                }
            }
        }
    };
}

