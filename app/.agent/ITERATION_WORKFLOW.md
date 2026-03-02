# Feature 迭代工作流

> 适用阶段：app 核心架构稳定，进入持续 feature 迭代期

---

## 概览

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌──────────┐
│  1. 设计稿   │ ──> │  2. 需求对齐  │ ──> │  3. AI 实现   │ ──> │ 4. 验收  │
│  (JSX 原型)  │     │  (对话确认)   │     │  (Flutter)   │     │ (真机)   │
└─────────────┘     └─────────────┘     └─────────────┘     └──────────┘
```

核心原则：**JSX 原型即设计稿**，不依赖 Figma。AI 直接读取 JSX 源码翻译为 Flutter。

---

## 1. 准备设计稿

### 1.1 设计稿位置

```
.agent/design/reference-design/src/
├── components/          ← 页面/组件 JSX
│   ├── HistoryView.jsx
│   ├── SessionView.jsx
│   ├── CameraView.jsx
│   ├── ProfileView.jsx
│   └── ...
└── data/                ← mock 数据
    ├── useCaseData.jsx
    └── ...
```

### 1.2 新功能的设计稿准备

根据改动范围选择方式：

| 场景 | 做法 |
|------|------|
| **新增页面** | 在 `components/` 新建 `XxxView.jsx`，在 `App.jsx` 加路由 |
| **修改已有页面** | 直接改对应 JSX 文件 |
| **新增数据结构** | 在 `data/` 新增或修改数据文件 |
| **纯样式调整** | 直接改 JSX 中的 Tailwind class |

### 1.3 验证原型

```bash
cd .agent/design/reference-design && npm install && npm run dev
```

浏览器打开确认效果正确后，再交给 AI 实现。

---

## 2. 发起迭代

> **快捷方式**：直接使用 `/new-iteration` 命令，AI 会自动执行以下全部步骤。

### 2.1 最小对话模板

```
/new-iteration
实现 [组件名/功能名]
设计稿：.agent/design/reference-design/src/components/XxxView.jsx
```

AI 会自动：
1. 读取 JSX 源码 + Tailwind 样式
2. 读取关联的 data 文件
3. 参考已有 Flutter 实现风格
4. 生成 Flutter 代码

### 2.2 带 API 的功能

```
实现 [功能名]

设计稿：.agent/design/reference-design/src/components/XxxView.jsx
API：[粘贴接口文档 / 放入 .agent/api/endpoints/xxx.md]
```

### 2.3 局部修改

```
修改 [页面名] 的 [区域]

参考设计稿变更：.agent/design/reference-design/src/components/XxxView.jsx
改动点：[描述具体变化]
```

---

## 3. AI 实现映射规则

### 3.1 JSX → Flutter 对应表

| JSX (React + Tailwind) | Flutter |
|------------------------|---------|
| 组件文件 `XxxView.jsx` | `lib/modules/pages/xxx/` 目录 |
| `useState` / `useEffect` | `ConsumerStatefulWidget` + Riverpod |
| `motion.div` (framer-motion) | `AnimatedContainer` / `FadeSlide` |
| `className="bg-black/50 backdrop-blur"` | `BackdropFilter` + `Colors.black.withOpacity(0.5)` |
| `className="rounded-2xl border border-white/10"` | `BoxDecoration(borderRadius, border)` |
| Tailwind spacing `p-4 gap-3` | `EdgeInsets` + `Gap` |
| `data/*.jsx` 中的 mock 数据 | `lib/design/data/` 或实际 API model |
| `onClick` / `onTap` | `GestureDetector` / `InkWell` |
| 条件渲染 `{show && <Xxx/>}` | `if (show) Xxx()` 或 `Visibility` |
| `map()` 列表渲染 | `ListView.builder` / `.map().toList()` |

### 3.2 项目代码结构映射

```
JSX 组件                          Flutter 实现
─────────────────────            ─────────────────────
components/HistoryView.jsx   →   lib/modules/pages/home/
components/SessionView.jsx   →   lib/modules/pages/session/
components/CameraView.jsx    →   lib/modules/pages/home/ (camera mode)
components/ProfileView.jsx   →   lib/modules/pages/memory/
components/OnboardingView.jsx →  lib/modules/pages/onboarding/
```

### 3.3 样式 token 速查

| Tailwind / JSX | Flutter | 说明 |
|----------------|---------|------|
| `bg-[#0A0A0A]` | `Color(0xFF0A0A0A)` | 主背景 |
| `text-white/85` | `Colors.white.withValues(alpha: 0.85)` | 主文字 |
| `text-white/50` | `Colors.white.withValues(alpha: 0.5)` | 次文字 |
| `text-white/30` | `Colors.white.withValues(alpha: 0.3)` | 弱文字 |
| `bg-black/35 backdrop-blur-xl` | `BackdropFilter(blur(20)) + black/0.35` | 玻璃态 |
| `border-white/12` | `Border(color: Colors.white.withValues(alpha: 0.12))` | 边框 |
| `text-green-400` | `Color(0xFF4ADE80)` | 绿色标签 |
| `text-amber-400` | `Color(0xFFFBBF24)` | 琥珀标签 |
| `text-blue-400` | `Color(0xFF60A5FA)` | 蓝色标签 |
| `text-purple-400` | `Color(0xFFA78BFA)` | 紫色标签 |

---

## 4. 文件组织规范

### 4.1 新 feature 文件结构

```
lib/modules/pages/[feature_name]/
├── [feature_name]_page.dart        # 页面入口（逻辑 + 生命周期）
├── [feature_name]_page.ui.dart     # 纯 UI（可选，复杂页面才拆）
├── widgets/                        # 页面级组件
│   └── xxx_card.dart
├── model/                          # 页面级数据模型
│   └── xxx_model.dart
└── provider/                       # 页面级状态管理
    └── xxx_provider.dart
```

### 4.2 改动后必做

```bash
# 涉及 @JsonSerializable / @riverpod / @TypedGoRoute 注解时
flutter pub run build_runner build --delete-conflicting-outputs
```

---

## 5. 迭代 checklist

每次 feature 交付前过一遍：

- [ ] JSX 原型已验证（浏览器看过效果）
- [ ] Flutter 实现与 JSX 视觉一致
- [ ] 页面路由已注册
- [ ] build_runner 已执行（如涉及注解）
- [ ] 真机运行无崩溃
- [ ] 暗色主题下文字/图标可读性 OK

---

## 6. 常见迭代场景速查

### 场景 A：新增整页

```
1. 写 JSX 原型 → components/NewPage.jsx
2. 浏览器验证
3. 告诉 AI：
   "实现 NewPage，设计稿：.agent/design/reference-design/src/components/NewPage.jsx"
4. AI 生成 → lib/modules/pages/new_page/
5. 添加路由 → build_runner → 真机验证
```

### 场景 B：改已有页面某个区域

```
1. 改 JSX 原型中对应部分
2. 告诉 AI：
   "HistoryView 的 promo 区域改了，对照新的 JSX 更新 Flutter 实现"
3. AI diff JSX 变更 → 定位 Flutter 代码 → 同步修改
```

### 场景 C：加 API 对接（替换 mock 数据）

```
1. 提供 API 文档（粘贴或放 .agent/api/endpoints/xxx.md）
2. 告诉 AI：
   "用真实 API 替换 SessionView 的 mock 数据"
3. AI 生成 Model + Provider + 网络请求，替换硬编码数据
```

### 场景 D：纯样式微调

```
直接描述：
"SessionView 的卡片圆角改成 16，间距从 12 改成 16"
不需要改 JSX，AI 直接改 Flutter 代码
```

---

## 附：.agent 目录结构

```
.agent/
├── ITERATION_WORKFLOW.md       ← 本文档（迭代主流程）
├── AI_GUIDE.md                 ← 快速入门（给新人看）
├── design/
│   ├── DESIGN_SYSTEM.md        ← 设计 token（颜色/字体/间距）
│   ├── interactions.md         ← 交互规范（转场/动画/手势）
│   └── reference-design/       ← JSX 设计原型（唯一设计源）
│       └── src/
├── api/endpoints/              ← API 接口文档
├── specs/features/             ← PRD 需求文档（可选）
├── templates/                  ← 代码模板（page/model/provider）
├── skills/                     ← 自动化技能（TestFlight 部署等）
└── workflows/                  ← 子流程（add-page/add-api 等）
```
