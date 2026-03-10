/**
 * TextResultModule — renders markdown text content in a glass card.
 * Used for text-result / text_result card templates from agent responses.
 */

import { GlassCard, ModuleHeader, AccentBar } from './shared';
import { renderMarkdown } from '../../utils/markdown';

export default function TextResultModule({ data }) {
  if (!data) return null;

  const { title, content, text } = data;
  const body = content || text || '';

  return (
    <GlassCard>
      <ModuleHeader title={title || 'Result'} icon="📝" />
      <AccentBar className="mb-3" />
      {body ? (
        <div className="space-y-1">{renderMarkdown(body)}</div>
      ) : (
        <p className="text-black/30 text-sm">No content</p>
      )}
    </GlassCard>
  );
}
