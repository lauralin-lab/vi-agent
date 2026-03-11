# VI Agent — Milestone Roadmap

> **Last Updated:** 2026-03-11
>
> **Product Vision:** product_v2.md (Two Worlds: Camera + Session Canvas)
>
> **Technical Architecture:** system_v5.md + system_v5.2.md (Card Template + Experience Package)
>
> **Infrastructure:** infrastructure-v1.md

---

## Overview

```
V0.1 ──→ V0.1.1 ──→ V0.1.2 ──→ V0.2 ──→ V0.3 ──→ V0.4 ──→ V1.0
 │          │          │         │        │        │        │
Camera     Card       Package   Session  记忆     Infra    Production
Pipeline   System     MVP       Canvas   个性化   安全      Ready
(current)
```

每个 milestone 是一个可交付的产品增量。Exit criteria 是用户可感知的能力，不是内部指标。

进度查看: `gh issue list --milestone "{milestone name}"`

### 废弃的旧 Milestone

以下 GitHub Milestone 已废弃（基于旧的 V3→V4 迁移叙事，不再反映产品方向）：

| 旧 Milestone | 状态 | 处理 |
|---|---|---|
| V0.2 — V4 合并与基础验证 | 废弃 | 关闭，issues 重新归类 |
| V0.3 — 集成验证 + Skill/意图系统 | 废弃 | 关闭，issues 重新归类 |
| V0.4 — 视频处理 + OAuth + 测试覆盖 | 废弃 | 关闭，issues 重新归类 |
| V1.0 — 完整 V4 发布 | 废弃 | 关闭，重新定义为新 V1.0 |

---

## M0: V0.1 — AI Camera Pipeline 全链路验证

> **GitHub Milestone**: `V0.1 — AI Camera Pipeline 全链路验证`
>
> **状态**: In Progress (31 closed / 24 open)

### 目标

Camera → Voice → AI Processing → Results → Retrieve 全链路跑通。证明 "AI Camera" 基本可用。

### 测试矩阵

| # | 场景 | 通过标准 |
|---|------|---------|
| 1 | 拍苹果→卡路里卡片 | 名称+热量±30%+卡片美观+语音+retrieve |
| 2 | 拍龟背竹→植物探测卡片 | 名称+毒性警告+养护三要素+语音+retrieve |
| 3 | 拍手绘登录页→可交互 demo | 布局≥60%+按钮可点击+输入框+语音+retrieve |

### Quality Gate

- 性能: T1≤3s T2≤8s T3 无白屏 T4≤1.5s T5≤2s T6≤2s
- 能耗: E1≤50K tokens E2≤15s E3≤$0.05 E4 CPU≤15%
- 稳定性: S1≥85% S2≥3 次 S3≥2 轮 S4 优雅失败

### Exit Criteria

- 3 项测试矩阵全部通过
- Quality Gate 全部达标
- QA 验收通过 → `git tag v0.1.0`

### 产品价值

证明 "AI Camera" 基本可用——拍照→语音→处理→结果→检索

---

## M1: V0.1.1 — Card Template System

> **预计 Mission Contracts**: ~6-8

### 目标

Card Template Protocol (system_v5.md §3-4) 完整实现。AI 输出从原始文本升级为结构化、可交互的 Card。

### 关键交付

| # | 任务 | Domain |
|---|------|--------|
| 1 | Card Template Protocol: `create_card`, `stream_to_card`, `finalize_card` | nanoclaw + frontend |
| 2 | 10 个 P0/P1 核心模板 (product_v2.md §8.1) | frontend |
| 3 | `_shared/` 共享模板目录 + 模板注册机制 | nanoclaw |
| 4 | Card streaming: pulsing border, typewriter text, progressive reveal | frontend |
| 5 | Living cards: `update_card`, `append_to_card`, `card_action` | nanoclaw + frontend |
| 6 | Card 持久化: session 保存 + History 回放 | api-server + frontend |

### Exit Criteria

- NanoClaw 通过 `create_card` → `stream_to_card` → `finalize_card` 输出结构化 Card
- 10 个核心模板可渲染: thinking-process, image-analysis, nutrition-card, hero-image, plant-animal-id, comparison-table, step-guide, shopping-list, map-pins, conversation
- Card 支持 streaming 状态 + living update
- Session 完成后 Card 可在 History 中回放

### 产品价值

AI 输出从 "文本块" 变为 "结构化认知卡片"。用户看到的不是一堆文字，而是分门别类的分析、图表、清单。

---

## M2: V0.1.2 — Experience Package MVP

> **预计 Mission Contracts**: ~5-7

### 目标

Experience Package (system_v5.2.md §1-2) 端到端跑通。Skill + Templates + Tools 打包为完整用户体验。

### 关键交付

| # | 任务 | Domain |
|---|------|--------|
| 1 | Package 目录结构规范: `manifest.json` + `skill.md` + `templates/` + `tools/` | nanoclaw |
| 2 | Package 加载器: 发现、注册、选择 Package | nanoclaw |
| 3 | `nutrition-analyzer` Package 端到端 | nanoclaw + frontend |
| 4 | `plant-identifier` Package 端到端 | nanoclaw + frontend |
| 5 | `sketch-to-ui` Package 端到端 | nanoclaw + frontend |
| 6 | Package 测试沙盒 (playground) | frontend |

### Exit Criteria

- 3 个预装 Package 可触发并输出对应 Card 流
- Package manifest 定义完整: 触发条件、模板列表、工具声明
- Playground 可独立浏览和测试 Package 输出

### 产品价值

Growth team 可以不改核心代码，通过编写 `skill.md` + 配置模板，独立交付新的 AI 使用场景。

---

## M3: V0.2 — Session Canvas 体验

> **预计 Mission Contracts**: ~6-8

### 目标

product_v2.md §2-3 的核心体验: Camera → Session 过渡 + Session Canvas + Voice 连续性。

### 关键交付

| # | 任务 | Domain |
|---|------|--------|
| 1 | Camera → Session 过渡动画 (Camera shrink + Canvas slide-up, 400ms spring) | frontend + app |
| 2 | Camera PiP (120×160, draggable, tap to expand, double-tap to full) | frontend + app |
| 3 | Session Canvas waterfall 布局 (card flow: think → perceive → act → interact) | frontend |
| 4 | Voice 连续性: Camera→Session 过渡中 mic 不中断 | realtime + frontend |
| 5 | Session lifecycle: active → complete → history (product_v2.md §6) | api-server + frontend |
| 6 | Intention Card 触发 Session: 点击 → 自动进入 Session + 执行 | frontend + nanoclaw |
| 7 | Follow-up: Session 中语音追问 → 新 Card 流入 | realtime + nanoclaw + frontend |

### Exit Criteria

- Camera → Session 过渡动画流畅 (无白屏, 首张 Card ≤2s 可见)
- PiP Camera 可拖拽、点击展开、双击回 Camera
- Session 中语音追问可触发新 Card
- Session 历史可回看

### 产品价值

产品核心体验完成: "我给 AI 看我的世界 (Camera), AI 给我看它的世界 (Session Canvas)"。两个世界的流畅切换。

---

## M4: V0.3 — 记忆 + 个性化

> **预计 Mission Contracts**: ~5-6

### 目标

AI 跨会话记住用户 (system_v5.md §8 Memory)。从 "每次重新开始" 到 "持续成长的 AI 伙伴"。

### 关键交付

| # | 任务 | Domain |
|---|------|--------|
| 1 | 统一双记忆系统 (LiveKit + API Server → 单一记忆存储) | api-server + realtime |
| 2 | 三层记忆: Identity (who) + Semantic (what you like) + Episodic (what happened) | api-server |
| 3 | 记忆写入: Session 结束时自动提炼关键信息 | nanoclaw |
| 4 | 记忆读取: 新 Session 开始时注入相关记忆到 AI context | nanoclaw + realtime |
| 5 | 用户可查看和编辑记忆 ("What do you know about me?") | frontend |

### Exit Criteria

- 第二次拍同类食物时，AI 记得用户的饮食偏好
- 用户可在设置中查看 AI 记住的内容
- 记忆不跨用户泄漏

### 产品价值

AI 从 "工具" 变为 "伙伴"。它记得你不吃辣、你养了一条金毛、你上次分析过类似的东西。

---

## M5: V0.4 — 基础设施安全 + Dev 体验

> **前置**: infrastructure-v1.md Phase 0 + Phase 1
>
> **预计 Mission Contracts**: ~8-10

### 目标

修复安全漏洞, Terraform 统一管理基础设施, Dev 环境现代化。

### 关键交付

**安全加固 (infrastructure-v1.md §2.4)**

| # | 任务 | 紧急度 |
|---|------|--------|
| 1 | 轮换所有已泄露 API keys + `git filter-repo` 清除 `.env` 历史 | 🔴 |
| 2 | docker-compose: postgres/redis 端口绑 127.0.0.1 | 🔴 |
| 3 | SSH: 启用 OS Login, 移除硬编码 SSH keys | 🟡 |
| 4 | Secrets: GitHub Environment Secrets 替代 SCP | 🟡 |

**Terraform (infrastructure-v1.md §2.2-2.3)**

| # | 任务 |
|---|------|
| 5 | 创建 GCS remote state bucket |
| 6 | 编写 `infra/` Terraform 代码, import 现有 3 台 VM |
| 7 | 添加 Terraform 防火墙规则 |
| 8 | `.github/workflows/infra.yml` |

**Dev 环境 (infrastructure-v1.md §3)**

| # | 任务 |
|---|------|
| 9 | `deploy-dev.yml` GitHub Actions workflow |
| 10 | `/dev` skill 重设计 (触发器模式) |

### Exit Criteria

- 零 CRITICAL 安全漏洞
- `terraform plan` 在 CI 上自动运行
- 新人 `/dev` 零配置即可部署 dev 实例
- Staging 环境可自动部署

### 产品价值

安全基线达标, 团队开发效率提升, 为接入真实用户做好基础设施准备。

---

## M6: V0.5 — 可观测性 + 质量保障

> **预计 Mission Contracts**: ~5-7

### 目标

生产前最后一道关: 监控、测试覆盖、性能验证。

### 关键交付

| # | 任务 | Domain |
|---|------|--------|
| 1 | 日志统一: 结构化日志 + Cloud Logging | global |
| 2 | 关键路径 tracing: Camera → NanoClaw → Card 渲染 | global |
| 3 | 基础指标: API 延迟, NanoClaw 执行时间, token 用量 | api-server + nanoclaw |
| 4 | 用量计费基础: 按用户 token 消耗统计 | api-server |
| 5 | 关键路径测试覆盖: NanoClaw executor, API auth, realtime agent | nanoclaw + api-server + realtime |
| 6 | E2E 测试: 3 个核心 Use Case 自动化 | global |

### Exit Criteria

- 线上问题可通过日志 + trace 定位
- Token 用量可按用户统计
- 核心路径有测试覆盖, CI 自动运行
- 3 个 Use Case E2E 测试通过

### 产品价值

从 "能跑" 到 "可运维"。出了问题知道在哪, 花了多少钱看得见。

---

## M7: V1.0 — 生产发布

> **前置**: V0.1 — V0.5 全部完成
>
> **预计 Mission Contracts**: ~5-6

### 目标

首次面向真实用户发布。

### 关键交付

| # | 任务 |
|---|------|
| 1 | Prod 环境首次部署 + SSL + 域名 |
| 2 | 全面 QA: 3 个测试矩阵场景 + Quality Gate |
| 3 | 移动端 App 发布准备 (Flutter WebView 验证) |
| 4 | 用户反馈通道 (基础) |
| 5 | 文档更新: 用户指南, API 文档 |

### Exit Criteria

- Prod 环境稳定运行 72 小时无 crash
- 3 个核心场景 QA 通过
- App 可安装并正常使用
- `git tag v1.0.0`

### 产品价值

"Video Call with Your AI" 正式上线。

---

## Team Domain Matrix

| Milestone | 预计 MCs | 核心 Domain |
|---|---|---|
| V0.1 Camera Pipeline | ~55 (31 done) | global |
| V0.1.1 Card System | ~6-8 | nanoclaw + frontend |
| V0.1.2 Package MVP | ~5-7 | nanoclaw + frontend |
| V0.2 Session Canvas | ~6-8 | frontend + app + realtime |
| V0.3 记忆 + 个性化 | ~5-6 | api-server + nanoclaw |
| V0.4 Infra 安全 | ~8-10 | infra |
| V0.5 可观测性 | ~5-7 | global |
| V1.0 生产发布 | ~5-6 | global |

**总计**: ~47-60 MCs (V0.1 之后)

---

*VI Agent Milestone Roadmap | 2026-03-11 | Rewritten — product-driven, granular milestones*
