---
name: new-iteration
description: 新迭代来了！根据 JSX 原型变更驱动 Flutter 实现
user_invocable: true
---

# 新迭代

根据 JSX 原型的变更，自动分析差异并翻译为 Flutter 实现。

## 输入

用户应提供以下信息（至少一项）：

| 输入 | 格式 | 示例 |
|------|------|------|
| **迭代内容** | 自然语言描述 | "新增 SettingsView 页面" / "SessionView 增加评论区" |
| **JSX 文件** | 组件路径 | `.agent/design/reference-design/src/components/XxxView.jsx` |
| **API 文档** | MD 或粘贴 | `.agent/api/endpoints/xxx.md` |

如果用户只说了功能名，根据名称去 `components/` 下找对应 JSX 文件。

## 执行流程

### Phase 1: 分析设计变更

1. **读取 JSX 原型**
   - 读取用户指定的 JSX 文件（或根据功能名推断）
   - 路径：`.agent/design/reference-design/src/components/`
   - 同时读取关联的 data 文件：`.agent/design/reference-design/src/data/`

2. **读取设计规范**
   - `.agent/design/DESIGN_SYSTEM.md` — 颜色/字体/间距 token
   - `.agent/design/interactions.md` — 交互/动画/转场规范

3. **定位 Flutter 对应代码**
   - 根据映射关系找到 Flutter 侧的文件：

   | JSX 组件 | Flutter 目录 |
   |----------|-------------|
   | `HistoryView.jsx` | `lib/modules/pages/home/` |
   | `SessionView.jsx` | `lib/modules/pages/session/` |
   | `CameraView.jsx` | `lib/modules/pages/home/` (camera mode) |
   | `ProfileView.jsx` | `lib/modules/pages/memory/` |
   | `OnboardingView.jsx` | `lib/modules/pages/onboarding/` |
   | `GalleryView.jsx` | `lib/modules/pages/gallery/` |
   | 新组件 | 新建 `lib/modules/pages/[name]/` |

4. **输出分析摘要**（给用户确认后再动手）：
   ```
   ## 迭代分析

   **变更范围**：[新增页面 / 修改已有页面 / 新增组件]
   **JSX 源文件**：[路径]
   **Flutter 目标**：[路径]
   **涉及文件**：
   - [ ] 新建/修改：xxx
   - [ ] 新建/修改：yyy
   **需要 API 对接**：是/否
   **需要 build_runner**：是/否
   ```

### Phase 2: 实现

根据变更范围选择子流程：

#### A. 新增页面

1. 创建目录结构：
   ```
   lib/modules/pages/[feature_name]/
   ├── [feature_name]_page.dart
   ├── widgets/
   │   └── ...
   └── provider/          ← 如需状态管理
       └── ...
   ```

2. 翻译 JSX → Flutter，遵循映射规则：
   | JSX / Tailwind | Flutter |
   |----------------|---------|
   | `className="bg-[#0A0A0A]"` | `Color(0xFF0A0A0A)` |
   | `className="text-white/85"` | `Colors.white.withValues(alpha: 0.85)` |
   | `className="bg-black/35 backdrop-blur-xl"` | `BackdropFilter(blur(20)) + black/0.35` |
   | `className="rounded-2xl border border-white/12"` | `BoxDecoration(borderRadius, border)` |
   | `className="p-4 gap-3"` | `EdgeInsets` + `Gap` |
   | `useState` / `useEffect` | `ConsumerStatefulWidget` + Riverpod |
   | `motion.div` (framer-motion) | `AnimatedContainer` / `FadeSlide` |
   | `onClick` | `GestureDetector` / `InkWell` |
   | `{show && <Xxx/>}` | `if (show) Xxx()` |
   | `items.map(...)` | `ListView.builder` / `.map().toList()` |

3. 添加路由到 `lib/routing/router.dart`

#### B. 修改已有页面

1. Diff JSX 变更，定位 Flutter 中的对应代码段
2. 同步修改，保持与 JSX 视觉一致
3. 不改无关代码

#### C. 新增 API 对接

1. 读取 API 文档（`.agent/api/endpoints/xxx.md` 或用户粘贴内容）
2. 创建 Model（`@JsonSerializable`）
3. 创建 Provider（`@riverpod`）
4. 替换 mock 数据

### Phase 3: 收尾

1. **build_runner**（如涉及 `@JsonSerializable` / `@riverpod` / `@TypedGoRoute`）：
   ```bash
   cd /Users/elanzhou/Desktop/collov/collov-camera && flutter pub run build_runner build --delete-conflicting-outputs
   ```

2. **验证 checklist**（逐项与用户确认）：
   - [ ] Flutter 实现与 JSX 原型视觉一致
   - [ ] 页面路由已注册（如新页面）
   - [ ] build_runner 已执行（如涉及注解）
   - [ ] 无编译错误（`flutter analyze`）
   - [ ] 暗色主题下文字/图标可读性 OK

## 使用示例

### 示例 1：新增页面
```
/new-iteration
新增 Settings 页面
设计稿：.agent/design/reference-design/src/components/SettingsView.jsx
```

### 示例 2：修改已有页面
```
/new-iteration
SessionView 的卡片区域改了布局
```

### 示例 3：带 API 的功能
```
/new-iteration
实现消息列表功能
设计稿：.agent/design/reference-design/src/components/MessageView.jsx
API：.agent/api/endpoints/message.md
```

### 示例 4：最简用法
```
/new-iteration ProfileView 增加了退出登录按钮
```
