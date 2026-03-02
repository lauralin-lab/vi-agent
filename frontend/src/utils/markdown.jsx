// Markdown renderer — extracted from MemoryView.jsx
// Shared by LiveSessionView and MemoryView

// ── Simple Markdown Renderer ──
// Handles: headings, bold, italic, code blocks, inline code, lists, links
export function renderMarkdown(text) {
  if (!text) return null;
  const lines = text.split('\n');
  const elements = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith('```')) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <pre key={key++} className="bg-white/5 rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono text-white/80 border border-white/5">
          {codeLines.join('\n')}
        </pre>
      );
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const sizes = { 1: 'text-lg font-bold', 2: 'text-base font-semibold', 3: 'text-sm font-semibold' };
      elements.push(
        <p key={key++} className={`${sizes[level]} text-white/90 mt-3 mb-1`}>
          {inlineFormat(headingMatch[2])}
        </p>
      );
      i++;
      continue;
    }

    // List item
    if (/^\s*[-*]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      elements.push(
        <ul key={key++} className="my-1 space-y-0.5">
          {items.map((item, j) => (
            <li key={j} className="text-white/70 text-sm flex gap-1.5">
              <span className="text-white/30 shrink-0">•</span>
              <span>{inlineFormat(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Empty line
    if (!line.trim()) {
      elements.push(<div key={key++} className="h-2" />);
      i++;
      continue;
    }

    // Normal paragraph
    elements.push(
      <p key={key++} className="text-white/70 text-sm leading-relaxed">
        {inlineFormat(line)}
      </p>
    );
    i++;
  }

  return elements;
}

// Inline formatting: bold, italic, inline code, links
export function inlineFormat(text) {
  if (!text) return text;
  const parts = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Inline code
    let match = remaining.match(/^(.*?)`([^`]+)`/);
    if (match) {
      if (match[1]) parts.push(match[1]);
      parts.push(<code key={key++} className="bg-white/10 px-1.5 py-0.5 rounded text-xs font-mono text-purple-300">{match[2]}</code>);
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Bold
    match = remaining.match(/^(.*?)\*\*(.+?)\*\*/);
    if (match) {
      if (match[1]) parts.push(match[1]);
      parts.push(<strong key={key++} className="text-white/90 font-semibold">{match[2]}</strong>);
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Italic
    match = remaining.match(/^(.*?)\*(.+?)\*/);
    if (match) {
      if (match[1]) parts.push(match[1]);
      parts.push(<em key={key++} className="text-white/80">{match[2]}</em>);
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Link
    match = remaining.match(/^(.*?)\[([^\]]+)\]\(([^)]+)\)/);
    if (match) {
      if (match[1]) parts.push(match[1]);
      parts.push(<a key={key++} href={match[3]} target="_blank" rel="noopener noreferrer" className="text-purple-400 underline underline-offset-2">{match[2]}</a>);
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // No more matches — push rest
    parts.push(remaining);
    break;
  }

  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : parts;
}
