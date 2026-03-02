---
description: 新功能完整开发流程（JSX 原型 + PRD + API）
---

# 新功能开发流程

这是新功能开发的**主入口工作流**，整合 JSX 原型、PRD 需求和 API 文档，驱动 AI 完成完整功能开发。

## 输入要求

开发新功能前，请准备以下材料（至少提供一项）：

| 材料 | 格式 | 说明 |
|------|------|------|
| **JSX 原型** | JSX 源码 | `.agent/design/reference-design/src/` 下的组件 |
| **PRD 需求** | Markdown | 放置在 `.agent/specs/features/[功能名].md` |
| **API 文档** | Markdown | 放置在 `.agent/api/endpoints/[模块名].md` |

## 开发步骤

### 阶段 1：需求分析

1. **解析 PRD 文档**
   - 阅读 `.agent/specs/features/[功能名].md`
   - 理解功能目标、用户故事、验收标准
   
2. **分析 JSX 原型**
   - 读取 `.agent/design/reference-design/src/components/` 下对应的 JSX 组件
   - 提取布局结构、样式（Tailwind → Flutter）、交互逻辑
   - 参考 `.agent/design/DESIGN_SYSTEM.md` 匹配设计系统

3. **解析 API 文档**
   - 阅读 `.agent/api/endpoints/[模块名].md`
   - 确定需要创建的 Model 和网络请求

### 阶段 2：代码实现

4. **创建数据模型**
   - 根据 API 文档创建 Model 类
   - 参考 `.agent/templates/model_template.dart`

5. **创建网络请求**
   - 实现 API 调用逻辑
   - 参考 `/add-api-endpoint` 工作流

6. **创建页面/组件**
   - 根据 JSX 原型翻译实现 UI
   - 参考 `/add-new-page` 或 `/add-widget` 工作流
   - 遵循 `.agent/design/interactions.md` 交互规范

7. **添加路由**
   - 在 `lib/routing/router.dart` 添加路由定义

### 阶段 3：代码生成

// turbo
8. 执行 build_runner 生成代码
```bash
cd /Users/elanzhou/Desktop/collov/collov-camera && flutter pub run build_runner build --delete-conflicting-outputs
```

### 阶段 4：验证

9. **代码检查**
   - 确保无编译错误
   - 检查代码规范

10. **功能验证**
    - 根据 PRD 验收标准进行测试

## 使用示例

```
我要开发一个新功能：用户资料页面

输入材料：
- JSX 原型：.agent/design/reference-design/src/components/ProfileView.jsx
- PRD：.agent/specs/features/user-profile.md  
- API：.agent/api/endpoints/user.md

请按照 /new-feature 工作流开发
```

## 相关工作流

- `/add-new-page` - 单独添加页面
- `/add-api-endpoint` - 单独添加 API
- `/add-widget` - 单独添加组件
- `/run-build-runner` - 执行代码生成
