# Deep Reasoning Toolkit — "Standing on the Shoulders of Giants"

> 非日常编码用。用于塑造任务方向的关键决策点：架构选择、任务分解、方向转折、矛盾解决。

## The Reasoning Rhythm

Every major decision follows this rhythm:

```
1. FRAME    → Define the decision. Variables, constraints, objective.
2. DIVERGE  → Generate ≥3 genuinely different approaches (not variations).
              At least one MUST be "scaling/learning-first."
              Let 众神殿 broaden your search on structural decisions.
3. ANALYZE  → Formalize comparison. State O(?) scaling. Identify invariants.
              If possible, define cost(approach) numerically.
4. STRESS   → Self-dialectic: attack each approach's weakest point.
              Proof by contradiction. Concrete counterexamples.
5. CONVERGE → Which survives? Constructive proof: show HOW, not just argue "should."
6. GROUND   → Translate to concrete tasks/code/actions. No philosophy without engineering.
```

---

## Thinking Methods

### 1. Self-Dialectic (Thesis → Antithesis → Synthesis)

```
THESIS:     "I believe X because..."
ANTITHESIS: "But the strongest counter is Y because..."
SYNTHESIS:  "The truth surviving both is Z..."
```

- Your antithesis must make you **genuinely hesitate**. Ask: "Under what conditions does my thesis catastrophically fail?"
- Same ruler for everyone — identical scrutiny for user's ideas and your own.
- Kill your darlings — if your idea loses the debate, abandon it without ego.

### 2. Formal Logic & Mathematical Reasoning

Use rigorous notation when it sharpens thinking (reveals structure, exposes hidden assumptions, proves something non-obvious). Don't use for decoration.

**Propositional Logic:**
```
Let P(x) = "x satisfies requirement R"
∀x ∈ Components: P(x)                    // every component must satisfy R
If P(a) → Q(a) and Q(a) → ¬R(a),
then P(a) → ¬R(a)                         // R and P incompatible — constraint exposed
```

**Proof Techniques:**
- **Contradiction**: Assume design works without X → show requirement violated → X is necessary
- **Construction**: Explicitly build mechanism, show it covers all N cases
- **Induction**: Base case works + step preserves invariant → holds for all
- **Counterexample**: One scenario where it fails kills a universal claim

**Mathematical Modeling:**
```
cost(design) = α·complexity + β·latency + γ·maintenance_burden
Minimize subject to: throughput ≥ T_min, correctness = 1
```

**Invariant Identification:**
```
INVARIANT: ∀t: balance(t) = Σ credits(0..t) - Σ debits(0..t)
// Core invariants → design writes itself. Violated invariant → wrong, no debate.
```

**When formal:** verifying consistency, proving necessity, dependency analysis, comparing alternatives.
**When informal:** brainstorming, obvious answers. Rule: if you write "should" or "probably" → formalize.

### 3. Deductive Chains

Start from axioms → chain implications forward → check for contradictions → proof by contradiction.
Valuable for: dependency ordering, impossible requirements, consistency of success criteria.

### 4. Inductive Pattern Recognition

Collect multiple instances → extract pattern → predict for new case → verify prediction.
Prevents generalizing from a single file read.

### 5. First Principles Decomposition

- "What is the irreducible core?"
- "Simplest solution with no legacy constraints?"
- "Now add back constraints one by one — why each one?"

### 6. Inversion Protocol — "反转思维"

When stuck, invert:
- "How to build X?" → "What makes X impossible? Remove those."
- "How to make fast?" → "What makes it slow? Eliminate those."
- "What features to add?" → "What to remove while preserving value?"
- "Handle all edge cases?" → "What invariant makes edge cases impossible?"

### 7. Compression Test — "用更少的概念表达同样的解决方案"

- Can 3 modules = 1 module + parameter?
- Can 5 special cases = 1 general rule?
- Can it be explained in one sentence to a non-expert?

Cannot compress → essential complexity. CAN compress → accidental complexity → simplify.

### 8. Feedforward Analysis — "三个月后崩溃在哪？"

- 10x growth → breaks where?
- First change request requiring rewrite → likely?
- Environment assumption that won't hold in 3 months?
- New team member misunderstanding in 6 months → where?

### 9. Dimension Unfolding

Before optimizing, map the full solution space:
```
Problem: "How to store sessions?"
Dimensions: storage [memory/disk/cache], serialization [JSON/proto],
            expiry [TTL/sliding/LRU], consistency [strong/eventual]
```
See entire space → choose deliberately. Use when ≥3 independent design choices.

---

## The Scaling Mindset — "The Bitter Lesson"

> General methods leveraging computation are ultimately the most effective, by a large margin.

```
Rules:    performance = f(human_effort)     — bounded by ingenuity, O(2^C) cases
Learning: performance = f(data × compute)   — bounded by resources, O(C) parameters
```

**Scaling Questions (ask before any design):**
1. "Scale with complexity?" → "add more rules" = RED FLAG (O(2^C)). "add more data" = GREEN.
2. "Encoding WHAT or HOW?" → WHAT (objectives) = good. HOW (procedures) = suspicious.
3. "Where does intelligence live?" → In code (fragile) vs in data (robust).
4. "What's the loss function?" → Can't state it = don't understand the problem.

**Anti-Patterns:**
- Enumerating cases → define objective, let system find mapping
- Hardcoded heuristics → make learnable: `threshold = f(context)`
- Taxonomizing upfront → taxonomy will be wrong; define metric, learn handler
- Config-driven complexity → search problem; use learning to find good config

**When Rules ARE Right:** ≤10 enumerable cases, provable correctness needed, encodes law not heuristic, interpretability > performance, no data (cold start).

---

## 众神殿 (Pantheon) — Cognitive Methods Library

The pantheon at `pantheon/` is a library of 1000+ figures. **Read actual entries** — don't name-drop.

**Era files:** `01_古代.md` through `07_20世纪下半叶至当代.md`, plus `greatest_minds.md` (index).

| Method | Source | Apply | Use When |
|---|---|---|---|
| **Simplification Test** | 费曼 | Explain in 3 sentences to non-expert. Can't? You don't understand it. | Verify understanding |
| **Axiomatic Reduction** | Euclid, 亚里士多德 | List irreducible assumptions. Everything derives from them. | Architecture, unnecessary complexity |
| **Center of Gravity** | 孙子 | ONE thing that if fails, everything fails. Concentrate there. | Strategy, prioritization |
| **Selection Pressure** | 达尔文 | What survives and dies? Can't evolve = already extinct. | Design longevity |
| **Inversion** | 雅各比, 庄子 | How to certainly fail? Avoid those conditions. | When stuck |
| **Stored Program** | 冯·诺依曼 | Separate data from mechanism. Change program without changing processor? | Extensibility |
| **Occam's Razor** | 奥卡姆 | Fewest assumptions preferred. Every entity must justify existence. | Choosing approaches |
| **Decomposition** | 笛卡尔 | Smallest sub-problems. Solve independently. Compose. | Module boundaries |
| **Loss Function** | Shannon, Turing | Define "error" precisely → optimization becomes mechanical. | Success criteria |
| **Dialectical Synthesis** | 黑格尔, 马克思 | Every solution creates its contradiction. What resolves it? | Anticipating evolution |

**How to invoke:** Problem type → select method → Read actual pantheon entry → Run method explicitly ("Applying [Method]: [problem through this lens] → [insight]"). Non-obvious insight = working. Confirms existing thought = try different method.

**Rule:** Never name-drop without substance. Invoke 孙子 → actually identify center of gravity. Invoke 费曼 → actually attempt simplification.
