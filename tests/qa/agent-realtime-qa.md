# Realtime Agent E2E QA — `vi-realtime`

**Agent**: VIRealtimeAgent (Python, LiveKit Agents SDK)
**Model**: `gemini-2.5-flash-native-audio-preview-12-2025` (env `GEMINI_MODEL`)
**Service**: `vi-realtime` container
**DataChannel topic (out)**: `vi-agent`
**DataChannel topic (in)**: `vi-user`
**RPC handlers**: `rpcF2BSendMessage` (frontend), `rpcG2BSendReply` (gateway callback)
**Key metrics**: Agent join < 5s, Greeting < 10s, Tool round-trip < 2s, Gateway dispatch < 10s

---

## Prerequisites

| Item | How to verify |
|---|---|
| Docker stack running | `docker ps --format '{{.Names}}'` shows `vi-realtime`, `vi-gateway`, `api-server`, `postgres`, `redis` |
| LiveKit server reachable | `curl -s "$LIVEKIT_URL"` does not timeout |
| GOOGLE_API_KEY set | `docker exec vi-realtime env \| grep GOOGLE_API_KEY` is non-empty |
| API Server healthy | `curl -s http://localhost:8000/health` returns `{"status":"ok"}` |
| Gateway healthy | `curl -s http://localhost:18789/health` returns `{"status":"ok","service":"vi-gateway"}` |

**Environment variables for test runner:**
```bash
export API_URL="${VI_TEST_API_URL:-http://localhost:8000}"
export GATEWAY_URL="${VI_TEST_GATEWAY_URL:-http://localhost:18789}"
export DEVICE_ID="qa-rt-$(date +%s)"
```

**Helper: Get anonymous token + session**
```bash
BODY=$(curl -s -X POST "$API_URL/api/livekit/anonymous" \
  -H "Content-Type: application/json" \
  -d "{\"device_id\": \"$DEVICE_ID\"}")
TOKEN=$(echo "$BODY" | jq -r '.token')
ROOM=$(echo "$BODY" | jq -r '.room_name')
VI_USER=$(echo "$BODY" | jq -r '.vi_user_id')
SESSION=$(echo "$BODY" | jq -r '.session_id')
LK_URL=$(echo "$BODY" | jq -r '.livekit_url')
```

---

## Master Test Table

| ID | Suite | Test Name | Sev | Method | Pass Criteria |
|---|---|---|---|---|---|
| RT-CONN-01 | CONNECT | Agent joins room | CRIT | Token + Room observe | `agent-*` participant in room within 5s |
| RT-CONN-02 | CONNECT | No duplicate agents | HIGH | Room participant list | Exactly 1 `agent-*` participant |
| RT-CONN-03 | CONNECT | Greeting received | CRIT | DataChannel `vi-agent` | `intention` or `action_suggestion` message within 10s |
| RT-CONN-04 | CONNECT | Clean disconnect | MED | Disconnect + observe | Agent leaves within 30s, session `ended_at` set |
| RT-PERC-01 | PERCEPTION | Text via RPC | CRIT | `rpcF2BSendMessage` | Agent produces transcript/tool response |
| RT-PERC-02 | PERCEPTION | Transcript streaming | HIGH | DataChannel `vi-agent` | Streaming `intention` or `timeline_block` messages |
| RT-PERC-03 | PERCEPTION | Info updates during processing | MED | DataChannel `vi-agent` | `action_suggestion` or `timeline_block` messages arrive |
| RT-DISP-01 | DISPATCH | Dispatch triggers gateway | CRIT | DataChannel `vi-user` dispatch_task | Gateway joins room, task accepted |
| RT-DISP-02 | DISPATCH | Gateway result received | HIGH | DataChannel `vi-gateway` | `start` -> `html_stream`/`text_stream` -> `end` sequence |
| RT-DISP-03 | DISPATCH | Task status in DB | HIGH | `GET /api/internal/sessions/{id}` | Session shows dispatched status |
| RT-DISP-04 | DISPATCH | Agent acknowledges result | MED | DataChannel `vi-agent` | `timeline_block` with bubble after gateway reply |
| RT-TOOL-01 | TOOLS | suggest_action fires | HIGH | Trigger intent conversation | `action_suggestion` DataChannel message with `action` field |
| RT-TOOL-02 | TOOLS | update_intention fires | HIGH | Start conversation | `intention` DataChannel message with `text` field |
| RT-TOOL-03 | TOOLS | push_bubble fires | MED | Agent narration | `timeline_block` with `block_type: "bubble"` |
| RT-TOOL-04 | TOOLS | execute_task dispatches | HIGH | Press Done flow | RPC `dispatch_task` sent to gateway participant |
| RT-TOOL-05 | TOOLS | update_memory persists | MED | Conversation with preference | `POST /api/internal/memories/batch` called |
| RT-MEM-01 | MEMORY | Reads memory on connect | HIGH | Pre-seed memory + connect | Agent greeting references seeded content |
| RT-MEM-02 | MEMORY | Writes memory on disconnect | HIGH | Converse + disconnect | New memory via `GET /api/users/memory/by-device` |
| RT-MEM-03 | MEMORY | Memory context endpoint | MED | After interaction | `GET /api/internal/memories/context/{vi_user_id}` non-empty |
| RT-RES-01 | RESILIENCE | Gemini error no crash | CRIT | Observe logs | Agent stays connected on Gemini 1008/error |
| RT-RES-02 | RESILIENCE | Gateway timeout handled | HIGH | Slow gateway | Agent does not hang; reports timeout |
| RT-RES-03 | RESILIENCE | Session cleanup on error | MED | Force error | `ended_at` set on session record |

**Total: 22 tests** (5 CRITICAL, 9 HIGH, 8 MED)

---

## Suite 1: CONNECT (4 tests) -- Agent Connection Lifecycle

| ID | Severity | Timeout |
|---|---|---|
| RT-CONN-01 | CRITICAL | 10s |
| RT-CONN-02 | HIGH | 10s |
| RT-CONN-03 | CRITICAL | 15s |
| RT-CONN-04 | MED | 45s |

### RT-CONN-01: Agent joins room within 5s of user joining

**Steps:**
1. Get anonymous LiveKit token via `POST /api/livekit/anonymous` with `device_id`.
2. Connect to the room using a LiveKit client (browser or SDK).
3. Listen for `ParticipantConnected` events.
4. Verify a participant with identity starting with `agent-` appears within 5 seconds.

**API-only fallback (no LiveKit client):**
```bash
# Get token (triggers _dispatch_agent internally)
BODY=$(curl -s -X POST "$API_URL/api/livekit/anonymous" \
  -H "Content-Type: application/json" \
  -d "{\"device_id\": \"$DEVICE_ID\"}")
echo "$BODY" | jq .

# Check vi-realtime logs for the room join
docker logs vi-realtime 2>&1 | tail -20 | grep "New session started"
```

**Pass**: `agent-*` participant appears in room participant list within 5s.
**Fail diagnosis**:
- `docker logs vi-realtime 2>&1 | grep -i "error\|exception"` -- check startup errors
- Verify `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` are set in vi-realtime container
- Verify LiveKit server is running and reachable from Docker network
- Check `docker logs vi-realtime 2>&1 | grep "dispatch"` for agent dispatch failures

### RT-CONN-02: No duplicate agents in room

**Steps:**
1. Connect to room (reuse token from RT-CONN-01).
2. Wait 5s for agent to join.
3. Count participants whose identity starts with `agent-`.

**Pass**: Exactly 1 `agent-*` participant.
**Fail diagnosis**:
- `docker logs vi-realtime 2>&1 | grep "duplicate"` -- check for duplicate dispatch
- Multiple `_dispatch_agent()` calls may fire if the anonymous endpoint is called multiple times
- Check LiveKit dashboard for room participant list

### RT-CONN-03: Agent greeting received within 10s

**Steps:**
1. Connect to room and subscribe to DataChannel topic `vi-agent`.
2. Wait for agent to join (RT-CONN-01 prerequisite).
3. Listen for DataChannel messages on topic `vi-agent`.
4. Verify at least one of: `{ type: "intention" }`, `{ type: "action_suggestion" }`, or `{ type: "timeline_block" }` arrives within 10s.

**What the agent does on connect:**
```python
session.generate_reply(
    instructions="Greet the user warmly and briefly..."
)
```
This triggers Gemini Live, which calls `update_intention` and `suggest_action` tools.

**Pass**: DataChannel message with `type: "intention"` or `type: "action_suggestion"` received.
**Fail diagnosis**:
- `docker logs vi-realtime 2>&1 | grep -i "gemini\|google\|api_key"` -- check Gemini API connectivity
- Verify `GOOGLE_API_KEY` is valid and has Gemini Live API access
- Check model name: must be `gemini-2.5-flash-native-audio-preview-12-2025` (not a text-only model)
- `docker logs vi-realtime 2>&1 | grep "1008"` -- Gemini policy violation error

### RT-CONN-04: Agent disconnects cleanly on user leave

**Steps:**
1. Connect to room, wait for agent.
2. Disconnect from room.
3. Wait up to 30s.
4. Check: agent participant leaves the room.
5. Check: session record has `ended_at` set via `GET /api/internal/sessions/{session_id}`.

**What the agent does on disconnect:**
```python
@ctx.room.on("disconnected")
def on_disconnected():
    await agent.auto_summarize_session()
    await agent._http.patch(f"{api_base_url}/api/internal/sessions/{session_id}/end")
    await agent.close()
```

**Verification:**
```bash
curl -s "$API_URL/api/internal/sessions/$SESSION" | jq '.ended_at'
# Should be non-null ISO timestamp
```

**Pass**: Agent leaves room, session `ended_at` is set.
**Fail diagnosis**:
- `docker logs vi-realtime 2>&1 | grep "Session ended"` -- check cleanup ran
- Agent may linger if `auto_summarize_session` hangs on API call

---

## Suite 2: PERCEPTION (3 tests) -- Audio/Video Processing

| ID | Severity | Timeout |
|---|---|---|
| RT-PERC-01 | CRITICAL | 15s |
| RT-PERC-02 | HIGH | 15s |
| RT-PERC-03 | MED | 15s |

### RT-PERC-01: Agent responds to text via RPC

**Steps:**
1. Connect to room, wait for agent join.
2. Call RPC `rpcF2BSendMessage` on the agent participant with payload:
   ```json
   { "text": "Hello, what do you see?", "action": "", "images": [] }
   ```
3. Listen on DataChannel `vi-agent` for response messages.
4. Verify at least one `intention`, `action_suggestion`, or `timeline_block` message arrives.

**What happens internally:**
```python
async def _handle_frontend_message(data):
    session.generate_reply(
        instructions=f"The user sent a text message: '{user_text}'. Respond helpfully."
    )
```

**Pass**: Agent produces at least one DataChannel message in response.
**Fail diagnosis**:
- Check `docker logs vi-realtime 2>&1 | grep "Frontend RPC message"` -- verify RPC was received
- If no response: Gemini API may be rate-limited or erroring
- Check `docker logs vi-realtime 2>&1 | grep -i "error\|exception"` for LLM failures

### RT-PERC-02: Transcript streaming works

**Steps:**
1. After RT-PERC-01 RPC call, collect all DataChannel messages on `vi-agent` for 10s.
2. Verify messages arrive incrementally (more than one message).
3. Verify at least one message has `type: "intention"` with `text` field populated.

**Pass**: Multiple DataChannel messages arrive; at least one has meaningful `text` content.
**Fail diagnosis**:
- Single-shot response instead of streaming: check Gemini model supports streaming
- No `intention` type: agent may not be calling `update_intention` tool -- check system prompt

### RT-PERC-03: Info updates during processing

**Steps:**
1. Send a complex request via RPC: `{ "text": "Analyze everything you see in detail" }`.
2. Collect DataChannel messages on `vi-agent`.
3. Look for `action_suggestion` messages with `action` and `label` fields.
4. Look for `timeline_block` messages with `block_type: "bubble"`.

**Pass**: At least one `action_suggestion` or `timeline_block` (bubble) message received.
**Fail diagnosis**:
- Agent may respond verbally but not call tools -- this is a Gemini behavior issue
- Check `docker logs vi-realtime 2>&1 | grep "suggest_action\|push_bubble"` for tool calls

---

## Suite 3: DISPATCH (4 tests) -- Task Dispatch to Gateway

| ID | Severity | Timeout |
|---|---|---|
| RT-DISP-01 | CRITICAL | 30s |
| RT-DISP-02 | HIGH | 60s |
| RT-DISP-03 | HIGH | 10s |
| RT-DISP-04 | MED | 30s |

### RT-DISP-01: User dispatch triggers gateway call

**Steps:**
1. Connect to room, wait for agent.
2. Publish DataChannel message on topic `vi-user`:
   ```json
   {
     "type": "dispatch_task",
     "intention": "Analyze the scene and create a summary",
     "photoCount": 0,
     "photoUrls": []
   }
   ```
3. Listen on DataChannel `vi-gateway` for `{ type: "start" }` message.
4. Verify agent triggers Lazy Join: `POST /api/internal/gateway/join` with the room name.
5. Verify gateway participant (`gateway-*`) appears in room.

**What happens internally:**
- Agent calls `execute_task` tool.
- `execute_task` checks for gateway in room, triggers Lazy Join if absent.
- Sends RPC `dispatch_task` to gateway with `TaskRequest` payload.
- Gateway routes to executor (gemini-flash for `fast`, nanoclaw for `thorough`).

**Verification:**
```bash
# Check gateway logs for join
docker logs vi-gateway 2>&1 | tail -20 | grep "Connected room"

# Check agent logs for dispatch
docker logs vi-realtime 2>&1 | tail -20 | grep "Dispatching to gateway"
```

**Pass**: Gateway joins room and receives dispatch RPC; `{ type: "start" }` arrives on `vi-gateway` topic.
**Fail diagnosis**:
- `docker logs vi-realtime 2>&1 | grep "Gateway not in room"` -- Lazy Join triggered
- `docker logs vi-realtime 2>&1 | grep "Gateway did not join"` -- Lazy Join failed
- `docker logs vi-gateway 2>&1 | grep -i "error"` -- gateway join error
- Check `GATEWAY_URL` env var in api-server container: should be `http://vi-gateway:18789`

### RT-DISP-02: Gateway result received by agent

**Steps:**
1. After RT-DISP-01, listen on DataChannel `vi-gateway` for streaming chunks:
   - `{ type: "start", taskId }` -- task started
   - `{ type: "progress", step, total, message }` -- progress updates
   - `{ type: "html_stream", content, done: false }` -- HTML chunks (0..N)
   - `{ type: "html_stream", content: "", done: true }` -- stream complete
   - `{ type: "result", summary, data }` -- final result
   - `{ type: "end", taskId }` -- task finished
2. Verify the full sequence appears within 60s.
3. Verify total accumulated HTML content length > 0.

**Performance baselines:**
- Time from dispatch to `start`: < 5s
- Time from `start` to first `html_stream`: < 8s (depends on executor)
- Time from dispatch to `end`: < 60s

**Pass**: Full `start -> [progress] -> [html_stream] -> end` sequence received.
**Fail diagnosis**:
- No `start` event: RPC dispatch failed -- check RT-DISP-01
- `start` but no `html_stream`: executor errored -- check `docker logs vi-gateway 2>&1 | grep "Error task"`
- Check executor API keys: `GOOGLE_API_KEY` for gemini-flash, `ANTHROPIC_API_KEY` for nanoclaw

### RT-DISP-03: Task status updated in DB

**Steps:**
1. After gateway result received, check session status via API.
2. If the agent persists task records, check task status.

**Verification:**
```bash
# Check session state
curl -s "$API_URL/api/internal/sessions/$SESSION" | jq '{status, intention, result_summary}'

# Check if session has progress indicators
curl -s "$API_URL/api/internal/sessions/$SESSION" | jq '{progress_step, progress_total}'
```

**Pass**: Session record shows updated fields (intention, status, or result_summary non-null).
**Fail diagnosis**:
- Agent may not persist task to DB directly -- task lifecycle is managed via gateway DataChannel
- Check `docker logs vi-realtime 2>&1 | grep "persist intention"` for session update calls

### RT-DISP-04: Agent speaks result summary

**Steps:**
1. After gateway sends `rpcG2BSendReply` callback to agent, listen on DataChannel `vi-agent`.
2. Verify agent publishes at least one `timeline_block` with `block_type: "bubble"` containing completion indicator.
3. Verify agent's Gemini session generates a voice acknowledgment.

**What happens:**
```python
# In _handle_gateway_reply:
session.generate_reply(
    instructions="The task just completed. A visual card has been pushed..."
)
```

**Pass**: `timeline_block` bubble message received after gateway callback.
**Fail diagnosis**:
- `docker logs vi-realtime 2>&1 | grep "Gateway reply"` -- verify callback received
- If callback received but no response: Gemini session may have expired

---

## Suite 4: TOOLS (5 tests) -- Agent Tool Usage

| ID | Severity | Timeout |
|---|---|---|
| RT-TOOL-01 | HIGH | 15s |
| RT-TOOL-02 | HIGH | 15s |
| RT-TOOL-03 | MED | 15s |
| RT-TOOL-04 | HIGH | 30s |
| RT-TOOL-05 | MED | 30s |

### RT-TOOL-01: suggest_action updates shutter icon

**Steps:**
1. Connect, wait for greeting.
2. Send RPC: `{ "text": "I want to scan this receipt" }`.
3. Listen on `vi-agent` for `{ type: "action_suggestion" }`.
4. Verify it contains `action` (one of: `photo`, `video`, `scan`, `done`) and `label`.

**Pass**: `action_suggestion` message with valid `action` field.

### RT-TOOL-02: update_intention fires

**Steps:**
1. Connect, wait for greeting.
2. Send RPC: `{ "text": "I want to identify this plant" }`.
3. Listen on `vi-agent` for `{ type: "intention" }`.
4. Verify `text` field contains something related to plant identification.

**Pass**: `intention` message with meaningful `text`.

### RT-TOOL-03: push_bubble fires

**Steps:**
1. Connect, wait for greeting.
2. Listen on `vi-agent` for `{ type: "timeline_block", block_type: "bubble" }`.
3. Greeting flow should trigger at least one bubble.

**Pass**: `timeline_block` with `block_type: "bubble"` and `content` field.

### RT-TOOL-04: execute_task dispatches

**Steps:**
1. Connect, wait for agent.
2. Send dispatch_task via `vi-user` DataChannel (same as RT-DISP-01).
3. Verify `docker logs vi-realtime 2>&1 | grep "execute_task"` shows the tool was called.
4. Verify gateway RPC was invoked.

**Pass**: Agent logs show `execute_task` called and RPC sent to gateway.

### RT-TOOL-05: update_memory persists

**Steps:**
1. Connect, send RPC: `{ "text": "Remember that my favorite color is blue" }`.
2. Wait 10s for agent to call `update_memory` tool.
3. Check memory API: `GET /api/users/memory/by-device?vi_user_id=$VI_USER`.

**Verification:**
```bash
curl -s "$API_URL/api/users/memory/by-device?vi_user_id=$VI_USER" | jq .
```

**Pass**: Memory list includes `preferences.md` or `agent-memory.md` with relevant content.
**Fail diagnosis**:
- Agent may not call `update_memory` for every preference statement -- depends on Gemini behavior
- Check `docker logs vi-realtime 2>&1 | grep "update_memory\|Memory update"` for tool calls

---

## Suite 5: MEMORY (3 tests) -- Memory Persistence

| ID | Severity | Timeout |
|---|---|---|
| RT-MEM-01 | HIGH | 20s |
| RT-MEM-02 | HIGH | 45s |
| RT-MEM-03 | MED | 15s |

### RT-MEM-01: Agent reads user memory on connect

**Steps:**
1. Pre-seed a memory file for the test user:
   ```bash
   curl -s -X PUT "$API_URL/api/users/memory/by-device/preferences.md?vi_user_id=$VI_USER" \
     -H "Content-Type: application/json" \
     -d '{"content": "User prefers dark mode. Favorite language: English. Allergic to cats."}'
   ```
2. Get a new token and connect to room (new session triggers `fetch_user_memories()`).
3. Listen on `vi-agent` for greeting.
4. Verify greeting or intention references seeded content (e.g., mentions English or preferences).

**What happens internally:**
```python
# At session start:
asyncio.create_task(agent.fetch_user_memories())
# This calls: GET /api/internal/memories/context/{vi_user_id}?max_chars=2000
# And updates: agent._ctx_mgr.update_user_profile(memory_context_str)
```

**Pass**: Agent's context includes seeded memory content (verifiable via greeting or tool behavior).
**Fail diagnosis**:
- Check `docker logs vi-realtime 2>&1 | grep "Fetched memory context"` -- verify fetch happened
- Check `curl -s "$API_URL/api/internal/memories/context/$VI_USER"` returns the seeded content

### RT-MEM-02: Agent writes memory on disconnect

**Steps:**
1. Connect, have a brief conversation (at least set an intention).
2. Disconnect.
3. Wait 5s for cleanup.
4. Check memories:
   ```bash
   curl -s "$API_URL/api/users/memory/by-device?vi_user_id=$VI_USER" | jq .
   ```

**What happens on disconnect:**
```python
await agent.auto_summarize_session()
# Writes to agent-memory.md: "Session: {current_intention}"
```

**Pass**: `agent-memory.md` file exists and contains session summary text.
**Fail diagnosis**:
- Agent only writes if `_current_intention` is set -- may not write if no tools were called
- Check `docker logs vi-realtime 2>&1 | grep "Session summary written"` for confirmation

### RT-MEM-03: Memory context injection works

**Steps:**
1. After any interaction that triggers `update_memory`, call:
   ```bash
   curl -s "$API_URL/api/internal/memories/context/$VI_USER?max_chars=2000" | jq .
   ```
2. Verify `context` field is non-empty.

**Pass**: `context` field contains aggregated memory text.

---

## Suite 6: RESILIENCE (3 tests) -- Error Handling

| ID | Severity | Timeout |
|---|---|---|
| RT-RES-01 | CRITICAL | 30s |
| RT-RES-02 | HIGH | 120s |
| RT-RES-03 | MED | 30s |

### RT-RES-01: Gemini API failure does not crash agent

**Steps:**
1. Connect to room, wait for agent.
2. Monitor container status: `docker ps --filter name=vi-realtime --format '{{.Status}}'`.
3. Check logs for Gemini errors:
   ```bash
   docker logs vi-realtime 2>&1 | grep -i "error\|exception\|1008\|policy"
   ```
4. If errors present, verify agent container is still running and participant is still in room.

**Pass**: Container running, agent participant present despite logged Gemini errors.
**Fail diagnosis**:
- `docker ps` shows vi-realtime restarting -- unhandled exception crashed the process
- Check the exception traceback in logs for the specific failure
- Gemini 1008 (policy violation) should be caught by the try/except in agent code

### RT-RES-02: Gateway timeout handled

**Steps:**
1. Simulate a slow/unavailable gateway:
   - Stop vi-gateway: `docker stop vi-gateway`
2. Connect to room, trigger a dispatch via `vi-user` DataChannel.
3. Agent should attempt Lazy Join, poll for 10s, then return error.
4. Verify agent publishes error bubble: `timeline_block` with error content.
5. Restart gateway: `docker start vi-gateway`.

**What happens:**
```python
# In execute_task, after Lazy Join fails:
if not gateway_identity:
    return "Task dispatch failed: Gateway not available"
```

**Pass**: Agent returns "Gateway not available" error gracefully, does not hang or crash.

### RT-RES-03: Session cleanup on error

**Steps:**
1. Connect to room.
2. Force an error condition (e.g., send malformed data on `vi-user` topic).
3. Wait for session to end (disconnect or timeout).
4. Check session record:
   ```bash
   curl -s "$API_URL/api/internal/sessions/$SESSION" | jq '.ended_at'
   ```

**Pass**: `ended_at` is set (non-null).

---

## QA Report Generation

After running all tests, compile results using this template:

```
# Realtime Agent QA Report
Date: YYYY-MM-DD
Environment: [local / staging / production]
Commit: [git sha]

## Summary
- Total: 22 tests
- Pass: X
- Fail: Y
- Skip: Z
- Critical failures: [list]

## Results Table
| ID | Name | Result | Duration | Notes |
|---|---|---|---|---|
| RT-CONN-01 | Agent joins room | PASS/FAIL | Xs | ... |
...

## Failures (detail each)
### [ID]: [Name]
- Expected: ...
- Actual: ...
- Logs: ...
- Root cause: ...

## Performance
| Metric | Measured | Baseline | Status |
|---|---|---|---|
| Agent join time | Xs | <5s | OK/SLOW |
| Greeting time | Xs | <10s | OK/SLOW |
| Dispatch to start | Xs | <5s | OK/SLOW |
| Dispatch to complete | Xs | <60s | OK/SLOW |
```

---

## Known Limitations

1. **No programmatic LiveKit DataChannel monitoring via curl.** Full E2E tests require either:
   - A browser connected to the app (use Playwright/browser evaluate)
   - A LiveKit SDK client in Python/Node
   - The `lk` CLI tool for room inspection
2. **Gemini behavior is non-deterministic.** The agent may or may not call specific tools (suggest_action, push_bubble) in a given run. Run tool tests 3 times and pass if at least 1 succeeds.
3. **Audio/video perception cannot be tested without actual media streams.** Tests in this doc focus on text-based RPC and DataChannel paths.
4. **Test mode** (`VI_TEST_MODE=1`) disables Gemini and uses a stub. Useful for infrastructure tests (CONNECT suite) but not for PERCEPTION or TOOLS suites.
5. **Rate limits**: API endpoints are rate-limited (10/minute for livekit/anonymous). Space token requests accordingly.
