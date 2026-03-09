// NanoClaw Dashboard — vanilla JS client (v2: Overview + Chat)
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
      if (target === 'overview') loadOverview();
      if (target === 'chat') {
        if (!sseConnected) connectSSE();
        loadSessionList();
      }
      if (target === 'packages') loadPackagesList();
      if (target === 'skills') loadSkillsList();
      if (target === 'templates') loadTemplatesList();
      if (target === 'apis') loadApiList();
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

  // ── Collapsible sections ──
  document.querySelectorAll('.section-header').forEach(header => {
    header.addEventListener('click', () => {
      const key = header.dataset.toggle;
      const body = $('section-' + key);
      const chevron = header.querySelector('.section-chevron');
      if (body.style.display === 'none') {
        body.style.display = '';
        chevron.textContent = '\u25BC';
      } else {
        body.style.display = 'none';
        chevron.textContent = '\u25B6';
      }
    });
  });

  // ══════════════════════════════════════════════════════════════
  // OVERVIEW
  // ══════════════════════════════════════════════════════════════

  async function loadOverview() {
    fetchHealth();
    fetchSkills();
    fetchTemplates();
    fetchSessions();
    loadAllMemoryLayers();
    connectContextSSE();
  }

  // ── Health ──
  async function fetchHealth() {
    try {
      const res = await fetch('/api/dashboard/health');
      const data = await res.json();
      renderHealthCards(data);
      renderQueues(data.queues);
      renderActiveUsers(data.activeUsers || [], data.userId, data.pool, data);
    } catch (err) {
      $('health-cards').innerHTML = '<div class="card"><div class="card-label">Error</div><div class="card-value error">' + escapeHtml(err.message) + '</div></div>';
    }
  }

  function renderHealthCards(data) {
    const store = data.cardStore || {};
    const activeUsers = data.activeUsers || [];

    // Session count: combine in-memory + persisted
    const liveCount = store.sessionCount || 0;
    const persistedCount = data.persistedSessions || 0;
    const totalSessions = Math.max(liveCount, persistedCount);

    const cards = [
      { label: 'Status', value: data.status, cls: data.status === 'ok' ? 'ok' : 'error' },
      { label: 'Uptime', value: formatUptime(data.uptime || 0), cls: '' },
      { label: 'Active Users', value: activeUsers.length, cls: activeUsers.length > 0 ? 'ok' : '' },
      { label: 'Sessions', value: totalSessions, cls: '', sub: liveCount > 0 ? liveCount + ' live' : '' },
      { label: 'Cards', value: store.totalCards !== undefined ? store.totalCards : '-', cls: '' },
    ];
    $('health-cards').innerHTML = cards.map(c =>
      '<div class="card"><div class="card-label">' + c.label + '</div>' +
      '<div class="card-value ' + c.cls + '">' + escapeHtml(String(c.value)) + '</div>' +
      (c.sub ? '<div class="card-sub">' + escapeHtml(c.sub) + '</div>' : '') +
      '</div>'
    ).join('');
  }

  let expandedUser = null;
  let cachedHealthData = null;

  function renderActiveUsers(users, configUserId, pool, healthData) {
    const container = $('active-users-list');
    pool = pool || {};
    cachedHealthData = healthData;
    // Always include config user
    const allUsers = new Set([configUserId, ...users]);
    if (allUsers.size === 0) {
      container.innerHTML = '<div class="loading">No active users</div>';
      return;
    }
    container.innerHTML = Array.from(allUsers).map(uid => {
      const isConfig = uid === configUserId;
      const isActive = users.includes(uid);
      const isExpanded = expandedUser === uid;
      const store = healthData?.cardStore || {};
      const sessCount = healthData?.persistedSessions || 0;

      let expandedHtml = '';
      if (isExpanded) {
        expandedHtml = '<div class="user-detail">' +
          '<div class="user-detail-row"><span>Sessions:</span><span>' + sessCount + ' total</span></div>' +
          '<div class="user-detail-row"><span>Live cards:</span><span>' + (store.totalCards || 0) + '</span></div>' +
          '<div class="user-detail-row"><span>Live events:</span><span>' + (store.totalEvents || 0) + '</span></div>' +
          '<div class="user-detail-row"><span>Mode:</span><span>' + (pool.running ? 'Pool (' + pool.workerCount + ' workers)' : 'Direct exec') + '</span></div>' +
          '</div>';
      }

      return '<div class="card user-card' + (isExpanded ? ' expanded' : '') + '" data-uid="' + escapeHtml(uid) + '" style="cursor:pointer">' +
        '<div class="card-label">' +
        (isConfig ? '<span class="badge badge-blue" style="margin-right:6px">host</span>' : '') +
        (isActive ? '<span class="badge badge-green" style="margin-right:6px">active</span>' : '<span class="badge badge-orange" style="margin-right:6px">idle</span>') +
        '</div>' +
        '<div class="card-value" style="font-size:16px">' + escapeHtml(uid) + '</div>' +
        expandedHtml +
        '</div>';
    }).join('');

    container.querySelectorAll('.user-card').forEach(card => {
      card.addEventListener('click', () => {
        const uid = card.dataset.uid;
        expandedUser = expandedUser === uid ? null : uid;
        renderActiveUsers(users, configUserId, pool, healthData);
      });
    });
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

  // ── Skills ──
  async function fetchSkills() {
    try {
      const res = await fetch('/api/dashboard/skills');
      const data = await res.json();
      skillsList = data.skills || [];
      renderSkillsGrid(skillsList);
    } catch (err) {
      $('skills-grid').innerHTML = '<div class="loading">Error: ' + escapeHtml(err.message) + '</div>';
    }
  }

  function renderSkillsGrid(skills) {
    if (skills.length === 0) {
      $('skills-grid').innerHTML = '<div class="loading">No skills loaded</div>';
      return;
    }
    $('skills-grid').innerHTML = skills.map(s =>
      '<div class="skill-card">' +
      '<div class="skill-card-icon">' + (s.icon || '') + '</div>' +
      '<div class="skill-card-info">' +
      '<div class="skill-card-name">' + escapeHtml(s.name) + '</div>' +
      '<div class="skill-card-meta">' +
      '<code>' + escapeHtml(formatSkillTag(s.slug)) + '</code>' +
      '<span class="badge badge-blue">' + escapeHtml(s.category || '-') + '</span>' +
      '</div>' +
      '</div>' +
      '</div>'
    ).join('');
  }

  // ── Templates ──
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
      '<table><thead><tr><th>ID</th><th>Category</th><th>Streamable</th></tr></thead><tbody>' +
      templates.map(t =>
        '<tr>' +
        '<td><code>' + escapeHtml(t.$id || '-') + '</code></td>' +
        '<td><span class="badge badge-blue">' + escapeHtml(t.category || '-') + '</span></td>' +
        '<td>' + (t.streamable ? '<span class="badge badge-green">Yes</span>' : '<span class="badge badge-red">No</span>') + '</td>' +
        '</tr>'
      ).join('') +
      '</tbody></table>';
  }

  // ── Card Store Stats ──
  async function fetchSessions() {
    try {
      const res = await fetch('/api/dashboard/sessions');
      const data = await res.json();
      const cards = [
        { label: 'Sessions', value: data.sessionCount !== undefined ? data.sessionCount : '-' },
        { label: 'Total Events', value: data.totalEvents !== undefined ? data.totalEvents : '-' },
        { label: 'Total Cards', value: data.totalCards !== undefined ? data.totalCards : '-' },
      ];
      $('store-stats').innerHTML = cards.map(c =>
        '<div class="card"><div class="card-label">' + c.label + '</div>' +
        '<div class="card-value">' + escapeHtml(String(c.value)) + '</div></div>'
      ).join('');
    } catch (err) {
      $('store-stats').innerHTML = '<div class="card"><div class="card-value error">' + escapeHtml(err.message) + '</div></div>';
    }
  }

  // ── Memory Manager ──
  let currentMemFile = null;
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

  document.querySelectorAll('[data-action="create"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
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

  // ── Auto-refresh ──
  // Health every 10s
  setInterval(() => {
    if (document.querySelector('#page-overview.active')) fetchHealth();
  }, 10000);

  // Full overview refresh every 30s (skills, templates, sessions, memory)
  setInterval(() => {
    if (document.querySelector('#page-overview.active')) {
      fetchSkills();
      fetchTemplates();
      fetchSessions();
    }
  }, 30000);

  // Chat session list refresh every 15s
  setInterval(() => {
    if (document.querySelector('#page-chat.active')) {
      loadSessionList();
    }
  }, 15000);

  // Load overview on start
  loadOverview();

  // ══════════════════════════════════════════════════════════════
  // CHAT
  // ══════════════════════════════════════════════════════════════

  let sseConnected = false;
  let multiSSE = null;
  let chatTaskId = null;
  let selectedSkill = null;
  let skillsList = [];
  let chatCards = {};
  let currentSessionId = null;

  // ── SSE Connection (shared: chat events + monitor) ──
  function connectSSE() {
    if (multiSSE) multiSSE.close();
    multiSSE = new EventSource('/api/dashboard/sse/all');
    sseConnected = true;

    multiSSE.onopen = () => {
      document.querySelector('.sidebar-footer').innerHTML = '<span class="status-dot live"></span> Connected';
    };

    multiSSE.onmessage = (evt) => {
      let parsed;
      try { parsed = JSON.parse(evt.data); } catch { return; }

      const channel = parsed.channel || 'unknown';
      const data = parsed.data;

      // Feed to monitor panel
      appendMonitorEntry(channel, parsed.ts, data);

      // Feed to chat if it's a stream event
      if (channel === 'stream' && data) {
        handleChatEvent(data);
      }
    };

    multiSSE.onerror = () => {
      document.querySelector('.sidebar-footer').innerHTML = '<span class="status-dot off"></span> Disconnected';
      sseConnected = false;
    };
  }

  // ── Monitor Panel ──
  let monitorOpen = false;

  $('monitor-toggle').addEventListener('click', (e) => {
    if (e.target.closest('.ch-filter') || e.target.closest('#monitor-clear')) return;
    monitorOpen = !monitorOpen;
    $('monitor-log').style.display = monitorOpen ? '' : 'none';
    $('monitor-toggle').querySelector('span:first-child').textContent = (monitorOpen ? '\u25BC' : '\u25B6') + ' Monitor';
  });

  $('monitor-clear').addEventListener('click', (e) => {
    e.stopPropagation();
    $('monitor-log').innerHTML = '';
  });

  const CHANNEL_COLORS = {
    ctx: 'ch-tag-ctx', exec: 'ch-tag-exec', stream: 'ch-tag-stream',
    intent: 'ch-tag-intent', actions: 'ch-tag-actions', summary: 'ch-tag-summary',
    frames: 'ch-tag-frames', media: 'ch-tag-media', events: 'ch-tag-events',
  };

  function getActiveFilters() {
    const filters = new Set();
    document.querySelectorAll('#channel-filters input:checked').forEach(cb => {
      filters.add(cb.value);
    });
    return filters;
  }

  function appendMonitorEntry(channel, ts, data) {
    const filters = getActiveFilters();
    if (!filters.has(channel)) return;

    const log = $('monitor-log');
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
    while (log.children.length > 500) {
      log.removeChild(log.firstChild);
    }
  }

  // ── Session Sidebar ──
  let sessionHistory = [];

  async function loadSessionList() {
    const container = $('session-list');
    container.style.opacity = '0.5';
    try {
      const res = await fetch('/api/dashboard/sessions/history?t=' + Date.now());
      const data = await res.json();
      sessionHistory = data.sessions || [];
      renderSessionList();
    } catch {
      container.innerHTML = '<div class="loading" style="padding:16px;font-size:12px">Failed to load</div>';
    } finally {
      container.style.opacity = '1';
    }
  }

  function renderSessionList() {
    const container = $('session-list');
    if (sessionHistory.length === 0) {
      container.innerHTML = '<div class="loading" style="padding:16px;font-size:12px">No sessions yet</div>';
      return;
    }

    // Group by date
    const groups = {};
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    // Group by sessionId, collect tasks per session
    const sessionMap = {};
    for (const task of sessionHistory) {
      const sid = task.sessionId || 'unknown';
      if (!sessionMap[sid]) {
        sessionMap[sid] = { sessionId: sid, tasks: [], latestTs: 0 };
      }
      sessionMap[sid].tasks.push(task);
      if (task.ts > sessionMap[sid].latestTs) sessionMap[sid].latestTs = task.ts;
    }

    const sessions = Object.values(sessionMap).sort((a, b) => b.latestTs - a.latestTs);

    for (const session of sessions) {
      const d = new Date(session.latestTs).toDateString();
      let label;
      if (d === today) label = 'Today';
      else if (d === yesterday) label = 'Yesterday';
      else label = new Date(session.latestTs).toLocaleDateString();
      if (!groups[label]) groups[label] = [];
      groups[label].push(session);
    }

    let html = '';
    for (const [label, items] of Object.entries(groups)) {
      html += '<div class="session-group-label">' + escapeHtml(label) + '</div>';
      for (const session of items) {
        const firstTask = session.tasks[0];
        const prompt = (firstTask.prompt || '').slice(0, 50);
        const skill = firstTask.skillSlug || '';
        const isActive = session.sessionId === currentSessionId;
        html += '<div class="session-item' + (isActive ? ' active' : '') + '" data-session-id="' + escapeHtml(session.sessionId) + '">' +
          '<div class="session-item-prompt">' + escapeHtml(prompt || 'Untitled') + '</div>' +
          '<div class="session-item-meta">' +
          (skill ? '<span class="badge badge-purple" style="font-size:10px">' + formatSkillTag(skill) + '</span> ' : '') +
          '<span>' + session.tasks.length + ' task' + (session.tasks.length > 1 ? 's' : '') + '</span>' +
          '</div>' +
          '</div>';
      }
    }

    container.innerHTML = html;

    container.querySelectorAll('.session-item').forEach(item => {
      item.addEventListener('click', () => {
        const sid = item.dataset.sessionId;
        loadSession(sid);
      });
    });
  }

  function loadSession(sessionId) {
    currentSessionId = sessionId;
    renderSessionList(); // highlight active

    const session = Object.values(
      sessionHistory.reduce((acc, t) => {
        const sid = t.sessionId || 'unknown';
        if (!acc[sid]) acc[sid] = { sessionId: sid, tasks: [] };
        acc[sid].tasks.push(t);
        return acc;
      }, {})
    ).find(s => s.sessionId === sessionId);

    if (!session) return;

    // Populate session info panel
    renderSessionInfo(session);

    const msgs = $('chat-messages');
    msgs.innerHTML = '';

    // Sort tasks by timestamp
    const tasks = session.tasks.sort((a, b) => (a.ts || 0) - (b.ts || 0));

    // Collect ALL cards across tasks, keeping only the latest version of each cardId
    const allCards = {};
    const cardTaskMap = {};
    for (const task of tasks) {
      const taskCards = task.cards || {};
      for (const [id, card] of Object.entries(taskCards)) {
        // Only keep finalized cards, or the latest version
        if (!allCards[id] || card.status === 'finalized') {
          allCards[id] = Object.assign({ cardId: id }, card);
          cardTaskMap[id] = task;
        }
      }
    }

    for (const task of tasks) {
      // User message with media thumbnails
      const userDiv = document.createElement('div');
      userDiv.className = 'chat-msg user';
      let userMediaHtml = '';
      if (task.mediaUrls && task.mediaUrls.length > 0) {
        userMediaHtml = '<div style="margin-bottom:8px">' +
          task.mediaUrls.map(function(url) {
            return '<img src="' + escapeHtml(url) + '" style="max-width:200px;max-height:150px;border-radius:8px;margin:2px" onerror="this.style.display=\'none\'">';
          }).join('') + '</div>';
      }
      userDiv.innerHTML =
        '<div class="chat-bubble">' + userMediaHtml + escapeHtml(task.prompt || '') + '</div>' +
        '<div class="chat-msg-meta">' +
        (task.skillSlug ? '<span class="badge badge-purple" style="margin-right:6px">' + formatSkillTag(task.skillSlug) + '</span>' : '') +
        formatDateTime(task.ts) +
        '</div>';
      msgs.appendChild(userDiv);

      // Show deduplicated cards — only cards whose latest version belongs to THIS task
      const taskCardIds = Object.keys(task.cards || {}).filter(id => cardTaskMap[id] === task);
      if (taskCardIds.length > 0) {
        const cardsDiv = document.createElement('div');
        cardsDiv.className = 'chat-msg assistant';
        let cardsHtml = '';
        for (const id of taskCardIds) {
          const card = allCards[id];
          try {
            if (card._rawMode) {
              cardsHtml += renderCardRaw(card);
            } else {
              cardsHtml += renderCardVisual(card);
            }
          } catch {
            cardsHtml += '<div class="chat-card-result">' + escapeHtml(JSON.stringify(card, null, 2)) + '</div>';
          }
        }
        cardsDiv.innerHTML =
          '<div class="chat-cards-container">' + cardsHtml + '</div>' +
          '<div class="chat-msg-meta">' + formatDuration(task.durationMs || 0) + '</div>';
        msgs.appendChild(cardsDiv);

        // Wire up </> toggle buttons for history cards
        cardsDiv.querySelectorAll('.chat-card-toggle').forEach(function(btn) {
          btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const cardId = btn.dataset.cardId;
            if (allCards[cardId]) {
              allCards[cardId]._rawMode = !allCards[cardId]._rawMode;
              loadSession(currentSessionId); // re-render
            }
          });
        });
      }

      // Show text result only if NO cards at all for this task
      const hasAnyCards = Object.keys(task.cards || {}).length > 0;
      if (task.result && !hasAnyCards) {
        const assistantDiv = document.createElement('div');
        assistantDiv.className = 'chat-msg assistant';
        const isHtml = task.result.trim().startsWith('<');
        if (isHtml) {
          assistantDiv.innerHTML =
            '<div class="chat-bubble"><div class="chat-card-html">' + task.result + '</div></div>' +
            '<div class="chat-msg-meta">' + formatDuration(task.durationMs || 0) + '</div>';
        } else {
          assistantDiv.innerHTML =
            '<div class="chat-bubble">' + escapeHtml(task.result) + '</div>' +
            '<div class="chat-msg-meta">' + formatDuration(task.durationMs || 0) + '</div>';
        }
        msgs.appendChild(assistantDiv);
      }
    }

    msgs.scrollTop = msgs.scrollHeight;
  }

  function renderSessionInfo(session) {
    const container = $('session-info');
    if (!session) {
      container.innerHTML = '<div class="session-info-empty">Select a session for details</div>';
      return;
    }

    const tasks = session.tasks || [];
    const firstTs = tasks.reduce((min, t) => t.ts < min ? t.ts : min, tasks[0]?.ts || 0);
    const lastTs = tasks.reduce((max, t) => t.ts > max ? t.ts : max, 0);
    const skills = [...new Set(tasks.map(t => t.skillSlug).filter(Boolean))];
    const totalDuration = tasks.reduce((sum, t) => sum + (t.durationMs || 0), 0);

    container.innerHTML =
      '<div class="session-info-label">Session ID</div>' +
      '<div class="session-info-value">' + escapeHtml(session.sessionId) + '</div>' +
      '<div class="session-info-label">Tasks</div>' +
      '<div class="session-info-value">' + tasks.length + ' task' + (tasks.length !== 1 ? 's' : '') + '</div>' +
      '<div class="session-info-label">Duration</div>' +
      '<div class="session-info-value">' + formatDuration(totalDuration) + '</div>' +
      (skills.length > 0 ? (
        '<div class="session-info-label">Skills</div>' +
        '<div class="session-info-value">' + skills.map(s => '<span class="badge badge-purple" style="font-size:10px;margin-right:4px">' + formatSkillTag(s) + '</span>').join('') + '</div>'
      ) : '') +
      '<div class="session-info-label">Time</div>' +
      '<div class="session-info-value">' + formatDateTime(firstTs) + '</div>';
  }

  function formatSkillTag(slug) {
    if (!slug) return '';
    if (slug === 'agent:main' || slug === '_generic') return '@agent:main';
    return '@skill:' + escapeHtml(slug);
  }

  $('new-session-btn').addEventListener('click', () => {
    currentSessionId = null;
    chatCards = {};
    currentAssistantDiv = null;
    const msgs = $('chat-messages');
    msgs.innerHTML = '<div class="chat-empty">Send a message to start a conversation with NanoClaw</div>';
    renderSessionList();
    renderSessionInfo(null);
  });

  $('refresh-sessions-btn').addEventListener('click', () => {
    loadSessionList();
  });

  // ── Chat Event Handling ──
  // Track the active streaming taskId — either from dashboard chat or external exec
  let activeStreamTaskId = null;

  function handleChatEvent(data) {
    // For exec lifecycle events
    if (data.type === 'exec_start' || data.type === 'exec_progress' ||
        data.type === 'exec_result' || data.type === 'exec_error') {

      // If this is from our own dashboard chat, match taskId
      if (chatTaskId && data.taskId && data.taskId !== chatTaskId) return;

      // If this is an external exec (camera/frontend), show it too
      if (data.type === 'exec_start') {
        activeStreamTaskId = data.taskId;
        if (!chatTaskId) {
          // External exec — create a user message bubble for context
          const prompt = data.prompt || data.taskId || 'External task';
          appendUserMessage(prompt, data.skillSlug || null, data.mediaUrls || []);
        }
        appendAssistantThinking();
      } else if (data.type === 'exec_progress') {
        // Only show for active task
        if (data.taskId && data.taskId !== activeStreamTaskId && data.taskId !== chatTaskId) return;
        updateAssistantThinking(data.message);
      } else if (data.type === 'exec_result') {
        if (data.taskId && data.taskId !== activeStreamTaskId && data.taskId !== chatTaskId) return;
        finalizeAssistantMessage(data.summary);
        activeStreamTaskId = null;
      } else if (data.type === 'exec_error') {
        if (data.taskId && data.taskId !== activeStreamTaskId && data.taskId !== chatTaskId) return;
        finalizeAssistantError(data.error);
        activeStreamTaskId = null;
      }
    } else if (data.op) {
      // Card operations — accept for any active task (dashboard or external)
      if (!activeStreamTaskId && !chatTaskId && !currentAssistantDiv) return;
      if (data.taskId && data.taskId !== activeStreamTaskId && data.taskId !== chatTaskId) return;
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

  // Render card using iframe embed for rich display
  function renderCardVisual(card) {
    const statusBadge = card.status === 'finalized'
      ? '<span class="badge badge-green" style="font-size:10px">done</span>'
      : '<span class="badge badge-yellow" style="font-size:10px">streaming</span>';
    const toggle = renderCardToggle(card);
    const iframeId = 'card-iframe-' + (card.cardId || Math.random().toString(36).slice(2));

    // Thinking process cards — keep inline (no need for iframe)
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

    // All other cards — render via iframe for rich display
    return '<div class="chat-card-rendered">' +
      '<div class="chat-card-header">' + escapeHtml(card.template || 'card') + ' ' + statusBadge + toggle + '</div>' +
      '<div class="chat-card-iframe-wrap">' +
      '<iframe id="' + iframeId + '" class="chat-card-iframe" src="/card-embed.html" ' +
      'data-card="' + escapeHtml(JSON.stringify(card)) + '" ' +
      'scrolling="no" style="height:60px"></iframe>' +
      '</div></div>';
  }

  // Auto-resize iframes and send card data once loaded
  window.addEventListener('message', function(e) {
    if (!e.data) return;
    if (e.data.type === 'card-embed-ready') {
      // Find the iframe that sent this message and send it the card data
      document.querySelectorAll('.chat-card-iframe').forEach(function(iframe) {
        if (iframe.contentWindow === e.source && iframe.dataset.card) {
          try {
            const card = JSON.parse(iframe.dataset.card);
            iframe.contentWindow.postMessage({ type: 'render-card', card: card }, '*');
          } catch (err) { /* ignore parse errors */ }
        }
      });
    }
    if (e.data.type === 'card-height' && e.data.cardId) {
      // Resize the iframe to fit content
      const iframe = document.getElementById('card-iframe-' + e.data.cardId);
      if (iframe && e.data.height > 0) {
        iframe.style.height = Math.min(e.data.height + 4, 600) + 'px';
      }
    }
  });

  function renderCardRaw(card) {
    const toggle = '<button class="chat-card-toggle raw" data-card-id="' + escapeHtml(card.cardId) + '" title="Show rendered">&lt;/&gt;</button>';
    return '<div class="chat-card-result">' +
      toggle +
      escapeHtml(JSON.stringify(card, null, 2)) +
      '</div>';
  }

  // ── Chat Messages ──
  function appendUserMessage(text, skill, mediaUrls) {
    const msgs = $('chat-messages');
    const empty = msgs.querySelector('.chat-empty');
    if (empty) empty.remove();

    let mediaHtml = '';
    if (mediaUrls && mediaUrls.length > 0) {
      mediaHtml = '<div style="margin-bottom:8px">' +
        mediaUrls.map(function(url) {
          return '<img src="' + escapeHtml(url) + '" style="max-width:200px;max-height:150px;border-radius:8px;margin:2px" onerror="this.style.display=\'none\'">';
        }).join('') +
        '</div>';
    }

    const div = document.createElement('div');
    div.className = 'chat-msg user';
    div.innerHTML =
      '<div class="chat-bubble">' + mediaHtml + escapeHtml(text) + '</div>' +
      '<div class="chat-msg-meta">' +
      (skill ? '<span class="badge badge-purple" style="margin-right:6px">' + formatSkillTag(skill) + '</span>' : '') +
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
    // Refresh session list to show new task
    loadSessionList();
  }

  function finalizeAssistantError(error) {
    if (!currentAssistantDiv) appendAssistantThinking();
    const bubble = currentAssistantDiv.querySelector('.chat-bubble');
    bubble.innerHTML = '<span style="color:var(--red)">Error: ' + escapeHtml(error) + '</span>';
    currentAssistantDiv = null;
    chatTaskId = null;
  }

  // ── Send Chat ──
  async function sendChat() {
    const input = $('chat-input');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    chatCards = {};
    currentAssistantDiv = null;
    appendUserMessage(text, selectedSkill ? selectedSkill.slug : null);

    if (!sseConnected) connectSSE();

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
      if (data.sessionId) currentSessionId = data.sessionId;

      selectedSkill = null;
      $('chat-skill-tag').style.display = 'none';
    } catch (err) {
      finalizeAssistantError(err.message);
    }
  }

  function handleChatKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatWithMedia();
    }
  }

  $('chat-send').addEventListener('click', sendChatWithMedia);
  $('chat-input').addEventListener('keydown', handleChatKeydown);

  // ── Skill Picker ──
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
          $('chat-skill-name').textContent = formatSkillTag(skill.slug);
          $('chat-skill-tag').style.display = 'inline-flex';
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

  // ══════════════════════════════════════════════════════════════
  // CHAT FILE UPLOAD
  // ══════════════════════════════════════════════════════════════

  let chatUploadFiles = []; // { file, preview, url }

  $('chat-add-btn').addEventListener('click', () => {
    $('chat-file-input').click();
  });

  $('chat-file-input').addEventListener('change', (e) => {
    if (e.target.files) addChatFiles(Array.from(e.target.files));
    e.target.value = '';
  });

  // Drag and drop on chat input area
  const chatInputArea = $('chat-input-area');
  chatInputArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    chatInputArea.classList.add('drag-over');
  });
  chatInputArea.addEventListener('dragleave', () => {
    chatInputArea.classList.remove('drag-over');
  });
  chatInputArea.addEventListener('drop', (e) => {
    e.preventDefault();
    chatInputArea.classList.remove('drag-over');
    if (e.dataTransfer.files) addChatFiles(Array.from(e.dataTransfer.files));
  });

  function addChatFiles(files) {
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => {
        const entry = { file, preview: reader.result, url: null, uploading: true };
        chatUploadFiles.push(entry);
        renderChatUploadPreviews();
        // Upload
        uploadFile(reader.result, file.name).then(url => {
          entry.url = url;
          entry.uploading = false;
          renderChatUploadPreviews();
        }).catch(() => {
          entry.uploading = false;
          entry.error = true;
          renderChatUploadPreviews();
        });
      };
      reader.readAsDataURL(file);
    }
  }

  async function uploadFile(dataUrl, filename) {
    const res = await fetch('/api/dashboard/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl, filename }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data.url;
  }

  function renderChatUploadPreviews() {
    const container = $('chat-upload-preview');
    if (chatUploadFiles.length === 0) {
      container.style.display = 'none';
      return;
    }
    container.style.display = 'flex';
    container.innerHTML = chatUploadFiles.map((f, i) => {
      const isImage = f.file.type.startsWith('image/');
      const thumb = isImage
        ? '<img src="' + escapeHtml(f.preview) + '" alt="">'
        : '<div class="chat-upload-file-icon">' + escapeHtml(f.file.name.split('.').pop()) + '</div>';
      return '<div class="chat-upload-thumb' + (f.uploading ? ' uploading' : '') + (f.error ? ' error' : '') + '" data-idx="' + i + '">' +
        thumb +
        '<button class="remove" data-idx="' + i + '">&times;</button>' +
        '</div>';
    }).join('');

    container.querySelectorAll('.remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        chatUploadFiles.splice(parseInt(btn.dataset.idx), 1);
        renderChatUploadPreviews();
      });
    });
  }

  // Override sendChat to include media URLs
  const _origSendChat = sendChat;
  async function sendChatWithMedia() {
    const input = $('chat-input');
    const text = input.value.trim();
    if (!text && chatUploadFiles.length === 0) return;

    // Wait for all uploads to complete
    const pending = chatUploadFiles.filter(f => f.uploading);
    if (pending.length > 0) return; // still uploading

    const mediaUrls = chatUploadFiles.filter(f => f.url).map(f => f.url);

    input.value = '';
    chatCards = {};
    currentAssistantDiv = null;
    appendUserMessage(text || '(media)', selectedSkill ? selectedSkill.slug : null, mediaUrls);
    chatUploadFiles = [];
    renderChatUploadPreviews();

    if (!sseConnected) connectSSE();

    try {
      const body = { prompt: text || 'Analyze this' };
      if (selectedSkill) body.skillSlug = selectedSkill.slug;
      if (mediaUrls.length > 0) body.mediaUrls = mediaUrls;

      const res = await fetch('/api/dashboard/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      chatTaskId = data.taskId;
      if (data.sessionId) currentSessionId = data.sessionId;
      selectedSkill = null;
      $('chat-skill-tag').style.display = 'none';
    } catch (err) {
      finalizeAssistantError(err.message);
    }
  }

  // chat-send and chat-input already wired to sendChatWithMedia above

  // ══════════════════════════════════════════════════════════════
  // PACKAGES TAB
  // ══════════════════════════════════════════════════════════════

  let packagesList = [];
  let selectedPackageId = null;

  async function loadPackagesList() {
    try {
      const res = await fetch('/api/dashboard/packages');
      const data = await res.json();
      packagesList = data.packages || [];
      renderPackagesList();
    } catch (err) {
      $('pkg-list').innerHTML = '<div class="loading">Error: ' + escapeHtml(err.message) + '</div>';
    }
  }

  function renderPackagesList(filter) {
    const container = $('pkg-list');
    let filtered = packagesList;
    if (filter) {
      const q = filter.toLowerCase();
      filtered = packagesList.filter(p =>
        p.name.toLowerCase().includes(q) || (p.id || '').toLowerCase().includes(q)
      );
    }

    if (filtered.length === 0) {
      container.innerHTML = '<div class="loading">No packages found</div>';
      return;
    }

    container.innerHTML = filtered.map(p =>
      '<div class="pkg-item' + (selectedPackageId === p.id ? ' active' : '') + '" data-id="' + escapeHtml(p.id) + '">' +
      '<span class="pkg-item-icon">' + (p.icon || '📦') + '</span>' +
      '<div class="pkg-item-info">' +
      '<div class="pkg-item-name">' + escapeHtml(p.name) + '</div>' +
      '<div class="pkg-item-desc">' + escapeHtml(p.description || '') + '</div>' +
      '<div class="pkg-item-meta">' +
      '<span class="badge badge-blue">' + escapeHtml(p.category || '-') + '</span>' +
      '<span class="badge badge-green">' + p.templateCount + ' tpl</span>' +
      '</div></div></div>'
    ).join('');

    container.querySelectorAll('.pkg-item').forEach(item => {
      item.addEventListener('click', () => selectPackage(item.dataset.id));
    });
  }

  $('pkg-filter-input').addEventListener('input', (e) => renderPackagesList(e.target.value));
  $('pkg-refresh-btn').addEventListener('click', loadPackagesList);

  async function selectPackage(packageId) {
    selectedPackageId = packageId;
    renderPackagesList($('pkg-filter-input').value);

    try {
      const res = await fetch('/api/dashboard/packages/' + encodeURIComponent(packageId));
      const pkg = await res.json();
      renderPackageDetail(pkg);
    } catch (err) {
      $('pkg-main').innerHTML = '<div class="loading">Error: ' + escapeHtml(err.message) + '</div>';
    }
  }

  let pkgActiveTab = 'info';

  function renderPackageDetail(pkg) {
    const manifest = pkg.manifest || {};
    const main = $('pkg-main');

    main.innerHTML =
      '<div class="pkg-detail-header">' +
      '<span class="pkg-detail-icon">' + (manifest.icon || '📦') + '</span>' +
      '<div>' +
      '<h3 class="pkg-detail-title">' + escapeHtml(manifest.name || manifest.id) + '</h3>' +
      '<div class="pkg-detail-meta">' +
      '<code>' + escapeHtml(manifest.id) + '</code> ' +
      '<span class="badge badge-blue">' + escapeHtml(manifest.category || '-') + '</span> ' +
      '<span class="badge badge-green">v' + escapeHtml(manifest.version || '?') + '</span>' +
      '</div></div></div>' +
      '<div class="pkg-detail-tabs">' +
      '<button class="pkg-detail-tab' + (pkgActiveTab === 'info' ? ' active' : '') + '" data-tab="info">Info</button>' +
      '<button class="pkg-detail-tab' + (pkgActiveTab === 'playground' ? ' active' : '') + '" data-tab="playground">Playground</button>' +
      '</div>' +
      '<div class="pkg-detail-content" id="pkg-detail-content"></div>';

    main.querySelectorAll('.pkg-detail-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        pkgActiveTab = tab.dataset.tab;
        renderPackageDetail(pkg);
      });
    });

    if (pkgActiveTab === 'info') renderPackageInfo(pkg);
    else renderPackagePlayground(pkg);
  }

  function renderPackageInfo(pkg) {
    const m = pkg.manifest || {};
    const content = $('pkg-detail-content');
    let html = '<div class="pkg-info">';

    // Description
    html += '<div class="pkg-info-section"><div class="pkg-info-label">Description</div>' +
      '<div class="pkg-info-value">' + escapeHtml(m.description || 'No description') + '</div></div>';

    // Instruction
    if (pkg.skillPrompt) {
      html += '<div class="pkg-info-section"><div class="pkg-info-label">Instruction Prompt</div>' +
        '<div class="pkg-info-code">' + escapeHtml(pkg.skillPrompt.slice(0, 2000)) + '</div></div>';
    }

    // Templates
    if (pkg.templates && pkg.templates.length > 0) {
      html += '<div class="pkg-info-section"><div class="pkg-info-label">Templates (' + pkg.templates.length + ')</div>' +
        '<div class="pkg-info-list">' + pkg.templates.map(t =>
          '<div class="pkg-info-list-item"><code>' + escapeHtml(t.$id) + '</code> ' +
          '<span class="badge badge-blue">' + escapeHtml(t.category || '-') + '</span> ' +
          (t.streamable ? '<span class="badge badge-green">streamable</span>' : '') +
          '</div>'
        ).join('') + '</div></div>';
    }

    // Tools
    if (pkg.toolDefinitions && pkg.toolDefinitions.length > 0) {
      html += '<div class="pkg-info-section"><div class="pkg-info-label">Tools (' + pkg.toolDefinitions.length + ')</div>' +
        '<div class="pkg-info-list">' + pkg.toolDefinitions.map(t =>
          '<div class="pkg-info-list-item"><code>' + escapeHtml(t.name) + '</code> ' +
          '<span style="color:var(--text-dim);font-size:12px">' + escapeHtml(t.description || '') + '</span></div>'
        ).join('') + '</div></div>';
    }

    // Manifest JSON
    html += '<div class="pkg-info-section"><div class="pkg-info-label">Manifest (JSON)</div>' +
      '<div class="json-view">' + escapeHtml(JSON.stringify(m, null, 2)) + '</div></div>';

    html += '</div>';
    content.innerHTML = html;
  }

  let pkgPlaygroundExamples = [];
  let pkgPlaygroundCards = {};
  let pkgPlaygroundTaskId = null;

  async function renderPackagePlayground(pkg) {
    const content = $('pkg-detail-content');
    const packageId = pkg.manifest.id;

    content.innerHTML =
      '<div class="pkg-playground">' +
      '<div class="pkg-playground-sidebar">' +
      '<div class="pkg-playground-sidebar-header">Examples</div>' +
      '<div class="pkg-playground-examples" id="pkg-examples-list"><div class="loading">Loading...</div></div>' +
      '<div class="pkg-playground-sidebar-header" style="margin-top:12px">History</div>' +
      '<div class="pkg-playground-history" id="pkg-history-list"><div class="loading" style="font-size:11px">No history yet</div></div>' +
      '</div>' +
      '<div class="pkg-playground-chat">' +
      '<div class="pkg-playground-messages" id="pkg-messages">' +
      '<div class="chat-empty">Test this package by sending a message</div>' +
      '</div>' +
      '<div class="chat-input-area">' +
      '<div class="pkg-media-area" id="pkg-media-area">Drop files here or click to upload</div>' +
      '<div class="pkg-media-previews" id="pkg-media-previews"></div>' +
      '<div class="chat-input-row">' +
      '<button class="btn-icon chat-add-btn" id="pkg-add-btn" title="Attach files">+</button>' +
      '<input type="text" id="pkg-chat-input" placeholder="Test this package..." autocomplete="off">' +
      '<button class="btn btn-primary" id="pkg-chat-send">Send</button>' +
      '</div>' +
      '<input type="file" id="pkg-file-input" multiple accept="image/*,video/*,.pdf" style="display:none">' +
      '</div></div></div>';

    // Load examples
    loadPkgExamples(packageId);

    // Wire up events
    $('pkg-chat-send').addEventListener('click', () => sendPkgTest(packageId));
    $('pkg-chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendPkgTest(packageId); }
    });
    $('pkg-add-btn').addEventListener('click', () => $('pkg-file-input').click());
    $('pkg-file-input').addEventListener('change', (e) => {
      if (e.target.files) addPkgFiles(Array.from(e.target.files));
      e.target.value = '';
    });

    // Drag-drop on media area
    const mediaArea = $('pkg-media-area');
    mediaArea.addEventListener('click', () => $('pkg-file-input').click());
    mediaArea.addEventListener('dragover', (e) => { e.preventDefault(); mediaArea.classList.add('drag-over'); });
    mediaArea.addEventListener('dragleave', () => mediaArea.classList.remove('drag-over'));
    mediaArea.addEventListener('drop', (e) => {
      e.preventDefault(); mediaArea.classList.remove('drag-over');
      if (e.dataTransfer.files) addPkgFiles(Array.from(e.dataTransfer.files));
    });
  }

  let pkgMediaFiles = [];

  function addPkgFiles(files) {
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => {
        const entry = { file, preview: reader.result, url: null, uploading: true };
        pkgMediaFiles.push(entry);
        renderPkgMediaPreviews();
        uploadFile(reader.result, file.name).then(url => {
          entry.url = url; entry.uploading = false; renderPkgMediaPreviews();
        }).catch(() => { entry.error = true; entry.uploading = false; renderPkgMediaPreviews(); });
      };
      reader.readAsDataURL(file);
    }
  }

  function renderPkgMediaPreviews() {
    const container = $('pkg-media-previews');
    if (pkgMediaFiles.length === 0) { container.innerHTML = ''; return; }
    container.innerHTML = pkgMediaFiles.map((f, i) =>
      '<div class="chat-upload-thumb' + (f.uploading ? ' uploading' : '') + '">' +
      (f.file.type.startsWith('image/') ? '<img src="' + f.preview + '">' : '<div class="chat-upload-file-icon">' + f.file.name.split('.').pop() + '</div>') +
      '<button class="remove" data-idx="' + i + '">&times;</button></div>'
    ).join('');
    container.querySelectorAll('.remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        pkgMediaFiles.splice(parseInt(btn.dataset.idx), 1);
        renderPkgMediaPreviews();
      });
    });
  }

  async function loadPkgExamples(packageId) {
    try {
      const res = await fetch('/api/dashboard/packages/' + encodeURIComponent(packageId) + '/examples');
      const data = await res.json();
      pkgPlaygroundExamples = data.examples || [];
      renderPkgExamples(packageId);
    } catch {
      $('pkg-examples-list').innerHTML = '<div class="loading" style="font-size:11px">No examples</div>';
    }
  }

  function renderPkgExamples(packageId) {
    const container = $('pkg-examples-list');
    if (pkgPlaygroundExamples.length === 0) {
      container.innerHTML = '<div class="loading" style="font-size:11px">No examples yet</div>';
      return;
    }
    container.innerHTML = pkgPlaygroundExamples.map(ex =>
      '<div class="pkg-example-chip" data-prompt="' + escapeHtml(ex.prompt || '') + '">' +
      '<span>' + escapeHtml(ex.name || 'Example') + '</span>' +
      '<button class="pkg-example-delete" data-filename="' + escapeHtml(ex.filename) + '" data-pkg="' + escapeHtml(packageId) + '">&times;</button>' +
      '</div>'
    ).join('');
    container.querySelectorAll('.pkg-example-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        if (e.target.closest('.pkg-example-delete')) return;
        $('pkg-chat-input').value = chip.dataset.prompt;
        $('pkg-chat-input').focus();
      });
    });
    container.querySelectorAll('.pkg-example-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await fetch('/api/dashboard/packages/' + btn.dataset.pkg + '/examples/' + btn.dataset.filename, { method: 'DELETE' });
        loadPkgExamples(btn.dataset.pkg);
      });
    });
  }

  async function sendPkgTest(packageId) {
    const input = $('pkg-chat-input');
    const text = input.value.trim();
    if (!text && pkgMediaFiles.length === 0) return;
    if (pkgMediaFiles.some(f => f.uploading)) return;

    const mediaUrls = pkgMediaFiles.filter(f => f.url).map(f => f.url);
    input.value = '';
    pkgMediaFiles = [];
    renderPkgMediaPreviews();

    const msgs = $('pkg-messages');
    const empty = msgs.querySelector('.chat-empty');
    if (empty) empty.remove();

    // User message
    const userDiv = document.createElement('div');
    userDiv.className = 'chat-msg user';
    let mediaHtml = mediaUrls.length > 0
      ? '<div style="margin-bottom:6px">' + mediaUrls.map(u => '<img src="' + escapeHtml(u) + '" style="max-width:120px;border-radius:6px;margin:2px">').join('') + '</div>'
      : '';
    userDiv.innerHTML = '<div class="chat-bubble">' + mediaHtml + escapeHtml(text || '(media)') + '</div>';
    msgs.appendChild(userDiv);

    // Thinking
    const assistDiv = document.createElement('div');
    assistDiv.className = 'chat-msg assistant';
    assistDiv.innerHTML = '<div class="chat-bubble"><span class="assistant-thinking">Thinking...</span></div>';
    msgs.appendChild(assistDiv);
    msgs.scrollTop = msgs.scrollHeight;

    if (!sseConnected) connectSSE();

    try {
      const body = { prompt: text || 'Analyze this', mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined };
      const res = await fetch('/api/dashboard/packages/' + encodeURIComponent(packageId) + '/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      pkgPlaygroundTaskId = data.taskId;

      // Listen for results via existing SSE
      const checkResult = setInterval(() => {
        if (!pkgPlaygroundTaskId) {
          clearInterval(checkResult);
          return;
        }
      }, 500);
    } catch (err) {
      assistDiv.querySelector('.chat-bubble').innerHTML = '<span style="color:var(--red)">Error: ' + escapeHtml(err.message) + '</span>';
    }
  }

  // ══════════════════════════════════════════════════════════════
  // SKILLS TAB
  // ══════════════════════════════════════════════════════════════

  let skillsTabList = [];
  let selectedSkillSlug = null;

  async function loadSkillsList() {
    try {
      const res = await fetch('/api/dashboard/skills');
      const data = await res.json();
      skillsTabList = data.skills || [];
      renderSkillsTabList();
    } catch (err) {
      $('skill-list').innerHTML = '<div class="loading">Error: ' + escapeHtml(err.message) + '</div>';
    }
  }

  function renderSkillsTabList(filter) {
    const container = $('skill-list');
    let filtered = skillsTabList;
    if (filter) {
      const q = filter.toLowerCase();
      filtered = skillsTabList.filter(s =>
        s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q)
      );
    }
    if (filtered.length === 0) {
      container.innerHTML = '<div class="loading">No skills found</div>';
      return;
    }
    container.innerHTML = filtered.map(s =>
      '<div class="pkg-item' + (selectedSkillSlug === s.slug ? ' active' : '') + '" data-slug="' + escapeHtml(s.slug) + '">' +
      '<span class="pkg-item-icon">' + (s.icon || '⚙️') + '</span>' +
      '<div class="pkg-item-info">' +
      '<div class="pkg-item-name">' + escapeHtml(s.name) + '</div>' +
      '<div class="pkg-item-desc">' + escapeHtml(s.description || '') + '</div>' +
      '<div class="pkg-item-meta">' +
      '<span class="badge badge-blue">' + escapeHtml(s.category || '-') + '</span>' +
      (s.version ? ' <span class="badge badge-green">v' + escapeHtml(s.version) + '</span>' : '') +
      '</div></div></div>'
    ).join('');

    container.querySelectorAll('.pkg-item').forEach(item => {
      item.addEventListener('click', () => selectSkillTab(item.dataset.slug));
    });
  }

  $('skill-filter-input').addEventListener('input', (e) => renderSkillsTabList(e.target.value));
  $('skill-refresh-btn').addEventListener('click', loadSkillsList);

  function selectSkillTab(slug) {
    selectedSkillSlug = slug;
    renderSkillsTabList($('skill-filter-input').value);
    const skill = skillsTabList.find(s => s.slug === slug);
    if (!skill) return;
    renderSkillDetail(skill);
  }

  function renderSkillDetail(skill) {
    const main = $('skill-main');
    let html = '<div class="skill-detail">' +
      '<div class="skill-detail-header">' +
      '<span style="font-size:32px">' + (skill.icon || '⚙️') + '</span>' +
      '<div>' +
      '<h3>' + escapeHtml(skill.name) + '</h3>' +
      '<div style="margin-top:4px">' +
      '<code style="font-size:11px;color:var(--text-dim)">' + escapeHtml(skill.slug) + '</code> ' +
      '<span class="badge badge-blue">' + escapeHtml(skill.category || '-') + '</span> ' +
      (skill.version ? '<span class="badge badge-green">v' + escapeHtml(skill.version) + '</span>' : '') +
      '</div></div></div>';

    // Description
    html += '<div class="skill-section"><div class="skill-section-title">Description</div>' +
      '<div class="skill-section-body">' + escapeHtml(skill.description || 'No description') + '</div></div>';

    // Model
    if (skill.model) {
      html += '<div class="skill-section"><div class="skill-section-title">Model</div>' +
        '<div class="skill-section-body"><code>' + escapeHtml(skill.model) + '</code></div></div>';
    }

    // Requirements
    if (skill.requirements) {
      html += '<div class="skill-section"><div class="skill-section-title">Requirements</div><div class="skill-section-body">';
      if (skill.requirements.oauth) html += '<div><strong>OAuth:</strong> ' + skill.requirements.oauth.map(o => '<span class="badge badge-purple">' + escapeHtml(o) + '</span>').join(' ') + '</div>';
      if (skill.requirements.tools) html += '<div style="margin-top:4px"><strong>Tools:</strong> ' + skill.requirements.tools.map(t => '<code>' + escapeHtml(t) + '</code>').join(', ') + '</div>';
      if (skill.requirements.input_types) html += '<div style="margin-top:4px"><strong>Input Types:</strong> ' + skill.requirements.input_types.join(', ') + '</div>';
      html += '</div></div>';
    }

    // Thinking
    if (skill.thinking) {
      html += '<div class="skill-section"><div class="skill-section-title">Thinking Steps</div><div class="skill-section-body">';
      if (skill.thinking.title) html += '<div><strong>Title:</strong> ' + escapeHtml(skill.thinking.title) + '</div>';
      if (skill.thinking.steps) {
        html += skill.thinking.steps.map(s =>
          '<div style="margin-top:4px;padding:6px 8px;background:var(--bg);border-radius:6px">' +
          '<strong>' + escapeHtml(s.label) + '</strong>' +
          (s.content ? '<div style="color:var(--text-dim);font-size:12px;margin-top:2px">' + escapeHtml(s.content) + '</div>' : '') +
          '</div>'
        ).join('');
      }
      html += '</div></div>';
    }

    // Output
    if (skill.output) {
      html += '<div class="skill-section"><div class="skill-section-title">Output</div><div class="skill-section-body">';
      if (skill.output.template) html += '<div><strong>Template:</strong> <code>' + escapeHtml(skill.output.template) + '</code></div>';
      if (skill.output.auto_publish !== undefined) html += '<div><strong>Auto-publish:</strong> ' + (skill.output.auto_publish ? 'Yes' : 'No') + '</div>';
      html += '</div></div>';
    }

    // UI
    if (skill.ui) {
      html += '<div class="skill-section"><div class="skill-section-title">UI Config</div><div class="skill-section-body">';
      if (skill.ui.card_color) html += '<div><strong>Card Color:</strong> <span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:' + escapeHtml(skill.ui.card_color) + ';vertical-align:middle"></span> ' + escapeHtml(skill.ui.card_color) + '</div>';
      if (skill.ui.preview_template) html += '<div><strong>Preview Template:</strong> <code>' + escapeHtml(skill.ui.preview_template) + '</code></div>';
      html += '</div></div>';
    }

    // Tags
    if (skill.tags && skill.tags.length > 0) {
      html += '<div class="skill-section"><div class="skill-section-title">Tags</div><div class="skill-section-body">' +
        skill.tags.map(t => '<span class="badge badge-blue" style="margin-right:4px">' + escapeHtml(t) + '</span>').join('') +
        '</div></div>';
    }

    // Full manifest
    html += '<div class="skill-section"><div class="skill-section-title">Manifest (JSON)</div>' +
      '<div class="json-view">' + escapeHtml(JSON.stringify(skill, null, 2)) + '</div></div>';

    html += '</div>';
    main.innerHTML = html;
  }

  // ══════════════════════════════════════════════════════════════
  // TEMPLATES TAB
  // ══════════════════════════════════════════════════════════════

  let templatesTabList = [];
  let selectedTemplateId = null;

  async function loadTemplatesList() {
    try {
      const res = await fetch('/api/dashboard/templates');
      const data = await res.json();
      templatesTabList = data.templates || [];
      renderTemplatesTabList();
    } catch (err) {
      $('tpl-list').innerHTML = '<div class="loading">Error: ' + escapeHtml(err.message) + '</div>';
    }
  }

  function renderTemplatesTabList(filter) {
    const container = $('tpl-list');
    let filtered = templatesTabList;
    if (filter) {
      const q = filter.toLowerCase();
      filtered = templatesTabList.filter(t =>
        (t.$id || '').toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q)
      );
    }
    if (filtered.length === 0) {
      container.innerHTML = '<div class="loading">No templates found</div>';
      return;
    }
    container.innerHTML = filtered.map(t =>
      '<div class="pkg-item' + (selectedTemplateId === t.$id ? ' active' : '') + '" data-id="' + escapeHtml(t.$id) + '">' +
      '<span class="pkg-item-icon">' + (t.renderer === 'html' ? '🌐' : '⚛️') + '</span>' +
      '<div class="pkg-item-info">' +
      '<div class="pkg-item-name">' + escapeHtml(t.$id) + '</div>' +
      '<div class="pkg-item-desc">' + escapeHtml(t.description || '') + '</div>' +
      '<div class="pkg-item-meta">' +
      '<span class="badge badge-blue">' + escapeHtml(t.category || '-') + '</span>' +
      (t.streamable ? ' <span class="badge badge-green">streamable</span>' : '') +
      (t.source ? ' <span class="badge badge-purple" style="font-size:9px">' + escapeHtml(t.source) + '</span>' : '') +
      '</div></div></div>'
    ).join('');

    container.querySelectorAll('.pkg-item').forEach(item => {
      item.addEventListener('click', () => selectTemplateTab(item.dataset.id));
    });
  }

  $('tpl-filter-input').addEventListener('input', (e) => renderTemplatesTabList(e.target.value));
  $('tpl-refresh-btn').addEventListener('click', loadTemplatesList);

  function selectTemplateTab(templateId) {
    selectedTemplateId = templateId;
    renderTemplatesTabList($('tpl-filter-input').value);
    const tpl = templatesTabList.find(t => t.$id === templateId);
    if (!tpl) return;
    renderTemplateDetail(tpl);
  }

  function renderTemplateDetail(tpl) {
    const main = $('tpl-main');
    let html = '<div class="tpl-detail">' +
      '<div class="tpl-detail-header">' +
      '<h3>' + escapeHtml(tpl.$id) + '</h3>' +
      '<div style="margin-top:4px">' +
      '<span class="badge badge-blue">' + escapeHtml(tpl.category || '-') + '</span> ' +
      '<span class="badge badge-purple">' + escapeHtml(tpl.renderer || 'html') + '</span> ' +
      (tpl.streamable ? '<span class="badge badge-green">streamable</span> ' : '') +
      (tpl.mutable ? '<span class="badge badge-yellow">mutable</span> ' : '') +
      (tpl.source ? '<span class="badge badge-orange">' + escapeHtml(tpl.source) + '</span>' : '') +
      '</div>' +
      '<p style="margin-top:8px;color:var(--text-dim);font-size:13px">' + escapeHtml(tpl.description || '') + '</p>' +
      '</div>';

    // Slots table
    const slots = tpl.slots || {};
    const slotEntries = Object.entries(slots);
    if (slotEntries.length > 0) {
      html += '<div class="tpl-section"><div class="skill-section-title">Slots (' + slotEntries.length + ')</div>' +
        '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Type</th><th>Required</th><th>Streamable</th><th>Mutable</th></tr></thead><tbody>' +
        slotEntries.map(([name, slot]) =>
          '<tr><td><code>' + escapeHtml(name) + '</code></td>' +
          '<td>' + escapeHtml(slot.type || '-') + '</td>' +
          '<td>' + (slot.required ? '<span class="badge badge-green">Yes</span>' : '-') + '</td>' +
          '<td>' + (slot.streamable ? '<span class="badge badge-green">Yes</span>' : '-') + '</td>' +
          '<td>' + (slot.mutable ? '<span class="badge badge-yellow">Yes</span>' : '-') + '</td></tr>'
        ).join('') +
        '</tbody></table></div></div>';
    }

    // Test panel
    const sampleData = {};
    for (const [name, slot] of slotEntries) {
      if (slot.type === 'string') sampleData[name] = 'Sample ' + name;
      else if (slot.type === 'number') sampleData[name] = 42;
      else if (slot.type === 'boolean') sampleData[name] = true;
      else if (slot.type === 'array') sampleData[name] = [];
      else sampleData[name] = null;
    }

    html += '<div class="tpl-section"><div class="skill-section-title">Test Render</div>' +
      '<textarea class="tpl-test-data" id="tpl-test-data">' + escapeHtml(JSON.stringify(sampleData, null, 2)) + '</textarea>' +
      '<div style="margin-top:8px"><button class="btn btn-primary btn-sm" id="tpl-test-btn">Render</button></div>' +
      '<div class="tpl-test-output" id="tpl-test-output"></div></div>';

    // Component info
    if (tpl.component) {
      html += '<div class="tpl-section"><div class="skill-section-title">React Component</div>' +
        '<code>' + escapeHtml(tpl.component) + '</code></div>';
    }

    // Streamable/mutable slots
    if (tpl.streamable_slots) {
      html += '<div class="tpl-section"><div class="skill-section-title">Streamable Slots</div>' +
        tpl.streamable_slots.map(s => '<code style="margin-right:4px">' + escapeHtml(s) + '</code>').join('') + '</div>';
    }
    if (tpl.mutable_slots) {
      html += '<div class="tpl-section"><div class="skill-section-title">Mutable Slots</div>' +
        tpl.mutable_slots.map(s => '<code style="margin-right:4px">' + escapeHtml(s) + '</code>').join('') + '</div>';
    }

    // Full JSON
    html += '<div class="tpl-section"><div class="skill-section-title">Definition (JSON)</div>' +
      '<div class="json-view">' + escapeHtml(JSON.stringify(tpl, null, 2)) + '</div></div>';

    html += '</div>';
    main.innerHTML = html;

    // Wire test button
    $('tpl-test-btn').addEventListener('click', () => {
      try {
        const data = JSON.parse($('tpl-test-data').value);
        const card = { cardId: 'test', template: tpl.$id, data, status: 'finalized' };
        $('tpl-test-output').innerHTML = renderCardVisual(card);
        // Wire toggle buttons
        $('tpl-test-output').querySelectorAll('.chat-card-toggle').forEach(btn => {
          btn.addEventListener('click', () => {
            card.rawMode = !card.rawMode;
            $('tpl-test-output').innerHTML = card.rawMode ? renderCardRaw(card) : renderCardVisual(card);
          });
        });
      } catch (err) {
        $('tpl-test-output').innerHTML = '<div style="color:var(--red);padding:12px">Error: ' + escapeHtml(err.message) + '</div>';
      }
    });
  }

  // ══════════════════════════════════════════════════════════════
  // APIS TAB
  // ══════════════════════════════════════════════════════════════

  let apiProviders = [];
  let selectedApiProvider = null;

  async function loadApiList() {
    try {
      const res = await fetch('/api/dashboard/apis');
      const data = await res.json();
      apiProviders = data.apis || [];
      renderApiSidebar();
    } catch (err) {
      $('api-list').innerHTML = '<div class="loading">Error: ' + escapeHtml(err.message) + '</div>';
    }
  }

  function renderApiSidebar() {
    const container = $('api-list');
    if (apiProviders.length === 0) {
      container.innerHTML = '<div class="loading">No API providers found</div>';
      return;
    }
    container.innerHTML = apiProviders.map(api =>
      '<div class="pkg-item' + (selectedApiProvider === api.provider ? ' active' : '') + '" data-provider="' + escapeHtml(api.provider) + '">' +
      '<span class="pkg-item-icon">' + (api.configured ? '🟢' : '🔴') + '</span>' +
      '<div class="pkg-item-info">' +
      '<div class="pkg-item-name">' + escapeHtml(api.provider) + '</div>' +
      '<div class="pkg-item-meta">' +
      (api.configured ? '<span class="badge badge-green">configured</span>' : '<span class="badge badge-red">missing</span>') +
      (api.required ? ' <span class="badge badge-yellow">required</span>' : '') +
      (api.packages.length > 0 ? ' <span class="badge badge-blue">' + api.packages.length + ' pkg</span>' : '') +
      '</div></div></div>'
    ).join('');

    container.querySelectorAll('.pkg-item').forEach(item => {
      item.addEventListener('click', () => selectApiTab(item.dataset.provider));
    });
  }

  $('api-refresh-btn').addEventListener('click', loadApiList);

  function selectApiTab(providerName) {
    selectedApiProvider = providerName;
    renderApiSidebar();
    const api = apiProviders.find(a => a.provider === providerName);
    if (!api) return;
    renderApiDetail(api);
  }

  function renderApiDetail(api) {
    const main = $('api-main');
    let html = '<div class="api-detail">' +
      '<div class="api-detail-header">' +
      '<h3>' + escapeHtml(api.provider) + '</h3>' +
      '<div style="margin-top:4px">' +
      (api.configured ? '<span class="badge badge-green">Key is set</span>' : '<span class="badge badge-red">No key configured</span>') +
      '</div></div>';

    // Detail grid
    html += '<div class="api-detail-grid">' +
      '<div class="api-detail-row"><span class="api-detail-label">Provider</span><span>' + escapeHtml(api.provider) + '</span></div>' +
      (api.envVar ? '<div class="api-detail-row"><span class="api-detail-label">Environment Variable</span><code>' + escapeHtml(api.envVar) + '</code></div>' : '') +
      '<div class="api-detail-row"><span class="api-detail-label">Required</span><span>' + (api.required ? 'Yes' : 'No') + '</span></div>' +
      '<div class="api-detail-row"><span class="api-detail-label">Status</span><span>' + (api.configured ? '✅ Configured' : '❌ Missing') + '</span></div>' +
      '</div>';

    // Packages using this API
    if (api.packages.length > 0) {
      html += '<div class="api-section"><div class="skill-section-title">Used by Packages</div>' +
        '<div class="api-packages-list">' + api.packages.map(p =>
          '<span class="badge badge-blue" style="margin:2px">' + escapeHtml(p) + '</span>'
        ).join('') + '</div></div>';
    }

    // Config panel
    if (api.envVar) {
      html += '<div class="api-config-panel">' +
        '<div class="skill-section-title">Configure API Key</div>' +
        '<div class="api-config-form">' +
        '<label style="font-size:11px;color:var(--text-dim)">' + escapeHtml(api.envVar) + '</label>' +
        '<div class="api-config-input-row">' +
        '<input type="password" id="api-key-input" placeholder="Enter API key..." class="api-key-input">' +
        '<button class="btn-sm" id="api-key-toggle" title="Show/hide">👁</button>' +
        '<button class="btn btn-primary btn-sm" id="api-key-save">Save</button>' +
        '</div>' +
        '<div class="api-config-status" id="api-config-status">' +
        (api.configured ? '<span style="color:var(--green)">Key is set</span>' : '<span style="color:var(--text-dim)">No key configured</span>') +
        '</div></div></div>';
    }

    html += '</div>';
    main.innerHTML = html;

    // Wire events
    if (api.envVar) {
      $('api-key-toggle').addEventListener('click', () => {
        const input = $('api-key-input');
        input.type = input.type === 'password' ? 'text' : 'password';
      });
      $('api-key-save').addEventListener('click', async () => {
        const value = $('api-key-input').value.trim();
        if (!value) return;
        try {
          const res = await fetch('/api/dashboard/apis/keys', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ envVar: api.envVar, value }),
          });
          if (res.ok) {
            $('api-config-status').innerHTML = '<span style="color:var(--green)">✅ Key saved successfully</span>';
            $('api-key-input').value = '';
            api.configured = true;
            renderApiSidebar();
          } else {
            const data = await res.json();
            $('api-config-status').innerHTML = '<span style="color:var(--red)">Error: ' + escapeHtml(data.error) + '</span>';
          }
        } catch (err) {
          $('api-config-status').innerHTML = '<span style="color:var(--red)">Error: ' + escapeHtml(err.message) + '</span>';
        }
      });
    }
  }

  // Auto-connect SSE on load
  connectSSE();
  loadSessionList();
})();
