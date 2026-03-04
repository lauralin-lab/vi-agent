import { publishStreamEvent } from '../channels/stream-publisher.js';
import type { StreamEvent } from '../channels/types.js';

/**
 * Tool for skills to publish structured results to the stream.
 * Wraps stream-publisher with a simpler interface.
 */
export async function publishResult(
  taskId: string,
  result: { type: 'html' | 'text' | 'module'; content: string; moduleType?: string },
): Promise<void> {
  if (result.type === 'html') {
    await publishStreamEvent({
      type: 'exec_html_stream',
      taskId,
      chunk: result.content,
      done: true,
    });
  } else if (result.type === 'text') {
    await publishStreamEvent({
      type: 'exec_text_stream',
      taskId,
      chunk: result.content,
      done: true,
    });
  } else if (result.type === 'module') {
    await publishStreamEvent({
      type: 'exec_module',
      taskId,
      moduleType: result.moduleType || 'generic',
      data: result.content,
    });
  }
}
