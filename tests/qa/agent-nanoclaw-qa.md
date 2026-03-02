# NanoClaw Executor E2E QA — `vi-gateway` (nanoclaw)

**Executor**: NanoClawExecutor (TypeScript, `@anthropic-ai/sdk`)
**Model**: `claude-sonnet-4-6` (env `CLAUDE_MODEL`)
**Service**: `vi-gateway` container
**Routing**: `priority: 'thorough'` tasks via TaskRouter (default for user "Done" press)
**DataChannel topic (out)**: `vi-gateway`
**RPC handler**: `dispatch_task` (shared with GeminiFlash, routed by TaskRouter)
**System prompt**: Body-only HTML or text, dark theme, Tailwind CDN, mobile-first, thorough analysis
**max_tokens**: 16384
**Key metrics**: First chunk < 5s, Stream complete < 30s, Auto-detects HTML vs text

---

## Prerequisites

| Item | How to verify |
|---|---|
| vi-gateway container running | `docker ps --filter name=vi-gateway --format '{{.Status}}'` shows "Up" |
| Gateway health endpoint | `curl -s http://localhost:18789/health` returns executors containing `nanoclaw` |
| ANTHROPIC_API_KEY set | `docker exec vi-gateway env \| grep ANTHROPIC_API_KEY` is non-empty |
| API Server healthy | `curl -s http://localhost:8000/health` returns `{"status":"ok"}` |
| LiveKit reachable | LiveKit URL from .env is accessible |

**Environment variables for test runner:**
```bash
export API_URL="${VI_TEST_API_URL:-http://localhost:8000}"
export GATEWAY_URL="${VI_TEST_GATEWAY_URL:-http://localhost:18789}"
export DEVICE_ID="qa-nc-$(date +%s)"
```

---

## Master Test Table

| ID | Suite | Test Name | Sev | Method | Pass Criteria |
|---|---|---|---|---|---|
| NC-DISP-01 | DISPATCH | Thorough task reaches NanoClaw | CRIT | DataChannel observe | `{ type: "start", executor: "nanoclaw" }` on `vi-gateway` |
| NC-DISP-02 | DISPATCH | Streaming arrives | CRIT | DataChannel observe | `start -> stream chunks -> stream(done:true) -> end` |
| NC-DISP-03 | DISPATCH | Result stored in sequence | HIGH | DataChannel observe | `{ type: "result", data: { isHtml, chunkCount, totalLength } }` |
| NC-CONT-01 | CONTENT | HTML auto-detection | HIGH | Inspect stream types | `html_stream` chunks when prompt requests visual output |
| NC-CONT-02 | CONTENT | Text auto-detection | HIGH | Inspect stream types | `text_stream` chunks when prompt requests analysis |
| NC-CONT-03 | CONTENT | Markdown fences stripped | MED | Inspect first chunk | No ` ```html ` prefix in stream content |
| NC-ERR-01 | ERROR | Missing API key graceful | HIGH | Remove key + dispatch | Error chunk or no-executor fallback, no crash |
| NC-ERR-02 | ERROR | Model error produces error chunk | HIGH | Force API error | `{ type: "error", message, recoverable }` on DataChannel |

**Total: 8 tests** (2 CRITICAL, 5 HIGH, 1 MED)

---

## Suite 1: DISPATCH (3 tests) -- Full E2E Flow

| ID | Severity | Timeout |
|---|---|---|
| NC-DISP-01 | CRITICAL | 30s |
| NC-DISP-02 | CRITICAL | 60s |
| NC-DISP-03 | HIGH | 10s |

### NC-DISP-01: Thorough task reaches NanoClaw executor

**Steps (browser-based):**
1. Open app in browser, camera view starts.
2. Converse with agent to set an intention (e.g., "Do a deep analysis of this scene").
3. Press Done (triggers `dispatch_task` via DataChannel).
4. The agent's `execute_task` runs with `fast=False` (default), setting `priority: "thorough"`.
5. Monitor `vi-gateway` DataChannel topic.
6. Verify first message: `{ type: "start", taskId: "...", executor: "nanoclaw" }`.

**Steps (programmatic):**
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
     "intention": "Perform a thorough analysis of this image and create a detailed report",
     "photoCount": 0,
     "photoUrls": []
   }
   ```
5. Listen on `vi-gateway` topic for `{ type: "start" }`.

**How the executor is selected:**
```typescript
// In TaskRouter.route():
if (request.priority !== 'fast') {
  preferred = envOverride || this.config.defaultThoroughExecutor;  // 'nanoclaw'
}

// NanoClawExecutor.canHandle():
return this.client !== null && request.priority === 'thorough';
```

**Default behavior**: When the user presses Done without explicitly choosing fast mode, the agent calls `execute_task(task_description, fast=False)`, which sets `priority: "thorough"`, routing to NanoClaw. This is the **default path** for all user-initiated dispatches.

**Pass**: DataChannel message `{ type: "start", executor: "nanoclaw" }` received.
**Fail diagnosis**:
- `docker logs vi-gateway 2>&1 | grep "Routed task"` -- check routing decision
- `docker logs vi-gateway 2>&1 | grep "No executor"` -- no executor matched
- Verify `ANTHROPIC_API_KEY` is set (otherwise `canHandle()` returns false, falls through to gemini-flash)
- `docker logs vi-gateway 2>&1 | grep "NanoClawExecutor.*No ANTHROPIC_API_KEY"` -- executor disabled at startup

### NC-DISP-02: Streaming arrives

**Steps:**
1. After dispatch (NC-DISP-01), collect all messages on `vi-gateway` DataChannel topic.
2. Record timestamps for each message.
3. Verify the streaming sequence:

| Order | Message Type | Required Fields | Notes |
|---|---|---|---|
| 1 | `start` | `taskId`, `executor: "nanoclaw"` | |
| 2 | `progress` | `step: 1`, `total: 4`, `message: "Preparing context..."` | |
| 3 | `progress` | `step: 2`, `total: 4`, `message: "Thinking..."` | |
| 4 | `progress` | `step: 3`, `total: 4`, `message: "Generating response..."` | |
| 5..N | `html_stream` or `text_stream` | `content` (non-empty), `done: false` | Type depends on auto-detection |
| N+1 | `html_stream` or `text_stream` | `content: ""`, `done: true` | Stream sentinel |
| N+2 | `progress` | `step: 4`, `total: 4` | Complete message |
| N+3 | `result` | `summary`, `data: { chunkCount, totalLength, model, isHtml }` | |
| N+4 | `end` | `taskId` | Sent by GatewayService |

**Key difference from GeminiFlash**: NanoClaw has **4 progress steps** (vs 3 for GeminiFlash) and uses either `html_stream` or `text_stream` based on auto-detection.

**Auto-detection logic (first 300 chars buffered):**
```typescript
// Buffer initial content to detect HTML
if (cleaned.match(/<(div|section|article|main|h[1-6]|p|ul|ol|table|nav|header|footer)\b/i)) {
  isHtml = true;
  yield { type: 'html_stream', ... };
}
// If passed 300-char threshold without detecting: yields text_stream
```

**Assertions:**
1. At least 1 stream chunk (`html_stream` or `text_stream`) with `done: false` and non-empty `content`.
2. Exactly 1 stream chunk with `done: true`.
3. Exactly 1 `result` chunk.
4. `result.data.chunkCount` > 0.
5. `result.data.totalLength` > 100.
6. `result.data.model` equals `claude-sonnet-4-6` (or env override).

**Performance baselines:**
| Metric | Baseline | Measured |
|---|---|---|
| Dispatch to `start` | < 1s | __ |
| `start` to first stream chunk | < 5s | __ |
| First chunk to `done: true` | < 25s | __ |
| Dispatch to `end` | < 30s | __ |

**Pass**: Full sequence received, chunk count > 0, total length > 100.
**Fail diagnosis**:
- `start` received but no stream chunks: Claude API error during streaming
  - `docker logs vi-gateway 2>&1 | grep "NanoClawExecutor.*Error"`
  - Verify `ANTHROPIC_API_KEY` is valid and has API access
  - Check for rate limiting: `docker logs vi-gateway 2>&1 | grep "429\|rate"`
- Streaming starts but stops prematurely: Claude connection interrupted, max_tokens hit
- Very slow (>60s): Claude API latency, check Anthropic status page

### NC-DISP-03: Result stored in sequence

**Steps:**
1. After streaming complete, verify the `result` chunk in the DataChannel sequence.
2. Verify `result.data` contains:
   - `chunkCount`: number of stream chunks produced
   - `totalLength`: total character count of streamed content
   - `model`: model name used (`claude-sonnet-4-6` or env override)
   - `isHtml`: boolean indicating whether HTML was auto-detected
3. Verify `result.summary` matches the format:
   - HTML: `"Generated HTML (X chars)"`
   - Text: `"Generated text (X chars)"`

**Additionally, verify the gateway RPC callback:**
```bash
docker logs vi-realtime 2>&1 | grep "Gateway reply"
# Should show: "Gateway reply for task=... status=complete executor=nanoclaw"
```

**Pass**: `result` chunk present with valid data; callback sent to agent.

---

## Suite 2: CONTENT (3 tests) -- Output Quality

| ID | Severity | Timeout |
|---|---|---|
| NC-CONT-01 | HIGH | 60s |
| NC-CONT-02 | HIGH | 60s |
| NC-CONT-03 | MED | 0s (post-hoc) |

### NC-CONT-01: HTML auto-detection works

**Steps:**
1. Dispatch a task with a prompt that requests visual/HTML output:
   ```json
   {
     "prompt": "Create a beautiful webpage showing a recipe for chocolate cake with ingredients and steps",
     "priority": "thorough"
   }
   ```
2. Collect stream chunks on `vi-gateway` DataChannel.
3. Verify chunks have `type: "html_stream"` (not `text_stream`).
4. Verify `result.data.isHtml` is `true`.

**How auto-detection works:**
The executor buffers the first 300 characters of output. It checks for HTML semantic tags:
```typescript
cleaned.match(/<(div|section|article|main|h[1-6]|p|ul|ol|table|nav|header|footer)\b/i)
```
If any match, all subsequent chunks are `html_stream`. If no match after 300 chars, all chunks are `text_stream`.

**Pass**: Stream chunks are `html_stream` type; `result.data.isHtml === true`.
**Fail diagnosis**:
- Claude produced plain text instead of HTML: system prompt says "Output ONLY the content HTML" but Claude may not comply
- First 300 chars were all text before HTML starts: detection threshold too small (design limitation)
- Check accumulated content manually: does it contain HTML tags?

### NC-CONT-02: Text auto-detection works

**Steps:**
1. Dispatch a task with a prompt that requests analysis/text output:
   ```json
   {
     "prompt": "Analyze the philosophical implications of artificial consciousness. Write a detailed essay.",
     "priority": "thorough"
   }
   ```
2. Collect stream chunks on `vi-gateway` DataChannel.
3. Verify chunks have `type: "text_stream"` (not `html_stream`).
4. Verify `result.data.isHtml` is `false`.

**Note**: The system prompt instructs Claude to produce HTML for visual tasks. For purely analytical prompts without visual output request, Claude may still produce HTML. This test validates the detection logic, not the model's compliance. If Claude produces HTML for this prompt, the test should verify auto-detection correctly classified it as HTML (not text), and the test should be re-run with a stronger text-only prompt.

**Pass**: Stream chunks are `text_stream` type; `result.data.isHtml === false`.
**Fail diagnosis**:
- Claude always produces HTML due to system prompt instruction -- expected behavior
- If needed, override with a system prompt that requests text-only output
- Mark as SKIP if Claude consistently produces HTML for all prompts (system prompt design choice)

### NC-CONT-03: Markdown code fences stripped

**Steps:**
1. Collect the first stream chunk from any dispatch.
2. If the model wraps output in ` ```html\n...\n``` `, the executor strips the opening fence.

**What happens:**
```typescript
// In NanoClawExecutor.execute():
if (cleaned.match(/^```(?:html)?\s*\n/)) {
  cleaned = cleaned.replace(/^```(?:html)?\s*\n/, '');
  trailingFence = true;
}
```

**Assertion against first (or accumulated) stream content:**
```javascript
const firstContent = streamChunks[0].content;
assert(!firstContent.startsWith('```html'), 'Must not start with ```html fence');
assert(!firstContent.startsWith('```\n'), 'Must not start with ``` fence');
```

**Pass**: Stream content does not begin with markdown code fences.
**Fail diagnosis**:
- Claude may not wrap in fences (system prompt says "No code fences"), in which case this test always passes
- If fences present: stripping regex failed -- check the regex pattern match

---

## Suite 3: ERROR (2 tests) -- Failure Handling

| ID | Severity | Timeout |
|---|---|---|
| NC-ERR-01 | HIGH | 10s |
| NC-ERR-02 | HIGH | 30s |

### NC-ERR-01: Missing API key produces graceful error

**Steps:**
1. Verify behavior when `ANTHROPIC_API_KEY` is unset.
   - In constructor: `this.client` is `null`, `canHandle()` returns `false`.
   - TaskRouter tries NanoClaw first (for thorough), fails, falls through to GeminiFlash.
   - If GeminiFlash also cannot handle (wrong priority), returns null: "No executor available".
2. If the executor is reached but client is null, it yields:
   ```json
   { "type": "error", "message": "Claude not configured (missing ANTHROPIC_API_KEY)", "recoverable": false }
   ```

**Startup check:**
```bash
docker logs vi-gateway 2>&1 | grep "NanoClawExecutor"
# "Initialized with model=claude-sonnet-4-6" → key is set
# "No ANTHROPIC_API_KEY — executor disabled" → key is missing
```

**Behavior when key missing + thorough task dispatched:**
- TaskRouter checks `nanoclaw.canHandle(request)` -> `false` (client is null)
- Falls through to `gemini-flash.canHandle(request)` -> `false` (priority is 'thorough')
- Returns null -> dispatch RPC responds: `{ "ok": false, "error": "No executor available for this request" }`

**Pass**: No crash; clear error returned.
**Fail diagnosis**:
- If gateway crashes: constructor throws -- should only `console.warn`
- If task silently fails: check `docker logs vi-gateway 2>&1 | grep "No executor"`

### NC-ERR-02: Model error produces error chunk

**Steps:**
1. Dispatch a task that causes an Anthropic API error (content policy, invalid key, quota).
2. Listen on `vi-gateway` DataChannel for `{ type: "error" }` chunk.
3. Verify the error chunk contains:
   - `message`: string describing the error
   - `recoverable`: boolean (`true` for API errors caught in catch block)

**What happens on API error:**
```typescript
// In NanoClawExecutor.execute(), catch block:
catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[NanoClawExecutor] Error task=${request.taskId}: ${msg}`);
  yield { type: 'error', message: msg, recoverable: true };
}
```

**Additionally**, the GatewayService wraps executor errors:
```typescript
// In processTaskAsync(), outer catch:
catch (err) {
  await this.publishData(room, {
    type: 'error', taskId, message: msg, recoverable: false,
  });
}
```

**Log check:**
```bash
docker logs vi-gateway 2>&1 | grep "NanoClawExecutor.*Error task"
```

**Pass**: Error chunk published with `message` and `recoverable` fields.
**Fail diagnosis**:
- If no error chunk but task hangs: streaming connection not properly terminated
- If gateway crashes: unhandled promise rejection in async generator

---

## How to Test Both Executors (Comparative)

The simplest way to test NanoClaw vs GeminiFlash side-by-side:

**Method 1: Priority-based routing (default)**
| Action | Priority | Executor |
|---|---|---|
| User presses Done (default) | `thorough` | NanoClaw |
| Agent sets `fast=True` (short tasks) | `fast` | GeminiFlash |

**Method 2: Environment override**
```bash
# Force all tasks to NanoClaw:
docker exec vi-gateway sh -c 'export VI_DEFAULT_EXECUTOR=nanoclaw'

# Force all tasks to GeminiFlash:
docker exec vi-gateway sh -c 'export VI_DEFAULT_EXECUTOR=gemini-flash'
```
Note: env var is checked on each `route()` call, so it takes effect immediately.

**Method 3: API-driven dispatch via internal endpoints**
```bash
# 1. Create a session
SESSION_RESP=$(curl -s -X POST "$API_URL/api/internal/sessions" \
  -H "Content-Type: application/json" \
  -d "{\"vi_user_id\": \"$VI_USER\"}")
SESSION_ID=$(echo "$SESSION_RESP" | jq -r '.session_id')

# 2. Dispatch with specific executor hint
curl -s -X POST "$API_URL/api/internal/sessions/$SESSION_ID/dispatch" \
  -H "Content-Type: application/json" \
  -d '{"executor": "nanoclaw", "prompt": "Analyze this in detail"}'

# 3. Poll session status
curl -s "$API_URL/api/internal/sessions/$SESSION_ID" | jq '{status, progress_step, result_summary}'
```

**Full E2E via LiveKit SDK (Python example):**
```python
from livekit import rtc
import json, asyncio

async def test_nanoclaw():
    room = rtc.Room()
    await room.connect(lk_url, token)

    chunks = []
    @room.on("data_received")
    def on_data(packet):
        if packet.topic == "vi-gateway":
            data = json.loads(packet.data.decode())
            chunks.append(data)
            print(f"  [{data.get('type')}] {str(data)[:100]}")

    # Dispatch thorough task (default priority)
    await room.local_participant.publish_data(
        json.dumps({
            "type": "dispatch_task",
            "intention": "Create a comprehensive analysis with visual layout",
            "photoCount": 0,
            "photoUrls": []
        }).encode(),
        topic="vi-user"
    )

    # Wait for streaming to complete (NanoClaw is slower than GeminiFlash)
    await asyncio.sleep(45)

    # Assert streaming sequence
    types = [c["type"] for c in chunks]
    assert "start" in types, f"Missing start event. Got: {types}"
    assert "end" in types, f"Missing end event. Got: {types}"

    # Check executor
    start_chunk = next(c for c in chunks if c["type"] == "start")
    assert start_chunk.get("executor") == "nanoclaw", f"Wrong executor: {start_chunk}"

    # Check result
    result_chunk = next((c for c in chunks if c["type"] == "result"), None)
    if result_chunk:
        print(f"Result: {result_chunk['summary']}")
        print(f"  isHtml: {result_chunk['data'].get('isHtml')}")
        print(f"  totalLength: {result_chunk['data'].get('totalLength')}")
        print(f"  model: {result_chunk['data'].get('model')}")

    # Check content type
    stream_chunks = [c for c in chunks if c["type"] in ("html_stream", "text_stream") and not c.get("done")]
    assert len(stream_chunks) > 0, "No stream content received"
    print(f"Received {len(stream_chunks)} content chunks")
```

---

## QA Report Generation

```
# NanoClaw Executor QA Report
Date: YYYY-MM-DD
Environment: [local / staging / production]
Commit: [git sha]
Model: claude-sonnet-4-6 (or env override)

## Summary
- Total: 8 tests
- Pass: X
- Fail: Y
- Skip: Z
- Critical failures: [list]

## Results Table
| ID | Name | Result | Duration | Notes |
|---|---|---|---|---|
| NC-DISP-01 | Thorough task reaches NanoClaw | PASS/FAIL | Xs | ... |
| NC-DISP-02 | Streaming arrives | PASS/FAIL | Xs | ... |
| NC-DISP-03 | Result stored | PASS/FAIL | Xs | ... |
| NC-CONT-01 | HTML auto-detection | PASS/FAIL | Xs | ... |
| NC-CONT-02 | Text auto-detection | PASS/FAIL/SKIP | Xs | ... |
| NC-CONT-03 | Markdown fences stripped | PASS/FAIL | Xs | ... |
| NC-ERR-01 | Missing API key | PASS/FAIL | Xs | ... |
| NC-ERR-02 | Model error chunk | PASS/FAIL | Xs | ... |

## Failures
### [ID]: [Name]
- Expected: ...
- Actual: ...
- Logs: `docker logs vi-gateway 2>&1 | grep "..."`
- Root cause: ...

## Performance
| Metric | Measured | Baseline | Status |
|---|---|---|---|
| Dispatch to start | Xs | <1s | OK/SLOW |
| Start to first chunk | Xs | <5s | OK/SLOW |
| Dispatch to complete | Xs | <30s | OK/SLOW |
| Total content chars | X | >100 | OK/LOW |
| Chunk count | X | >1 | OK/LOW |
| isHtml (for visual prompts) | true/false | true | OK/MISMATCH |

## Comparison with GeminiFlash
| Metric | GeminiFlash | NanoClaw | Delta |
|---|---|---|---|
| First chunk latency | Xs | Xs | +Xs |
| Total streaming time | Xs | Xs | +Xs |
| Output length (chars) | X | X | +X |
| Output type | html_stream | html_stream/text_stream | varies |
| Progress steps | 3 | 4 | +1 |
```

---

## Known Limitations

1. **NanoClaw is the default executor.** When users press Done, `fast=False` is the default, routing to NanoClaw. This means most real-world traffic hits NanoClaw unless the agent explicitly sets `fast=True`.
2. **Text auto-detection may rarely trigger.** The system prompt instructs Claude to produce HTML ("Output ONLY the content HTML"), so most outputs will be `html_stream`. NC-CONT-02 (text detection) may need a prompt that explicitly overrides the system instruction or should be marked SKIP.
3. **300-char detection buffer.** If Claude produces 300+ chars of text before any HTML tags, the output is classified as `text_stream` for the entire response, even if HTML follows. This is a known design trade-off.
4. **Trailing markdown fence.** The executor tracks `trailingFence = true` when it strips an opening ` ```html ` fence, but does not actively strip the closing ` ``` `. The closing fence, if present, will appear in the final chunk content. This is cosmetic and the frontend handles it.
5. **max_tokens: 16384.** For very long responses, the output will be truncated at this limit. The `result.data.totalLength` may be near 16384 * ~4 chars/token if the model maxes out.
6. **Multimodal input.** NanoClaw supports image URLs via Anthropic's `image` content blocks. Testing with actual images requires S3-hosted presigned URLs. Without images, the executor still works with text-only context.
7. **Gateway port is internal-only** in default docker-compose. See GeminiFlash QA doc for access options.
