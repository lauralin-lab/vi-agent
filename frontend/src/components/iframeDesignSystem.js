/**
 * Shared design system CSS for HTML iframes (streaming + static).
 *
 * Injected into both PersistentHtmlRenderer's IFRAME_SRCDOC and
 * StaticHtmlBlock's wrappedHtml so all LLM-generated HTML gets
 * consistent enhanced glassmorphism styling on the black background.
 *
 * Design tokens match the native React module components in modules/shared.jsx.
 */

export const IFRAME_DESIGN_CSS = `
/* ── Design Tokens ── */
:root {
  --text-xs: clamp(10px, 2.5vw, 11px);
  --text-sm: clamp(12px, 3vw, 13px);
  --text-base: clamp(14px, 3.5vw, 15px);
  --text-lg: clamp(16px, 4vw, 18px);
  --text-xl: clamp(18px, 4.5vw, 22px);
  --text-2xl: clamp(22px, 5.5vw, 28px);
  --glass-bg: rgba(255, 255, 255, 0.04);
  --glass-border: rgba(255, 255, 255, 0.08);
  --glass-hover: rgba(255, 255, 255, 0.08);
  --accent: #a855f7;
  --accent-dim: rgba(168, 85, 247, 0.6);
  --accent-glow: rgba(168, 85, 247, 0.15);
}

/* ── Base Reset ── */
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: 'Inter', 'SF Pro Display', system-ui, -apple-system, sans-serif;
  background: transparent;
  color: rgba(255, 255, 255, 0.82);
  padding: 0;
  overflow-x: hidden;
  font-size: var(--text-base);
  line-height: 1.75;
  letter-spacing: 0.01em;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

::-webkit-scrollbar { display: none; }
button, [data-action] { cursor: pointer; }
button:active, [data-action]:active { transform: scale(0.97); }
.hidden { display: none !important; }

/* ── Typography ── */
h1, h2, h3, h4, h5 {
  color: rgba(255, 255, 255, 0.93);
  font-weight: 600;
  line-height: 1.3;
  margin-top: 1.4em;
  margin-bottom: 0.5em;
}
h1:first-child, h2:first-child, h3:first-child, h4:first-child { margin-top: 0; }
h1 { font-size: var(--text-2xl); letter-spacing: -0.025em; }
h2 { font-size: var(--text-xl); letter-spacing: -0.015em; }
h3 { font-size: var(--text-lg); }
h4 { font-size: var(--text-base); color: rgba(255, 255, 255, 0.8); }

p {
  margin-bottom: 0.75em;
  color: rgba(255, 255, 255, 0.78);
}
p:last-child { margin-bottom: 0; }

strong { color: rgba(255, 255, 255, 0.95); font-weight: 600; }
em { color: rgba(255, 255, 255, 0.7); }

a {
  color: #c084fc;
  text-decoration: none;
  transition: color 0.2s;
}
a:hover { color: #e9d5ff; }

/* ── Lists ── */
ul, ol {
  padding-left: 1.4em;
  margin-bottom: 1em;
  color: rgba(255, 255, 255, 0.78);
}
li {
  margin-bottom: 0.35em;
  line-height: 1.65;
}
li::marker { color: var(--accent-dim); }

/* ── Blockquote ── */
blockquote {
  border-left: 3px solid rgba(168, 85, 247, 0.4);
  padding: 0.6em 1em;
  margin: 1em 0;
  background: var(--glass-bg);
  border-radius: 0 12px 12px 0;
  color: rgba(255, 255, 255, 0.7);
  font-style: italic;
}

/* ── Code ── */
code {
  background: rgba(255, 255, 255, 0.06);
  padding: 0.15em 0.4em;
  border-radius: 6px;
  font-size: 0.88em;
  color: #c084fc;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
}
pre {
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  padding: 1em;
  overflow-x: auto;
  margin: 1em 0;
}
pre code {
  background: none;
  padding: 0;
  color: rgba(255, 255, 255, 0.8);
}

/* ── Tables ── */
table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  margin: 1em 0;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--glass-border);
}
thead th {
  background: var(--accent-glow);
  color: rgba(255, 255, 255, 0.88);
  font-weight: 600;
  text-align: left;
  padding: 0.65em 0.9em;
  font-size: var(--text-sm);
  border-bottom: 1px solid var(--glass-border);
}
tbody td {
  padding: 0.55em 0.9em;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.75);
  font-size: var(--text-sm);
}
tbody tr:last-child td { border-bottom: none; }
tbody tr:hover { background: rgba(255, 255, 255, 0.03); }

/* ── Images ── */
img {
  max-width: 100%;
  height: auto;
  border-radius: 12px;
  border: 1px solid var(--glass-border);
}

/* ── Horizontal Rule ── */
hr {
  border: none;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent-dim), transparent);
  margin: 1.5em 0;
}

/* ── Details / Summary ── */
details {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  padding: 0.75em 1em;
  margin: 0.6em 0;
}
summary {
  cursor: pointer;
  color: rgba(255, 255, 255, 0.88);
  font-weight: 500;
}
summary::marker { color: var(--accent); }

/* ── Glass Utility Classes (LLM can use these) ── */
.vi-card {
  background: var(--glass-bg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  padding: 1em;
  margin-bottom: 0.8em;
}
.vi-section {
  background: rgba(255, 255, 255, 0.025);
  border-radius: 12px;
  padding: 0.75em;
}
.vi-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 100px;
  border: 1px solid var(--glass-border);
  background: var(--glass-bg);
  font-size: var(--text-xs);
  color: rgba(255, 255, 255, 0.7);
}
.vi-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0.55em 1.1em;
  border-radius: 12px;
  border: 1px solid var(--glass-border);
  background: var(--glass-bg);
  color: rgba(255, 255, 255, 0.8);
  font-weight: 500;
  font-size: var(--text-sm);
  cursor: pointer;
  transition: all 0.2s;
}
.vi-btn:hover { background: var(--glass-hover); }
.vi-btn:active { transform: scale(0.97); }
.vi-btn-primary {
  background: rgba(168, 85, 247, 0.2);
  border-color: rgba(168, 85, 247, 0.25);
  color: #d8b4fe;
}
.vi-btn-primary:hover { background: rgba(168, 85, 247, 0.3); }
.vi-accent-bar {
  height: 2px;
  background: linear-gradient(90deg, var(--accent-dim), rgba(59, 130, 246, 0.4), transparent);
  border-radius: 100px;
  margin: 0.6em 0;
}

/* ── Streaming Animation ── */
#root > *:last-child {
  animation: viSlideIn 0.3s ease-out;
}
@keyframes viSlideIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
`;
