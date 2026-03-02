import { makeUseCase } from './useCaseFactory.jsx';

// Batch 2: Use Cases 18-34
const batch2 = [
    makeUseCase(18, {
        title: "Calorie Counter Meal", date: "20 mins ago", category: "Health",
        thumb: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=400&auto=format&fit=crop",
        sTitle: "Meal Calories",
        intention: "Count calories for this entire meal, break down macros, and log to my daily tracker.",
        chips: ["🍽️ Meal Scan", "📊 Macros", "📈 Daily Log", "💡 Tips"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">healthy lunch plate</span> — grilled chicken, quinoa, mixed greens, <span className="text-white/90 font-medium">~480 kcal estimated</span>.</span>,
        voiceDesc: <span>Want <span className="text-white/90 font-medium">calorie count</span> and <span className="text-white/90 font-medium">daily log update</span>.</span>,
        todos: [
            { text: "Food Recognition", steps: [{ t: "Detecting food items...", d: 800 }, { t: "Chicken breast 150g, quinoa 120g, greens 80g", d: 900 }, { t: "Dressing: olive oil ~15ml", d: 600 }], summary: "4 items identified with portions" },
            { text: "Calorie Calculation", steps: [{ t: "Chicken: 248 kcal · Quinoa: 144 kcal", d: 700 }, { t: "Greens: 16 kcal · Dressing: 120 kcal", d: 600 }, { t: "Total: 528 kcal", d: 600 }], summary: "528 kcal · 42g protein · 38g carbs · 22g fat" },
            { text: "Daily Tracker", steps: [{ t: "Today's total: 1,340/2,000 kcal", d: 700 }, { t: "Remaining: 660 kcal for dinner", d: 600 }, { t: "✓ Logged", d: 500 }], summary: "1,340/2,000 kcal today · 660 remaining" },
        ],
        artifact: { title: "Meal Log Entry", type: "Nutrition Log", sections: "3 sections", calories: 528, verdict: "On Track", verdictColor: "bg-green-500/20 text-green-400", breakdown: [{ l: "Protein", v: "42g", p: 56, c: "bg-purple-500" }, { l: "Carbs", v: "38g", p: 38, c: "bg-blue-500" }, { l: "Fat", v: "22g", p: 22, c: "bg-orange-500" }], info: [{ s: "Today", p: "1,340 kcal", n: "67%" }, { s: "Remaining", p: "660 kcal", n: "Dinner" }, { s: "Goal", p: "2,000 kcal", n: "Daily" }], note: "Healthy lunch logged: 528 kcal. On track for daily goal. 660 kcal remaining for dinner." }
    }),
    makeUseCase(19, {
        title: "Book Summary & Notes", date: "45 mins ago", category: "Education",
        thumb: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?q=80&w=400&auto=format&fit=crop",
        sTitle: "Book Notes",
        intention: "Identify this book, provide key takeaways, create reading notes, and suggest similar books.",
        chips: ["📚 Identify", "💡 Takeaways", "📝 Notes", "📖 Similar"],
        visualDesc: <span>I see <span className="text-white/90 font-medium">"Thinking, Fast and Slow"</span> by <span className="text-white/90 font-medium">Daniel Kahneman</span>.</span>,
        voiceDesc: <span>Want <span className="text-white/90 font-medium">key takeaways</span> and <span className="text-white/90 font-medium">similar recommendations</span>.</span>,
        todos: [
            { text: "Book Recognition", steps: [{ t: "Cover match: Thinking, Fast and Slow", d: 700 }, { t: "Author: Daniel Kahneman (2011)", d: 600 }, { t: "Genre: Psychology / Behavioral Economics", d: 600 }], summary: "Kahneman 2011 · Psychology" },
            { text: "Key Takeaways", steps: [{ t: "System 1 vs System 2 thinking", d: 800 }, { t: "Cognitive biases and heuristics", d: 700 }, { t: "Prospect theory fundamentals", d: 700 }, { t: "5 key takeaways extracted", d: 600 }], summary: "5 key takeaways · System 1/2 framework" },
            { text: "Similar Books", steps: [{ t: "Predictably Irrational (Ariely)", d: 600 }, { t: "Nudge (Thaler & Sunstein)", d: 600 }, { t: "Influence (Cialdini)", d: 600 }, { t: "✓ Reading list ready", d: 500 }], summary: "3 similar books recommended" },
        ],
        artifact: { title: "Book Summary", type: "Reading Notes", sections: "3 sections", verdict: "Must Read", verdictColor: "bg-cyan-500/20 text-cyan-400", breakdown: [{ l: "Rating", v: "4.8/5", p: 96, c: "bg-amber-500" }, { l: "Difficulty", v: "Medium", p: 50, c: "bg-blue-500" }, { l: "Length", v: "499 pp", p: 70, c: "bg-purple-500" }], info: [{ s: "Genre", p: "Psychology", n: "Behavioral" }, { s: "Key", p: "System 1 & 2", n: "Framework" }, { s: "Rating", p: "4.8/5", n: "Goodreads" }], note: "Essential read on cognitive biases. System 1 (fast/intuitive) vs System 2 (slow/deliberate)." }
    }),
    makeUseCase(20, {
        title: "Invoice Data Extraction", date: "1 hour ago", category: "Finance",
        thumb: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?q=80&w=400&auto=format&fit=crop",
        sTitle: "Invoice Processing",
        intention: "Extract all data from this invoice, validate totals, and prepare payment entry.",
        chips: ["🧾 Extract", "✅ Validate", "💳 Payment", "📁 Archive"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">vendor invoice</span> from <span className="text-white/90 font-medium">AWS Services</span> — monthly cloud hosting bill.</span>,
        voiceDesc: <span>Need to <span className="text-white/90 font-medium">process payment</span> and <span className="text-white/90 font-medium">categorize expense</span>.</span>,
        todos: [
            { text: "Invoice OCR", steps: [{ t: "Extracting header fields...", d: 800 }, { t: "Invoice #: AWS-2026-0219", d: 600 }, { t: "Total: $2,847.32", d: 600 }, { t: "Due: Mar 1, 2026", d: 600 }], summary: "AWS-2026-0219 · $2,847.32 · Due Mar 1" },
            { text: "Line Item Validation", steps: [{ t: "EC2: $1,420.00 · S3: $340.50", d: 700 }, { t: "Lambda: $286.82 · CloudFront: $800.00", d: 700 }, { t: "Subtotal verified ✓", d: 600 }], summary: "4 line items · Subtotal verified ✓" },
            { text: "Payment Setup", steps: [{ t: "Category: Cloud Infrastructure", d: 700 }, { t: "Cost center: Engineering", d: 600 }, { t: "Payment scheduled for Feb 28", d: 600 }, { t: "✓ Ready", d: 500 }], summary: "Scheduled Feb 28 · Engineering cost center" },
        ],
        artifact: { title: "Invoice Entry", type: "Finance", sections: "3 sections", calories: 2847, calLabel: "Total", calUnit: "$", verdict: "Due Mar 1", verdictColor: "bg-amber-500/20 text-amber-400", breakdown: [{ l: "EC2", v: "$1,420", p: 50, c: "bg-blue-500" }, { l: "CloudFront", v: "$800", p: 28, c: "bg-purple-500" }, { l: "S3", v: "$340", p: 12, c: "bg-green-500" }, { l: "Lambda", v: "$287", p: 10, c: "bg-orange-500" }], info: [{ s: "Vendor", p: "AWS", n: "Cloud" }, { s: "Category", p: "Infrastructure", n: "Engineering" }, { s: "Payment", p: "Feb 28", n: "Scheduled" }], note: "AWS monthly invoice $2,847.32. 4 service items verified. Payment scheduled Feb 28." }
    }),
    makeUseCase(21, {
        title: "Art Style Identifier", date: "2 hours ago", category: "Education",
        thumb: "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?q=80&w=400&auto=format&fit=crop",
        sTitle: "Art Analysis",
        intention: "Identify the art style, artist influence, historical context, and similar works.",
        chips: ["🎨 Style", "👤 Artist", "📜 History", "🖼️ Similar"],
        visualDesc: <span>I see an <span className="text-white/90 font-medium">impressionist painting</span> — <span className="text-white/90 font-medium">Monet-style water lilies</span> with characteristic brushwork.</span>,
        voiceDesc: <span>Want to know the <span className="text-white/90 font-medium">art style</span> and <span className="text-white/90 font-medium">historical context</span>.</span>,
        todos: [
            { text: "Style Classification", steps: [{ t: "Running art classifier...", d: 800 }, { t: "Style: French Impressionism (94%)", d: 700 }, { t: "Period: late 19th century", d: 600 }], summary: "Impressionism · Late 19th century · 94%" },
            { text: "Artist Analysis", steps: [{ t: "Influence: Claude Monet", d: 700 }, { t: "Subject: Water Lilies (Nymphéas)", d: 700 }, { t: "Technique: broken brushstrokes, plein air", d: 700 }], summary: "Monet influence · Water Lilies series" },
            { text: "Context & Similar", steps: [{ t: "Movement: 1860s-1880s Paris", d: 700 }, { t: "Similar: Renoir, Pissarro, Sisley", d: 600 }, { t: "✓ Art report compiled", d: 500 }], summary: "Paris school · Renoir, Pissarro related" },
        ],
        artifact: { title: "Art Analysis", type: "Education", sections: "3 sections", verdict: "Impressionist", verdictColor: "bg-cyan-500/20 text-cyan-400", breakdown: [{ l: "Confidence", v: "94%", p: 94, c: "bg-blue-500" }, { l: "Period", v: "1870s", p: 60, c: "bg-amber-500" }, { l: "Influence", v: "Monet", p: 90, c: "bg-purple-500" }], info: [{ s: "Style", p: "Impressionism", n: "French" }, { s: "Artist", p: "Monet influence", n: "1870s" }, { s: "Subject", p: "Water Lilies", n: "Nymphéas" }], note: "French Impressionism, Monet's Water Lilies influence. Broken brushstrokes, plein air technique." }
    }),
    makeUseCase(22, {
        title: "Grocery List From Fridge", date: "5 mins ago", category: "Shopping",
        thumb: "https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?q=80&w=400&auto=format&fit=crop",
        sTitle: "Smart Grocery List",
        intention: "Scan my fridge contents, identify what's running low, suggest meals, create shopping list.",
        chips: ["🧊 Scan Fridge", "📝 Shopping List", "🍳 Meal Ideas", "💰 Budget"],
        visualDesc: <span>I see inside a <span className="text-white/90 font-medium">refrigerator</span> — eggs, milk (low), veggies, <span className="text-white/90 font-medium">several items running low</span>.</span>,
        voiceDesc: <span>Want a <span className="text-white/90 font-medium">shopping list</span> and <span className="text-white/90 font-medium">meal suggestions</span> from what's here.</span>,
        todos: [
            { text: "Fridge Inventory", steps: [{ t: "Detecting items...", d: 900 }, { t: "Found: 14 items, 4 running low", d: 800 }, { t: "Milk: 10% · Butter: 15% · Chicken: none", d: 700 }], summary: "14 items · 4 low · 2 out of stock" },
            { text: "Meal Suggestions", steps: [{ t: "With current items: 3 recipes possible", d: 800 }, { t: "Veggie stir-fry, egg fried rice, salad", d: 700 }, { t: "Missing for pasta: chicken, parmesan", d: 600 }], summary: "3 meals possible · Need chicken for more" },
            { text: "Shopping List", steps: [{ t: "Essential: milk, butter, chicken", d: 700 }, { t: "Nice-to-have: parmesan, bread, fruit", d: 600 }, { t: "Estimated: $32-45", d: 600 }, { t: "✓ List ready", d: 500 }], summary: "8 items · ~$38 estimated" },
        ],
        artifact: { title: "Smart Grocery List", type: "Shopping List", sections: "3 sections", calories: 38, calLabel: "Estimated", calUnit: "$", verdict: "8 Items", verdictColor: "bg-orange-500/20 text-orange-400", breakdown: [{ l: "Essential", v: "3 items", p: 100, c: "bg-red-500" }, { l: "Restock", v: "3 items", p: 60, c: "bg-amber-500" }, { l: "Nice-to-have", v: "2 items", p: 30, c: "bg-green-500" }], info: [{ s: "Urgent", p: "Milk, Chicken", n: "Out/Low" }, { s: "Meals", p: "3 possible", n: "Current" }, { s: "Budget", p: "~$38", n: "Estimated" }], note: "8 items needed. 3 meals possible with current inventory. Prioritize milk and chicken." }
    }),
    makeUseCase(23, {
        title: "Workout Form Check", date: "35 mins ago", category: "Health",
        thumb: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=80&w=400&auto=format&fit=crop",
        sTitle: "Form Analysis",
        intention: "Analyze my squat form, identify issues, provide corrections, and suggest exercises.",
        chips: ["🏋️ Form Check", "⚠️ Issues", "✅ Corrections", "📈 Progress"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">barbell back squat</span> — <span className="text-white/90 font-medium">knees tracking forward</span>, slight lower back rounding.</span>,
        voiceDesc: <span>Check my <span className="text-white/90 font-medium">squat form</span> and tell me what to <span className="text-white/90 font-medium">fix</span>.</span>,
        todos: [
            { text: "Pose Analysis", steps: [{ t: "Tracking 17 body keypoints...", d: 900 }, { t: "Knee angle: 72° (good range)", d: 700 }, { t: "Hip hinge: slight forward lean", d: 700 }, { t: "Lower back: mild rounding detected", d: 800 }], summary: "Knee angle good · Back rounding detected" },
            { text: "Corrections", steps: [{ t: "Issue 1: Butt wink at bottom 10%", d: 700 }, { t: "Fix: hip mobility drills before squats", d: 600 }, { t: "Issue 2: Heels slightly lifting", d: 700 }, { t: "Fix: elevate heels or squat shoes", d: 600 }], summary: "2 issues found · 2 corrections suggested" },
            { text: "Accessory Work", steps: [{ t: "Add: goblet squats for pattern", d: 600 }, { t: "Add: hip 90/90 stretches", d: 600 }, { t: "Add: ankle mobility work", d: 600 }, { t: "✓ Program updated", d: 500 }], summary: "3 accessory exercises added" },
        ],
        artifact: { title: "Form Analysis", type: "Fitness Report", sections: "3 sections", verdict: "7/10 Form", verdictColor: "bg-amber-500/20 text-amber-400", breakdown: [{ l: "Depth", v: "Good", p: 85, c: "bg-green-500" }, { l: "Back", v: "Fix needed", p: 40, c: "bg-red-500" }, { l: "Knees", v: "Good", p: 80, c: "bg-blue-500" }], info: [{ s: "Issue 1", p: "Butt wink", n: "Mobility" }, { s: "Issue 2", p: "Heel lift", n: "Shoes" }, { s: "Overall", p: "7/10", n: "Improving" }], note: "Decent squat form (7/10). Fix: hip mobility for butt wink, squat shoes for heel lift." }
    }),
    makeUseCase(24, {
        title: "Handwritten Letter OCR", date: "1 day ago", category: "Memory",
        thumb: "https://images.unsplash.com/photo-1455390582262-044cdead277a?q=80&w=400&auto=format&fit=crop",
        sTitle: "Letter Digitized",
        intention: "Digitize this handwritten letter, translate if needed, and archive to my memory vault.",
        chips: ["✍️ OCR", "🌐 Translate", "💾 Archive", "📅 Date"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">handwritten letter</span> — <span className="text-white/90 font-medium">cursive English</span>, appears to be a personal letter from the 1990s.</span>,
        voiceDesc: <span>Want to <span className="text-white/90 font-medium">digitize</span> and <span className="text-white/90 font-medium">save to memory</span>.</span>,
        todos: [
            { text: "Handwriting OCR", steps: [{ t: "Running cursive OCR model...", d: 1000 }, { t: "Extracted 342 words", d: 800 }, { t: "Confidence: 94.2%", d: 600 }, { t: "3 uncertain words flagged", d: 500 }], summary: "342 words · 94.2% confidence · 3 flagged" },
            { text: "Context Analysis", steps: [{ t: "Date: March 15, 1997", d: 700 }, { t: "Author: Grandma Rose", d: 600 }, { t: "Topic: birthday wishes and family news", d: 700 }], summary: "1997 · From Grandma Rose · Birthday letter" },
            { text: "Archive", steps: [{ t: "Saving to Memory Vault...", d: 700 }, { t: "Tagged: family, letters, 1990s", d: 600 }, { t: "Linked to: Family History collection", d: 600 }, { t: "✓ Archived permanently", d: 500 }], summary: "Saved to Memory Vault · Family History" },
        ],
        artifact: { title: "Digitized Letter", type: "Memory Archive", sections: "3 sections", verdict: "Archived ✓", verdictColor: "bg-rose-500/20 text-rose-400", breakdown: [{ l: "Words", v: "342", p: 100, c: "bg-blue-500" }, { l: "Accuracy", v: "94.2%", p: 94, c: "bg-green-500" }, { l: "Flagged", v: "3 words", p: 3, c: "bg-amber-500" }], info: [{ s: "Date", p: "Mar 15, 1997", n: "Original" }, { s: "From", p: "Grandma Rose", n: "Family" }, { s: "Collection", p: "Family History", n: "Archived" }], note: "Handwritten letter digitized. 342 words at 94.2% accuracy. Archived to Family History." }
    }),
    makeUseCase(25, {
        title: "Car Dashboard Warning", date: "Just now", category: "DIY",
        thumb: "https://images.unsplash.com/photo-1489824904134-891ab64532f1?q=80&w=400&auto=format&fit=crop",
        sTitle: "Dashboard Alert",
        intention: "Identify this dashboard warning light, explain severity, and suggest next steps.",
        chips: ["🚗 Identify", "⚠️ Severity", "🔧 Fix", "📞 Mechanic"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">check engine light</span> on a <span className="text-white/90 font-medium">car dashboard</span> — amber/orange color.</span>,
        voiceDesc: <span>What does this <span className="text-white/90 font-medium">warning light</span> mean? Is it <span className="text-white/90 font-medium">urgent</span>?</span>,
        todos: [
            { text: "Light Identification", steps: [{ t: "Match: Check Engine Light (CEL)", d: 800 }, { t: "Color: Amber = not immediately critical", d: 700 }, { t: "OBD-II code likely needed", d: 600 }], summary: "Check Engine Light · Amber · Non-critical" },
            { text: "Common Causes", steps: [{ t: "1. Loose gas cap (most common)", d: 600 }, { t: "2. O2 sensor failure", d: 600 }, { t: "3. Catalytic converter", d: 600 }, { t: "4. Mass airflow sensor", d: 600 }], summary: "4 common causes listed" },
            { text: "Action Plan", steps: [{ t: "Step 1: Check gas cap tightness", d: 600 }, { t: "Step 2: Get OBD-II scan ($0-50)", d: 600 }, { t: "Step 3: Schedule mechanic if persists", d: 600 }, { t: "✓ Guide ready", d: 500 }], summary: "Check gas cap first · OBD scan if persists" },
        ],
        artifact: { title: "Dashboard Guide", type: "Auto Diagnosis", sections: "3 sections", verdict: "Non-Critical", verdictColor: "bg-yellow-500/20 text-yellow-400", breakdown: [{ l: "Urgency", v: "Medium", p: 50, c: "bg-amber-500" }, { l: "DIY Fix", v: "Possible", p: 60, c: "bg-green-500" }, { l: "Cost", v: "$0-500", p: 40, c: "bg-blue-500" }], info: [{ s: "Light", p: "Check Engine", n: "Amber" }, { s: "First", p: "Check Gas Cap", n: "Free" }, { s: "Scan", p: "OBD-II", n: "$0-50" }], note: "Check engine light (amber) = not emergency. Check gas cap first. Get OBD-II scan if persists." }
    }),
    makeUseCase(26, {
        title: "Architectural Style Guide", date: "5 hours ago", category: "Education",
        thumb: "https://images.unsplash.com/photo-1431576901776-e539bd916ba2?q=80&w=400&auto=format&fit=crop",
        sTitle: "Architecture Analysis",
        intention: "Identify the architectural style of this building, its era, key features, and similar examples.",
        chips: ["🏛️ Style", "📐 Features", "📜 Era", "🏗️ Similar"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">Gothic Revival building</span> with <span className="text-white/90 font-medium">pointed arches and flying buttresses</span>.</span>,
        voiceDesc: <span>What <span className="text-white/90 font-medium">architectural style</span> is this? Tell me about its <span className="text-white/90 font-medium">features</span>.</span>,
        todos: [
            { text: "Style Classification", steps: [{ t: "Analyzing architectural elements...", d: 800 }, { t: "Style: Gothic Revival (93%)", d: 700 }, { t: "Era: mid-19th century", d: 600 }], summary: "Gothic Revival · 19th century · 93%" },
            { text: "Key Features", steps: [{ t: "Pointed arches identified", d: 600 }, { t: "Flying buttresses present", d: 600 }, { t: "Rose window on facade", d: 600 }, { t: "Ribbed vaulting likely", d: 600 }], summary: "4 key Gothic features identified" },
            { text: "Similar Buildings", steps: [{ t: "Notre-Dame de Paris", d: 600 }, { t: "Westminster Abbey", d: 600 }, { t: "Cologne Cathedral", d: 600 }, { t: "✓ Guide compiled", d: 500 }], summary: "3 similar Gothic examples" },
        ],
        artifact: { title: "Architecture Guide", type: "Educational", sections: "3 sections", verdict: "Gothic Revival", verdictColor: "bg-cyan-500/20 text-cyan-400", breakdown: [{ l: "Confidence", v: "93%", p: 93, c: "bg-blue-500" }, { l: "Era", v: "1840s", p: 60, c: "bg-amber-500" }, { l: "Condition", v: "Good", p: 75, c: "bg-green-500" }], info: [{ s: "Style", p: "Gothic Revival", n: "19th c." }, { s: "Feature", p: "Pointed Arches", n: "Key" }, { s: "Similar", p: "Notre-Dame", n: "Paris" }], note: "Gothic Revival architecture. Key features: pointed arches, flying buttresses, rose windows." }
    }),
    makeUseCase(27, {
        title: "Sneaker Authenticity Check", date: "3 hours ago", category: "Shopping",
        thumb: "https://images.unsplash.com/photo-1552346154-21d32810aba3?q=80&w=400&auto=format&fit=crop",
        sTitle: "Auth Check",
        intention: "Verify if these sneakers are authentic, check market value, and find best resale price.",
        chips: ["✅ Authenticate", "💲 Value", "📊 Market", "🏷️ Details"],
        visualDesc: <span>I see <span className="text-white/90 font-medium">Nike Air Jordan 1 Retro High OG</span> — <span className="text-white/90 font-medium">"Chicago" colorway</span>.</span>,
        voiceDesc: <span>Are these <span className="text-white/90 font-medium">authentic</span>? What's the <span className="text-white/90 font-medium">resale value</span>?</span>,
        todos: [
            { text: "Authentication", steps: [{ t: "Checking stitching patterns...", d: 900 }, { t: "Sole shape analysis...", d: 800 }, { t: "Logo placement verified...", d: 700 }, { t: "Tag/label cross-reference ✓", d: 700 }], summary: "AUTHENTIC ✓ · All 8 checkpoints passed" },
            { text: "Market Value", steps: [{ t: "StockX: $380-420 (DS)", d: 700 }, { t: "GOAT: $395-440", d: 600 }, { t: "eBay: $350-460 (varies)", d: 600 }], summary: "Market value: $380-440 deadstock" },
            { text: "Details & History", steps: [{ t: "Release: 2015 reissue", d: 600 }, { t: "Style: 555088-101", d: 600 }, { t: "Condition: 8.5/10 (worn)", d: 600 }, { t: "✓ Report ready", d: 500 }], summary: "2015 release · 8.5/10 condition" },
        ],
        artifact: { title: "Sneaker Report", type: "Authentication", sections: "3 sections", calories: 410, calLabel: "Avg Value", calUnit: "$", verdict: "Authentic ✓", verdictColor: "bg-green-500/20 text-green-400", breakdown: [{ l: "Auth Score", v: "8/8", p: 100, c: "bg-green-500" }, { l: "Condition", v: "8.5/10", p: 85, c: "bg-blue-500" }, { l: "Market", v: "Rising", p: 70, c: "bg-amber-500" }], info: [{ s: "StockX", p: "$380-420", n: "DS" }, { s: "GOAT", p: "$395-440", n: "DS" }, { s: "Condition", p: "8.5/10", n: "Worn" }], note: "Authentic Jordan 1 Chicago (2015). 8 checkpoints passed. Value: $380-440 DS." }
    }),
    makeUseCase(28, {
        title: "Circuit Board Diagnosis", date: "6 hours ago", category: "Professional",
        thumb: "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=400&auto=format&fit=crop",
        sTitle: "PCB Analysis",
        intention: "Identify components on this circuit board, detect any damage, and suggest repair options.",
        chips: ["🔌 Identify", "🔍 Damage", "🛠️ Repair", "📋 Schematic"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">PCB board</span> with <span className="text-white/90 font-medium">surface-mount components</span> — possible burnt capacitor visible.</span>,
        voiceDesc: <span>Is there <span className="text-white/90 font-medium">visible damage</span>? What <span className="text-white/90 font-medium">components</span> need replacing?</span>,
        todos: [
            { text: "Component ID", steps: [{ t: "Identifying SMD components...", d: 900 }, { t: "14 resistors, 8 capacitors, 3 ICs", d: 800 }, { t: "MCU: STM32F103", d: 700 }], summary: "25 components identified · STM32F103 MCU" },
            { text: "Damage Detection", steps: [{ t: "Thermal imaging analysis...", d: 800 }, { t: "Burnt capacitor C7 (22µF) detected", d: 800 }, { t: "Solder joint crack at U2", d: 700 }], summary: "C7 burnt · U2 solder crack" },
            { text: "Repair Plan", steps: [{ t: "Replace C7: 22µF 16V ceramic cap ($0.12)", d: 700 }, { t: "Reflow U2 solder joints", d: 600 }, { t: "Total: ~$5 + 30 min", d: 600 }, { t: "✓ Plan ready", d: 500 }], summary: "Replace C7 + reflow U2 · $5 + 30 min" },
        ],
        artifact: { title: "PCB Repair Guide", type: "Technical Report", sections: "3 sections", calories: 5, calLabel: "Repair Cost", calUnit: "$", verdict: "Repairable", verdictColor: "bg-indigo-500/20 text-indigo-400", breakdown: [{ l: "Components", v: "25", p: 100, c: "bg-blue-500" }, { l: "Damaged", v: "2", p: 8, c: "bg-red-500" }, { l: "Time", v: "30 min", p: 30, c: "bg-amber-500" }], info: [{ s: "Issue 1", p: "C7 burnt", n: "Replace" }, { s: "Issue 2", p: "U2 crack", n: "Reflow" }, { s: "Cost", p: "~$5", n: "Parts" }], note: "2 issues found: burnt capacitor C7, solder crack U2. Repairable for ~$5 in 30 min." }
    }),
    makeUseCase(29, {
        title: "Travel Itinerary Builder", date: "Yesterday", category: "Travel",
        thumb: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=400&auto=format&fit=crop",
        sTitle: "Trip Planner",
        intention: "Build a 3-day Tokyo itinerary based on this guidebook page, with budget and transport tips.",
        chips: ["🗺️ Itinerary", "💴 Budget", "🚃 Transport", "🍱 Food"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">Tokyo guidebook page</span> showing <span className="text-white/90 font-medium">Shibuya and Shinjuku</span> highlights.</span>,
        voiceDesc: <span>Plan a <span className="text-white/90 font-medium">3-day Tokyo trip</span> with <span className="text-white/90 font-medium">budget tips</span>.</span>,
        todos: [
            { text: "Content Extraction", steps: [{ t: "OCR on guidebook page...", d: 800 }, { t: "12 attractions extracted", d: 700 }, { t: "Mapping locations...", d: 600 }], summary: "12 attractions from guidebook · Mapped" },
            { text: "Itinerary Planning", steps: [{ t: "Day 1: Shibuya + Harajuku + Meiji", d: 700 }, { t: "Day 2: Tsukiji + Akihabara + TeamLab", d: 700 }, { t: "Day 3: Senso-ji + Skytree + Shinjuku", d: 700 }, { t: "Optimized for walking routes", d: 600 }], summary: "3-day itinerary · 12 stops · optimized routes" },
            { text: "Budget & Transport", steps: [{ t: "Suica card recommended: ¥5,000", d: 700 }, { t: "Daily budget: ¥8,000-12,000", d: 600 }, { t: "Total: ¥30,000 (~$200)", d: 600 }, { t: "✓ Trip plan ready", d: 500 }], summary: "~$200 for 3 days · Suica card recommended" },
        ],
        artifact: { title: "Tokyo 3-Day Plan", type: "Travel Itinerary", sections: "3 days", calories: 200, calLabel: "Budget", calUnit: "$", verdict: "3 Days", verdictColor: "bg-sky-500/20 text-sky-400", breakdown: [{ l: "Day 1", v: "Shibuya", p: 33, c: "bg-blue-500" }, { l: "Day 2", v: "Akihabara", p: 33, c: "bg-purple-500" }, { l: "Day 3", v: "Asakusa", p: 33, c: "bg-amber-500" }], info: [{ s: "Transport", p: "Suica Card", n: "¥5,000" }, { s: "Daily", p: "¥8-12K", n: "~$60" }, { s: "Total", p: "~$200", n: "3 days" }], note: "3-day Tokyo itinerary covering 12 attractions. Budget ~$200. Get Suica card for transport." }
    }),
    makeUseCase(30, {
        title: "Code Bug Screenshot Fix", date: "40 mins ago", category: "STEM",
        thumb: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?q=80&w=400&auto=format&fit=crop",
        sTitle: "Code Fix",
        intention: "Identify the bug in this code screenshot, explain the issue, and provide the fix.",
        chips: ["🐛 Bug ID", "💡 Explain", "🔧 Fix", "✅ Test"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">Python traceback</span> — <span className="text-white/90 font-medium">TypeError: 'NoneType' not subscriptable</span> on line 42.</span>,
        voiceDesc: <span>What's causing this <span className="text-white/90 font-medium">bug</span> and how do I <span className="text-white/90 font-medium">fix it</span>?</span>,
        todos: [
            { text: "Code OCR & Analysis", steps: [{ t: "Extracting code from screenshot...", d: 800 }, { t: "Language: Python 3.11", d: 600 }, { t: "Error: NoneType subscript on line 42", d: 700 }, { t: "Root cause: API returns None on 404", d: 800 }], summary: "Python NoneType error · API returns None on 404" },
            { text: "Fix Generation", steps: [{ t: "Add null check before subscript", d: 700 }, { t: "Add try/except for API call", d: 600 }, { t: "Add default value fallback", d: 600 }], summary: "3 fixes: null check + try/except + default" },
            { text: "Test Cases", steps: [{ t: "Test 1: valid API response ✓", d: 600 }, { t: "Test 2: 404 response (was failing) ✓", d: 600 }, { t: "Test 3: timeout handling ✓", d: 600 }, { t: "✓ All tests pass", d: 500 }], summary: "3 test cases · All passing ✓" },
        ],
        artifact: { title: "Bug Fix Report", type: "Code Review", sections: "3 sections", verdict: "Fixed ✓", verdictColor: "bg-green-500/20 text-green-400", breakdown: [{ l: "Severity", v: "Medium", p: 50, c: "bg-amber-500" }, { l: "Lines Changed", v: "4", p: 20, c: "bg-blue-500" }, { l: "Tests", v: "3/3 ✓", p: 100, c: "bg-green-500" }], info: [{ s: "Error", p: "NoneType subscript", n: "L42" }, { s: "Cause", p: "Missing null check", n: "API 404" }, { s: "Fix", p: "Add guard clause", n: "4 lines" }], note: "NoneType error caused by unhandled API 404 response. Fixed with null check + try/except." }
    }),
    makeUseCase(31, {
        title: "Food Allergy Scanner", date: "10 mins ago", category: "Health",
        thumb: "https://images.unsplash.com/photo-1621939514649-280e2ee25f60?q=80&w=400&auto=format&fit=crop",
        sTitle: "Allergy Check",
        intention: "Scan this food label for allergens, check against my allergy profile, flag any risks.",
        chips: ["🏷️ Scan Label", "⚠️ Allergens", "✅ Safe Check", "🔄 Alternatives"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">nutrition label</span> on a packaged food item — <span className="text-white/90 font-medium">ingredients list visible</span>.</span>,
        voiceDesc: <span>Is this <span className="text-white/90 font-medium">safe for me</span>? Check for <span className="text-white/90 font-medium">nut allergies</span>.</span>,
        todos: [
            { text: "Label OCR", steps: [{ t: "Reading ingredients list...", d: 800 }, { t: "18 ingredients extracted", d: 700 }, { t: "Cross-referencing allergen database...", d: 800 }], summary: "18 ingredients scanned" },
            { text: "Allergen Check", steps: [{ t: "⚠️ Contains: TREE NUTS (almonds)", d: 900 }, { t: "May contain: peanuts (facility)", d: 800 }, { t: "Gluten-free ✓ · Dairy-free ✓", d: 600 }], summary: "⚠️ TREE NUTS detected · Not safe" },
            { text: "Alternatives", steps: [{ t: "Similar product (nut-free): Brand X", d: 700 }, { t: "Available at: Whole Foods, Target", d: 600 }, { t: "✓ Safe alternatives found", d: 500 }], summary: "2 nut-free alternatives found" },
        ],
        artifact: { title: "Allergy Report", type: "Safety Check", sections: "3 sections", verdict: "⚠️ NOT SAFE", verdictColor: "bg-red-500/20 text-red-400", breakdown: [{ l: "Tree Nuts", v: "FOUND ⚠️", p: 100, c: "bg-red-500" }, { l: "Peanuts", v: "May Contain", p: 50, c: "bg-amber-500" }, { l: "Gluten", v: "Free ✓", p: 0, c: "bg-green-500" }], info: [{ s: "Allergen", p: "Almonds", n: "Tree Nut" }, { s: "Facility", p: "Peanuts", n: "Cross" }, { s: "Alt", p: "Brand X", n: "Nut-free" }], note: "⚠️ Contains tree nuts (almonds). May contain peanuts. NOT SAFE for nut allergy. Alternatives available." }
    }),
    makeUseCase(32, {
        title: "Room Measurement AR", date: "2 days ago", category: "AR",
        thumb: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?q=80&w=400&auto=format&fit=crop",
        sTitle: "Room Scan",
        intention: "Measure this room dimensions, calculate square footage, and generate a floor plan.",
        chips: ["📐 Measure", "📊 Area", "🗺️ Floor Plan", "🛋️ Layout"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">living room</span> — <span className="text-white/90 font-medium">rectangular space</span> with windows on one wall.</span>,
        voiceDesc: <span>Measure this room and create a <span className="text-white/90 font-medium">floor plan</span>.</span>,
        todos: [
            { text: "Dimension Scan", steps: [{ t: "AR depth scanning...", d: 900 }, { t: "Width: 14.2 ft · Length: 18.6 ft", d: 800 }, { t: "Ceiling: 9.1 ft", d: 600 }], summary: "14.2 × 18.6 ft · 9.1 ft ceiling" },
            { text: "Area Calculation", steps: [{ t: "Floor area: 264 sq ft", d: 600 }, { t: "Volume: 2,402 cu ft", d: 600 }, { t: "Window area: 32 sq ft (2 windows)", d: 600 }], summary: "264 sq ft · 2,402 cu ft volume" },
            { text: "Floor Plan", steps: [{ t: "Generating 2D floor plan...", d: 800 }, { t: "Adding door and window positions...", d: 700 }, { t: "✓ Floor plan exported", d: 500 }], summary: "Floor plan generated with measurements" },
        ],
        artifact: { title: "Room Floor Plan", type: "AR Measurement", sections: "3 sections", calories: 264, calLabel: "Area", calUnit: "sq ft", verdict: "Scanned ✓", verdictColor: "bg-teal-500/20 text-teal-400", breakdown: [{ l: "Width", v: "14.2 ft", p: 70, c: "bg-blue-500" }, { l: "Length", v: "18.6 ft", p: 90, c: "bg-purple-500" }, { l: "Ceiling", v: "9.1 ft", p: 45, c: "bg-amber-500" }], info: [{ s: "Area", p: "264 sq ft", n: "Floor" }, { s: "Volume", p: "2,402 cu ft", n: "Total" }, { s: "Windows", p: "2", n: "32 sq ft" }], note: "Room: 14.2 × 18.6 ft (264 sq ft). 9.1 ft ceiling. Floor plan exported with annotations." }
    }),
    makeUseCase(33, {
        title: "Presentation Slide Capture", date: "Yesterday", category: "Memory",
        thumb: "https://images.unsplash.com/photo-1560439514-4e9645039924?q=80&w=400&auto=format&fit=crop",
        sTitle: "Slides Captured",
        intention: "Capture this presentation slide, extract key points, and add to my knowledge base.",
        chips: ["📸 Capture", "💡 Key Points", "📂 Organize", "🔗 Link"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">conference presentation slide</span> — <span className="text-white/90 font-medium">"Future of AI" keynote</span> with data charts.</span>,
        voiceDesc: <span>Save the <span className="text-white/90 font-medium">key points</span> and add to my <span className="text-white/90 font-medium">knowledge base</span>.</span>,
        todos: [
            { text: "Slide Capture", steps: [{ t: "High-res capture + deskew...", d: 800 }, { t: "Title: 'AI Market Projections 2026-2030'", d: 700 }, { t: "3 charts + 5 bullet points", d: 600 }], summary: "Slide captured · 3 charts + 5 points" },
            { text: "Key Point Extraction", steps: [{ t: "AI market: $190B by 2030", d: 600 }, { t: "Growth rate: 37% CAGR", d: 600 }, { t: "Top sectors: Healthcare, Finance, Auto", d: 600 }], summary: "$190B by 2030 · 37% CAGR · 3 sectors" },
            { text: "Knowledge Base", steps: [{ t: "Saving to: AI Research collection", d: 700 }, { t: "Linked to: Market Analysis notes", d: 600 }, { t: "✓ Added to knowledge base", d: 500 }], summary: "Saved to AI Research collection" },
        ],
        artifact: { title: "Slide Notes", type: "Knowledge Base", sections: "3 sections", verdict: "Saved ✓", verdictColor: "bg-rose-500/20 text-rose-400", breakdown: [{ l: "Charts", v: "3", p: 60, c: "bg-blue-500" }, { l: "Key Points", v: "5", p: 100, c: "bg-purple-500" }, { l: "Sources", v: "2", p: 40, c: "bg-amber-500" }], info: [{ s: "Topic", p: "AI Market", n: "2026-2030" }, { s: "Growth", p: "37% CAGR", n: "$190B" }, { s: "Collection", p: "AI Research", n: "Linked" }], note: "AI Market Projections keynote captured. $190B by 2030 at 37% CAGR." }
    }),
    makeUseCase(34, {
        title: "Guitar Chord Identifier", date: "3 hours ago", category: "Education",
        thumb: "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?q=80&w=400&auto=format&fit=crop",
        sTitle: "Chord Analysis",
        intention: "Identify this guitar chord from the finger position, show variations, and suggest songs.",
        chips: ["🎸 Chord ID", "🎵 Variations", "🎶 Songs", "📝 Tab"],
        visualDesc: <span>I see a <span className="text-white/90 font-medium">guitar chord</span> being played — <span className="text-white/90 font-medium">open G major</span> finger position.</span>,
        voiceDesc: <span>What <span className="text-white/90 font-medium">chord</span> is this? Show me <span className="text-white/90 font-medium">variations</span>.</span>,
        todos: [
            { text: "Chord Recognition", steps: [{ t: "Analyzing finger positions...", d: 800 }, { t: "Match: G Major (open position)", d: 700 }, { t: "Notes: G-B-D-G-B-G", d: 600 }], summary: "G Major · Open position · G-B-D-G-B-G" },
            { text: "Variations & Theory", steps: [{ t: "Barre G: fret 3", d: 600 }, { t: "G7: add F note", d: 600 }, { t: "Gmaj7: add F# note", d: 600 }], summary: "3 variations: Barre, G7, Gmaj7" },
            { text: "Song Suggestions", steps: [{ t: "Wonderwall - Oasis", d: 600 }, { t: "Sweet Home Alabama", d: 600 }, { t: "Let It Be - Beatles", d: 600 }, { t: "✓ Practice list ready", d: 500 }], summary: "3 beginner songs using G major" },
        ],
        artifact: { title: "Chord Guide", type: "Music Education", sections: "3 sections", verdict: "G Major", verdictColor: "bg-cyan-500/20 text-cyan-400", breakdown: [{ l: "Difficulty", v: "Beginner", p: 20, c: "bg-green-500" }, { l: "Variations", v: "3", p: 60, c: "bg-blue-500" }, { l: "Songs", v: "3", p: 60, c: "bg-purple-500" }], info: [{ s: "Chord", p: "G Major", n: "Open" }, { s: "Notes", p: "G-B-D-G-B-G", n: "6 strings" }, { s: "Level", p: "Beginner", n: "Essential" }], note: "G Major open chord. One of the first chords to learn. Used in Wonderwall, Sweet Home Alabama." }
    }),
];

export default batch2;
