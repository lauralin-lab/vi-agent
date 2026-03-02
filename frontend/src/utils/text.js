export function getShortTitle(prompt) {
  if (!prompt) return 'New Session';
  // Strip [USER_DISPATCH] prefix
  let text = prompt.replace(/^\[USER_DISPATCH\]\s*/i, '');
  // Strip [PHOTO CONTEXT ...] blocks
  text = text.replace(/\[PHOTO CONTEXT[^\]]*\][\s\S]*?\[END PHOTO CONTEXT\]/gi, '');
  // Strip photo URLs
  text = text.replace(/https:\/\/storage\.googleapis\.com\/\S+/g, '');
  // Strip "intention:" prefix
  text = text.replace(/^intention:\s*/i, '');
  // Clean up Photos: sections and dashes
  text = text.replace(/\nPhotos?:?\s*[\s\S]*/i, '');
  text = text.replace(/Photos:\s*(-\s*\n?)*/g, '');
  // Take first line
  text = text.split('\n')[0].trim();
  // Filter greeting phrases — return generic title instead
  if (/^(hello|hi|hey|how can i help|what can i do)/i.test(text)) return 'Photo Analysis';
  if (!text || text.length < 3) return 'New Session';
  // CJK-aware truncation
  const cjkChars = text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g);
  const isCJK = cjkChars && cjkChars.length > text.length * 0.3;
  if (isCJK) {
    return text.length <= 8 ? text : text.slice(0, 8) + '...';
  }
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 4) return text;
  return words.slice(0, 4).join(' ') + '...';
}
