import '../../../models/live_kit_show_result_model.dart';

/// Agent 输出状态定义
sealed class AgentOutputState {
  const AgentOutputState();

  /// 所有 Dialog 名称列表
  static const allDialogRouteNames = [
    'AgentThinkOutPutDialog',
    'AgentTalkOutPutTextDialog',
    'LiveKitWebViewDialog',
    'LiveKitHtmlDialog',
    'LiveKitResultMarkdownJsonDialog',
  ];

  /// 获取当前状态对应的 Dialog RouteName
  String? get dialogRouteName => switch (this) {
    AgentOutputThinking() => 'AgentThinkOutPutDialog',
    AgentOutputTalkText() => 'AgentTalkOutPutTextDialog',
    AgentOutputWebView() => 'LiveKitWebViewDialog',
    AgentOutputHtml() => 'LiveKitHtmlDialog',
    AgentOutputMarkdownJson() => 'LiveKitResultMarkdownJsonDialog',
    AgentOutputIdle() => null,
  };
}

/// 空闲状态 --- 没有 Agent 输出
class AgentOutputIdle extends AgentOutputState {
  const AgentOutputIdle();
}

/// Agent-transcript --- 展示回复的文本
class AgentOutputTalkText extends AgentOutputState {
  final List<String> texts;

  const AgentOutputTalkText(this.texts);
}

/// Markdown json 输出状态 --- 展示Agent 输出的 Markdown json
class AgentOutputMarkdownJson extends AgentOutputState {
  final String content;
  final LiveKitShowResultType type;

  const AgentOutputMarkdownJson(this.content, this.type);
}

/// WebView 输出状态 --- 展示 Agent 返回的网页 URL
class AgentOutputWebView extends AgentOutputState {
  final String url;

  const AgentOutputWebView(this.url);
}

/// Html 输出状态 --- 展示 Agent 返回的 Html 片段
class AgentOutputHtml extends AgentOutputState {
  final String html;

  const AgentOutputHtml(this.html);
}

/// Thinking 输出状态 --- 展示 Agent 思考过程
class AgentOutputThinking extends AgentOutputState {
  final String text;

  const AgentOutputThinking(this.text);
}
