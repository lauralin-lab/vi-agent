#!/usr/bin/env bash
# migrate-board-to-issues.sh — Migrate tasks from board.md to GitHub Issues
#
# Usage: ./scripts/migrate-board-to-issues.sh
#
# Prerequisites:
#   1. gh auth login (with repo write access)
#   2. Labels created via ./scripts/setup-github-labels.sh

set -euo pipefail

echo "📋 Migrating board.md tasks to GitHub Issues..."
echo ""

# Check gh auth
if ! gh auth status &>/dev/null; then
  echo "❌ gh CLI not authenticated. Run: gh auth login"
  exit 1
fi

# Check repo access
if ! gh repo view --json name &>/dev/null; then
  echo "❌ Cannot access repo. Check permissions."
  exit 1
fi

# Helper: create issue with labels
create_mc() {
  local title="$1"
  local priority="$2"
  local size="$3"
  local domain="$4"
  local version="$5"
  local body="$6"
  local extra_labels="${7:-}"
  local state="${8:-open}"

  local labels="mission,status:wip,priority:${priority},size:${size}"
  [ -n "$domain" ] && labels="${labels},domain:${domain}"
  [ -n "$version" ] && labels="${labels},version:${version}"
  [ -n "$extra_labels" ] && labels="${labels},${extra_labels}"

  if [ "$state" = "closed" ]; then
    labels=$(echo "$labels" | sed 's/status:queued/status:done/')
  fi

  local issue_url
  issue_url=$(gh issue create \
    --title "$title" \
    --body "$body" \
    --label "$labels" \
    2>&1) || {
    echo "  ❌ Failed: $title"
    return 1
  }

  if [ "$state" = "closed" ]; then
    local issue_num
    issue_num=$(echo "$issue_url" | grep -o '[0-9]*$')
    gh issue close "$issue_num" --reason completed 2>/dev/null || true
  fi

  echo "  ✅ $title → $issue_url"
}

echo "── V0.1 Queued Tasks (P0) ──"

create_mc "[T-056] UC-1: Food calorie card full pipeline" "P0" "L" "global" "v0.1" \
"## Mission Contract

### Success Criteria
- [ ] 拍照识别食物名称准确率 >= 90%
- [ ] Photo-to-card 渲染时间 <= 8s
- [ ] 卡片信息完整（食物名、热量、营养素）
- [ ] 端到端流程可复现

### Sub-tasks
- [ ] Camera capture → API upload
- [ ] Food recognition (Gemini)
- [ ] Calorie data retrieval
- [ ] Card template rendering
- [ ] Voice narration of results

### Context
V0.1 Use Case 1. See: .claude/drive/v0.1-definition/v0.1-spec.md

### Verification
Run the full pipeline: photo → recognition → card display"

create_mc "[T-057] UC-2: Plant detection card full pipeline" "P0" "L" "global" "v0.1" \
"## Mission Contract

### Success Criteria
- [ ] 植物识别准确率 >= 85%
- [ ] Photo-to-card 渲染时间 <= 8s
- [ ] 卡片信息完整（植物名、科属、养护建议）

### Sub-tasks
- [ ] Camera capture → API upload
- [ ] Plant recognition (Gemini)
- [ ] Plant info retrieval
- [ ] Card template rendering
- [ ] Voice narration

### Context
V0.1 Use Case 2. See: .claude/drive/v0.1-definition/v0.1-spec.md

### Verification
Run the full pipeline: photo → recognition → card display"

create_mc "[T-058] UC-3a: Hand-drawn UI to interactive demo" "P0" "L" "gateway" "v0.1" \
"## Mission Contract

### Success Criteria
- [ ] 手绘线框图识别并转换为 HTML/CSS
- [ ] UI 还原度 >= 60%
- [ ] 生成的 demo 可交互

### Sub-tasks
- [ ] Image capture of hand-drawn wireframe
- [ ] Wireframe recognition and parsing
- [ ] HTML/CSS generation via template system
- [ ] Interactive demo rendering

### Context
V0.1 Use Case 3a. See: .claude/drive/v0.1-definition/v0.1-spec.md"

create_mc "[T-059] UC-3b: Hand-drawn mind map to visualization" "P0" "L" "gateway" "v0.1" \
"## Mission Contract

### Success Criteria
- [ ] 手绘思维导图识别并转换为结构化数据
- [ ] 可视化渲染（树形/放射状）
- [ ] 节点文字识别准确率 >= 80%

### Sub-tasks
- [ ] Image capture of hand-drawn mind map
- [ ] Structure recognition and parsing
- [ ] Visualization rendering (D3/SVG)

### Context
V0.1 Use Case 3b. See: .claude/drive/v0.1-definition/v0.1-spec.md"

create_mc "[T-060] Core loop performance targets" "P0" "M" "global" "v0.1" \
"## Mission Contract

### Success Criteria
- [ ] App open → first AI voice <= 3s
- [ ] Photo → card rendering <= 8s
- [ ] Voice response latency <= 2s

### Sub-tasks
- [ ] Benchmark current latencies
- [ ] Identify bottlenecks
- [ ] Optimize critical path
- [ ] Verify all targets met

### Context
V0.1 quality gates. See: .claude/drive/v0.1-definition/v0.1-spec.md"

echo ""
echo "── V0.1 Queued Tasks (P1) ──"

create_mc "[T-061] Energy consumption targets" "P1" "M" "global" "v0.1" \
"## Mission Contract

### Success Criteria
- [ ] <= 50K tokens per session
- [ ] <= \$0.05 per session cost
- [ ] Token usage tracking in place

### Context
V0.1 energy quality gates."

create_mc "[T-062] Stability targets" "P1" "M" "global" "v0.1" \
"## Mission Contract

### Success Criteria
- [ ] >= 85% session success rate
- [ ] >= 3 consecutive sessions without refresh needed
- [ ] Error recovery mechanism in place

### Context
V0.1 stability quality gates."

create_mc "[T-063] V0.1 QA verification" "P0" "M" "global" "v0.1" \
"## Mission Contract

### Success Criteria
- [ ] All 3 use case test scenarios pass
- [ ] All quality gate metrics verified
- [ ] QA report generated

### Sub-tasks
- [ ] Run UC-1 test scenario
- [ ] Run UC-2 test scenario
- [ ] Run UC-3a/3b test scenarios
- [ ] Compile QA report

### Context
Final QA gate for V0.1 release."

echo ""
echo "── Infrastructure Tasks (P2) ──"

create_mc "[T-050] GitHub Actions CI pipeline" "P2" "M" "infra" "" \
"## Mission Contract

### Success Criteria
- [ ] CI runs on all PRs
- [ ] All 4 services checked (api-server, frontend, gateway, realtime)
- [ ] CI summary gates on all checks

### Context
Infrastructure task — CI/CD setup."

create_mc "[T-051] Frontend test infrastructure" "P2" "M" "frontend" "" \
"## Mission Contract

### Success Criteria
- [ ] Vitest or similar test runner configured
- [ ] At least 1 component test written
- [ ] Tests run in CI

### Context
Frontend currently has no automated tests."

create_mc "[T-052] Gateway test infrastructure" "P2" "M" "gateway" "" \
"## Mission Contract

### Success Criteria
- [ ] Test runner configured (Jest/Vitest)
- [ ] At least 1 unit test for executor
- [ ] Tests run in CI

### Context
Gateway currently has no automated tests."

echo ""
echo "── Backlog Tasks (P2-P3) ──"

create_mc "[T-053] Alembic migration setup" "P2" "S" "api-server" "" \
"## Mission Contract

### Success Criteria
- [ ] Alembic configured for api-server
- [ ] Initial migration generated
- [ ] Migration runs successfully

### Context
Database migration infrastructure."

create_mc "[T-054] ESLint + Prettier for gateway" "P3" "S" "gateway" "" \
"## Mission Contract

### Success Criteria
- [ ] ESLint configured with TypeScript rules
- [ ] Prettier configured
- [ ] Lint passes in CI

### Context
Code quality tooling for gateway service."

create_mc "[T-055] Full-stack smoke test script" "P3" "M" "global" "" \
"## Mission Contract

### Success Criteria
- [ ] Script that starts all 4 services and verifies basic health
- [ ] Health check endpoints tested
- [ ] Can be run locally and in CI

### Context
End-to-end smoke test for the full stack."

echo ""
echo "── Done Tasks (closed) ──"

create_mc "[T-048] Project README and onboarding docs" "P2" "M" "global" "" \
"Completed: Comprehensive README, SETUP.md, CONTRIBUTING.md" "" "closed"

create_mc "[T-049] Claude Code skill system setup" "P2" "M" "infra" "" \
"Completed: Skills, hooks, sounds, messaging, install.sh" "" "closed"

echo ""
echo "🎉 Migration complete!"
echo ""
echo "Run: /team   to view the dashboard"
