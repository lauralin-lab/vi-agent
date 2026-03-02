# VI-Agent QA Test System

> 面向 Claude Code Agent 的完整 QA 测试体系。Agent 执行测试、诊断问题、生成报告。

---

## Architecture

```
tests/qa/
├── README.md                      ← 你在这里
├── backend-qa.md                  ← 后端 API 全量测试 (38 endpoints, 9 suites)
├── browser-qa.md                  ← 浏览器 UI 全量测试 (54 tests, 10 suites)
├── agent-realtime-qa.md           ← Realtime Agent (Gemini Live) E2E
├── agent-gemini-flash-qa.md       ← GeminiFlash Executor E2E
├── agent-nanoclaw-qa.md           ← NanoClaw Executor E2E
├── perf_baseline.json             ← 性能基线数据 (自动对比)
└── report-template.md             ← 报告模板

tests/reports/
├── qa_report_{date}.md            ← 自动生成的报告
└── screenshots/                   ← 测试截图
```

---

## Quick Start

### 运行后端 QA
```
读取 tests/qa/backend-qa.md，按顺序执行所有 curl 命令，记录 PASS/FAIL。
生成报告到 tests/reports/qa_report_{date}.md。
```

### 运行浏览器 QA
```
读取 tests/qa/browser-qa.md，使用 Browser Use 执行所有 UI 测试。
截图保存到 tests/reports/screenshots/。
生成报告到 tests/reports/qa_report_{date}.md。
```

### 运行 Agent E2E
```
依次读取 agent-realtime-qa.md、agent-gemini-flash-qa.md、agent-nanoclaw-qa.md。
每个 agent 独立测试完整的 request → streaming → result 流程。
```

---

## Design Decisions

| 维度 | 决策 | 理由 |
|------|------|------|
| **定位** | Executable Checklist | 发现 + 诊断，不修复代码 |
| **格式** | Table-Driven | Suite 概览表 + 紧凑 detail blocks |
| **Agent 自主权** | 诊断不动手 | 定位 root cause + file:line，写报告，不改代码 |
| **性能** | JSON baseline + 自动对比 | perf_baseline.json 定义阈值，超标自动标红 |
| **报告** | Structured Markdown | 全自动生成，填充 report-template.md |
| **浏览器工具** | Antigravity Browser Use | 通用指令，不绑定具体 MCP |
| **Agent 测试** | 3 核心 Agent | Realtime(Gemini), GeminiFlash, NanoClaw |

---

## Document Format Specification

每个 QA 文档遵循统一的 Table-Driven 格式：

### 1. Suite Overview Table
```markdown
| ID | Name | Method | Sev | Deps | Perf Key |
|----|------|--------|-----|------|----------|
| AUTH-01 | Signup | POST /auth/signup | CRIT | - | signup_ms |
```

### 2. Test Detail Block
```markdown
### AUTH-01: Signup 创建新用户
> POST /api/auth/signup | Auth: None | Severity: CRITICAL | Deps: - | Perf: signup_latency_ms

**Execute:**
​```bash
{concrete curl or browser command}
​```

**Assert:**
- `{assertion}` → PASS:label

**On Fail → Diagnose:**
- {failure_pattern} → {root_cause} | check: {command}

**Perf:** signup_latency_ms (baseline: 300ms)
```

---

## Severity Levels

| Level | Meaning | Failure Impact |
|-------|---------|----------------|
| **CRITICAL** | Core functionality, system must work | Blocks all downstream tests, QA verdict = FAIL |
| **HIGH** | Important feature, should work | Significant issue, degrades user experience |
| **MED** | Secondary feature, nice to have | Minor issue, workaround exists |
| **LOW** | Polish, edge case | Cosmetic or unlikely scenario |

---

## Performance Baseline

`perf_baseline.json` 定义每个指标的基线值（毫秒）。

**规则:**
- `threshold = baseline × threshold_multiplier` (默认 1.5×)
- 测量值 ≤ baseline → **OK** ✅
- baseline < 测量值 ≤ threshold → **WARN** ⚠️
- 测量值 > threshold → **FAIL** ❌

**更新基线:**
当系统性能改善或环境变更后，更新 `perf_baseline.json` 中的数值。

---

## Report Generation Protocol

QA Agent 执行完所有测试后，按以下步骤生成报告：

1. **读取** `report-template.md`
2. **填充** 所有 `{{PLACEHOLDER}}` 字段
3. **计算** verdict:
   - `PASS` = 所有 CRITICAL 通过 + 通过率 ≥ 90%
   - `PARTIAL` = 所有 CRITICAL 通过 + 通过率 ≥ 70%
   - `FAIL` = 任何 CRITICAL 失败 OR 通过率 < 70%
4. **对比** perf_baseline.json，标记 regressions
5. **写入** `tests/reports/qa_report_{date}.md`
6. **保存** 截图到 `tests/reports/screenshots/`

---

## Test Dependencies

```
HEALTH ──→ AUTH ──→ LIVEKIT ──→ SESSION ──→ TASK
                                    │
                                    └──→ MEMORY
                                    └──→ EVENTS
                                    └──→ UPLOAD
                                    └──→ GATEWAY

Browser: APP-LOAD → AUTH-FLOW → CAMERA → SESSION → HOME → MEMORY → NAV → DATA-CHANNEL → ERROR → PERF

Agents: Backend HEALTH + LIVEKIT must pass first
  Realtime: CONNECT → PERCEPTION → DISPATCH → TOOLS → MEMORY → RESILIENCE
  GeminiFlash: HEALTH → DISPATCH → CONTENT → ERROR
  NanoClaw: DISPATCH → CONTENT → ERROR
```

---

## Execution Order (Recommended)

1. **Backend QA** (fastest, no browser needed, ~5 min)
   - If HEALTH fails → stop, system is down
   - If AUTH fails → stop, all authenticated tests blocked

2. **Agent E2E** (requires running services, ~10 min)
   - Realtime Agent first (it dispatches to Gateway)
   - Then GeminiFlash and NanoClaw (they need gateway running)

3. **Browser QA** (slowest, needs browser automation, ~15 min)
   - Depends on backend + agents being healthy

---

## Known Limitations

- **Camera tests in headless mode:** No real camera feed. Tests verify element existence and graceful fallback.
- **Audio tests:** Cannot verify actual audio playback in headless browser.
- **Gemini API:** External dependency, may be rate-limited or have model changes.
- **LiveKit WebRTC:** Full DataChannel testing requires actual room connection.
- **SSE tests:** Require Redis to be running and properly configured.
