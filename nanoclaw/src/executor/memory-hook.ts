/**
 * Memory hook — after NanoClaw finishes a task:
 *   1. LLM summarizes conversation → diary entry (memory/YYYY-MM-DD.md)
 *   2. LLM promotes diary → MEMORY.md (if new long-term info found)
 *
 * Per memory-system-spec.md: two-layer model, session-end auto-write.
 */
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { appendDiary, readMemory, writeMemory } from '../tools/memory-update.js';

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
  return _anthropic;
}

/**
 * Process conversation for memory after task completion.
 * Non-blocking — errors are logged but don't fail the task.
 */
export async function triggerMemoryUpdate(
  prompt: string,
  result: string,
): Promise<void> {
  if (!prompt || prompt.length < 5) return;
  if (!result || result.length < 10) return;

  const cleanResult = result.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const timestamp = new Date().toISOString().slice(11, 16);

  // Step 1: LLM summarizes conversation → diary entry
  const diaryEntry = await summarizeForDiary(timestamp, prompt, cleanResult);
  if (!diaryEntry) return; // NOTHING_NOTABLE

  await appendDiary(diaryEntry);

  // Step 2: LLM promotes diary → MEMORY.md
  await promoteToMemory(diaryEntry);
}

/**
 * Summarize conversation into a structured diary entry.
 * Returns null if conversation was trivial (NOTHING_NOTABLE).
 */
async function summarizeForDiary(
  timestamp: string,
  prompt: string,
  result: string,
): Promise<string | null> {
  const summaryPrompt = `总结这段对话，生成日记条目。

对话内容：
- 用户：${truncate(prompt, 500)}
- Agent：${truncate(result, 800)}

输出格式：
## ${timestamp} — 对话主题（一句话）
- bullet point 摘要（每条一行）
- 值得长期记住的信息标记为 [→长期]

规则：
- 记事实，不记事件
- 如果对话太短或无实质内容（纯寒暄/闲聊），输出 NOTHING_NOTABLE
- 简洁但完整，不超过 300 字`;

  try {
    const msg = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: summaryPrompt }],
    });

    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    if (!text || text.includes('NOTHING_NOTABLE')) {
      console.log('[memory-hook] Conversation trivial — skipping diary');
      return null;
    }

    return text.trim();
  } catch (err) {
    console.warn('[memory-hook] Summarization failed:', err);
    return null;
  }
}

/**
 * Promote diary entry to long-term MEMORY.md.
 * Reads current MEMORY.md, uses Claude to merge, writes back.
 */
async function promoteToMemory(diaryEntry: string): Promise<void> {
  const currentMemory = await readMemory();

  const prompt = `你是一个记忆管理器，为一个视觉 AI 助手管理长期记忆。

输入 1 — 本次对话的摘要（刚生成的日记条目）：
${diaryEntry}

输入 2 — 当前的长期记忆文件（MEMORY.md）：
${currentMemory || '(空 — 首次使用，从零创建)'}

任务：
- 判断对话摘要中是否有值得长期记住的新信息
- 如果有：将新信息合并到长期记忆中，输出完整的更新后文件
- 如果没有新信息：输出 NO_UPDATE
- 如果某条信息与已有记忆冲突（用户改变了偏好），更新旧记忆而非追加

信息分类规则：
- 用户身份/习惯 → ## 基本信息
- 人名、关系 → ## 身边的人
- 明确的偏好/指令 → ## 偏好
- 审美/风格/颜色/材质偏好 → ## 审美风格
- 重要选择 → ## 重要决定（带日期）
- 持续进行的项目/任务 → ## 正在做的事
- 常用参考信息 → ## 常用信息

规则：
- 顶级标题固定为 # 关于我
- 记事实，不记事件
- 不要删除已有的正确信息
- 不标注信息来源（不写"从对话中得知"等）
- 只写确认的结论，低置信度推测不写入
- 用与已有内容一致的语言
- 总长度不超过 2000 字符`;

  try {
    const msg = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    if (!text || text.includes('NO_UPDATE')) {
      console.log('[memory-hook] Promotion: no new long-term info');
      return;
    }

    await writeMemory(text.trim());
    console.log(`[memory-hook] MEMORY.md promoted (${text.length} chars)`);
  } catch (err) {
    console.warn('[memory-hook] Promotion failed:', err);
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '...' : s;
}
