const fs = require('fs');
const path = require('path');
const os = require('os');
const sessionsDir = path.join(os.homedir(), '.openclaw/agents/main/sessions');
const cacheFile = path.join(sessionsDir, 'summaries-cache.json');

// Load existing cache
let cache = {};
try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8')); } catch { }

// Load sessions.json
const sessionsMap = JSON.parse(fs.readFileSync(path.join(sessionsDir, 'sessions.json'), 'utf-8'));

for (const [key, value] of Object.entries(sessionsMap)) {
    if (!value || typeof value !== 'object') continue;
    const sessionId = value.sessionId || '';
    if (!sessionId) continue;
    const filename = sessionId + '.jsonl';
    const filePath = path.join(sessionsDir, filename);
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, 'utf-8');

    // Extract [file:path]
    const fileRegex = /\[file:([^\]]+)\]/g;
    let match;
    const seen = new Set();
    const files = [];
    while ((match = fileRegex.exec(content)) !== null) {
        const p = match[1].trim();
        if (p && !seen.has(p)) { seen.add(p); files.push(p); }
    }

    // Keep existing title or use label/key
    const existing = cache[filename];
    const title = (existing && existing.title) ? existing.title : (value.label || key);

    cache[filename] = { title, files, timestamp: Date.now() };
    console.log(filename + ': title=' + title + ', files=' + files.length);
}

fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
console.log('\nCache saved to ' + cacheFile);
