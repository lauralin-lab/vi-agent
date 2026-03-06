// NanoClaw Dashboard — vanilla JS client
(function () {
  'use strict';

  // ── Navigation ──
  const navLinks = document.querySelectorAll('.nav-link');
  const pages = document.querySelectorAll('.page');

  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      const target = link.dataset.page;
      navLinks.forEach(l => l.classList.remove('active'));
      pages.forEach(p => p.classList.remove('active'));
      link.classList.add('active');
      document.getElementById('page-' + target).classList.add('active');
      if (target === 'health') fetchHealth();
      if (target === 'skills') fetchSkills();
      if (target === 'tasks') { fetchTemplates(); fetchSessions(); }
      if (target === 'sessions') fetchSessionHistory();
      if (target === 'memory') { loadAllMemoryLayers(); connectContextSSE(); }
      if (target === 'chat' && !chatSSE) connectChatSSE();
    });
  });

  // ── Helpers ──
  function $(id) { return document.getElementById(id); }

  function formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return (h > 0 ? h + 'h ' : '') + m + 'm ' + s + 's';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString();
  }

  function formatDateTime(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
  }

  function formatDuration(ms) {
    if (ms < 1000) return ms + 'ms';
    return (ms / 1000).toFixed(1) + 's';
  }

  // ══════════════════════════════════════════════════════════════
  // CHAT
  // ══════════════════════════════════════════════════════════════

  let chatSSE = null;
  let chatTaskId = null;
  let selectedSkill = null;
  let skillsList = [];
  let chatCards = {}; // cardId -> { template, data, status, rawMode } for current response

  // Load skills for picker
  async function loadSkillsForPicker() {
    try {
      const res = await fetch('/api/dashboard/skills');
      const data = await res.json();
      skillsList = data.skills || [];
    } catch { skillsList = []; }
  }

  loadSkillsForPicker();

  function connectChatSSE() {
    if (chatSSE) chatSSE.close();
    chatSSE = new EventSource('/api/dashboard/sse');
    chatSSE.onopen = () => {
      document.querySelector('.sidebar-footer').innerHTML = '<span class="status-dot live"></span> Connected';
    };
    chatSSE.onmessage = (evt) => {
      let parsed;
      try { parsed = JSON.parse(evt.data); } catch { return; }
      handleChatEvent(parsed);
    };
    chatSSE.onerror = () => {
      document.querySelector('.sidebar-footer').innerHTML = '<span class="status-dot off"></span> Disconnected';
    };
  }

  function handleChatEvent(data) {
    if (!chatTaskId) return;
    // Only handle events for our current task
    if (data.taskId && data.taskId !== chatTaskId) return;

    if (data.type === 'exec_start') {
      appendAssistantThinking();
    } else if (data.type === 'exec_progress') {
      updateAssistantThinking(data.message);
    } else if (data.type === 'exec_result') {
      finalizeAssistantMessage(data.summary);
    } else if (data.type === 'exec_error') {
      finalizeAssistantError(data.error);
    } else if (data.op === 'html_stream') {
      handleChatCardOp(data);
    } else if (data.op === 'stream_to_card') {
      handleChatCardOp(data);
    } else if (data.op === 'create_card') {
      handleChatCardOp(data);
    } else if (data.op === 'update_card') {
      handleChatCardOp(data);
    } else if (data.op === 'append_to_card') {
      handleChatCardOp(data);
    } else if (data.op === 'replace_card') {
      handleChatCardOp(data);
    } else if (data.op === 'finalize_card') {
      handleChatCardOp(data);
    } else if (data.op === 'remove_card') {
      handleChatCardOp(data);
    }
  }

  // ── Chat Card State Management ──
  function handleChatCardOp(op) {
    if (!currentAssistantDiv) appendAssistantThinking();
    const cardId = op.cardId;

    switch (op.op) {
      case 'create_card':
        chatCards[cardId] = { cardId, template: op.template, data: { ...op.data }, status: 'streaming' };
        break;
      case 'update_card':
        if (chatCards[cardId]) Object.assign(chatCards[cardId].data, op.updates);
        break;
      case 'stream_to_card':
        if (chatCards[cardId]) {
          const prev = chatCards[cardId].data[op.slot] || '';
          chatCards[cardId].data[op.slot] = prev + op.chunk;
        }
        break;
      case 'append_to_card':
        if (chatCards[cardId]) {
          const arr = chatCards[cardId].data[op.slot] || [];
          chatCards[cardId].data[op.slot] = arr.concat(op.items);
        }
        break;
      case 'replace_card':
        if (chatCards[cardId]) {
          chatCards[cardId].template = op.template;
          chatCards[cardId].data = { ...op.data };
        }
        break;
      case 'finalize_card':
        if (chatCards[cardId]) chatCards[cardId].status = 'finalized';
        break;
      case 'remove_card':
        delete chatCards[cardId];
        break;
      case 'html_stream':
        if (!chatCards[cardId]) {
          chatCards[cardId] = { cardId, template: 'html_stream', data: { html: '' }, status: 'streaming' };
        }
        chatCards[cardId].data.html = (chatCards[cardId].data.html || '') + op.chunk;
        if (op.done) chatCards[cardId].status = 'finalized';
        break;
    }

    renderChatCards();
  }

  function renderChatCards() {
    if (!currentAssistantDiv) return;
    // Find or create the cards container in the current assistant message
    let cardsContainer = currentAssistantDiv.querySelector('.chat-cards-container');
    if (!cardsContainer) {
      cardsContainer = document.createElement('div');
      cardsContainer.className = 'chat-cards-container';
      currentAssistantDiv.appendChild(cardsContainer);
    }

    const ids = Object.keys(chatCards);
    if (ids.length === 0) return;

    cardsContainer.innerHTML = ids.map(id => {
      const card = chatCards[id];
      if (card.rawMode) return renderCardRaw(card);
      try {
        return renderCardVisual(card);
      } catch {
        return renderCardRaw(card);
      }
    }).join('');

    // Wire up per-card toggle buttons
    cardsContainer.querySelectorAll('.chat-card-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cardId = btn.dataset.cardId;
        if (chatCards[cardId]) {
          chatCards[cardId].rawMode = !chatCards[cardId].rawMode;
          renderChatCards();
        }
      });
    });

    const msgs = $('chat-messages');
    msgs.scrollTop = msgs.scrollHeight;
  }

  function renderCardToggle(card) {
    return '<button class="chat-card-toggle" data-card-id="' + escapeHtml(card.cardId) + '" title="Show raw JSON">&lt;/&gt;</button>';
  }

  function renderCardVisual(card) {
    const statusBadge = card.status === 'finalized'
      ? '<span class="badge badge-green" style="font-size:10px">done</span>'
      : '<span class="badge badge-yellow" style="font-size:10px">streaming</span>';
    const toggle = renderCardToggle(card);

    // html_stream — render HTML directly
    if (card.template === 'html_stream' && card.data.html) {
      return '<div class="chat-card-rendered">' +
        '<div class="chat-card-header">HTML ' + statusBadge + toggle + '</div>' +
        '<div class="chat-card-html">' + card.data.html + '</div>' +
        '</div>';
    }

    // thinking-process — render as steps
    if (card.template === 'thinking-process' || card.template === 'thinking_process') {
      const title = card.data.title || 'Thinking...';
      const steps = card.data.steps || [];
      return '<div class="chat-card-rendered chat-card-thinking">' +
        '<div class="chat-card-header">' + escapeHtml(title) + ' ' + statusBadge + toggle + '</div>' +
        steps.map(s =>
          '<div class="chat-card-step">' +
          '<div class="chat-card-step-label">' + escapeHtml(s.label || '') + '</div>' +
          '<div class="chat-card-step-content">' + escapeHtml(s.content || '') + '</div>' +
          '</div>'
        ).join('') +
        '</div>';
    }

    // Generic card — render data fields nicely
    const data = card.data || {};
    const entries = Object.entries(data);
    if (entries.length === 0) {
      return '<div class="chat-card-rendered">' +
        '<div class="chat-card-header">' + escapeHtml(card.template) + ' ' + statusBadge + toggle + '</div>' +
        '<div class="chat-card-empty">No data</div>' +
        '</div>';
    }

    return '<div class="chat-card-rendered">' +
      '<div class="chat-card-header">' + escapeHtml(card.template) + ' ' + statusBadge + toggle + '</div>' +
      '<div class="chat-card-fields">' +
      entries.map(([key, val]) => {
        const valStr = typeof val === 'string' ? val : JSON.stringify(val, null, 2);
        if (typeof val === 'string' && val.length > 100) {
          return '<div class="chat-card-field-block">' +
            '<div class="chat-card-field-key">' + escapeHtml(key) + '</div>' +
            '<div class="chat-card-field-val-long">' + escapeHtml(valStr) + '</div>' +
            '</div>';
        }
        return '<div class="chat-card-field">' +
          '<span class="chat-card-field-key">' + escapeHtml(key) + '</span>' +
          '<span class="chat-card-field-val">' + escapeHtml(valStr) + '</span>' +
          '</div>';
      }).join('') +
      '</div>' +
      '</div>';
  }

  function renderCardRaw(card) {
    const toggle = '<button class="chat-card-toggle raw" data-card-id="' + escapeHtml(card.cardId) + '" title="Show rendered">&lt;/&gt;</button>';
    return '<div class="chat-card-result">' +
      toggle +
      escapeHtml(JSON.stringify(card, null, 2)) +
      '</div>';
  }

  function appendUserMessage(text, skill) {
    const msgs = $('chat-messages');
    const empty = msgs.querySelector('.chat-empty');
    if (empty) empty.remove();

    const div = document.createElement('div');
    div.className = 'chat-msg user';
    div.innerHTML =
      '<div class="chat-bubble">' + escapeHtml(text) + '</div>' +
      '<div class="chat-msg-meta">' +
      (skill ? '<span class="badge badge-purple" style="margin-right:6px">@' + escapeHtml(skill) + '</span>' : '') +
      formatTime(Date.now()) +
      '</div>';
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  let currentAssistantDiv = null;
  let assistantStreamText = '';

  function appendAssistantThinking() {
    const msgs = $('chat-messages');
    currentAssistantDiv = document.createElement('div');
    currentAssistantDiv.className = 'chat-msg assistant';
    currentAssistantDiv.innerHTML =
      '<div class="chat-bubble"><span class="assistant-thinking">Thinking...</span></div>' +
      '<div class="chat-msg-meta">' + formatTime(Date.now()) + '</div>';
    msgs.appendChild(currentAssistantDiv);
    msgs.scrollTop = msgs.scrollHeight;
    assistantStreamText = '';
  }

  function updateAssistantThinking(message) {
    if (!currentAssistantDiv) return;
    const thinking = currentAssistantDiv.querySelector('.assistant-thinking');
    if (thinking) thinking.textContent = message;
  }

  function appendToAssistantStream(chunk) {
    if (!currentAssistantDiv) {
      appendAssistantThinking();
    }
    assistantStreamText += chunk;
    const bubble = currentAssistantDiv.querySelector('.chat-bubble');
    bubble.innerHTML = escapeHtml(assistantStreamText);
  }

  function finalizeAssistantMessage(summary) {
    if (!currentAssistantDiv) return;
    const bubble = currentAssistantDiv.querySelector('.chat-bubble');
    if (assistantStreamText) {
      bubble.innerHTML = escapeHtml(assistantStreamText);
    } else if (summary) {
      bubble.innerHTML = escapeHtml(summary);
    }
    currentAssistantDiv = null;
    chatTaskId = null;
  }

  function finalizeAssistantError(error) {
    if (!currentAssistantDiv) appendAssistantThinking();
    const bubble = currentAssistantDiv.querySelector('.chat-bubble');
    bubble.innerHTML = '<span style="color:var(--red)">Error: ' + escapeHtml(error) + '</span>';
    currentAssistantDiv = null;
    chatTaskId = null;
  }

  async function sendChat() {
    const input = $('chat-input');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    chatCards = {};
    currentAssistantDiv = null;
    appendUserMessage(text, selectedSkill ? selectedSkill.slug : null);

    try {
      const body = { prompt: text };
      if (selectedSkill) body.skillSlug = selectedSkill.slug;

      const res = await fetch('/api/dashboard/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      chatTaskId = data.taskId;

      // Clear skill selection after sending
      selectedSkill = null;
      $('chat-skill-tag').style.display = 'none';
    } catch (err) {
      finalizeAssistantError(err.message);
    }
  }

  $('chat-send').addEventListener('click', sendChat);
  $('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  });

  // Skill picker logic
  $('chat-input').addEventListener('input', (e) => {
    const val = e.target.value;
    const atIdx = val.lastIndexOf('@');
    if (atIdx >= 0 && atIdx === val.length - 1 || (atIdx >= 0 && !val.slice(atIdx).includes(' '))) {
      const query = val.slice(atIdx + 1).toLowerCase();
      showSkillPicker(query);
    } else {
      hideSkillPicker();
    }
  });

  function showSkillPicker(query) {
    const picker = $('skill-picker');
    const list = $('skill-picker-list');
    const filtered = skillsList.filter(s =>
      !query || s.name.toLowerCase().includes(query) || s.slug.toLowerCase().includes(query)
    );
    if (filtered.length === 0) {
      hideSkillPicker();
      return;
    }
    list.innerHTML = filtered.map(s =>
      '<div class="skill-picker-item" data-slug="' + escapeHtml(s.slug) + '">' +
      '<span class="skill-icon">' + (s.icon || '') + '</span>' +
      '<div class="skill-info">' +
      '<div class="skill-name">' + escapeHtml(s.name) + '</div>' +
      '<div class="skill-desc">' + escapeHtml(s.description || '') + '</div>' +
      '</div></div>'
    ).join('');
    picker.style.display = 'block';

    list.querySelectorAll('.skill-picker-item').forEach(item => {
      item.addEventListener('click', () => {
        const slug = item.dataset.slug;
        const skill = skillsList.find(s => s.slug === slug);
        if (skill) {
          selectedSkill = skill;
          $('chat-skill-name').textContent = '@' + skill.name;
          $('chat-skill-tag').style.display = 'inline-flex';
          // Remove @ from input
          const input = $('chat-input');
          const atIdx = input.value.lastIndexOf('@');
          if (atIdx >= 0) input.value = input.value.slice(0, atIdx);
          input.focus();
        }
        hideSkillPicker();
      });
    });
  }

  function hideSkillPicker() {
    $('skill-picker').style.display = 'none';
  }

  $('chat-skill-remove').addEventListener('click', () => {
    selectedSkill = null;
    $('chat-skill-tag').style.display = 'none';
  });

  // Auto-connect chat SSE on load
  connectChatSSE();

  // ══════════════════════════════════════════════════════════════
  // MULTI-CHANNEL MONITOR
  // ══════════════════════════════════════════════════════════════

  let channelSSE = null;

  const CHANNEL_COLORS = {
    ctx: 'ch-tag-ctx',
    exec: 'ch-tag-exec',
    stream: 'ch-tag-stream',
    intent: 'ch-tag-intent',
    actions: 'ch-tag-actions',
    summary: 'ch-tag-summary',
    frames: 'ch-tag-frames',
    media: 'ch-tag-media',
    events: 'ch-tag-events',
  };

  function getActiveFilters() {
    const filters = new Set();
    document.querySelectorAll('#channel-filters input:checked').forEach(cb => {
      filters.add(cb.value);
    });
    return filters;
  }

  function connectChannelSSE() {
    if (channelSSE) channelSSE.close();
    const uid = $('ch-uid').value.trim();
    const url = '/api/dashboard/sse/all' + (uid ? '?uid=' + encodeURIComponent(uid) : '');
    channelSSE = new EventSource(url);
    $('ch-status').textContent = 'Connecting...';
    $('ch-connect').textContent = 'Reconnect';

    channelSSE.onopen = () => {
      $('ch-status').textContent = 'Connected';
    };

    channelSSE.onmessage = (evt) => {
      let parsed;
      try { parsed = JSON.parse(evt.data); } catch { return; }
      const channel = parsed.channel || 'unknown';
      const filters = getActiveFilters();
      if (!filters.has(channel)) return;
      appendChannelEntry(channel, parsed.ts, parsed.data);
    };

    channelSSE.onerror = () => {
      $('ch-status').textContent = 'Disconnected';
    };
  }

  function appendChannelEntry(channel, ts, data) {
    const log = $('ch-log');
    const entry = document.createElement('div');
    entry.className = 'sse-entry';

    const time = document.createElement('span');
    time.className = 'sse-time';
    time.textContent = formatTime(ts || Date.now());

    const tag = document.createElement('span');
    tag.className = 'ch-tag ' + (CHANNEL_COLORS[channel] || '');
    tag.textContent = channel;

    const body = document.createElement('span');
    body.className = 'sse-data';
    body.textContent = typeof data === 'string' ? data : JSON.stringify(data);

    entry.appendChild(time);
    entry.appendChild(tag);
    entry.appendChild(body);
    log.appendChild(entry);

    if (log.scrollHeight - log.scrollTop - log.clientHeight < 100) {
      log.scrollTop = log.scrollHeight;
    }
    while (log.children.length > 1000) {
      log.removeChild(log.firstChild);
    }
  }

  $('ch-connect').addEventListener('click', connectChannelSSE);
  $('ch-clear').addEventListener('click', () => { $('ch-log').innerHTML = ''; });

  // ══════════════════════════════════════════════════════════════
  // SESSION HISTORY
  // ══════════════════════════════════════════════════════════════

  async function fetchSessionHistory() {
    try {
      const res = await fetch('/api/dashboard/sessions/history');
      const data = await res.json();
      renderTimeline(data.sessions || []);
    } catch (err) {
      $('sessions-timeline').innerHTML = '<div class="loading">Error: ' + escapeHtml(err.message) + '</div>';
    }
  }

  function renderTimeline(sessions) {
    const container = $('sessions-timeline');
    $('sessions-count').textContent = sessions.length + ' tasks';

    if (sessions.length === 0) {
      container.innerHTML = '<div class="loading">No session history yet</div>';
      return;
    }

    container.innerHTML = sessions.map(s => {
      const prompt = (s.prompt || '').slice(0, 80);
      const result = (s.result || '').slice(0, 500);
      return '<div class="timeline-item">' +
        '<div class="timeline-header" onclick="this.parentElement.classList.toggle(\'expanded\')">' +
        '<span class="timeline-time">' + escapeHtml(formatDateTime(s.ts)) + '</span>' +
        '<span class="timeline-skill"><span class="badge badge-blue">' + escapeHtml(s.skillSlug || '_generic') + '</span></span>' +
        '<span class="timeline-prompt">' + escapeHtml(prompt) + '</span>' +
        '<span class="timeline-duration">' + formatDuration(s.durationMs || 0) + '</span>' +
        '</div>' +
        '<div class="timeline-detail">' +
        '<div class="timeline-detail-label">Prompt</div>' +
        '<div class="json-view" style="max-height:100px">' + escapeHtml(s.prompt || '') + '</div>' +
        '<div class="timeline-detail-label">Result</div>' +
        '<div class="json-view" style="max-height:200px">' + escapeHtml(result) + '</div>' +
        '<div class="timeline-detail-label">Metadata</div>' +
        '<div class="json-view" style="max-height:100px">' +
        escapeHtml(JSON.stringify({ taskId: s.taskId, sessionId: s.sessionId, durationMs: s.durationMs }, null, 2)) +
        '</div>' +
        '</div></div>';
    }).join('');
  }

  $('sessions-refresh').addEventListener('click', fetchSessionHistory);

  // ══════════════════════════════════════════════════════════════
  // MEMORY MANAGER
  // ══════════════════════════════════════════════════════════════

  let currentMemFile = null; // { layer, filename }
  let contextSSE = null;

  async function loadAllMemoryLayers() {
    for (const layer of ['identity', 'semantic', 'episodic']) {
      await loadMemoryLayer(layer);
    }
  }

  async function loadMemoryLayer(layer) {
    try {
      const res = await fetch('/api/dashboard/memory/' + layer);
      const data = await res.json();
      renderMemoryFileList(layer, data.files || []);
    } catch {
      $('mem-files-' + layer).innerHTML = '<div style="padding:8px 12px;color:var(--text-dim);font-size:11px">No files</div>';
    }
  }

  function renderMemoryFileList(layer, files) {
    const container = $('mem-files-' + layer);
    if (files.length === 0) {
      container.innerHTML = '<div style="padding:8px 12px;color:var(--text-dim);font-size:11px">No files</div>';
      return;
    }
    container.innerHTML = files.map(f => {
      const isActive = currentMemFile && currentMemFile.layer === layer && currentMemFile.filename === f.name;
      return '<div class="memory-file-item' + (isActive ? ' active' : '') + '" data-layer="' + layer + '" data-file="' + escapeHtml(f.name) + '">' +
        '<span>' + escapeHtml(f.name) + '</span>' +
        '<span class="memory-file-size">' + f.size + 'b</span>' +
        '</div>';
    }).join('');

    container.querySelectorAll('.memory-file-item').forEach(item => {
      item.addEventListener('click', () => {
        openMemoryFile(item.dataset.layer, item.dataset.file);
      });
    });
  }

  async function openMemoryFile(layer, filename) {
    currentMemFile = { layer, filename };
    // Highlight active
    document.querySelectorAll('.memory-file-item').forEach(el => el.classList.remove('active'));
    const active = document.querySelector('.memory-file-item[data-layer="' + layer + '"][data-file="' + filename + '"]');
    if (active) active.classList.add('active');

    $('mem-editor-title').textContent = layer + '/' + filename;
    $('mem-editor-actions').style.display = 'flex';

    try {
      const res = await fetch('/api/dashboard/memory/' + layer + '/' + encodeURIComponent(filename));
      const data = await res.json();
      $('mem-editor-content').value = data.content || '';
    } catch {
      $('mem-editor-content').value = '(failed to load)';
    }
  }

  $('mem-save').addEventListener('click', async () => {
    if (!currentMemFile) return;
    const content = $('mem-editor-content').value;
    try {
      await fetch('/api/dashboard/memory/' + currentMemFile.layer + '/' + encodeURIComponent(currentMemFile.filename), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      loadMemoryLayer(currentMemFile.layer);
    } catch (err) {
      alert('Save failed: ' + err.message);
    }
  });

  $('mem-delete').addEventListener('click', async () => {
    if (!currentMemFile) return;
    if (!confirm('Delete ' + currentMemFile.layer + '/' + currentMemFile.filename + '?')) return;
    try {
      await fetch('/api/dashboard/memory/' + currentMemFile.layer + '/' + encodeURIComponent(currentMemFile.filename), {
        method: 'DELETE',
      });
      currentMemFile = null;
      $('mem-editor-title').textContent = 'Select a file to view';
      $('mem-editor-actions').style.display = 'none';
      $('mem-editor-content').value = '';
      loadAllMemoryLayers();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  });

  // Create file buttons
  document.querySelectorAll('[data-action="create"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const layer = btn.dataset.layer;
      const filename = prompt('New file name (must end with .md):', 'new-note.md');
      if (!filename || !filename.endsWith('.md')) return;
      try {
        await fetch('/api/dashboard/memory/' + layer + '/' + encodeURIComponent(filename), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: '# ' + filename.replace('.md', '') + '\n\n' }),
        });
        await loadMemoryLayer(layer);
        openMemoryFile(layer, filename);
      } catch (err) {
        alert('Create failed: ' + err.message);
      }
    });
  });

  // Context snapshot SSE
  function connectContextSSE() {
    if (contextSSE) contextSSE.close();
    contextSSE = new EventSource('/api/dashboard/context');
    contextSSE.onmessage = (evt) => {
      let parsed;
      try { parsed = JSON.parse(evt.data); } catch { return; }
      if (parsed.snapshot) {
        $('mem-context-body').textContent = parsed.snapshot;
        $('mem-version').textContent = 'v' + (parsed.memory_version || '?');
      }
    };
  }

  // ══════════════════════════════════════════════════════════════
  // HEALTH (existing)
  // ══════════════════════════════════════════════════════════════

  async function fetchHealth() {
    try {
      const res = await fetch('/api/dashboard/health');
      const data = await res.json();
      renderHealthCards(data);
      renderQueues(data.queues);
    } catch (err) {
      $('health-cards').innerHTML = '<div class="card"><div class="card-label">Error</div><div class="card-value error">' + escapeHtml(err.message) + '</div></div>';
    }
  }

  function renderHealthCards(data) {
    const pool = data.pool || {};
    const store = data.cardStore || {};
    const cards = [
      { label: 'Status', value: data.status, cls: data.status === 'ok' ? 'ok' : 'error' },
      { label: 'Uptime', value: formatUptime(data.uptime || 0), cls: '' },
      { label: 'User ID', value: data.userId || '-', cls: '' },
      { label: 'Pool Workers', value: pool.total !== undefined ? pool.busy + '/' + pool.total : '-', cls: pool.busy > 0 ? 'warn' : 'ok' },
      { label: 'Sessions', value: store.sessionCount !== undefined ? store.sessionCount : '-', cls: '' },
      { label: 'Total Cards', value: store.totalCards !== undefined ? store.totalCards : '-', cls: '' },
    ];
    $('health-cards').innerHTML = cards.map(c =>
      '<div class="card"><div class="card-label">' + c.label + '</div>' +
      '<div class="card-value ' + c.cls + '">' + escapeHtml(String(c.value)) + '</div></div>'
    ).join('');
  }

  function renderQueues(queues) {
    if (!queues || typeof queues !== 'object') {
      $('health-queues').innerHTML = '<div class="loading">No queue data</div>';
      return;
    }
    const entries = Object.entries(queues);
    if (entries.length === 0) {
      $('health-queues').innerHTML = '<div class="loading">No queues</div>';
      return;
    }
    $('health-queues').innerHTML =
      '<table><thead><tr><th>Queue</th><th>Depth</th></tr></thead><tbody>' +
      entries.map(([k, v]) =>
        '<tr><td>' + escapeHtml(k) + '</td><td>' + escapeHtml(String(v)) + '</td></tr>'
      ).join('') +
      '</tbody></table>';
  }

  // ══════════════════════════════════════════════════════════════
  // SKILLS (existing)
  // ══════════════════════════════════════════════════════════════

  async function fetchSkills() {
    try {
      const res = await fetch('/api/dashboard/skills');
      const data = await res.json();
      renderSkills(data.skills || []);
    } catch (err) {
      $('skills-table').innerHTML = '<div class="loading">Error: ' + escapeHtml(err.message) + '</div>';
    }
  }

  function renderSkills(skills) {
    if (skills.length === 0) {
      $('skills-table').innerHTML = '<div class="loading">No skills loaded</div>';
      return;
    }
    $('skills-table').innerHTML =
      '<table><thead><tr><th>Icon</th><th>Name</th><th>Slug</th><th>Category</th><th>Version</th><th>Tags</th></tr></thead><tbody>' +
      skills.map(s =>
        '<tr>' +
        '<td style="font-size:20px;text-align:center">' + (s.icon || '') + '</td>' +
        '<td><strong>' + escapeHtml(s.name) + '</strong><br><span style="color:var(--text-dim);font-size:11px">' + escapeHtml(s.description || '') + '</span></td>' +
        '<td><code>' + escapeHtml(s.slug) + '</code></td>' +
        '<td><span class="badge badge-blue">' + escapeHtml(s.category || '-') + '</span></td>' +
        '<td>' + escapeHtml(s.version || '-') + '</td>' +
        '<td>' + (s.tags || []).map(t => '<span class="badge badge-green" style="margin-right:4px">' + escapeHtml(t) + '</span>').join('') + '</td>' +
        '</tr>'
      ).join('') +
      '</tbody></table>';
  }

  // ══════════════════════════════════════════════════════════════
  // SSE MONITOR (existing)
  // ══════════════════════════════════════════════════════════════

  let evtSource = null;

  $('sse-connect').addEventListener('click', connectSSE);
  $('sse-clear').addEventListener('click', () => { $('sse-log').innerHTML = ''; });

  function connectSSE() {
    if (evtSource) { evtSource.close(); evtSource = null; }
    const uid = $('sse-uid').value.trim();
    const url = '/api/dashboard/sse' + (uid ? '?uid=' + encodeURIComponent(uid) : '');
    evtSource = new EventSource(url);
    $('sse-status').textContent = 'Connecting...';
    $('sse-connect').textContent = 'Reconnect';

    evtSource.onopen = () => { $('sse-status').textContent = 'Connected'; };
    evtSource.onmessage = (evt) => {
      let parsed;
      try { parsed = JSON.parse(evt.data); } catch { parsed = evt.data; }
      appendSSEEntry(parsed);
      if (parsed && parsed.op) handleCardOp(parsed);
    };
    evtSource.onerror = () => { $('sse-status').textContent = 'Disconnected'; };
  }

  function appendSSEEntry(data) {
    const log = $('sse-log');
    const entry = document.createElement('div');
    entry.className = 'sse-entry';

    const time = document.createElement('span');
    time.className = 'sse-time';
    time.textContent = new Date().toLocaleTimeString();

    const type = document.createElement('span');
    type.className = 'sse-type';
    const eventType = data.op || data.type || 'message';
    type.textContent = eventType;
    if (eventType.includes('card') || eventType.includes('html')) type.classList.add('card-op');
    else if (eventType.includes('exec') || eventType === 'connected') type.classList.add('lifecycle');
    else if (eventType.includes('error')) type.classList.add('error');

    const body = document.createElement('span');
    body.className = 'sse-data';
    body.textContent = typeof data === 'string' ? data : JSON.stringify(data);

    entry.appendChild(time);
    entry.appendChild(type);
    entry.appendChild(body);
    log.appendChild(entry);

    if (log.scrollHeight - log.scrollTop - log.clientHeight < 100) {
      log.scrollTop = log.scrollHeight;
    }
    while (log.children.length > 500) {
      log.removeChild(log.firstChild);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // CARD PREVIEW (existing)
  // ══════════════════════════════════════════════════════════════

  const cardState = {};
  const cardEvents = [];

  function handleCardOp(op) {
    cardEvents.push({ ts: Date.now(), op });
    if (cardEvents.length > 200) cardEvents.shift();

    switch (op.op) {
      case 'create_card':
        cardState[op.cardId] = { cardId: op.cardId, template: op.template, data: { ...op.data }, status: 'streaming' };
        break;
      case 'update_card':
        if (cardState[op.cardId]) Object.assign(cardState[op.cardId].data, op.updates);
        break;
      case 'stream_to_card':
        if (cardState[op.cardId]) {
          const prev = cardState[op.cardId].data[op.slot] || '';
          cardState[op.cardId].data[op.slot] = prev + op.chunk;
        }
        break;
      case 'append_to_card':
        if (cardState[op.cardId]) {
          const arr = cardState[op.cardId].data[op.slot] || [];
          cardState[op.cardId].data[op.slot] = arr.concat(op.items);
        }
        break;
      case 'replace_card':
        if (cardState[op.cardId]) {
          cardState[op.cardId].template = op.template;
          cardState[op.cardId].data = { ...op.data };
        }
        break;
      case 'finalize_card':
        if (cardState[op.cardId]) cardState[op.cardId].status = 'finalized';
        break;
      case 'remove_card':
        delete cardState[op.cardId];
        break;
      case 'html_stream':
        if (!cardState[op.cardId]) {
          cardState[op.cardId] = { cardId: op.cardId, template: 'html_stream', data: { html: '' }, status: 'streaming' };
        }
        cardState[op.cardId].data.html = (cardState[op.cardId].data.html || '') + op.chunk;
        if (op.done) cardState[op.cardId].status = 'finalized';
        break;
    }

    renderCards();
    renderCardEventLog();
  }

  function renderCards() {
    const canvas = $('card-canvas');
    const ids = Object.keys(cardState);
    if (ids.length === 0) {
      canvas.innerHTML = '<div class="loading">No cards</div>';
      return;
    }
    canvas.innerHTML = ids.map(id => {
      const card = cardState[id];
      const statusBadge = card.status === 'finalized'
        ? '<span class="badge badge-green">finalized</span>'
        : '<span class="badge badge-yellow">streaming</span>';
      return '<div class="card">' +
        '<div class="card-label">' + escapeHtml(card.template) + ' ' + statusBadge + '</div>' +
        '<div style="font-size:12px;color:var(--text-dim);margin-bottom:8px">ID: ' + escapeHtml(card.cardId) + '</div>' +
        '<div class="json-view" style="max-height:200px">' + escapeHtml(JSON.stringify(card.data, null, 2)) + '</div>' +
        '</div>';
    }).join('');
  }

  function renderCardEventLog() {
    const last20 = cardEvents.slice(-20);
    $('card-event-log').textContent = last20.map(e =>
      new Date(e.ts).toLocaleTimeString() + ' | ' + e.op.op + ' | ' + (e.op.cardId || '-')
    ).join('\n');
  }

  // ══════════════════════════════════════════════════════════════
  // TASK INSPECTOR (existing)
  // ══════════════════════════════════════════════════════════════

  async function fetchTemplates() {
    try {
      const res = await fetch('/api/dashboard/templates');
      const data = await res.json();
      renderTemplates(data.templates || []);
    } catch (err) {
      $('templates-table').innerHTML = '<div class="loading">Error: ' + escapeHtml(err.message) + '</div>';
    }
  }

  function renderTemplates(templates) {
    if (templates.length === 0) {
      $('templates-table').innerHTML = '<div class="loading">No templates loaded</div>';
      return;
    }
    $('templates-table').innerHTML =
      '<table><thead><tr><th>ID</th><th>Category</th><th>Renderer</th><th>Streamable</th><th>Mutable</th><th>Description</th></tr></thead><tbody>' +
      templates.map(t =>
        '<tr>' +
        '<td><code>' + escapeHtml(t.$id || '-') + '</code></td>' +
        '<td><span class="badge badge-blue">' + escapeHtml(t.category || '-') + '</span></td>' +
        '<td>' + escapeHtml(t.renderer || '-') + '</td>' +
        '<td>' + (t.streamable ? '<span class="badge badge-green">Yes</span>' : '<span class="badge badge-red">No</span>') + '</td>' +
        '<td>' + (t.mutable ? '<span class="badge badge-green">Yes</span>' : '<span class="badge badge-red">No</span>') + '</td>' +
        '<td style="max-width:300px">' + escapeHtml(t.description || '-') + '</td>' +
        '</tr>'
      ).join('') +
      '</tbody></table>';
  }

  async function fetchSessions() {
    try {
      const res = await fetch('/api/dashboard/sessions');
      const data = await res.json();
      renderSessionStats(data);
    } catch (err) {
      $('store-stats').innerHTML = '<div class="card"><div class="card-value error">' + escapeHtml(err.message) + '</div></div>';
    }
  }

  function renderSessionStats(data) {
    const cards = [
      { label: 'Sessions', value: data.sessionCount !== undefined ? data.sessionCount : '-' },
      { label: 'Total Events', value: data.totalEvents !== undefined ? data.totalEvents : '-' },
      { label: 'Total Cards', value: data.totalCards !== undefined ? data.totalCards : '-' },
    ];
    $('store-stats').innerHTML = cards.map(c =>
      '<div class="card"><div class="card-label">' + c.label + '</div>' +
      '<div class="card-value">' + escapeHtml(String(c.value)) + '</div></div>'
    ).join('');
  }

  // ── Auto-refresh health every 10s ──
  setInterval(() => {
    if (document.querySelector('#page-health.active')) fetchHealth();
  }, 10000);
})();
