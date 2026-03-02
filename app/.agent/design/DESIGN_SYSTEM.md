# Collov Camera 设计系统

本文档定义项目的设计系统，供 AI 在实现 UI 时参考。

## 颜色系统

### 主题色

| 变量名 | 色值 | 用途 |
|--------|------|------|
| `primaryColor` | `#171717` | 主色，深灰/黑色 |
| `onPrimaryColor` | `#F2F2F0` | 主色上的文字/图标 |
| `secondaryColor` | `#373430` | 辅色，深棕灰色 |
| `onSecondaryColor` | `#F2F2F2` | 辅色上的文字/图标 |
| `surfaceColor` | `#F4F6F6` | 背景色，浅灰色 |
| `onSurfaceColor` | `#373430` | 背景上的文字/图标 |
| `cardColor` | `#FCFCFC` | 卡片背景色 |
| `errorColor` | `Colors.red` | 错误提示色 |

### 透明度变体

| 变量名 | 色值 | 用途 |
|--------|------|------|
| `primaryColor25` | `#408E8075` | 25% 透明度主色 |
| `secondaryColor25` | `#40373430` | 25% 透明度辅色 |
| `white40` | `#66FFFFFF` | 40% 透明度白色 |
| `black35` | `#5A000000` | 35% 透明度黑色（遮罩） |

### Flutter 代码

```dart
import 'package:collov_camera/modules/style/app_theme.dart';

// 使用方式
AppTheme.primaryColor
AppTheme.surfaceColor
```

---

## 字体系统

### 字体家族

- **主字体**: SF Pro Display
- **备用字体**: monospace

### 字重

| 字重 | 值 | 文件 |
|------|------|------|
| Regular | 400 | SFPRODISPLAYREGULAR.otf |
| Medium | 500 | SFPRODISPLAYMEDIUM.otf |
| SemiBold | 600 | SFPRODISPLAYSEMIBOLDITALIC.otf |
| Bold | 700 | SFPRODISPLAYBOLD.otf |

### 使用规范

| 场景 | 字重 | 大小建议 |
|------|------|---------|
| 大标题 | Bold (700) | 24-32sp |
| 标题 | SemiBold (600) | 18-20sp |
| 正文 | Regular (400) | 14-16sp |
| 辅助文字 | Regular (400) | 12sp |
| 按钮 | Medium (500) | 14-16sp |

---

## 间距系统

### 标准间距

| 名称 | 值 | 用途 |
|------|------|------|
| xs | 4px | 紧凑间距 |
| sm | 8px | 小间距 |
| md | 16px | 中等间距 |
| lg | 24px | 大间距 |
| xl | 32px | 特大间距 |
| xxl | 48px | 超大间距 |

### 使用建议

```dart
// 使用 gap 包简化间距
import 'package:gap/gap.dart';

Column(
  children: [
    Widget1(),
    Gap(16),  // 中等间距
    Widget2(),
  ],
)
```

---

## 圆角系统

| 名称 | 值 | 用途 |
|------|------|------|
| sm | 4px | 小圆角（输入框） |
| md | 8px | 中等圆角（按钮） |
| lg | 12px | 大圆角（卡片） |
| xl | 16px | 特大圆角 |
| full | 9999px | 圆形（头像、圆形按钮） |

---

## 阴影系统

| 名称 | 参数 | 用途 |
|------|------|------|
| subtle | blur: 4, y: 2, color: black4% | 轻微阴影 |
| card | blur: 8, y: 4, color: black8% | 卡片阴影 |
| elevated | blur: 16, y: 8, color: black12% | 悬浮元素 |

---

## 组件映射

### JSX 组件 → Flutter Widget

| JSX 组件 | Flutter Widget | 文件位置 |
|-------------|----------------|---------|
| Button/Primary | `AppButton` | `widgets/app_button.dart` |
| AppBar | `AppBarWidget` | `widgets/app_bar.dart` |
| Image | `AppImage` | `widgets/app_image.dart` |
| Loading | `LoadingDialog` | `widgets/loading_dialog.dart` |
| Toast | `CustomNotifyWidget` | `widgets/custom_notify_widget.dart` |

---

## 主题获取

```dart
// 创建主题
final theme = AppTheme.createTheme();

// 在 MaterialApp 中使用
MaterialApp(
  theme: AppTheme.createTheme(),
  // ...
)
```

## 相关文件

- 主题定义: `lib/modules/style/app_theme.dart`
- 组件: `lib/modules/widgets/`
