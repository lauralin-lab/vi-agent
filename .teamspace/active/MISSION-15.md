---
issue: 15
url: https://github.com/flair-home-stylist/vi_agent/issues/15
title: "fix(frontend): LiveSessionView header scroll behavior and input box issues"
assignee: xxLe
priority: P1
labels: [mission-contract, priority:P1, status:wip, domain:frontend, size:M]
branch: mission/15-livesessionview-header-scroll-xxLe
milestone: none
version: "V0.1"
claimed: 2026-03-03T00:00:00+08:00
issue_content_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
---

# MISSION-15: fix(frontend): LiveSessionView header scroll behavior and input box issues

## Objective

Fix the LiveSessionView component so that the header stays fixed/sticky during content scroll, and the input box remains visible and usable when the mobile keyboard is open. Ensure smooth scroll behavior on iOS Safari and Android Chrome with proper safe-area handling.

## Sub-tasks

- [x] Investigate and reproduce header scroll issues (does it scroll away? overlap content?)
- [x] Fix header positioning — ensure sticky/fixed behavior during canvas scroll
- [x] Fix input box keyboard avoidance — handle `visualViewport` resize or `focusin` events
- [x] Test on iOS Safari (keyboard push-up behavior) and Android Chrome
- [x] Ensure ConversationPill z-index doesn't conflict with input bar

## Acceptance Criteria

- Header stays fixed/sticky during content scroll, with proper z-index and background
- Input box remains visible and usable when mobile keyboard is open
- No visual overlap between header, canvas content, and input bar
- Smooth scroll experience without layout jumps on iOS Safari and Android Chrome
- safe-area-inset properly respected for both header and input on notched devices

## Context Files

- `frontend/src/components/LiveSessionView.jsx` — **main target**: header (line ~1154), input bar (line ~1322), scroll container (line ~1251)
- `frontend/src/index.css` — `.safe-area-top` class definition (line 75), dynamic viewport height (line 70)
- `frontend/src/components/LiveCameraView.jsx` — preceding view in navigation flow
- `frontend/src/App.jsx` — routing and layout context
- `frontend/src/hooks/useAgentProtocol.js` — references safe-area utilities
- `frontend/vite.config.js` — build configuration
- `frontend/tailwind.config.js` or `postcss.config.js` — Tailwind/PostCSS setup (if exists)

## Test Command

```bash
# Build and verify no errors
cd frontend && npm run build

# Manual testing checklist:
# 1. Open LiveSessionView on iOS Safari — scroll canvas content, verify header stays visible
# 2. Tap input box — verify keyboard doesn't hide the input
# 3. Type and send a message — verify input resets properly
# 4. Scroll aggressively — verify no layout jumps or header disappearing
# 5. Test on Android Chrome — same checks
```

## AI Notes

(populated during /team-drive execution)
