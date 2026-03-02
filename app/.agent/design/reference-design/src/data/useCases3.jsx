import { makeUseCase } from './useCaseFactory.jsx';

// Batch 3: Use Cases 35-50
const batch3 = [
    makeUseCase(35, {
        title: "Street Food Safety Check", date: "Just now", category: "Health",
        thumb: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=400&auto=format&fit=crop",
        sTitle: "Food Safety",
        intention: "Assess this street food stall's hygiene, identify the dish, and check common food safety risks.",
        chips: ["🍜 Identify", "🧼 Hygiene", "⚠️ Risks", "✅ Safe?"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">street food stall</span> serving <span className="text-white/90 font-medium">pad thai</span> — checking hygiene indicators.</span>,
        voiceDesc: <span>Is this stall <span className="text-white/90 font-medium">safe to eat at</span>? Any <span className="text-white/90 font-medium">red flags</span>?</span>,
        todos: [
            { text: "Stall Assessment", steps: [{ t: "Checking hygiene indicators...", d: 800 }, { t: "Clean surfaces ✓ · Gloves ✓", d: 700 }, { t: "Food turnover: high (good)", d: 600 }], summary: "Hygiene: 7/10 · Good turnover" },
            { text: "Dish Identification", steps: [{ t: "Pad Thai with shrimp", d: 600 }, { t: "Common allergens: shellfish, peanuts, egg", d: 700 }, { t: "Fresh ingredients visible ✓", d: 600 }], summary: "Pad Thai · Shellfish/peanut allergens" },
            { text: "Risk Assessment", steps: [{ t: "Overall: LOW risk", d: 600 }, { t: "Tip: eat freshly cooked, avoid pre-made", d: 600 }, { t: "✓ Assessment complete", d: 500 }], summary: "LOW risk · Eat freshly cooked" },
        ],
        artifact: { title: "Food Safety Report", type: "Safety Check", sections: "3 sections", verdict: "Low Risk ✓", verdictColor: "bg-green-500/20 text-green-400", breakdown: [{ l: "Hygiene", v: "7/10", p: 70, c: "bg-blue-500" }, { l: "Freshness", v: "High", p: 90, c: "bg-green-500" }, { l: "Risk", v: "Low", p: 20, c: "bg-amber-500" }], info: [{ s: "Dish", p: "Pad Thai", n: "Shrimp" }, { s: "Allergens", p: "Shellfish, Peanut", n: "Egg" }, { s: "Verdict", p: "Safe to eat", n: "Fresh" }], note: "Street food stall scores 7/10 hygiene. Low risk. Eat freshly cooked items." }
    }),
    makeUseCase(36, {
        title: "Tax Document Scanner", date: "2 days ago", category: "Finance",
        thumb: "https://images.unsplash.com/photo-1554224154-22dec7ec8818?q=80&w=400&auto=format&fit=crop",
        sTitle: "Tax Processing",
        intention: "Scan this W-2 form, extract all fields, cross-check with last year, and prepare for filing.",
        chips: ["📄 Scan W-2", "🔢 Extract", "📊 Compare", "📋 Filing"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">W-2 tax form</span> — <span className="text-white/90 font-medium">2025 tax year</span>, federal and state info visible.</span>,
        voiceDesc: <span>Extract the data and <span className="text-white/90 font-medium">prepare for tax filing</span>.</span>,
        todos: [
            { text: "Form OCR", steps: [{ t: "W-2 template matching...", d: 800 }, { t: "Employer: Tech Corp Inc", d: 600 }, { t: "Gross wages: $185,000", d: 600 }, { t: "Federal tax withheld: $38,200", d: 600 }], summary: "$185K wages · $38.2K federal withheld" },
            { text: "YoY Comparison", steps: [{ t: "2024 wages: $165,000", d: 700 }, { t: "Increase: +$20,000 (12.1%)", d: 600 }, { t: "Tax bracket: same (32%)", d: 600 }], summary: "+$20K YoY · Same bracket" },
            { text: "Filing Prep", steps: [{ t: "Ready for TurboTax import", d: 700 }, { t: "Estimated refund: ~$2,400", d: 700 }, { t: "Filing deadline: Apr 15, 2026", d: 600 }, { t: "✓ Data prepped", d: 500 }], summary: "~$2,400 refund · Ready to file" },
        ],
        artifact: { title: "Tax Summary", type: "Tax Document", sections: "3 sections", calories: 185000, calLabel: "Gross Wages", calUnit: "$", verdict: "~$2.4K Refund", verdictColor: "bg-green-500/20 text-green-400", breakdown: [{ l: "Federal", v: "$38,200", p: 21, c: "bg-blue-500" }, { l: "State", v: "$12,950", p: 7, c: "bg-purple-500" }, { l: "FICA", v: "$14,145", p: 8, c: "bg-amber-500" }], info: [{ s: "Employer", p: "Tech Corp Inc", n: "W-2" }, { s: "YoY Change", p: "+12.1%", n: "+$20K" }, { s: "File By", p: "Apr 15, 2026", n: "Deadline" }], note: "W-2 scanned: $185K gross, $38.2K federal withheld. Estimated refund ~$2,400." }
    }),
    makeUseCase(37, {
        title: "Insect Identifier", date: "4 hours ago", category: "Nature",
        thumb: "https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?q=80&w=400&auto=format&fit=crop",
        sTitle: "Insect ID",
        intention: "Identify this insect, tell me if it's harmful, and suggest how to manage it.",
        chips: ["🔬 Identify", "⚠️ Harmful?", "🏠 Manage", "📸 Similar"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">ladybug</span> on a leaf — <span className="text-white/90 font-medium">7-spotted variety</span>, bright red with black dots.</span>,
        voiceDesc: <span>Is this <span className="text-white/90 font-medium">harmful</span>? Should I <span className="text-white/90 font-medium">remove it</span>?</span>,
        todos: [
            { text: "Species ID", steps: [{ t: "Running insect classifier...", d: 800 }, { t: "Match: 7-spot ladybug (Coccinella septempunctata)", d: 800 }, { t: "Confidence: 97.1%", d: 600 }], summary: "7-spot ladybug · 97.1% confidence" },
            { text: "Harm Assessment", steps: [{ t: "Harmful to humans: NO", d: 600 }, { t: "Beneficial: eats aphids (pest control)", d: 700 }, { t: "Garden-friendly ✓", d: 500 }], summary: "Harmless · Beneficial pest control" },
            { text: "Management", steps: [{ t: "Recommendation: KEEP — beneficial!", d: 600 }, { t: "Eats ~5,000 aphids in lifetime", d: 600 }, { t: "✓ Report complete", d: 500 }], summary: "Keep! Natural pest control agent" },
        ],
        artifact: { title: "Insect Report", type: "Nature ID", sections: "3 sections", verdict: "Beneficial ✓", verdictColor: "bg-emerald-500/20 text-emerald-400", breakdown: [{ l: "Confidence", v: "97.1%", p: 97, c: "bg-green-500" }, { l: "Harm", v: "None", p: 0, c: "bg-blue-500" }, { l: "Benefit", v: "High", p: 90, c: "bg-amber-500" }], info: [{ s: "Species", p: "Coccinella septempunctata", n: "Ladybug" }, { s: "Harmful", p: "No", n: "Harmless" }, { s: "Action", p: "Keep!", n: "Pest control" }], note: "7-spot ladybug: harmless and beneficial. Eats aphids — natural pest control. Keep in garden!" }
    }),
    makeUseCase(38, {
        title: "Stock Chart Analysis", date: "30 mins ago", category: "Finance",
        thumb: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?q=80&w=400&auto=format&fit=crop",
        sTitle: "Chart Analysis",
        intention: "Analyze this stock chart pattern, identify support/resistance, and suggest entry points.",
        chips: ["📈 Pattern", "📊 Support/Res", "🎯 Entry", "⚠️ Risk"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">stock chart</span> showing <span className="text-white/90 font-medium">ascending triangle pattern</span> with volume increasing.</span>,
        voiceDesc: <span>What's the <span className="text-white/90 font-medium">pattern</span> and where should I <span className="text-white/90 font-medium">enter</span>?</span>,
        todos: [
            { text: "Pattern Recognition", steps: [{ t: "Analyzing candlestick data...", d: 800 }, { t: "Pattern: Ascending Triangle (bullish)", d: 700 }, { t: "Timeframe: 3-month formation", d: 600 }], summary: "Ascending Triangle · Bullish · 3 months" },
            { text: "Key Levels", steps: [{ t: "Resistance: $185.50 (tested 3x)", d: 700 }, { t: "Support: rising trendline ~$172", d: 700 }, { t: "Volume: increasing on advances ✓", d: 600 }], summary: "R: $185.50 · S: $172 · Volume bullish" },
            { text: "Trade Plan", steps: [{ t: "Entry: breakout above $186 on volume", d: 700 }, { t: "Stop loss: $170 (below trendline)", d: 600 }, { t: "Target: $199 (measured move)", d: 600 }, { t: "Risk/Reward: 1:1.8", d: 600 }], summary: "Entry $186 · Stop $170 · Target $199" },
        ],
        artifact: { title: "Chart Analysis", type: "Trading Report", sections: "3 sections", calories: 186, calLabel: "Entry Point", calUnit: "$", verdict: "Bullish", verdictColor: "bg-green-500/20 text-green-400", breakdown: [{ l: "Breakout", v: "$186", p: 85, c: "bg-green-500" }, { l: "Stop", v: "$170", p: 15, c: "bg-red-500" }, { l: "Target", v: "$199", p: 95, c: "bg-blue-500" }], info: [{ s: "Pattern", p: "Ascending Triangle", n: "Bullish" }, { s: "R/R Ratio", p: "1:1.8", n: "Good" }, { s: "Volume", p: "Increasing", n: "Confirms" }], note: "Ascending triangle pattern, bullish. Entry: breakout >$186. Target $199. R/R 1:1.8." }
    }),
    makeUseCase(39, {
        title: "Font Identifier", date: "1 hour ago", category: "Creativity",
        thumb: "https://images.unsplash.com/photo-1618367588411-d9a90fefa881?q=80&w=400&auto=format&fit=crop",
        sTitle: "Font Match",
        intention: "Identify this font from the signage, find free alternatives, and suggest font pairings.",
        chips: ["🔤 Font ID", "💸 Free Alts", "🎨 Pairings", "📥 Download"],
        visualDesc: <span>I see <span className="text-white/90 font-medium">elegant serif typography</span> — looks like <span className="text-white/90 font-medium">Playfair Display</span> or Didot family.</span>,
        voiceDesc: <span>What <span className="text-white/90 font-medium">font</span> is this? Find me <span className="text-white/90 font-medium">free alternatives</span>.</span>,
        todos: [
            { text: "Font Recognition", steps: [{ t: "Analyzing letterforms...", d: 800 }, { t: "Match: Playfair Display (92%)", d: 700 }, { t: "Weight: Bold · Style: Regular", d: 600 }], summary: "Playfair Display Bold · 92% match" },
            { text: "Free Alternatives", steps: [{ t: "Lora (Google Fonts) — similar feel", d: 600 }, { t: "Cormorant Garamond — elegant alt", d: 600 }, { t: "Libre Baskerville — classic option", d: 600 }], summary: "3 free alternatives on Google Fonts" },
            { text: "Pairing Suggestions", steps: [{ t: "Body: Source Sans Pro (clean contrast)", d: 600 }, { t: "Body: Open Sans (modern pairing)", d: 600 }, { t: "✓ Pairing guide ready", d: 500 }], summary: "Pair with Source Sans Pro or Open Sans" },
        ],
        artifact: { title: "Font Guide", type: "Design Resource", sections: "3 sections", verdict: "92% Match", verdictColor: "bg-pink-500/20 text-pink-400", breakdown: [{ l: "Confidence", v: "92%", p: 92, c: "bg-purple-500" }, { l: "Alternatives", v: "3 free", p: 60, c: "bg-green-500" }, { l: "Pairings", v: "2", p: 40, c: "bg-blue-500" }], info: [{ s: "Font", p: "Playfair Display", n: "Serif" }, { s: "Alt", p: "Lora", n: "Free" }, { s: "Pair", p: "Source Sans Pro", n: "Body" }], note: "Playfair Display Bold identified. Free alts: Lora, Cormorant Garamond. Pair with Source Sans Pro." }
    }),
    makeUseCase(40, {
        title: "Cocktail Recipe Maker", date: "3 hours ago", category: "Creativity",
        thumb: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?q=80&w=400&auto=format&fit=crop",
        sTitle: "Cocktail Recipe",
        intention: "Identify this cocktail, provide the recipe, suggest variations, and calculate ingredients for a party.",
        chips: ["🍸 Identify", "📝 Recipe", "🔄 Variations", "🎉 Party Scale"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">Negroni cocktail</span> — classic <span className="text-white/90 font-medium">orange peel garnish</span>, rocks glass.</span>,
        voiceDesc: <span>Give me the <span className="text-white/90 font-medium">recipe</span> and scale for a <span className="text-white/90 font-medium">party of 12</span>.</span>,
        todos: [
            { text: "Cocktail ID", steps: [{ t: "Visual match: Negroni (96%)", d: 700 }, { t: "Glass: rocks/old-fashioned", d: 600 }, { t: "Garnish: orange peel twist", d: 500 }], summary: "Negroni · Rocks glass · Orange peel" },
            { text: "Recipe", steps: [{ t: "1 oz gin · 1 oz Campari · 1 oz sweet vermouth", d: 700 }, { t: "Stir with ice, strain over fresh ice", d: 600 }, { t: "Variations: Boulevardier (bourbon), Sbagliato (prosecco)", d: 700 }], summary: "Equal parts gin/Campari/vermouth" },
            { text: "Party Scale (×12)", steps: [{ t: "Gin: 12 oz (375ml)", d: 600 }, { t: "Campari: 12 oz (375ml)", d: 600 }, { t: "Sweet vermouth: 12 oz (375ml)", d: 600 }, { t: "12 oranges for garnish", d: 500 }, { t: "✓ Party recipe ready", d: 500 }], summary: "375ml each spirit · 12 oranges" },
        ],
        artifact: { title: "Cocktail Recipe", type: "Recipe Card", sections: "3 sections", calories: 12, calLabel: "Servings", calUnit: "", verdict: "Classic", verdictColor: "bg-pink-500/20 text-pink-400", breakdown: [{ l: "Gin", v: "375ml", p: 33, c: "bg-blue-500" }, { l: "Campari", v: "375ml", p: 33, c: "bg-red-500" }, { l: "Vermouth", v: "375ml", p: 33, c: "bg-amber-500" }], info: [{ s: "Recipe", p: "Equal parts (1:1:1)", n: "Classic" }, { s: "Variation", p: "Boulevardier", n: "Bourbon" }, { s: "Cost", p: "~$8/drink", n: "Estimated" }], note: "Negroni: equal parts gin, Campari, sweet vermouth. For 12: 375ml each + 12 oranges." }
    }),
    makeUseCase(41, {
        title: "Yoga Pose Identifier", date: "Yesterday", category: "Health",
        thumb: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?q=80&w=400&auto=format&fit=crop",
        sTitle: "Yoga Guide",
        intention: "Identify this yoga pose, check my alignment, suggest modifications and a flow sequence.",
        chips: ["🧘 Pose ID", "📐 Alignment", "🔄 Modify", "🔗 Flow"],
        visualDesc: <span>I see <span className="text-white/90 font-medium">Warrior II pose</span> — <span className="text-white/90 font-medium">Virabhadrasana II</span>, front knee slightly past ankle.</span>,
        voiceDesc: <span>Check my <span className="text-white/90 font-medium">alignment</span> and suggest a <span className="text-white/90 font-medium">flow sequence</span>.</span>,
        todos: [
            { text: "Pose Recognition", steps: [{ t: "Analyzing body position...", d: 800 }, { t: "Match: Warrior II (Virabhadrasana II)", d: 700 }, { t: "Level: Intermediate", d: 500 }], summary: "Warrior II · Intermediate level" },
            { text: "Alignment Check", steps: [{ t: "Front knee: slightly past ankle ⚠️", d: 700 }, { t: "Fix: align knee directly over ankle", d: 600 }, { t: "Back foot: good 90° angle ✓", d: 600 }, { t: "Arms: level and extended ✓", d: 500 }], summary: "1 correction: knee over ankle" },
            { text: "Flow Sequence", steps: [{ t: "Warrior I → Warrior II → Reverse Warrior", d: 700 }, { t: "→ Extended Side Angle → Triangle", d: 600 }, { t: "Hold each 5 breaths", d: 500 }, { t: "✓ Flow ready", d: 500 }], summary: "5-pose Warrior flow sequence" },
        ],
        artifact: { title: "Yoga Flow Guide", type: "Fitness Guide", sections: "3 sections", verdict: "Good Form", verdictColor: "bg-green-500/20 text-green-400", breakdown: [{ l: "Alignment", v: "8/10", p: 80, c: "bg-blue-500" }, { l: "Difficulty", v: "Intermediate", p: 50, c: "bg-purple-500" }, { l: "Flow", v: "5 poses", p: 60, c: "bg-amber-500" }], info: [{ s: "Pose", p: "Warrior II", n: "Sanskrit" }, { s: "Fix", p: "Knee alignment", n: "Minor" }, { s: "Flow", p: "5 poses", n: "15 min" }], note: "Warrior II: good overall, align front knee over ankle. 5-pose warrior flow included." }
    }),
    makeUseCase(42, {
        title: "Gemstone Identification", date: "5 hours ago", category: "Professional",
        thumb: "https://images.unsplash.com/photo-1515562141589-67f0d999b36b?q=80&w=400&auto=format&fit=crop",
        sTitle: "Gem Analysis",
        intention: "Identify this gemstone, assess quality, estimate value, and verify authenticity.",
        chips: ["💎 Identify", "⭐ Quality", "💰 Value", "✅ Authentic"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">blue gemstone</span> — appears to be a <span className="text-white/90 font-medium">natural sapphire</span> with good clarity.</span>,
        voiceDesc: <span>Is this <span className="text-white/90 font-medium">real sapphire</span>? What's it <span className="text-white/90 font-medium">worth</span>?</span>,
        todos: [
            { text: "Gem Identification", steps: [{ t: "Analyzing color, clarity, cut...", d: 900 }, { t: "Match: Blue Sapphire (Corundum)", d: 800 }, { t: "Origin estimate: Sri Lankan", d: 700 }], summary: "Blue Sapphire · Sri Lankan origin" },
            { text: "Quality Grading", steps: [{ t: "Color: vivid blue (AAA)", d: 700 }, { t: "Clarity: VS (very slightly included)", d: 600 }, { t: "Cut: oval, good proportions", d: 600 }, { t: "Carat: ~2.3ct estimated", d: 600 }], summary: "AAA color · VS clarity · 2.3ct" },
            { text: "Valuation", steps: [{ t: "Market rate: $800-1,200/ct for this grade", d: 800 }, { t: "Estimated value: $1,840-2,760", d: 700 }, { t: "Recommend GIA certification", d: 600 }, { t: "✓ Report ready", d: 500 }], summary: "~$2,300 estimated · GIA cert recommended" },
        ],
        artifact: { title: "Gemstone Report", type: "Appraisal", sections: "3 sections", calories: 2300, calLabel: "Est. Value", calUnit: "$", verdict: "AAA Grade", verdictColor: "bg-blue-500/20 text-blue-400", breakdown: [{ l: "Color", v: "AAA", p: 95, c: "bg-blue-500" }, { l: "Clarity", v: "VS", p: 80, c: "bg-purple-500" }, { l: "Cut", v: "Good", p: 75, c: "bg-amber-500" }], info: [{ s: "Type", p: "Blue Sapphire", n: "Corundum" }, { s: "Origin", p: "Sri Lanka", n: "Estimated" }, { s: "Cert", p: "GIA recommended", n: "$150" }], note: "Blue Sapphire, ~2.3ct, AAA color, VS clarity. Estimated $1,840-2,760. Get GIA certified." }
    }),
    makeUseCase(43, {
        title: "Electricity Bill Analyzer", date: "1 day ago", category: "Finance",
        thumb: "https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?q=80&w=400&auto=format&fit=crop",
        sTitle: "Bill Analysis",
        intention: "Analyze my electricity bill, find usage patterns, suggest savings, compare solar option.",
        chips: ["⚡ Usage", "📊 Trends", "💡 Savings", "☀️ Solar"],
        visualDesc: <span>I see an <span className="text-white/90 font-medium">electricity bill</span> — <span className="text-white/90 font-medium">$247 for January</span>, usage spike vs last month.</span>,
        voiceDesc: <span>Why is my bill <span className="text-white/90 font-medium">higher</span>? How can I <span className="text-white/90 font-medium">save</span>?</span>,
        todos: [
            { text: "Bill Extraction", steps: [{ t: "OCR on utility bill...", d: 800 }, { t: "Total: $247.30 · Usage: 1,842 kWh", d: 700 }, { t: "Rate: $0.134/kWh", d: 600 }], summary: "$247 · 1,842 kWh · $0.134/kWh" },
            { text: "Usage Analysis", steps: [{ t: "vs Last month: +28% ($54 more)", d: 700 }, { t: "vs Last year: +12%", d: 600 }, { t: "Peak: heating in cold snap (Jan 8-14)", d: 700 }], summary: "+28% MoM · Heating spike Jan 8-14" },
            { text: "Savings Tips", steps: [{ t: "Programmable thermostat: save $30/mo", d: 700 }, { t: "LED bulbs: save $8/mo", d: 600 }, { t: "Solar estimate: $0 bill after 7yr payback", d: 800 }, { t: "✓ Savings plan ready", d: 500 }], summary: "Save ~$38/mo · Solar ROI in 7 years" },
        ],
        artifact: { title: "Energy Report", type: "Utility Analysis", sections: "3 sections", calories: 247, calLabel: "Monthly Bill", calUnit: "$", verdict: "+28% ⬆️", verdictColor: "bg-red-500/20 text-red-400", breakdown: [{ l: "Heating", v: "68%", p: 68, c: "bg-red-500" }, { l: "Appliances", v: "22%", p: 22, c: "bg-blue-500" }, { l: "Lighting", v: "10%", p: 10, c: "bg-amber-500" }], info: [{ s: "Save", p: "$38/mo", n: "Easy wins" }, { s: "Thermostat", p: "-$30/mo", n: "Top tip" }, { s: "Solar", p: "$0 bill", n: "7yr ROI" }], note: "$247 bill, +28% from heating spike. Save $38/mo with thermostat + LEDs. Solar pays off in 7 years." }
    }),
    makeUseCase(44, {
        title: "Cloud Formation Guide", date: "8 hours ago", category: "Nature",
        thumb: "https://images.unsplash.com/photo-1534088568595-a066f410bcda?q=80&w=400&auto=format&fit=crop",
        sTitle: "Cloud ID",
        intention: "Identify this cloud formation, predict weather implications, and explain meteorology basics.",
        chips: ["☁️ Cloud Type", "🌤️ Weather", "📚 Learn", "📸 Gallery"],
        visualDesc: <span>I see <span className="text-white/90 font-medium">cumulonimbus clouds</span> — tall, towering <span className="text-white/90 font-medium">anvil-shaped</span> storm clouds.</span>,
        voiceDesc: <span>What kind of <span className="text-white/90 font-medium">clouds</span> are these? Will it <span className="text-white/90 font-medium">rain</span>?</span>,
        todos: [
            { text: "Cloud Classification", steps: [{ t: "Analyzing cloud morphology...", d: 800 }, { t: "Type: Cumulonimbus (Cb)", d: 700 }, { t: "Height: 20,000-60,000 ft", d: 600 }], summary: "Cumulonimbus · Storm cloud · Very tall" },
            { text: "Weather Prediction", steps: [{ t: "Associated with: thunderstorms", d: 700 }, { t: "Expect: heavy rain, lightning, hail possible", d: 700 }, { t: "Arrival: 1-3 hours based on movement", d: 600 }], summary: "Thunderstorm in 1-3 hours · Lightning likely" },
            { text: "Meteorology Notes", steps: [{ t: "Formation: strong updrafts + instability", d: 700 }, { t: "Anvil top = jet stream interaction", d: 600 }, { t: "✓ Guide compiled", d: 500 }], summary: "Updraft-driven · Anvil = jet stream" },
        ],
        artifact: { title: "Weather Guide", type: "Nature ID", sections: "3 sections", verdict: "Storm Coming", verdictColor: "bg-red-500/20 text-red-400", breakdown: [{ l: "Rain", v: "95% likely", p: 95, c: "bg-blue-500" }, { l: "Lightning", v: "80% likely", p: 80, c: "bg-amber-500" }, { l: "Hail", v: "30% possible", p: 30, c: "bg-red-500" }], info: [{ s: "Cloud", p: "Cumulonimbus", n: "Cb" }, { s: "ETA", p: "1-3 hours", n: "Moving E" }, { s: "Action", p: "Seek shelter", n: "Recommended" }], note: "Cumulonimbus (storm) clouds. Thunderstorm with lightning likely in 1-3 hours. Seek shelter." }
    }),
    makeUseCase(45, {
        title: "Logo Design Feedback", date: "2 days ago", category: "Creativity",
        thumb: "https://images.unsplash.com/photo-1626785774625-0b1c2c4eab67?q=80&w=400&auto=format&fit=crop",
        sTitle: "Design Review",
        intention: "Critique this logo design, analyze visual balance, color psychology, and suggest improvements.",
        chips: ["🎨 Critique", "⚖️ Balance", "🧠 Psychology", "✨ Improve"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">minimalist logo</span> — geometric <span className="text-white/90 font-medium">hexagonal mark</span> with wordmark below.</span>,
        voiceDesc: <span>Give me <span className="text-white/90 font-medium">honest feedback</span> on this <span className="text-white/90 font-medium">logo design</span>.</span>,
        todos: [
            { text: "Visual Analysis", steps: [{ t: "Analyzing proportions...", d: 800 }, { t: "Geometric balance: good ✓", d: 600 }, { t: "Negative space: effective ✓", d: 600 }, { t: "Scalability: works at all sizes ✓", d: 600 }], summary: "Good balance · Effective negative space" },
            { text: "Color Psychology", steps: [{ t: "Primary: deep blue (#1A365D)", d: 600 }, { t: "Conveys: trust, professionalism", d: 600 }, { t: "Accent: teal (#319795) — modern, innovative", d: 700 }], summary: "Blue = trust · Teal = innovation" },
            { text: "Improvements", steps: [{ t: "Suggestion 1: increase wordmark weight", d: 700 }, { t: "Suggestion 2: add slight rounded corners", d: 600 }, { t: "Suggestion 3: test in monochrome", d: 600 }, { t: "Overall score: 7.5/10", d: 500 }], summary: "7.5/10 · 3 improvement suggestions" },
        ],
        artifact: { title: "Design Critique", type: "Design Review", sections: "3 sections", verdict: "7.5/10", verdictColor: "bg-pink-500/20 text-pink-400", breakdown: [{ l: "Balance", v: "8/10", p: 80, c: "bg-blue-500" }, { l: "Color", v: "8.5/10", p: 85, c: "bg-purple-500" }, { l: "Typography", v: "6/10", p: 60, c: "bg-amber-500" }], info: [{ s: "Style", p: "Minimalist", n: "Geometric" }, { s: "Colors", p: "Blue + Teal", n: "Trust" }, { s: "Fix", p: "Wordmark weight", n: "Priority" }], note: "Clean geometric logo, 7.5/10. Strengthen wordmark weight and test monochrome version." }
    }),
    makeUseCase(46, {
        title: "Bird Species Identifier", date: "This morning", category: "Nature",
        thumb: "https://images.unsplash.com/photo-1444464666168-49d633b86797?q=80&w=400&auto=format&fit=crop",
        sTitle: "Bird ID",
        intention: "Identify this bird species, its call, habitat, and migration pattern.",
        chips: ["🐦 ID", "🎵 Call", "🏠 Habitat", "🗺️ Migration"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">Blue Jay</span> — distinctive <span className="text-white/90 font-medium">blue crest and white underside</span>.</span>,
        voiceDesc: <span>What <span className="text-white/90 font-medium">bird</span> is this? Tell me about its <span className="text-white/90 font-medium">behavior</span>.</span>,
        todos: [
            { text: "Species Classification", steps: [{ t: "Running Merlin Bird ID...", d: 800 }, { t: "Match: Blue Jay (Cyanocitta cristata)", d: 700 }, { t: "Confidence: 98.2%", d: 500 }], summary: "Blue Jay · 98.2% confidence" },
            { text: "Behavior Profile", steps: [{ t: "Diet: omnivore (nuts, seeds, insects)", d: 600 }, { t: "Call: loud 'jay-jay' alarm", d: 600 }, { t: "Habitat: eastern North America forests", d: 600 }], summary: "Omnivore · Loud calls · Eastern NA forests" },
            { text: "Seasonal Info", steps: [{ t: "Migration: partial (some stay year-round)", d: 700 }, { t: "Breeding: March-July", d: 600 }, { t: "Fun: mimics hawk calls!", d: 600 }, { t: "✓ Guide ready", d: 500 }], summary: "Partial migrant · Mimics hawks" },
        ],
        artifact: { title: "Bird Field Guide", type: "Nature ID", sections: "3 sections", verdict: "Common", verdictColor: "bg-emerald-500/20 text-emerald-400", breakdown: [{ l: "Confidence", v: "98.2%", p: 98, c: "bg-green-500" }, { l: "Rarity", v: "Common", p: 20, c: "bg-blue-500" }, { l: "Season", v: "Year-round", p: 100, c: "bg-amber-500" }], info: [{ s: "Species", p: "Blue Jay", n: "Corvidae" }, { s: "Diet", p: "Omnivore", n: "Nuts/Seeds" }, { s: "Fun Fact", p: "Mimics hawks", n: "Defense" }], note: "Blue Jay (Cyanocitta cristata). Common in eastern NA. Known for mimicking hawk calls as defense." }
    }),
    makeUseCase(47, {
        title: "Furniture Assembly Help", date: "4 days ago", category: "DIY",
        thumb: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?q=80&w=400&auto=format&fit=crop",
        sTitle: "Assembly Guide",
        intention: "Identify these furniture parts, match to instructions, and guide me through assembly.",
        chips: ["🔩 Parts ID", "📋 Steps", "🛠️ Tools", "📐 Tips"],
        visualDesc: <span>I see <span className="text-white/90 font-medium">IKEA furniture parts</span> — panels, dowels, screws, <span className="text-white/90 font-medium">cam locks scattered</span>.</span>,
        voiceDesc: <span>Help me <span className="text-white/90 font-medium">figure out these parts</span> and <span className="text-white/90 font-medium">assembly order</span>.</span>,
        todos: [
            { text: "Parts Identification", steps: [{ t: "Matching parts to IKEA catalog...", d: 900 }, { t: "Product: KALLAX shelf unit", d: 700 }, { t: "12 panels, 16 dowels, 8 cam locks", d: 700 }, { t: "All parts present ✓", d: 500 }], summary: "KALLAX shelf · All 36 parts present ✓" },
            { text: "Assembly Steps", steps: [{ t: "Step 1: Sort panels by size", d: 600 }, { t: "Step 2: Insert dowels into pre-drilled holes", d: 600 }, { t: "Step 3: Connect panels with cam locks", d: 600 }, { t: "12 total steps", d: 600 }], summary: "12 steps · ~45 min estimated" },
            { text: "Tools & Tips", steps: [{ t: "Tools: Phillips screwdriver only", d: 600 }, { t: "Tip: don't fully tighten until all connected", d: 700 }, { t: "Tip: lay on soft surface to avoid scratches", d: 600 }, { t: "✓ Guide ready", d: 500 }], summary: "1 tool needed · 2 pro tips" },
        ],
        artifact: { title: "Assembly Guide", type: "DIY Guide", sections: "12 steps", verdict: "Easy", verdictColor: "bg-yellow-500/20 text-yellow-400", breakdown: [{ l: "Parts", v: "36 total", p: 100, c: "bg-blue-500" }, { l: "Steps", v: "12", p: 60, c: "bg-purple-500" }, { l: "Time", v: "45 min", p: 45, c: "bg-amber-500" }], info: [{ s: "Product", p: "IKEA KALLAX", n: "Shelf" }, { s: "Tools", p: "Phillips screwdriver", n: "Only" }, { s: "Difficulty", p: "Easy", n: "Solo OK" }], note: "IKEA KALLAX shelf: 36 parts, 12 steps, ~45 min. Only need Phillips screwdriver." }
    }),
    makeUseCase(48, {
        title: "Color Palette Extractor", date: "3 days ago", category: "Creativity",
        thumb: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=400&auto=format&fit=crop",
        sTitle: "Color Palette",
        intention: "Extract the color palette from this photo, generate hex codes, and suggest design applications.",
        chips: ["🎨 Extract", "🔢 Hex Codes", "🖌️ Apply", "📐 Harmony"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">sunset landscape</span> with <span className="text-white/90 font-medium">warm oranges, deep purples, and golden hues</span>.</span>,
        voiceDesc: <span>Extract the <span className="text-white/90 font-medium">color palette</span> with <span className="text-white/90 font-medium">hex codes</span>.</span>,
        todos: [
            { text: "Color Extraction", steps: [{ t: "K-means clustering on image pixels...", d: 800 }, { t: "5 dominant colors extracted", d: 700 }, { t: "Harmony type: Analogous + Complementary", d: 600 }], summary: "5 colors · Analogous harmony" },
            { text: "Hex Codes", steps: [{ t: "#FF6B35 (burnt orange)", d: 500 }, { t: "#F7C59F (peach)", d: 500 }, { t: "#004E89 (deep blue)", d: 500 }, { t: "#1A1423 (dark purple)", d: 500 }, { t: "#EFEFD0 (cream)", d: 500 }], summary: "5 hex codes with names" },
            { text: "Applications", steps: [{ t: "Web design: warm hero section", d: 600 }, { t: "Brand: luxury/premium feel", d: 600 }, { t: "Pair with: clean white space", d: 600 }, { t: "✓ Palette exported", d: 500 }], summary: "Great for luxury brand / web hero" },
        ],
        artifact: { title: "Color Palette", type: "Design Asset", sections: "5 colors", verdict: "Warm Palette", verdictColor: "bg-orange-500/20 text-orange-400", breakdown: [{ l: "#FF6B35", v: "Burnt Orange", p: 30, c: "bg-orange-500" }, { l: "#F7C59F", v: "Peach", p: 25, c: "bg-amber-500" }, { l: "#004E89", v: "Deep Blue", p: 20, c: "bg-blue-500" }, { l: "#1A1423", v: "Dark Purple", p: 15, c: "bg-purple-500" }], info: [{ s: "Harmony", p: "Analogous", n: "Warm" }, { s: "Use", p: "Web / Brand", n: "Premium" }, { s: "Mood", p: "Luxurious", n: "Warm" }], note: "5-color sunset palette: warm analogous harmony. Great for luxury brand, web hero sections." }
    }),
    makeUseCase(49, {
        title: "Prescription Glasses Check", date: "Last week", category: "Health",
        thumb: "https://images.unsplash.com/photo-1574258495973-f010dfbb5371?q=80&w=400&auto=format&fit=crop",
        sTitle: "Vision Check",
        intention: "Read my glasses prescription, explain what it means, suggest lens options and where to buy.",
        chips: ["👓 Read Rx", "📖 Explain", "🔍 Lens Options", "🛒 Buy"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">glasses prescription</span> — <span className="text-white/90 font-medium">OD and OS values</span> with cylinder and axis.</span>,
        voiceDesc: <span>What does my <span className="text-white/90 font-medium">prescription</span> mean? Where to <span className="text-white/90 font-medium">buy glasses</span>?</span>,
        todos: [
            { text: "Rx Reading", steps: [{ t: "OD: -2.75 SPH, -0.50 CYL, 180 AXIS", d: 800 }, { t: "OS: -3.00 SPH, -0.75 CYL, 175 AXIS", d: 700 }, { t: "PD: 64mm", d: 500 }], summary: "Moderate myopia + mild astigmatism" },
            { text: "Explanation", steps: [{ t: "Myopia (nearsighted): -2.75 to -3.00", d: 700 }, { t: "Astigmatism: mild (-0.50 to -0.75)", d: 600 }, { t: "Rating: moderate correction needed", d: 600 }], summary: "Moderate nearsighted · Mild astigmatism" },
            { text: "Shopping Options", steps: [{ t: "Warby Parker: from $95 (basic)", d: 600 }, { t: "Zenni: from $6.95 + $30 lenses", d: 600 }, { t: "LensCrafters: from $199 (premium)", d: 600 }, { t: "Blue light coating recommended: +$30", d: 600 }, { t: "✓ Options compiled", d: 500 }], summary: "Zenni $37 → LensCrafters $199+" },
        ],
        artifact: { title: "Glasses Guide", type: "Health Report", sections: "3 sections", verdict: "Moderate Rx", verdictColor: "bg-blue-500/20 text-blue-400", breakdown: [{ l: "OD (Right)", v: "-2.75", p: 55, c: "bg-blue-500" }, { l: "OS (Left)", v: "-3.00", p: 60, c: "bg-purple-500" }, { l: "Astigmatism", v: "Mild", p: 25, c: "bg-amber-500" }], info: [{ s: "Budget", p: "Zenni $37", n: "Online" }, { s: "Mid", p: "Warby Parker $95", n: "Try Home" }, { s: "Premium", p: "LensCrafters $199+", n: "In-store" }], note: "Moderate myopia (-2.75/-3.00) with mild astigmatism. Options from $37 (Zenni) to $199+ (LensCrafters)." }
    }),
    makeUseCase(50, {
        title: "Concert Ticket Scanner", date: "5 days ago", category: "Memory",
        thumb: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?q=80&w=400&auto=format&fit=crop",
        sTitle: "Event Memory",
        intention: "Scan this concert ticket, save event details, add to my memory timeline, and find the setlist.",
        chips: ["🎫 Scan", "📅 Timeline", "🎵 Setlist", "📸 Gallery"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">concert ticket</span> — <span className="text-white/90 font-medium">Taylor Swift | The Eras Tour</span>, SoFi Stadium.</span>,
        voiceDesc: <span>Save this to my <span className="text-white/90 font-medium">memory timeline</span> and find the <span className="text-white/90 font-medium">setlist</span>.</span>,
        todos: [
            { text: "Ticket Scan", steps: [{ t: "OCR on ticket...", d: 700 }, { t: "Artist: Taylor Swift — The Eras Tour", d: 600 }, { t: "Venue: SoFi Stadium, LA", d: 600 }, { t: "Date: Aug 9, 2025 · Sec 113, Row 8", d: 600 }], summary: "Taylor Swift · SoFi · Aug 9, 2025" },
            { text: "Setlist Lookup", steps: [{ t: "Querying Setlist.fm...", d: 800 }, { t: "Found: 45 songs across 10 eras", d: 700 }, { t: "Runtime: 3 hours 15 minutes", d: 600 }], summary: "45 songs · 10 eras · 3hr 15min" },
            { text: "Memory Archive", steps: [{ t: "Adding to Life Timeline...", d: 700 }, { t: "Tagged: concerts, 2025, Taylor Swift", d: 600 }, { t: "Linked to: Photos from that night", d: 600 }, { t: "✓ Memory saved", d: 500 }], summary: "Saved to Life Timeline · Photos linked" },
        ],
        artifact: { title: "Concert Memory", type: "Memory Entry", sections: "3 sections", verdict: "Saved ✓", verdictColor: "bg-rose-500/20 text-rose-400", breakdown: [{ l: "Songs", v: "45", p: 100, c: "bg-purple-500" }, { l: "Duration", v: "3:15", p: 80, c: "bg-blue-500" }, { l: "Eras", v: "10", p: 100, c: "bg-pink-500" }], info: [{ s: "Artist", p: "Taylor Swift", n: "Eras Tour" }, { s: "Venue", p: "SoFi Stadium", n: "LA" }, { s: "Seat", p: "Sec 113, Row 8", n: "Floor" }], note: "Eras Tour at SoFi Stadium, Aug 9 2025. 45 songs, 10 eras, 3hr 15min. Saved to timeline." }
    }),
];

export default batch3;
