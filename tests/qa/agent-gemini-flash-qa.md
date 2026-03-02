# GeminiFlash Executor E2E QA — `vi-gateway` (gemini-flash)

**Executor**: GeminiFlashExecutor (TypeScript, `@google/generative-ai` SDK)
**Model**: `gemini-2.5-flash` (env `GEMINI_FLASH_MODEL`)
**Service**: `vi-gateway` container
**Routing**: `priority: 'fast'` tasks via TaskRouter
**DataChannel topic (out)**: `vi-gateway`
**RPC handler**: `dispatch_task` (registered per-room by GatewayService)
**System prompt**: Body-only HTML, dark theme, Tailwind CDN, mobile-first
**Key metrics**: First chunk < 3s, Stream complete < 15s, HTML valid + script-free

---

## Prerequisites

| Item | How to verify |
|---|---|
| vi-gateway container running | `docker ps --filter name=vi-gateway --format '{{.Status}}'` shows "Up" |
| Gateway health endpoint | `curl -s http://localhost:18789/health` returns `{"status":"ok","service":"vi-gateway","executors":["gemini-flash","nanoclaw"]}` |
| GOOGLE_API_KEY set | `docker exec vi-gateway env \| grep GOOGLE_API_KEY` is non-empty |
| API Server healthy | `curl -s http://localhost:8000/health` returns `{"status":"ok"}` |
| LiveKit reachable | LiveKit URL from .env is accessible |

**Environment variables for test runner:**
```bash
export API_URL="${VI_TEST_API_URL:-http://localhost:8000}"
export GATEWAY_URL="${VI_TEST_GATEWAY_URL:-http://localhost:18789}"
export DEVICE_ID="qa-gf-$(date +%s)"
```

---

## Master Test Table

| ID | Suite | Test Name | Sev | Method | Pass Criteria |
|---|---|---|---|---|---|
| GF-HEALTH-01 | HEALTH | Gateway health endpoint | CRIT | HTTP GET | 200 with `executors` containing `gemini-flash` |
| GF-HEALTH-02 | HEALTH | Gateway join endpoint | HIGH | HTTP POST | 200 with `ok: true` |
| GF-DISP-01 | DISPATCH | Fast task reaches GeminiFlash | CRIT | DataChannel observe | `{ type: "start", executor: "gemini-flash" }` on `vi-gateway` |
| GF-DISP-02 | DISPATCH | HTML streaming arrives | CRIT | DataChannel observe | `start -> html_stream(done:false)+ -> html_stream(done:true) -> end` |
| GF-DISP-03 | DISPATCH | Final result in sequence | HIGH | DataChannel observe | `{ type: "result", summary, data }` chunk received |
| GF-CONT-01 | CONTENT | HTML is body-only | HIGH | Inspect accumulated HTML | No `<!DOCTYPE>`, `<html>`, `<head>`, `<body>` tags |
| GF-CONT-02 | CONTENT | No script tags | CRIT | Inspect accumulated HTML | No `<script>` tags in output |
| GF-CONT-03 | CONTENT | Images optimized | MED | Inspect accumulated HTML | `<img>` tags have `loading` or `fetchpriority` + `onerror` attrs |
| GF-ERR-01 | ERROR | Missing API key graceful | HIGH | Remove key + dispatch | `canHandle()` returns false; error chunk or no-executor error |
| GF-ERR-02 | ERROR | Model error produces error chunk | HIGH | Force API error | `{ type: "error", message, recoverable }` chunk on `vi-gateway` |

**Total: 10 tests** (3 CRITICAL, 5 HIGH, 2 MED)

---

## Suite 1: HEALTH (2 tests) -- Service Reachability

| ID | Severity | Timeout |
|---|---|---|
| GF-HEALTH-01 | CRITICAL | 5s |
| GF-HEALTH-02 | HIGH | 10s |

### GF-HEALTH-01: Gateway service reachable

**Steps:**
```bash
RESULT=$(curl -s -w "\n%{http_code}" "$GATEWAY_URL/health")
HTTP_CODE=$(echo "$RESULT" | tail -1)
BODY=$(echo "$RESULT" | head -1)
```

**Assertions:**
1. `HTTP_CODE` equals `200`.
2. `BODY` contains `"status":"ok"`.
3. `BODY` contains `"gemini-flash"` in the `executors` array.

**Pass**: HTTP 200, body shows `gemini-flash` in executors list.
**Fail diagnosis**:
- Container not running: `docker ps --filter name=vi-gateway`
- Port not mapped: gateway listens on 18789 inside container. In docker-compose, no host port is mapped (internal only). Access from within Docker network or add port mapping for testing.
- Missing LiveKit env vars: gateway exits on startup if `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` are missing.
  ```bash
  docker logs vi-gateway 2>&1 | head -10
  # Look for: "Missing required LiveKit environment variables"
  ```

### GF-HEALTH-02: Gateway join endpoint works

**Steps:**
```bash
# Create a test room name
TEST_ROOM="vi-room-qa-gf-$(date +%s)"

RESULT=$(curl -s -w "\n%{http_code}" -X POST "$GATEWAY_URL/join" \
  -H "Content-Type: application/json" \
  -d "{\"room_name\": \"$TEST_ROOM\"}")
HTTP_CODE=$(echo "$RESULT" | tail -1)
BODY=$(echo "$RESULT" | head -1)
```

**Assertions:**
1. `HTTP_CODE` equals `200`.
2. `BODY` contains `"ok":true`.
3. `BODY` contains `"participantName"` starting with `gateway-`.

**Pass**: Gateway joins the room and returns participant name.
**Fail diagnosis**:
- LiveKit unreachable: `docker logs vi-gateway 2>&1 | grep "Failed to join room"`
- Wrong LiveKit credentials: check `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`
- Room may not exist yet (LiveKit creates rooms on first join, so this should work)

**Cleanup:**
```bash
curl -s -X POST "$GATEWAY_URL/leave" \
  -H "Content-Type: application/json" \
  -d "{\"room_name\": \"$TEST_ROOM\"}"
```

---

## Suite 2: DISPATCH (3 tests) -- Full E2E Flow

| ID | Severity | Timeout |
|---|---|---|
| GF-DISP-01 | CRITICAL | 30s |
| GF-DISP-02 | CRITICAL | 30s |
| GF-DISP-03 | HIGH | 10s |

### GF-DISP-01: Fast task reaches GeminiFlash executor

**Steps (browser-based):**
1. Open app in browser, camera view starts.
2. Converse with agent to set a simple intention (e.g., "Summarize what you see").
3. Press Done (triggers `dispatch_task` via DataChannel).
4. The agent's `execute_task` tool runs with `fast=True` (short tasks default to fast).
5. Monitor `vi-gateway` DataChannel topic in browser console.
6. Verify first message: `{ type: "start", taskId: "...", executor: "gemini-flash" }`.

**Steps (programmatic via API + LiveKit SDK):**
1. Get anonymous token:
   ```bash
   BODY=$(curl -s -X POST "$API_URL/api/livekit/anonymous" \
     -H "Content-Type: application/json" \
     -d "{\"device_id\": \"$DEVICE_ID\"}")
   SESSION=$(echo "$BODY" | jq -r '.session_id')
   VI_USER=$(echo "$BODY" | jq -r '.vi_user_id')
   ROOM=$(echo "$BODY" | jq -r '.room_name')
   ```
2. Connect to room with LiveKit SDK client.
3. Wait for agent to join.
4. Publish on `vi-user` topic:
   ```json
   {
     "type": "dispatch_task",
     "intention": "Create a quick summary of daily tasks",
     "photoCount": 0,
     "photoUrls": []
   }
   ```
5. Listen on `vi-gateway` topic for `{ type: "start" }`.

**How the executor is selected:**
```typescript
// In TaskRouter.route():
if (request.priority === 'fast') {
  preferred = envOverride || this.config.defaultFastExecutor;  // 'gemini-flash'
}

// GeminiFlashExecutor.canHandle():
return this.model !== null && request.priority === 'fast';
```

**Pass**: DataChannel message `{ type: "start", executor: "gemini-flash" }` received.
**Fail diagnosis**:
- `docker logs vi-gateway 2>&1 | grep "Routed task"` -- verify routing decision
- `docker logs vi-gateway 2>&1 | grep "No executor"` -- no executor could handle the request
- Verify `GOOGLE_API_KEY` is set (otherwise `canHandle()` returns false)
- Check task priority: agent sends `priority: "fast"` for `fast=True`, `priority: "thorough"` for `fast=False`. By default (user presses Done), `fast=False` which routes to NanoClaw, not GeminiFlash. To test GeminiFlash specifically, the agent must set `fast=True`.

### GF-DISP-02: HTML streaming arrives

**Steps:**
1. After dispatch (GF-DISP-01), collect all messages on `vi-gateway` DataChannel topic.
2. Record timestamps for each message.
3. Verify the complete streaming sequence:

| Order | Message Type | Required Fields | Notes |
|---|---|---|---|
| 1 | `start` | `taskId`, `executor` | Must be "gemini-flash" |
| 2 | `progress` | `step: 1`, `total: 3`, `message: "Thinking..."` | |
| 3 | `progress` | `step: 2`, `total: 3`, `message: "Generating HTML..."` | |
| 4..N | `html_stream` | `content` (non-empty), `done: false` | Repeated N times |
| N+1 | `html_stream` | `content: ""`, `done: true` | Stream sentinel |
| N+2 | `progress` | `step: 3`, `total: 3` | Complete message |
| N+3 | `result` | `summary`, `data: { chunkCount, totalLength, model }` | |
| N+4 | `end` | `taskId` | Sent by GatewayService |

**Assertions:**
1. At least 1 `html_stream` chunk with `done: false` and non-empty `content`.
2. Exactly 1 `html_stream` chunk with `done: true`.
3. Exactly 1 `result` chunk.
4. `result.data.chunkCount` > 0.
5. `result.data.totalLength` > 100 (reasonable HTML length).
6. `result.data.model` equals `gemini-2.5-flash` (or env override).

**Performance baselines:**
| Metric | Baseline | Measured |
|---|---|---|
| Dispatch to `start` | < 1s | __ |
| `start` to first `html_stream` | < 3s | __ |
| First `html_stream` to `done: true` | < 12s | __ |
| Dispatch to `end` | < 15s | __ |

**Pass**: Full sequence received, chunk count > 0, total length > 100.
**Fail diagnosis**:
- `start` received but no `html_stream`: Gemini API error during streaming
  - Check `docker logs vi-gateway 2>&1 | grep "GeminiFlashExecutor.*Error"`
  - Check `docker logs vi-gateway 2>&1 | grep "error"` for API quota/rate issues
- Streaming starts but stops mid-way: Gemini connection dropped
- Very slow (>30s): Gemini API latency issue, not a code bug

### GF-DISP-03: Final result stored in sequence

**Steps:**
1. After streaming complete, verify the `result` chunk in the DataChannel sequence.
2. Verify `result.summary` contains the generated HTML size description.
3. Verify `result.data` contains `{ chunkCount, totalLength, model }`.

**Additionally, verify the gateway RPC callback to the agent:**
```bash
docker logs vi-realtime 2>&1 | grep "Gateway reply"
# Should show: "Gateway reply for task=... status=complete executor=gemini-flash type=html"
```

**Pass**: `result` chunk present with valid data; agent receives callback.

---

## Suite 3: CONTENT (3 tests) -- Output Quality

| ID | Severity | Timeout |
|---|---|---|
| GF-CONT-01 | HIGH | 0s (post-hoc) |
| GF-CONT-02 | CRITICAL | 0s (post-hoc) |
| GF-CONT-03 | MED | 0s (post-hoc) |

These tests inspect the accumulated HTML content from all `html_stream` chunks.
Accumulate chunks during GF-DISP-02, then run these assertions.

### GF-CONT-01: HTML is body-only

**Assertion against accumulated HTML string:**
```javascript
const html = accumulatedChunks.join('');
assert(!html.includes('<!DOCTYPE'), 'Must not contain DOCTYPE');
assert(!html.match(/<html[\s>]/i), 'Must not contain <html> tag');
assert(!html.match(/<head[\s>]/i), 'Must not contain <head> tag');
assert(!html.match(/<body[\s>]/i), 'Must not contain <body> tag');
assert(html.match(/<(div|section|article|p|h[1-6])\b/i), 'Must contain content tags');
```

**Why this matters**: The gateway applies `stripBoilerplate()` which extracts `<body>` inner content. If the LLM generates a full HTML page, the sanitizer strips the wrapper. This test verifies the output is ready for injection into the frontend's iframe/container.

**Pass**: No document-level tags; contains semantic content tags.
**Fail diagnosis**:
- If `<html>` or `<head>` present: `stripBoilerplate()` in `gateway-service.ts` failed
- Check `stripBoilerplate` regex: `/<body[^>]*>([\s\S]*)<\/body>/i`
- Gemini may output content without `<body>` wrapper (body-only), which passes through unchanged

### GF-CONT-02: No script tags in output (XSS prevention)

**Assertion:**
```javascript
const html = accumulatedChunks.join('');
assert(!html.match(/<script\b/i), 'Must not contain <script> tags');
assert(!html.includes('javascript:'), 'Must not contain javascript: protocol');
assert(!html.match(/on\w+\s*=\s*["'][^"']*["']/i) ||
       html.match(/onerror="this\.style\.display='none'"/),
       'Only allowed inline handler is onerror for image fallback');
```

**Why this matters**: The gateway applies `stripScripts()` which removes all `<script>...</script>` blocks. This is a critical XSS prevention measure since the HTML is rendered in the frontend.

**Pass**: No `<script>` tags in accumulated HTML.
**Fail diagnosis**:
- If `<script>` present: `stripScripts()` regex failed
- Check regex: `/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi`
- Edge case: Gemini may output `<script` without closing tag -- check regex handles this

### GF-CONT-03: Images have optimization attributes

**Assertion:**
```javascript
const html = accumulatedChunks.join('');
const imgTags = html.match(/<img\b[^>]*>/gi) || [];
for (const img of imgTags) {
  // First 2 images get fetchpriority="high", rest get loading="lazy"
  assert(
    img.includes('fetchpriority=') || img.includes('loading='),
    'Image must have fetchpriority or loading attribute'
  );
  assert(img.includes('onerror='), 'Image must have onerror fallback');
  assert(img.includes('decoding="async"'), 'Image must have decoding="async"');
}
```

**Why this matters**: The `createMediaOptimizer()` in `gateway-service.ts` adds performance attributes to images. First 2 images get `fetchpriority="high"`, subsequent images get `loading="lazy"`.

**Pass**: All `<img>` tags have optimization attributes.
**Fail diagnosis**:
- Images present but no attributes: media optimizer not running
- No images in output: test is N/A (skip) -- depends on Gemini generating image references

---

## Suite 4: ERROR (2 tests) -- Failure Handling

| ID | Severity | Timeout |
|---|---|---|
| GF-ERR-01 | HIGH | 10s |
| GF-ERR-02 | HIGH | 30s |

### GF-ERR-01: Missing API key produces graceful error

**Steps:**
1. Verify what happens when `GOOGLE_API_KEY` is unset.
   - In the constructor: `this.model` is `null`, `canHandle()` returns `false`.
   - TaskRouter falls through to other executors or returns null.
2. If no executor handles the request, the dispatch RPC returns:
   ```json
   { "ok": false, "error": "No executor available for this request" }
   ```
3. If the executor is reached but model is null, it yields:
   ```json
   { "type": "error", "message": "Gemini Flash not configured (missing GOOGLE_API_KEY)", "recoverable": false }
   ```

**Simulation (log-based):**
```bash
docker logs vi-gateway 2>&1 | grep "GeminiFlashExecutor.*No GOOGLE_API_KEY"
# If present: executor was initialized without key (expected warning at startup)
```

**Pass**: No crash; error message returned to caller.
**Fail diagnosis**:
- If gateway crashes on missing key: constructor throws instead of returning null
- Check `docker logs vi-gateway 2>&1 | head -20` for startup errors

### GF-ERR-02: Model error produces error chunk

**Steps:**
1. Dispatch a task that may trigger a Gemini API error (e.g., content policy violation, quota exceeded).
2. Listen on `vi-gateway` DataChannel for `{ type: "error" }` chunk.
3. Verify the error chunk contains `message` and `recoverable` fields.

**What happens on API error:**
```typescript
// In GeminiFlashExecutor.execute(), catch block:
catch (err) {
  yield { type: 'error', message: msg, recoverable: true };
}
```

**Simulation (force error by checking logs):**
```bash
docker logs vi-gateway 2>&1 | grep "GeminiFlashExecutor.*Error task"
```

**Pass**: `{ type: "error", message: "...", recoverable: true }` chunk published on DataChannel.
**Fail diagnosis**:
- If no error chunk but task hangs: streaming generator is stuck (not caught)
- If gateway crashes: unhandled rejection in async generator

---

## How to Test Without Browser

The gateway is an internal service (no host port mapped by default in docker-compose). For QA testing:

**Option 1: Add port mapping** (modify docker-compose.yml temporarily):
```yaml
vi-gateway:
  ports:
    - "18789:18789"
```

**Option 2: Use API Server as proxy**:
- Gateway join: `POST /api/internal/gateway/join` on API Server proxies to gateway
- Health: Access gateway health from within Docker network

**Option 3: Use Docker exec**:
```bash
docker exec vi-gateway curl -s http://localhost:18789/health
```

**Full E2E via LiveKit SDK (Python example):**
```python
from livekit import rtc
import json, asyncio

async def test_gemini_flash():
    room = rtc.Room()
    # Connect with token from API
    await room.connect(lk_url, token)

    chunks = []
    @room.on("data_received")
    def on_data(packet):
        if packet.topic == "vi-gateway":
            data = json.loads(packet.data.decode())
            chunks.append(data)

    # Publish dispatch_task on vi-user topic
    await room.local_participant.publish_data(
        json.dumps({
            "type": "dispatch_task",
            "intention": "Create a quick summary",
            "photoCount": 0,
            "photoUrls": []
        }).encode(),
        topic="vi-user"
    )

    # Wait for streaming to complete
    await asyncio.sleep(20)

    # Assert streaming sequence
    types = [c["type"] for c in chunks]
    assert "start" in types
    assert "html_stream" in types
    assert "end" in types
```

---

## QA Report Generation

```
# GeminiFlash Executor QA Report
Date: YYYY-MM-DD
Environment: [local / staging / production]
Commit: [git sha]
Model: gemini-2.5-flash (or env override)

## Summary
- Total: 10 tests
- Pass: X
- Fail: Y
- Skip: Z
- Critical failures: [list]

## Results Table
| ID | Name | Result | Duration | Notes |
|---|---|---|---|---|
| GF-HEALTH-01 | Gateway health | PASS/FAIL | Xs | ... |
...

## Failures
### [ID]: [Name]
- Expected: ...
- Actual: ...
- Logs: `docker logs vi-gateway 2>&1 | grep "..."`
- Root cause: ...

## Performance
| Metric | Measured | Baseline | Status |
|---|---|---|---|
| Health response | Xms | <200ms | OK/SLOW |
| Dispatch to start | Xs | <1s | OK/SLOW |
| Start to first chunk | Xs | <3s | OK/SLOW |
| Dispatch to complete | Xs | <15s | OK/SLOW |
| Total HTML chars | X | >100 | OK/LOW |
| Chunk count | X | >1 | OK/LOW |
```

---

## Known Limitations

1. **Priority routing is agent-controlled.** The realtime agent decides `fast` vs `thorough` via the `fast` parameter to `execute_task`. By default, `fast=False` (routes to NanoClaw). To specifically test GeminiFlash, either:
   - Set `VI_DEFAULT_EXECUTOR=gemini-flash` env var to force all tasks to GeminiFlash
   - Modify the dispatch to include `priority: "fast"` explicitly
2. **Gateway port is internal-only** in default docker-compose. Add port mapping or test from within Docker network.
3. **Gemini output is non-deterministic.** The same prompt may produce different HTML structure. Content tests (CONT suite) should focus on structural properties (no scripts, body-only) not specific content.
4. **Image optimization tests require images in output.** If Gemini does not generate `<img>` tags for a given prompt, GF-CONT-03 should be marked as SKIP, not FAIL.
5. **S3 URL conversion** (`s3://` to `https://`) depends on Gemini referencing S3 URLs in output, which is unlikely in test scenarios. This path is tested implicitly.
