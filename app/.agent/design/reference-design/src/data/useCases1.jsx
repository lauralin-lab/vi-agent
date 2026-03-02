import { makeUseCase } from './useCaseFactory.jsx';

// Batch 1: Use Cases 1-17
const batch1 = [
    makeUseCase(1, {
        title: "Mango Nutrition Analysis", date: "2 mins ago", category: "Health",
        thumb: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=400&auto=format&fit=crop",
        sTitle: "Mango Analysis",
        intention: "Analyze full nutrition facts, calorie breakdown, and sugar content for this plate of mango.",
        chips: ["🔬 Nutrition", "📊 Calories", "🩺 Health", "🛒 Shopping"],
        visualDesc: <span>I see <span className="text-white/90 font-medium">fresh sliced mango</span> on a golden tray — <span className="text-white/90 font-medium">Thai Nam Dok Mai</span>, ~250g.</span>,
        voiceDesc: <span>You mentioned <span className="text-white/90 font-medium">calories</span> and <span className="text-white/90 font-medium">shopping options</span>.</span>,
        todos: [
            { text: "Deep Visual Analysis", steps: [{ t: "Loading YOLOv8-food model...", d: 900 }, { t: "Detected: mango_slice 94.7%", d: 800 }, { t: "Volume: 14 slices × 18g = 252g", d: 700 }, { t: "✓ Analysis complete", d: 500 }], summary: "Nam Dok Mai mango, ~252g, 94.7% confidence" },
            { text: "Nutrition Analysis", steps: [{ t: "Querying USDA FoodData API...", d: 800 }, { t: "538 kcal · 68g carbs · 46g sugar", d: 700 }, { t: "Sugar 184% WHO daily limit", d: 800 }, { t: "Recommend pairing with protein", d: 600 }], summary: "538 kcal · 46g sugar (184% WHO)" },
            { text: "Shopping & Report", steps: [{ t: "Searching grocery APIs...", d: 900 }, { t: "Thai Market $2.50 < Whole Foods $4.99", d: 700 }, { t: "✓ Report assembled", d: 500 }], summary: "3 sources · 4 sections assembled" },
        ],
        artifact: { title: "Mango Nutrition Report", type: "Analysis Report", sections: "4 sections · 15 data points", calories: 538, verdict: "Healthy Choice", verdictColor: "bg-green-500/20 text-green-400", breakdown: [{ l: "Carbs", v: "68g", p: 60, c: "bg-blue-500" }, { l: "Protein", v: "18g", p: 25, c: "bg-purple-500" }, { l: "Sugar", v: "46g", p: 45, c: "bg-pink-500" }], info: [{ s: "Thai Market", p: "$2.50/ea", n: "Best value" }, { s: "Whole Foods", p: "$4.99/ea", n: "Organic" }, { s: "Amazon", p: "$12.99/3pk", n: "Delivered" }], note: "Nutrient-rich tropical fruit. High sugar — pair with protein to balance blood sugar." }
    }),
    makeUseCase(2, {
        title: "Receipt Expense Tracking", date: "15 mins ago", category: "Finance",
        thumb: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?q=80&w=400&auto=format&fit=crop",
        sTitle: "Expense Analysis",
        intention: "Extract line items from this receipt, categorize expense, calculate tip, and prepare expense report.",
        chips: ["🧾 OCR", "💰 Category", "📊 Tip Calc", "📋 Report"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">restaurant receipt</span> from <span className="text-white/90 font-medium">Nobu Malibu</span> — total ~$187.</span>,
        voiceDesc: <span>You want to <span className="text-white/90 font-medium">track expenses</span> under <span className="text-white/90 font-medium">business dining</span>.</span>,
        todos: [
            { text: "OCR & Extraction", steps: [{ t: "Running Tesseract OCR v5...", d: 900 }, { t: "Extracted 12 line items", d: 800 }, { t: "Total: $171.67", d: 700 }, { t: "✓ 98.5% confidence", d: 500 }], summary: "12 items · $171.67 · 98.5% OCR" },
            { text: "Categorization & Tip", steps: [{ t: "Category: Business Dining", d: 800 }, { t: "Tip 18% = $30.90", d: 700 }, { t: "50% tax deductible", d: 600 }], summary: "Business Dining · Tip $30.90 · 50% deductible" },
            { text: "Report Assembly", steps: [{ t: "Creating QuickBooks entry...", d: 800 }, { t: "Attaching receipt image...", d: 600 }, { t: "✓ Ready for submission", d: 500 }], summary: "Expense entry ready for QuickBooks" },
        ],
        artifact: { title: "Expense Report Entry", type: "Finance Report", sections: "3 sections · 12 items", calories: 202, calLabel: "Total", calUnit: "$", verdict: "Tax Deductible", verdictColor: "bg-amber-500/20 text-amber-400", breakdown: [{ l: "Subtotal", v: "$157.50", p: 78, c: "bg-blue-500" }, { l: "Tax", v: "$14.17", p: 7, c: "bg-purple-500" }, { l: "Tip", v: "$30.90", p: 15, c: "bg-amber-500" }], info: [{ s: "Category", p: "Business Dining", n: "Client" }, { s: "Deductible", p: "50%", n: "IRS §274" }, { s: "Payment", p: "Amex ••4521", n: "Corporate" }], note: "12 items extracted from Nobu receipt. 50% tax deductible business meal." }
    }),
    makeUseCase(3, {
        title: "Calculus Problem Solver", date: "1 hour ago", category: "STEM",
        thumb: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?q=80&w=400&auto=format&fit=crop",
        sTitle: "Math Solution",
        intention: "Solve this integral step-by-step, explain each transformation, provide practice problems.",
        chips: ["🔢 Solution", "📐 Graph", "📝 Practice", "💡 Concept"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">calculus integral</span> — <span className="text-white/90 font-medium">∫ x·e^x dx</span>, integration by parts.</span>,
        voiceDesc: <span>You want <span className="text-white/90 font-medium">step-by-step</span> with <span className="text-white/90 font-medium">practice problems</span>.</span>,
        todos: [
            { text: "Problem Recognition", steps: [{ t: "Parsed: ∫ x·e^x dx", d: 800 }, { t: "Type: Integration by Parts", d: 700 }, { t: "Level: Calculus II", d: 600 }], summary: "∫ x·e^x dx — Integration by Parts" },
            { text: "Step-by-Step Solution", steps: [{ t: "Let u=x, dv=e^x dx", d: 900 }, { t: "= x·e^x - ∫e^x dx", d: 800 }, { t: "= x·e^x - e^x + C", d: 700 }, { t: "Verified by differentiation ✓", d: 600 }], summary: "x·e^x - e^x + C — Verified ✓" },
            { text: "Practice Generation", steps: [{ t: "Generating 3 similar problems...", d: 800 }, { t: "∫x·sin(x)dx, ∫x²·e^x dx, ∫ln(x)·x² dx", d: 700 }, { t: "✓ Study set compiled", d: 500 }], summary: "3 practice problems with solutions" },
        ],
        artifact: { title: "Calculus Solution Sheet", type: "Study Guide", sections: "3 sections", verdict: "Correct ✓", verdictColor: "bg-green-500/20 text-green-400", breakdown: [{ l: "Difficulty", v: "Calc II", p: 50, c: "bg-blue-500" }, { l: "Steps", v: "5", p: 40, c: "bg-purple-500" }, { l: "Practice", v: "3 Qs", p: 30, c: "bg-amber-500" }], info: [{ s: "Method", p: "Integration by Parts", n: "LIATE" }, { s: "Answer", p: "x·eˣ - eˣ + C", n: "Verified" }, { s: "Topic", p: "Calculus II", n: "Ch. 7" }], note: "Integration by parts solution. Answer: x·eˣ - eˣ + C. 3 practice problems included." }
    }),
    makeUseCase(4, {
        title: "Plant Species Identifier", date: "Yesterday", category: "Nature",
        thumb: "https://images.unsplash.com/photo-1520412099551-62b6bafeb5bb?q=80&w=400&auto=format&fit=crop",
        sTitle: "Plant ID",
        intention: "Identify this plant, check pet safety, and provide care instructions.",
        chips: ["🌿 Species", "🐾 Pet Safety", "💧 Care", "☀️ Light"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">Monstera Deliciosa</span> — <span className="text-white/90 font-medium">Swiss Cheese Plant</span> with fenestrations.</span>,
        voiceDesc: <span>Interested in <span className="text-white/90 font-medium">pet safety</span> and <span className="text-white/90 font-medium">care guide</span>.</span>,
        todos: [
            { text: "Species Classification", steps: [{ t: "Running PlantNet classifier...", d: 900 }, { t: "Match: Monstera deliciosa 97.3%", d: 800 }, { t: "Family: Araceae", d: 600 }], summary: "Monstera deliciosa · 97.3% confidence" },
            { text: "Pet Safety Check", steps: [{ t: "Querying ASPCA database...", d: 800 }, { t: "⚠️ TOXIC to dogs and cats", d: 900 }, { t: "Keep elevated or in pet-free room", d: 700 }], summary: "⚠️ Toxic to pets" },
            { text: "Care Guide", steps: [{ t: "Water: every 1-2 weeks", d: 700 }, { t: "Light: bright indirect", d: 600 }, { t: "Humidity: 60%+", d: 600 }, { t: "✓ Guide assembled", d: 500 }], summary: "Biweekly water, bright indirect light, 60%+ humidity" },
        ],
        artifact: { title: "Plant Care Guide", type: "Care Sheet", sections: "3 sections", verdict: "⚠️ Pet Toxic", verdictColor: "bg-red-500/20 text-red-400", breakdown: [{ l: "Confidence", v: "97.3%", p: 97, c: "bg-green-500" }, { l: "Water", v: "Biweekly", p: 50, c: "bg-blue-500" }, { l: "Light", v: "Indirect", p: 70, c: "bg-amber-500" }], info: [{ s: "Species", p: "Monstera deliciosa", n: "Araceae" }, { s: "Pet Safe", p: "No ⚠️", n: "ASPCA" }, { s: "Difficulty", p: "Easy", n: "Beginner" }], note: "Swiss Cheese Plant. Toxic to pets. Water biweekly, bright indirect light." }
    }),
    makeUseCase(5, {
        title: "Japanese Menu Translation", date: "Yesterday", category: "Productivity",
        thumb: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?q=80&w=400&auto=format&fit=crop",
        sTitle: "Menu Translation",
        intention: "Translate this Japanese menu, flag allergens, and suggest a 3-course meal.",
        chips: ["🇯🇵 Translate", "⭐ Recommend", "⚠️ Allergens", "🍽️ Meal Plan"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">Japanese izakaya menu</span> — ~18 items with yen pricing.</span>,
        voiceDesc: <span>You want <span className="text-white/90 font-medium">English translation</span> with <span className="text-white/90 font-medium">allergen info</span>.</span>,
        todos: [
            { text: "OCR & Translation", steps: [{ t: "Japanese OCR (kanji mode)...", d: 900 }, { t: "18 items extracted", d: 800 }, { t: "Translating via GPT-4...", d: 900 }, { t: "✓ 18 items translated", d: 500 }], summary: "18 items translated JP→EN" },
            { text: "Allergen Analysis", steps: [{ t: "Scanning for allergens...", d: 800 }, { t: "4 shellfish, 3 soy, 2 gluten flags", d: 700 }, { t: "5 vegetarian options found", d: 600 }], summary: "9 allergen flags · 5 veggie options" },
            { text: "Meal Suggestion", steps: [{ t: "Edamame → Salmon → Wagyu Don", d: 800 }, { t: "Total: ¥4,200 (~$28)", d: 600 }, { t: "✓ Menu guide ready", d: 500 }], summary: "3-course ¥4,200 (~$28)" },
        ],
        artifact: { title: "Translated Menu", type: "Translation", sections: "18 items", verdict: "18 Items", verdictColor: "bg-violet-500/20 text-violet-400", breakdown: [{ l: "Translated", v: "18", p: 100, c: "bg-violet-500" }, { l: "Allergens", v: "9 flags", p: 50, c: "bg-red-500" }, { l: "Veggie", v: "5 items", p: 28, c: "bg-green-500" }], info: [{ s: "Appetizer", p: "枝豆 Edamame", n: "¥380" }, { s: "Main", p: "サーモン Salmon", n: "¥1,280" }, { s: "Rice", p: "和牛丼 Wagyu", n: "¥2,540" }], note: "18 izakaya items translated. 3-course meal ¥4,200 (~$28)." }
    }),
    makeUseCase(6, {
        title: "Outfit Style Advisor", date: "2 days ago", category: "Creativity",
        thumb: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=400&auto=format&fit=crop",
        sTitle: "Style Analysis",
        intention: "Analyze this outfit, assess color harmony, suggest accessories, find similar pieces.",
        chips: ["👔 Style", "🎨 Color", "💍 Accessories", "🛍️ Shop"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">smart casual outfit</span> — navy blazer, white tee, <span className="text-white/90 font-medium">light wash denim</span>.</span>,
        voiceDesc: <span>Looking for <span className="text-white/90 font-medium">accessory ideas</span> and <span className="text-white/90 font-medium">shop similar</span>.</span>,
        todos: [
            { text: "Garment Detection", steps: [{ t: "Detecting: blazer, tee, jeans, sneakers", d: 900 }, { t: "Style: Smart Casual / Scandi Minimal", d: 800 }, { t: "Palette: #1B2A4A, #FFFFFF, #8FB4D9", d: 700 }], summary: "Smart Casual · Navy/White/Denim" },
            { text: "Accessory Suggestions", steps: [{ t: "Brown leather watch (warm contrast)", d: 700 }, { t: "Navy/tan crossbody bag", d: 600 }, { t: "Score: 8.2 → 9.1 with accessories", d: 700 }], summary: "8.2/10 → 9.1/10 with accessories" },
            { text: "Shopping Tiers", steps: [{ t: "Budget: Uniqlo ~$94", d: 700 }, { t: "Mid: Zara+COS ~$194", d: 600 }, { t: "Premium: Mr Porter ~$490", d: 600 }, { t: "✓ Guide ready", d: 500 }], summary: "3 price tiers: $94 | $194 | $490" },
        ],
        artifact: { title: "Style Guide", type: "Fashion Report", sections: "3 sections", verdict: "8.2/10", verdictColor: "bg-pink-500/20 text-pink-400", breakdown: [{ l: "Style", v: "8.2", p: 82, c: "bg-pink-500" }, { l: "Color", v: "9/10", p: 90, c: "bg-violet-500" }, { l: "Versatility", v: "High", p: 85, c: "bg-blue-500" }], info: [{ s: "Budget", p: "~$94", n: "Uniqlo" }, { s: "Mid", p: "~$194", n: "Zara" }, { s: "Premium", p: "~$490", n: "Mr Porter" }], note: "Smart-casual 8.2/10. Add brown leather watch for 9.1/10." }
    }),
    makeUseCase(7, {
        title: "Headphones Price Compare", date: "2 days ago", category: "Shopping",
        thumb: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=400&auto=format&fit=crop",
        sTitle: "Price Comparison",
        intention: "Identify this product, compare prices, check reviews, alert if better deal coming.",
        chips: ["🔍 Product ID", "💲 Compare", "⭐ Reviews", "🔔 Alert"],
        visualDesc: <span>I see <span className="text-white/90 font-medium">Sony WH-1000XM5</span> in <span className="text-white/90 font-medium">platinum silver</span>.</span>,
        voiceDesc: <span>Want <span className="text-white/90 font-medium">price comparison</span> and <span className="text-white/90 font-medium">deal alerts</span>.</span>,
        todos: [
            { text: "Product ID", steps: [{ t: "Match: Sony WH-1000XM5", d: 800 }, { t: "MSRP: $399.99", d: 600 }, { t: "✓ Cataloged", d: 500 }], summary: "Sony WH-1000XM5 · MSRP $399.99" },
            { text: "Price Comparison", steps: [{ t: "Amazon: $278 (30% off)", d: 800 }, { t: "Best Buy: $299", d: 700 }, { t: "Record low: $248 (BF 2025)", d: 700 }], summary: "Best: Amazon $278 · Record low $248" },
            { text: "Review Analysis", steps: [{ t: "4.6/5 across 12,847 reviews", d: 800 }, { t: "Alt: Bose QC Ultra $329", d: 700 }, { t: "✓ Report ready", d: 500 }], summary: "4.6/5 · Best ANC · Alt: Bose QC Ultra" },
        ],
        artifact: { title: "Product Comparison", type: "Shopping Report", sections: "3 sections", calories: 278, calLabel: "Best Price", calUnit: "$", verdict: "30% Off", verdictColor: "bg-orange-500/20 text-orange-400", breakdown: [{ l: "Amazon", v: "$278", p: 70, c: "bg-orange-500" }, { l: "B&H", v: "$289", p: 72, c: "bg-blue-500" }, { l: "Best Buy", v: "$299", p: 75, c: "bg-purple-500" }], info: [{ s: "Best Deal", p: "Amazon $278", n: "Prime" }, { s: "Record Low", p: "$248", n: "BF 2025" }, { s: "Alternative", p: "Bose QC Ultra", n: "$329" }], note: "Sony WH-1000XM5 at $278 on Amazon (30% off). $30 above record low." }
    }),
    makeUseCase(8, {
        title: "Leaking Faucet Fix", date: "3 days ago", category: "DIY",
        thumb: "https://images.unsplash.com/photo-1585704032915-c3400ca199e7?q=80&w=400&auto=format&fit=crop",
        sTitle: "Repair Guide",
        intention: "Diagnose this leaking faucet, provide repair steps, list tools, estimate cost vs plumber.",
        chips: ["🔧 Diagnose", "📋 Steps", "🛠️ Tools", "💰 Cost"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">dripping kitchen faucet</span> — <span className="text-white/90 font-medium">single-handle ball-type</span>, likely Delta.</span>,
        voiceDesc: <span>Want a <span className="text-white/90 font-medium">DIY guide</span> and <span className="text-white/90 font-medium">cost comparison</span>.</span>,
        todos: [
            { text: "Visual Diagnosis", steps: [{ t: "Match: Delta ball faucet Model 2176", d: 900 }, { t: "Cause: worn ball assembly", d: 800 }, { t: "Wasting ~5 gal/day", d: 600 }], summary: "Delta ball faucet · Worn valve/springs" },
            { text: "Repair Steps", steps: [{ t: "8-step repair guide generated", d: 800 }, { t: "Parts: Delta RP70 Kit $12.98", d: 700 }, { t: "Tools: Allen wrench, pliers", d: 600 }, { t: "✓ Guide ready", d: 500 }], summary: "8 steps · Delta RP70 $12.98 · 30 min" },
            { text: "Cost Analysis", steps: [{ t: "DIY: $12.98 + 30 min", d: 700 }, { t: "Plumber: $150-250", d: 700 }, { t: "Save ~$187", d: 600 }], summary: "DIY $13 / Plumber $200 · Save $187" },
        ],
        artifact: { title: "Faucet Repair Guide", type: "DIY Guide", sections: "3 sections", calories: 13, calLabel: "DIY Cost", calUnit: "$", verdict: "Easy Fix", verdictColor: "bg-yellow-500/20 text-yellow-400", breakdown: [{ l: "Difficulty", v: "2/5", p: 40, c: "bg-green-500" }, { l: "Time", v: "30 min", p: 30, c: "bg-blue-500" }, { l: "Savings", v: "$187", p: 93, c: "bg-amber-500" }], info: [{ s: "Parts", p: "Delta RP70 $12.98", n: "Home Depot" }, { s: "Plumber", p: "$150-250", n: "Avg" }, { s: "Savings", p: "$137-237", n: "DIY" }], note: "Simple ball-valve repair. $12.98 parts, 30 min. Save ~$187 vs plumber." }
    }),
    makeUseCase(9, {
        title: "Whiteboard Meeting Notes", date: "3 days ago", category: "Productivity",
        thumb: "https://images.unsplash.com/photo-1532619675605-1ede6c2e6880?q=80&w=400&auto=format&fit=crop",
        sTitle: "Meeting Notes",
        intention: "Digitize whiteboard, extract decisions/action items, create summary, send follow-ups.",
        chips: ["📸 Digitize", "📝 Actions", "📊 Summary", "📧 Follow-up"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">whiteboard diagram</span> — <span className="text-white/90 font-medium">architecture flowchart</span> with action items.</span>,
        voiceDesc: <span>Want to <span className="text-white/90 font-medium">capture notes</span> and <span className="text-white/90 font-medium">send follow-ups</span>.</span>,
        todos: [
            { text: "Digitization", steps: [{ t: "Perspective correction...", d: 800 }, { t: "OCR on handwritten text...", d: 900 }, { t: "6 boxes, 8 arrows detected", d: 800 }, { t: "✓ Digitized", d: 500 }], summary: "6-node flowchart + 14 text blocks" },
            { text: "Action Extraction", steps: [{ t: "3 decisions (red)", d: 700 }, { t: "5 action items (blue)", d: 700 }, { t: "2 open questions (green)", d: 600 }], summary: "3 decisions · 5 actions · 2 questions" },
            { text: "Summary & Follow-up", steps: [{ t: "Creating 5 Jira tickets...", d: 800 }, { t: "Drafting Slack message...", d: 700 }, { t: "✓ Ready to send", d: 500 }], summary: "Summary + 5 Jira tickets + Slack draft" },
        ],
        artifact: { title: "Meeting Summary", type: "Meeting Notes", sections: "3 sections", verdict: "5 Actions", verdictColor: "bg-violet-500/20 text-violet-400", breakdown: [{ l: "Decisions", v: "3", p: 60, c: "bg-red-500" }, { l: "Actions", v: "5", p: 100, c: "bg-blue-500" }, { l: "Open Qs", v: "2", p: 40, c: "bg-green-500" }], info: [{ s: "Sprint", p: "Sprint 14", n: "Q1 2026" }, { s: "Attendees", p: "6 people", n: "Eng+PM" }, { s: "Next", p: "Feb 24", n: "Mon 10am" }], note: "Architecture meeting: 3 decisions, 5 action items as Jira tickets." }
    }),
    makeUseCase(10, {
        title: "Medication Reminder Setup", date: "Last week", category: "Health",
        thumb: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        sTitle: "Med Tracker",
        intention: "Identify medications, set reminders, check interactions, track supply.",
        chips: ["💊 Pill ID", "⏰ Reminders", "⚠️ Interactions", "📦 Supply"],
        visualDesc: <span>I see <span className="text-white/90 font-medium">3 medication bottles</span> — <span className="text-white/90 font-medium">Lisinopril, Metformin, Vitamin D3</span>.</span>,
        voiceDesc: <span>Want <span className="text-white/90 font-medium">daily reminders</span> and <span className="text-white/90 font-medium">interaction check</span>.</span>,
        todos: [
            { text: "Medication ID", steps: [{ t: "Reading labels via OCR...", d: 800 }, { t: "Lisinopril 10mg, Metformin 500mg, D3 2000IU", d: 900 }, { t: "✓ 3 meds identified", d: 500 }], summary: "Lisinopril, Metformin, Vitamin D3" },
            { text: "Interaction Check", steps: [{ t: "Querying Drugs.com...", d: 800 }, { t: "Lisinopril+Metformin: minor interaction", d: 900 }, { t: "D3: no interactions ✓", d: 600 }, { t: "Schedule optimized", d: 700 }], summary: "1 minor interaction · 3 reminders set" },
            { text: "Supply Tracking", steps: [{ t: "Lisinopril: 22 days left", d: 600 }, { t: "Metformin: 18 days left", d: 600 }, { t: "D3: 45 days left", d: 600 }, { t: "Refill alerts set", d: 500 }], summary: "Supply tracked · Refill alerts active" },
        ],
        artifact: { title: "Medication Schedule", type: "Health Tracker", sections: "3 sections", calories: 3, calLabel: "Medications", calUnit: "", verdict: "1 Interaction", verdictColor: "bg-yellow-500/20 text-yellow-400", breakdown: [{ l: "Lisinopril", v: "22 days", p: 73, c: "bg-blue-500" }, { l: "Metformin", v: "18 days", p: 60, c: "bg-purple-500" }, { l: "Vitamin D3", v: "45 days", p: 100, c: "bg-amber-500" }], info: [{ s: "Morning", p: "Lisinopril 10mg", n: "8am" }, { s: "Meals", p: "Metformin 500mg", n: "12pm" }, { s: "Evening", p: "D3 2000IU", n: "6pm" }], note: "3 meds tracked. Minor Lisinopril-Metformin interaction. Refill alerts set." }
    }),
    makeUseCase(11, {
        title: "Business Card Scanner", date: "10 mins ago", category: "Productivity",
        thumb: "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?q=80&w=400&auto=format&fit=crop",
        sTitle: "Contact Import",
        intention: "Scan this business card, extract contact info, add to contacts, draft intro email.",
        chips: ["📇 Scan", "👤 Contact", "✉️ Email", "🔗 LinkedIn"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">business card</span> — <span className="text-white/90 font-medium">Sarah Chen, VP Engineering at Stripe</span>.</span>,
        voiceDesc: <span>Want to <span className="text-white/90 font-medium">save contact</span> and <span className="text-white/90 font-medium">draft follow-up email</span>.</span>,
        todos: [
            { text: "Card OCR", steps: [{ t: "Extracting text fields...", d: 800 }, { t: "Name: Sarah Chen · Title: VP Eng", d: 700 }, { t: "Email: s.chen@stripe.com", d: 600 }, { t: "✓ All fields parsed", d: 500 }], summary: "Sarah Chen · VP Eng @ Stripe · 5 fields" },
            { text: "Contact Creation", steps: [{ t: "Creating vCard...", d: 700 }, { t: "LinkedIn profile matched", d: 800 }, { t: "Added to CRM", d: 600 }], summary: "Contact saved + LinkedIn matched" },
            { text: "Email Draft", steps: [{ t: "Drafting intro email...", d: 800 }, { t: "Referencing meeting context...", d: 700 }, { t: "✓ Draft ready to review", d: 500 }], summary: "Follow-up email drafted" },
        ],
        artifact: { title: "Contact Card", type: "Contact Import", sections: "3 sections", verdict: "Saved ✓", verdictColor: "bg-green-500/20 text-green-400", breakdown: [{ l: "Fields", v: "5", p: 100, c: "bg-blue-500" }, { l: "OCR", v: "99.2%", p: 99, c: "bg-green-500" }, { l: "Match", v: "LinkedIn", p: 80, c: "bg-violet-500" }], info: [{ s: "Name", p: "Sarah Chen", n: "VP Eng" }, { s: "Company", p: "Stripe", n: "SF" }, { s: "Email", p: "s.chen@stripe.com", n: "Work" }], note: "Business card scanned. Contact saved to CRM. Follow-up email drafted." }
    }),
    makeUseCase(12, {
        title: "Skin Condition Analysis", date: "30 mins ago", category: "Health",
        thumb: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?q=80&w=400&auto=format&fit=crop",
        sTitle: "Skin Check",
        intention: "Analyze this skin condition, assess severity, suggest OTC treatments, recommend if doctor visit needed.",
        chips: ["🔬 Analysis", "📊 Severity", "💊 Treatment", "🏥 Doctor?"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">skin patch</span> — appears to be <span className="text-white/90 font-medium">contact dermatitis</span>, mild redness with slight scaling.</span>,
        voiceDesc: <span>Want to know if I should <span className="text-white/90 font-medium">see a doctor</span> or try <span className="text-white/90 font-medium">OTC treatment</span>.</span>,
        todos: [
            { text: "Visual Skin Analysis", steps: [{ t: "Running DermNet classifier...", d: 900 }, { t: "Match: Contact Dermatitis (82%)", d: 800 }, { t: "Severity: Mild (Grade 1)", d: 700 }, { t: "No concerning features", d: 600 }], summary: "Contact Dermatitis · Mild · 82% match" },
            { text: "Treatment Options", steps: [{ t: "OTC: Hydrocortisone 1% cream", d: 700 }, { t: "Apply 2x daily for 7 days", d: 600 }, { t: "Avoid known irritants", d: 600 }], summary: "Hydrocortisone 1% · 2x daily · 7 days" },
            { text: "Doctor Recommendation", steps: [{ t: "Severity assessment: doctor visit optional", d: 800 }, { t: "See doctor if: no improvement in 7 days", d: 700 }, { t: "✓ Report assembled", d: 500 }], summary: "Optional doctor visit · Monitor 7 days" },
        ],
        artifact: { title: "Skin Assessment", type: "Health Report", sections: "3 sections", verdict: "Mild", verdictColor: "bg-green-500/20 text-green-400", breakdown: [{ l: "Confidence", v: "82%", p: 82, c: "bg-blue-500" }, { l: "Severity", v: "Grade 1", p: 25, c: "bg-green-500" }, { l: "Duration", v: "7 days", p: 70, c: "bg-amber-500" }], info: [{ s: "Condition", p: "Contact Dermatitis", n: "Common" }, { s: "Treatment", p: "Hydrocortisone 1%", n: "OTC" }, { s: "Doctor", p: "Optional", n: "If persists" }], note: "Likely contact dermatitis (mild). Try hydrocortisone 1% for 7 days. See doctor if no improvement." }
    }),
    makeUseCase(13, {
        title: "Wine Label Analysis", date: "1 hour ago", category: "Professional",
        thumb: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?q=80&w=400&auto=format&fit=crop",
        sTitle: "Wine Info",
        intention: "Identify this wine, check ratings, suggest food pairings, find best price.",
        chips: ["🍷 Identify", "⭐ Rating", "🍽️ Pairing", "💲 Price"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">wine bottle</span> — <span className="text-white/90 font-medium">Château Margaux 2015</span>, Bordeaux Premier Grand Cru.</span>,
        voiceDesc: <span>Want <span className="text-white/90 font-medium">ratings</span>, <span className="text-white/90 font-medium">food pairings</span>, and <span className="text-white/90 font-medium">pricing</span>.</span>,
        todos: [
            { text: "Label Recognition", steps: [{ t: "Matching against Vivino database...", d: 900 }, { t: "Château Margaux 2015 Bordeaux", d: 800 }, { t: "Premier Grand Cru Classé", d: 600 }], summary: "Château Margaux 2015 · Premier Cru" },
            { text: "Rating & Tasting", steps: [{ t: "Vivino: 4.7/5 (2,340 ratings)", d: 800 }, { t: "Robert Parker: 99/100", d: 700 }, { t: "Tasting: black fruit, violets, silk tannins", d: 800 }], summary: "4.7/5 Vivino · 99/100 Parker" },
            { text: "Pairing & Price", steps: [{ t: "Pair: lamb, beef, aged cheese", d: 700 }, { t: "Price range: $450-890", d: 800 }, { t: "✓ Wine report ready", d: 500 }], summary: "Pair with lamb · $450-890 market price" },
        ],
        artifact: { title: "Wine Report", type: "Wine Analysis", sections: "3 sections", calories: 690, calLabel: "Avg Price", calUnit: "$", verdict: "99/100", verdictColor: "bg-red-500/20 text-red-400", breakdown: [{ l: "Vivino", v: "4.7/5", p: 94, c: "bg-purple-500" }, { l: "Parker", v: "99/100", p: 99, c: "bg-red-500" }, { l: "Drinkability", v: "Now-2045", p: 75, c: "bg-amber-500" }], info: [{ s: "Food", p: "Lamb, Beef", n: "Best pair" }, { s: "Serve", p: "17-18°C", n: "Decant 2hr" }, { s: "Cellar", p: "Up to 2045", n: "Improving" }], note: "Château Margaux 2015, rated 99/100 Parker. Pair with lamb or aged beef. $450-890." }
    }),
    makeUseCase(14, {
        title: "Landmark Recognition", date: "2 hours ago", category: "Travel",
        thumb: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?q=80&w=400&auto=format&fit=crop",
        sTitle: "Landmark Info",
        intention: "Identify this landmark, provide history, visitor tips, and nearby attractions.",
        chips: ["🏛️ Identify", "📚 History", "🎫 Tips", "📍 Nearby"],
        visualDesc: <span>I see the <span className="text-white/90 font-medium">Eiffel Tower</span> — iconic <span className="text-white/90 font-medium">Parisian landmark</span>, shot from Trocadéro.</span>,
        voiceDesc: <span>Want <span className="text-white/90 font-medium">history facts</span> and <span className="text-white/90 font-medium">visitor tips</span>.</span>,
        todos: [
            { text: "Landmark ID", steps: [{ t: "Visual matching: Eiffel Tower 99.8%", d: 700 }, { t: "Location: Champ de Mars, Paris", d: 600 }, { t: "Built: 1887-1889 by Gustave Eiffel", d: 700 }], summary: "Eiffel Tower · Paris · 1889" },
            { text: "Visitor Guide", steps: [{ t: "Hours: 9:30am-11:45pm", d: 600 }, { t: "Skip-the-line: book online €26.80", d: 700 }, { t: "Best time: sunset (7-8pm)", d: 600 }, { t: "Best photo: Trocadéro ✓", d: 500 }], summary: "Open daily · €26.80 · Best at sunset" },
            { text: "Nearby Attractions", steps: [{ t: "Arc de Triomphe: 2.1km", d: 600 }, { t: "Musée d'Orsay: 1.3km", d: 600 }, { t: "Seine cruise: 0.5km", d: 600 }, { t: "✓ Guide assembled", d: 500 }], summary: "5 nearby attractions mapped" },
        ],
        artifact: { title: "Landmark Guide", type: "Travel Guide", sections: "3 sections", verdict: "Must Visit", verdictColor: "bg-sky-500/20 text-sky-400", breakdown: [{ l: "Rating", v: "4.7/5", p: 94, c: "bg-amber-500" }, { l: "Wait", v: "~45 min", p: 45, c: "bg-red-500" }, { l: "Value", v: "€26.80", p: 60, c: "bg-green-500" }], info: [{ s: "Hours", p: "9:30am-11:45pm", n: "Daily" }, { s: "Ticket", p: "€26.80", n: "Online" }, { s: "Best Time", p: "Sunset", n: "7-8pm" }], note: "Eiffel Tower, built 1889. Book online to skip lines. Best viewed at sunset from Trocadéro." }
    }),
    makeUseCase(15, {
        title: "Dog Breed Identifier", date: "3 hours ago", category: "Nature",
        thumb: "https://images.unsplash.com/photo-1587300003388-59208cc962cb?q=80&w=400&auto=format&fit=crop",
        sTitle: "Breed ID",
        intention: "Identify this dog breed, provide temperament info, exercise needs, and health considerations.",
        chips: ["🐕 Breed ID", "🧠 Temperament", "🏃 Exercise", "🩺 Health"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">Golden Retriever</span> — adult, healthy coat, <span className="text-white/90 font-medium">classic golden color</span>.</span>,
        voiceDesc: <span>Want to know about <span className="text-white/90 font-medium">temperament</span> and <span className="text-white/90 font-medium">exercise needs</span>.</span>,
        todos: [
            { text: "Breed Classification", steps: [{ t: "Running breed classifier...", d: 800 }, { t: "Golden Retriever 96.8%", d: 700 }, { t: "Age estimate: 3-5 years", d: 600 }], summary: "Golden Retriever · 96.8% · 3-5 yrs" },
            { text: "Breed Profile", steps: [{ t: "Temperament: friendly, intelligent, devoted", d: 700 }, { t: "Exercise: 1-2 hours daily", d: 600 }, { t: "Size: 55-75 lbs", d: 600 }], summary: "Friendly · 1-2hr exercise · 55-75 lbs" },
            { text: "Health Guide", steps: [{ t: "Common: hip dysplasia, cancer risk", d: 800 }, { t: "Lifespan: 10-12 years", d: 600 }, { t: "✓ Breed report ready", d: 500 }], summary: "Watch hip dysplasia · 10-12yr lifespan" },
        ],
        artifact: { title: "Breed Report", type: "Animal ID", sections: "3 sections", verdict: "Family Dog", verdictColor: "bg-emerald-500/20 text-emerald-400", breakdown: [{ l: "Confidence", v: "96.8%", p: 97, c: "bg-green-500" }, { l: "Energy", v: "High", p: 80, c: "bg-amber-500" }, { l: "Trainability", v: "Excellent", p: 95, c: "bg-blue-500" }], info: [{ s: "Breed", p: "Golden Retriever", n: "Sporting" }, { s: "Exercise", p: "1-2 hrs/day", n: "Active" }, { s: "Lifespan", p: "10-12 years", n: "Average" }], note: "Golden Retriever: friendly, intelligent, great family dog. Needs 1-2hr exercise daily." }
    }),
    makeUseCase(16, {
        title: "Parking Meter Decoder", date: "Just now", category: "Travel",
        thumb: "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?q=80&w=400&auto=format&fit=crop",
        sTitle: "Parking Info",
        intention: "Read this parking sign, tell me the rules, when it's free, and set a timer reminder.",
        chips: ["🅿️ Rules", "⏰ Timer", "💰 Cost", "📍 Zones"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">parking sign</span> with <span className="text-white/90 font-medium">multiple time restrictions</span> and street cleaning schedule.</span>,
        voiceDesc: <span>Want to know <span className="text-white/90 font-medium">how long I can park</span> and <span className="text-white/90 font-medium">set timer</span>.</span>,
        todos: [
            { text: "Sign OCR", steps: [{ t: "Reading parking restrictions...", d: 800 }, { t: "2hr limit: Mon-Sat 8am-6pm", d: 700 }, { t: "Free: Sun + after 6pm", d: 600 }], summary: "2hr limit weekdays · Free Sun + evenings" },
            { text: "Current Status", steps: [{ t: "Current: Thu 3:45pm → 2hr limit active", d: 700 }, { t: "Must move by 5:45pm", d: 600 }, { t: "Timer set for 5:30pm", d: 600 }], summary: "Move by 5:45pm · Timer set 5:30pm" },
            { text: "Nearby Options", steps: [{ t: "Garage 0.2mi: $3/hr", d: 700 }, { t: "Free parking after 6pm", d: 600 }, { t: "✓ Parking guide ready", d: 500 }], summary: "Garage nearby $3/hr · Free after 6pm" },
        ],
        artifact: { title: "Parking Guide", type: "Quick Info", sections: "3 sections", verdict: "2hr Limit", verdictColor: "bg-sky-500/20 text-sky-400", breakdown: [{ l: "Time Left", v: "2 hrs", p: 100, c: "bg-green-500" }, { l: "Cost", v: "Free", p: 0, c: "bg-blue-500" }, { l: "Nearby", v: "$3/hr", p: 30, c: "bg-amber-500" }], info: [{ s: "Limit", p: "2 hours", n: "Mon-Sat" }, { s: "Move By", p: "5:45 PM", n: "Timer set" }, { s: "Free", p: "After 6pm", n: "& Sunday" }], note: "2-hour parking limit active. Timer set for 5:30pm. Free parking after 6pm and Sundays." }
    }),
    makeUseCase(17, {
        title: "Chemistry Equation Balancer", date: "4 hours ago", category: "STEM",
        thumb: "https://images.unsplash.com/photo-1532634993-15f421e42ec0?q=80&w=400&auto=format&fit=crop",
        sTitle: "Chemistry Solution",
        intention: "Balance this chemical equation, explain the reaction type, and show electron transfer.",
        chips: ["⚗️ Balance", "🔬 Reaction", "⚡ Electrons", "📝 Notes"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">chemical equation</span> — <span className="text-white/90 font-medium">Fe + O₂ → Fe₂O₃</span>, unbalanced combustion.</span>,
        voiceDesc: <span>Want it <span className="text-white/90 font-medium">balanced</span> with <span className="text-white/90 font-medium">explanation</span>.</span>,
        todos: [
            { text: "Equation Recognition", steps: [{ t: "Parsed: Fe + O₂ → Fe₂O₃", d: 700 }, { t: "Type: Synthesis/Combustion", d: 600 }, { t: "Unbalanced", d: 500 }], summary: "Fe + O₂ → Fe₂O₃ · Synthesis" },
            { text: "Balancing", steps: [{ t: "Balancing Fe: 4Fe", d: 700 }, { t: "Balancing O: 3O₂", d: 600 }, { t: "4Fe + 3O₂ → 2Fe₂O₃ ✓", d: 800 }, { t: "Verified: 4Fe, 6O each side", d: 600 }], summary: "4Fe + 3O₂ → 2Fe₂O₃ ✓" },
            { text: "Study Notes", steps: [{ t: "Oxidation states explained...", d: 700 }, { t: "Fe: 0 → +3 (oxidized)", d: 600 }, { t: "O: 0 → -2 (reduced)", d: 600 }, { t: "✓ Notes compiled", d: 500 }], summary: "Redox: Fe oxidized, O reduced" },
        ],
        artifact: { title: "Chemistry Solution", type: "Study Guide", sections: "3 sections", verdict: "Balanced ✓", verdictColor: "bg-green-500/20 text-green-400", breakdown: [{ l: "Fe atoms", v: "4 = 4", p: 100, c: "bg-orange-500" }, { l: "O atoms", v: "6 = 6", p: 100, c: "bg-blue-500" }, { l: "Difficulty", v: "Medium", p: 50, c: "bg-purple-500" }], info: [{ s: "Balanced", p: "4Fe + 3O₂ → 2Fe₂O₃", n: "✓" }, { s: "Type", p: "Synthesis", n: "Redox" }, { s: "Level", p: "Chemistry I", n: "Ch. 4" }], note: "Balanced: 4Fe + 3O₂ → 2Fe₂O₃. Synthesis/redox reaction. Fe oxidized (0→+3), O reduced (0→-2)." }
    }),
];

export default batch1;
