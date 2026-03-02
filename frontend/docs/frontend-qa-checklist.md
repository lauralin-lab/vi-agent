# VI Frontend Web Experience — QA Acceptance Checklist

> **Version**: 1.0
> **Last Updated**: 2026-02-25
> **Target**: https://{SERVER_IP}:8000 (iPhone viewport 390×844)
> **Prerequisite**: LiveKit server running, vi-realtime agent connected, camera/mic permissions granted

---

## 0. Environment & Prerequisites

| # | Check | Pass Criteria |
|---|-------|---------------|
| 0.1 | Page loads without errors | `https://{host}:8000` returns 200, no console errors |
| 0.2 | Self-signed cert accepted | Page renders (ignore cert warning in test harness) |
| 0.3 | Camera permission granted | `getUserMedia` succeeds, video track active |
| 0.4 | Microphone permission granted | Audio track active, no permission denied errors |
| 0.5 | LiveKit room connects | `window.__lkRoom.state === 'connected'` within 5s |
| 0.6 | Agent joins room | Agent participant visible in room, agent ID shown in status bar |

---

## 1. Camera View — Layout & Visual Integrity

| # | Check | Pass Criteria |
|---|-------|---------------|
| 1.1 | Full-screen video feed | `<video>` element fills viewport, `videoWidth > 0`, `!paused` |
| 1.2 | No processing overlay | No element with `backdrop-blur` + processing/task text visible |
| 1.3 | No info bar pill | No purple pill overlay at top of camera area |
| 1.4 | Top bar visible | Back arrow (←), WiFi icon, flash toggle (OFF), refresh icon |
| 1.5 | Card visible at bottom | Card component showing "LISTENING..." or agent text |
| 1.6 | Bottom controls bar | Mic button (left), Shutter button (center), spacer/Done (right) |
| 1.7 | Connection status bar | "connected | agent-{id}" text at bottom of screen |
| 1.8 | No horizontal scroll | Page width = viewport width, no overflow |

---

## 2. Camera View — Agent Connection & Card

| # | Check | Pass Criteria |
|---|-------|---------------|
| 2.1 | Card shows "Connecting..." initially | Before agent joins, card text = "Connecting to AI..." |
| 2.2 | Card updates with agent text | After agent connects, card shows agent's greeting/response |
| 2.3 | Card animates on text change | Smooth text transition, no flickering |
| 2.4 | LISTENING indicator active | Purple dots animation visible when mic is on |
| 2.5 | Agent transcript streaming | Card text updates in real-time as agent speaks |

---

## 3. Camera View — Mic Toggle

| # | Check | Pass Criteria |
|---|-------|---------------|
| 3.1 | Mic starts ON | Purple mic button, `isMicOn = true`, audio track publishing |
| 3.2 | Tap mic → OFF | Button changes to white/dim, `MicOff` icon, audio track muted |
| 3.3 | Tap mic → ON again | Returns to purple, `Mic` icon, audio track unmuted |
| 3.4 | Sound feedback | `mic.on` / `mic.off` sound plays on toggle |

---

## 4. Camera View — Shutter & Photo Capture

| # | Check | Pass Criteria |
|---|-------|---------------|
| 4.1 | Shutter button visible | White circle button (4.5rem), centered in bottom controls |
| 4.2 | Tap shutter → capture photo | Flash animation, capture animation plays |
| 4.3 | Media stack appears | Thumbnail stack in bottom-right with badge count "1" |
| 4.4 | Multiple captures stack | Each tap adds to stack, badge increments (max 8) |
| 4.5 | Stack thumbnail shows latest | Most recent capture visible as stack thumbnail |
| 4.6 | Long press shutter → video | Hold >600ms starts recording, red pulsing indicator |
| 4.7 | Release stops recording | Recording stops, video added to media stack |
| 4.8 | Recording timer visible | Seconds counter visible during recording |
| 4.9 | Stack delete button | Red × button on stack to clear captured media |
| 4.10 | Capture sound plays | `camera.shutter` sound on photo capture |

---

## 5. Camera View — Agent-Driven Action Icon (Shutter Dynamic Icon)

| # | Check | Pass Criteria |
|---|-------|---------------|
| 5.1 | Default shutter is plain white | No icon when agent hasn't suggested action |
| 5.2 | Agent suggestion changes icon | `suggest_action` tool → shutter shows corresponding icon |
| 5.3 | Icon vocabulary correct | `search` → Search, `scan` → ScanLine, `create` → Sparkles, `shop` → ShoppingBag, `identify` → Eye, `translate` → Languages, `receipt` → Receipt |
| 5.4 | Icon color matches intent | Each intent has distinct color (blue, cyan, purple, yellow, emerald, indigo, orange) |
| 5.5 | Fallback to text detection | If no agent suggestion, falls back to `lastDetectedIntent` |
| 5.6 | Smooth icon transition | Icon changes animate smoothly, no flash/flicker |

---

## 6. Camera View — Done Button & Navigation

| # | Check | Pass Criteria |
|---|-------|---------------|
| 6.1 | No Done before capture | Right side shows empty spacer when `capturedMedia` is empty |
| 6.2 | Done appears after capture | Green checkmark (Check icon) animates in on right side |
| 6.3 | Done button has spring animation | `type: 'spring'` scale-in animation |
| 6.4 | Done click navigates to Session | Tapping Done transitions to Session view within 500ms |
| 6.5 | No double-click issue | Rapid double-tap doesn't trigger duplicate navigation |
| 6.6 | RPC message sent on Done | `[USER_DISPATCH]` message sent to agent via `sendMessage` |
| 6.7 | Sound plays on Done | `camera.shutter` + `session.enter` sounds play |
| 6.8 | Contextual green button (mic OFF) | When mic is OFF + photos taken, shutter becomes large green Done |
| 6.9 | Done disabled when disconnected | Button `disabled` when `connectionStatus !== 'CONNECTED'` |

---

## 7. Camera View — Action Card Overlay

| # | Check | Pass Criteria |
|---|-------|---------------|
| 7.1 | Action card appears on agent trigger | `rpcB2FShowActionCard` shows overlay at bottom |
| 7.2 | Card has title + options | Title text + clickable option buttons |
| 7.3 | Option click sends message | Clicking option sends text to agent via `sendMessage` |
| 7.4 | Dismiss button works | X button closes action card |
| 7.5 | Card has backdrop blur | `bg-neutral-900/90 backdrop-blur-xl` styling |

---

## 8. Camera View — Scanning Effect

| # | Check | Pass Criteria |
|---|-------|---------------|
| 8.1 | Scanning line triggers on intent | Green horizontal line sweeps vertically |
| 8.2 | Scanning completes cleanly | Animation finishes, line disappears |

---

## 9. Session View — Layout & Structure

| # | Check | Pass Criteria |
|---|-------|---------------|
| 9.1 | Header shows "Session" | Title centered, back arrow (←) on left |
| 9.2 | Captured media displayed | Photo/video thumbnails visible at top |
| 9.3 | Media count shown | "{N} items" subtitle |
| 9.4 | Four sections present | CONVERSATION, INTENTION, EXECUTION, (RESULT when available) |
| 9.5 | Sections are collapsible | Chevron toggle expands/collapses each section |
| 9.6 | Progressive reveal | Intention at ~600ms, Execution at ~1200ms |
| 9.7 | Gradient divider | Visible divider line between Intention and Execution |
| 9.8 | Follow-up input at bottom | Text input with "Follow up..." placeholder |
| 9.9 | Connection status bar | Same connected status as camera view |

---

## 10. Session View — CONVERSATION Section

| # | Check | Pass Criteria |
|---|-------|---------------|
| 10.1 | Agent avatar present | Purple gradient avatar icon |
| 10.2 | Summary text from agent | Shows `conversationSummary` from data channel OR fallback to `lastAgentText` |
| 10.3 | Text is readable | Proper font size, line height, contrast |
| 10.4 | Section expands/collapses | Tap header toggles content visibility |

---

## 11. Session View — INTENTION Section

| # | Check | Pass Criteria |
|---|-------|---------------|
| 11.1 | Intention text displayed | Shows `intentionPrompt` from data channel OR fallback |
| 11.2 | Styled as code/quote block | Monospace font, left border accent, dark bg |
| 11.3 | Italic formatting | Text rendered in italic style |
| 11.4 | Section expands/collapses | Tap header toggles content visibility |

---

## 12. Session View — EXECUTION Section (Terminal)

| # | Check | Pass Criteria |
|---|-------|---------------|
| 12.1 | Terminal header | macOS-style dots (red/yellow/green) + "openclaw" label |
| 12.2 | Copy button in header | Clipboard icon in terminal header |
| 12.3 | Terminal dark background | `bg-black/80` or similar dark terminal style |
| 12.4 | Status line present | "Aura is ready." or similar green status text |
| 12.5 | `$` prompt visible | Dollar-sign prompt prefix for commands |
| 12.6 | Streaming log entries | Gateway transcript entries appear in real-time |
| 12.7 | Blinking cursor | Animated cursor at end of active line |
| 12.8 | `✓ done` on completion | Green checkmark when gateway task completes |
| 12.9 | Auto-scroll | Terminal scrolls to bottom as new entries appear |
| 12.10 | Monospace font | All terminal content in monospace/code font |

---

## 13. Session View — RESULT Section

| # | Check | Pass Criteria |
|---|-------|---------------|
| 13.1 | Result appears after gateway completes | Section visible only when `activeResult` is set |
| 13.2 | RichResultDisplay renders | Markdown/HTML result displayed correctly |
| 13.3 | Images render | If result contains images, they load properly |
| 13.4 | Links are clickable | External links open correctly |
| 13.5 | Code blocks formatted | Syntax highlighting in code blocks |
| 13.6 | Workspace URLs resolved | `resolveWorkspaceUrl` converts relative paths |

---

## 14. Session View — Follow-up Input

| # | Check | Pass Criteria |
|---|-------|---------------|
| 14.1 | Input field visible | Text input at bottom with placeholder "Follow up..." |
| 14.2 | Can type text | Keyboard appears, text entered |
| 14.3 | Send button works | Sends follow-up message to agent |
| 14.4 | Input clears after send | Field resets after successful send |

---

## 15. Navigation — Round-trip Flow

| # | Check | Pass Criteria |
|---|-------|---------------|
| 15.1 | Camera → (capture) → Done → Session | Full forward flow completes without errors |
| 15.2 | Session → Back → Camera | Back button returns to camera view |
| 15.3 | Camera resumes after return | Video feed active, agent still connected |
| 15.4 | Multiple round-trips | Can repeat capture → session → back cycle without degradation |
| 15.5 | No memory leaks | No accumulating event listeners or DOM nodes across cycles |

---

## 16. Data Channel Communication

| # | Check | Pass Criteria |
|---|-------|---------------|
| 16.1 | `agent_transcript` topic | Card text updates from transcript messages |
| 16.2 | `agent_action` topic | Action suggestion parsed, shutter icon updates |
| 16.3 | `agent_summary` topic | Conversation summary received, shown in Session |
| 16.4 | `agent_intention` topic | Intention prompt received, shown in Session |
| 16.5 | `agent_result` topic | Gateway result received, shown in Session |
| 16.6 | `agent_info_bar` topic | Info bar messages parsed (used for card updates) |
| 16.7 | XML parsing robust | Malformed XML doesn't crash the app |

---

## 17. RPC Communication

| # | Check | Pass Criteria |
|---|-------|---------------|
| 17.1 | `rpcF2BSendMessage` | Frontend sends text to agent |
| 17.2 | `rpcB2FShowResult` | Agent sends result, Session view updates |
| 17.3 | `rpcB2FTakePhoto` | Agent requests photo, capture triggers |
| 17.4 | `rpcB2FSetChatText` | Agent sets card text directly |
| 17.5 | `rpcB2FShowActionCard` | Agent shows action card overlay |

---

## 18. Error Handling & Edge Cases

| # | Check | Pass Criteria |
|---|-------|---------------|
| 18.1 | Agent disconnects gracefully | Card shows "Reconnecting..." or similar, no crash |
| 18.2 | Camera permission denied | Graceful fallback, error message shown |
| 18.3 | Network interruption | Room reconnects automatically (LiveKit built-in) |
| 18.4 | Rapid button tapping | No duplicate actions, no crashes |
| 18.5 | Empty capture on Done | Done disabled when no photos captured |
| 18.6 | Console error-free | Zero `[PAGE_ERROR]` entries during normal flow |
| 18.7 | No unhandled promise rejections | All async operations have error handling |

---

## 19. Visual Polish & Animations

| # | Check | Pass Criteria |
|---|-------|---------------|
| 19.1 | Page transitions smooth | Framer Motion fade in/out between views |
| 19.2 | Button press feedback | `active:scale-95` on all interactive buttons |
| 19.3 | Capture flash animation | White flash on photo capture |
| 19.4 | Stack fly-in animation | Thumbnail flies to stack position |
| 19.5 | Done button spring-in | Spring animation on checkmark appearance |
| 19.6 | Section expand/collapse | Smooth height transition on toggle |
| 19.7 | Terminal streaming | Text appears character/line at a time |
| 19.8 | No layout shift | No unexpected content jumps during loading |

---

## 20. Performance

| # | Check | Pass Criteria |
|---|-------|---------------|
| 20.1 | Initial load < 3s | Time from navigation to video feed visible |
| 20.2 | Agent connection < 5s | Time from page load to agent ID in status |
| 20.3 | Photo capture < 200ms | Time from shutter tap to flash animation |
| 20.4 | Done → Session < 500ms | Time from Done tap to Session view rendered |
| 20.5 | Back → Camera < 500ms | Time from back tap to camera view restored |
| 20.6 | No frame drops during video | 30fps maintained during camera feed |
| 20.7 | Memory stable | No continuous growth over 5-minute session |

---

## QA Execution Template

```
Date: ____________________
Tester: __________________
Build: ___________________
Device/Viewport: _________

Section 0: [ ] Pass  [ ] Fail  Notes: ___________
Section 1: [ ] Pass  [ ] Fail  Notes: ___________
Section 2: [ ] Pass  [ ] Fail  Notes: ___________
Section 3: [ ] Pass  [ ] Fail  Notes: ___________
Section 4: [ ] Pass  [ ] Fail  Notes: ___________
Section 5: [ ] Pass  [ ] Fail  Notes: ___________
Section 6: [ ] Pass  [ ] Fail  Notes: ___________
Section 7: [ ] Pass  [ ] Fail  Notes: ___________
Section 8: [ ] Pass  [ ] Fail  Notes: ___________
Section 9: [ ] Pass  [ ] Fail  Notes: ___________
Section 10: [ ] Pass  [ ] Fail  Notes: ___________
Section 11: [ ] Pass  [ ] Fail  Notes: ___________
Section 12: [ ] Pass  [ ] Fail  Notes: ___________
Section 13: [ ] Pass  [ ] Fail  Notes: ___________
Section 14: [ ] Pass  [ ] Fail  Notes: ___________
Section 15: [ ] Pass  [ ] Fail  Notes: ___________
Section 16: [ ] Pass  [ ] Fail  Notes: ___________
Section 17: [ ] Pass  [ ] Fail  Notes: ___________
Section 18: [ ] Pass  [ ] Fail  Notes: ___________
Section 19: [ ] Pass  [ ] Fail  Notes: ___________
Section 20: [ ] Pass  [ ] Fail  Notes: ___________

Overall: [ ] PASS  [ ] FAIL
Blockers: _____________________________
Sign-off: _____________________________
```

---

## Automated QA Script (Playwright)

Key checks that can be automated via Playwright MCP:

```javascript
// 1. Load page with ignoreHTTPSErrors context
// 2. Verify: no elements matching '.backdrop-blur' with processing text
// 3. Verify: video element exists, videoWidth > 0, !paused
// 4. Verify: button count matches expected layout
// 5. Click shutter → verify media stack badge appears
// 6. Click Done → verify body text contains 'CONVERSATION', 'INTENTION', 'EXECUTION'
// 7. Click Back → verify video element restored
// 8. Check page errors === 0
```
