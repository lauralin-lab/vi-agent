/**
 * Parse/serialize MEMORY.md ↔ structured card data.
 *
 * MEMORY.md format (produced by nanoclaw memory-hook):
 *   # 关于我
 *   ## 基本信息
 *   - item 1
 *   - item 2
 *   ## 审美风格
 *   - item 3
 *
 * Parsed structure: [{ title: '基本信息', items: ['item 1', 'item 2'] }, ...]
 */

/**
 * Parse MEMORY.md content into structured sections.
 * @param {string} content - raw markdown content
 * @returns {{ title: string, items: string[] }[]}
 */
export function parseMemoryMarkdown(content) {
  if (!content || !content.trim()) return [];

  const lines = content.split('\n');
  const sections = [];
  let current = null;

  for (const line of lines) {
    // ## heading → new section
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) {
      current = { title: h2[1].trim(), items: [] };
      sections.push(current);
      continue;
    }

    // Skip # top-level heading (e.g. "# 关于我")
    if (/^#\s/.test(line)) continue;

    // Bullet item → add to current section
    const bullet = line.match(/^\s*[-*]\s+(.+)/);
    if (bullet && current) {
      current.items.push(bullet[1].trim());
      continue;
    }

    // Non-empty, non-heading line within a section → treat as item
    if (current && line.trim() && !line.startsWith('#')) {
      current.items.push(line.trim());
    }
  }

  return sections;
}

/**
 * Serialize structured sections back to MEMORY.md markdown.
 * @param {{ title: string, items: string[] }[]} sections
 * @returns {string}
 */
export function serializeMemoryCards(sections) {
  if (!sections || sections.length === 0) return '';

  const parts = ['# 关于我'];

  for (const section of sections) {
    parts.push('');
    parts.push(`## ${section.title}`);
    for (const item of section.items) {
      parts.push(`- ${item}`);
    }
  }

  return parts.join('\n');
}
