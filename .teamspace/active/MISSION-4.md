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

## Sub-tasks---
issue: 4
url: https://github.com/flair-home-stylist/vi_agent/issues/4
title: "fix: GCS presign 签名失败 — Compute Engine 凭据无私钥"
assignee: lysfighting
priority: P1
labels: [bug, mission-contract, priority:P1]
branch: fix/4-gcs-presign-signing
milestone: none
version: "V0.1"
claimed: 2026-03-03T00:00:00+08:00
---

# MISSION-4: fix: GCS presign 签名失败 — Compute Engine 凭据无私钥

## Objective

修复 GCS signed URL 生成在 GCE 环境下的失败问题。API 服务器使用 Compute Engine 默认凭据（无私钥），
需要改用 IAM signBlob API 来生成签名 URL，而不是依赖本地私钥签名。

## Sub-tasks

- [ ] 在 `gcs_service.py` 新增 `get_signing_kwargs()` — 检测 Compute Engine 凭据，返回 IAM signBlob 所需参数
- [ ] 更新 `upload.py` 的 `generate_signed_url()` 调用，传入 signing kwargs
- [ ] 更新 `internal.py` 的 `presign_get_urls` 端点，传入 signing kwargs
- [ ] 部署到 dev 环境验证 presign 端点正常工作
- [ ] 确认前端拍照上传流程端到端可用

## Acceptance Criteria

- `/api/upload/presign` 端点在 GCE 环境下正常返回签名 URL
- `/internal/storage/presign-get` 端点在 GCE 环境下正常返回签名 URL
- 本地开发环境（有 SA key file）行为不受影响
- 前端拍照上传流程端到端验证通过

## Context Files

- `api-server/app/services/gcs_service.py` — GCS 客户端和 bucket 配置（核心修改）
- `api-server/app/routes/upload.py` — 前端上传 presign 端点
- `api-server/app/routes/internal.py` — 内部 presign-get 端点（line 453-490）
- `frontend/src/services/api.js` — 前端调用 presign 的客户端代码
- `api-server/requirements.txt` — Python 依赖（google-cloud-storage, google-auth）

## Test Command

```bash
# 在 GCE 环境中测试
curl -sk 'https://34.172.9.61:<PORT>/api/upload/presign?ext=jpg&vi_user_id=vi-test' \
  -H 'Content-Type: application/json'
```

## AI Notes

(populated during /team-drive execution)


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
