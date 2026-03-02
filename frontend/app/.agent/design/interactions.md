# 交互规范

本文档定义项目的交互规范，包括动画、手势、页面转场等，供 AI 在实现交互时参考。

## 页面转场

### 转场类型

项目使用 `AdaptiveTransitionPage` 实现自定义页面转场动画：

| 类型 | 描述 | 时长 | 缓动曲线 | 使用场景 |
|------|------|------|---------|---------|
| `none` | 无动画 | 0ms | - | 快速切换 |
| `fade` | 渐隐渐现 | 300ms | linear | 默认转场 |
| `topToBottom` | 从顶部滑入 | 300ms | easeInOutSine | 下拉面板 |
| `bottomToTop` | 从底部滑入 | 300ms | easeInOutSine | 底部弹窗、ActionSheet |
| `leftToRight` | 从左滑入 | 200ms | linear | 返回动画 |
| `rightToLeft` | 从右滑入 | 200ms | linear | 进入新页面（iOS 风格） |

### 使用方式

```dart
// 在路由定义中使用
@TypedGoRoute<YourPageRoute>(path: '/your-path')
class YourPageRoute extends GoRouteData {
  @override
  Page<void> buildPage(BuildContext context, GoRouterState state) {
    return AdaptiveTransitionPage(
      type: AdaptiveTransitionType.rightToLeft,  // 指定转场类型
      child: const YourPage(),
    );
  }
}
```

### iOS 侧滑返回

对于 `fade` 和 `rightToLeft` 类型的页面，iOS 平台自动支持侧滑返回手势。

---

## 动画时长规范

| 类型 | 时长 | 说明 |
|------|------|------|
| 快速反馈 | 100-150ms | 点击效果、开关状态 |
| 普通动画 | 200-300ms | 页面转场、展开折叠 |
| 复杂动画 | 300-500ms | 复杂过渡、引导动画 |
| 打字机效果 | 自定义 | 按字符逐个显示 |

---

## 手势交互

### 首页手势

项目使用 `HomeGestureMotion` 处理首页复杂手势：

- **横向滑动**: 切换子页面
- **嵌套滑动**: 优先响应内部 PageView，然后响应外部

### 常用手势

| 手势 | 代码 | 使用场景 |
|------|------|---------|
| 点击 | `GestureDetector.onTap` | 按钮、列表项 |
| 长按 | `GestureDetector.onLongPress` | 显示上下文菜单 |
| 拖拽 | `GestureDetector.onPan*` | 自定义滑动效果 |
| 缩放 | `GestureDetector.onScale*` | 图片缩放 |

---

## 特殊效果

### 打字机效果

用于 AI 回复的逐字显示效果：

```dart
// 使用 TypewriterText 组件
TypewriterText(
  controller: controller,
  builder: (context, text) => Text(text),
)

// 控制器用法
final controller = TypewriterTextController();
controller.setSpeed(50);  // 每秒 50 个字符
```

位置: `lib/modules/widgets/typewriter_text.dart`

### 加载效果

| 效果 | 组件 | 使用场景 |
|------|------|---------|
| Shimmer 微光 | `Shimmer` 包 | 列表骨架屏 |
| Loading 对话框 | `LoadingDialog` | 阻塞式加载 |
| Lottie 动画 | `Lottie` 包 | 自定义加载动画 |

### Toast 提示

```dart
// 使用 CustomNotifyWidget 或 Fluttertoast
Fluttertoast.showToast(msg: "操作成功");
```

---

## 对话框

### 底部弹窗

使用 `AdaptiveTransitionType.bottomToTop` 配合 Dialog：

```dart
showModalBottomSheet(
  context: context,
  builder: (context) => YourBottomSheet(),
);
```

### 居中对话框

```dart
showDialog(
  context: context,
  builder: (context) => DialogLite(
    child: YourDialogContent(),
  ),
);
```

---

## 交互最佳实践

### 1. 反馈原则
- 所有可点击元素需要有视觉反馈（涟漪、缩放、颜色变化）
- 异步操作需要显示加载状态
- 操作结果需要 Toast 或状态变化反馈

### 2. 动画原则
- 使用系统提供的缓动曲线
- 避免过长的动画时间（>500ms）
- 动画应该有目的（引导注意力、表达状态变化）

### 3. 手势原则
- 遵循平台惯例（iOS 侧滑返回）
- 避免手势冲突
- 提供触觉反馈（HapticFeedback）

---

## 相关文件

- 页面转场: `lib/modules/widgets/adaptive_transition_page.dart`
- 手势处理: `lib/modules/pages/home_page_gesture.dart`
- 打字机效果: `lib/modules/widgets/typewriter_text.dart`
- 按钮组件: `lib/modules/widgets/app_button.dart`
