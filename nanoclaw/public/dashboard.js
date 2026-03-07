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

      // Show persisted cards first (these are the rich card outputs)
      const taskCards = task.cards || {};
      const hasCards = Object.keys(taskCards).length > 0;
      if (hasCards) {
        const cardsDiv = document.createElement('div');
        cardsDiv.className = 'chat-msg assistant';
        let cardsHtml = '';
        for (const [id, card] of Object.entries(taskCards)) {
          // Add cardId for toggle support
          const cardObj = Object.assign({ cardId: id }, card);
          try {
            cardsHtml += renderCardVisual(cardObj);
          } catch {
            cardsHtml += '<div class="chat-card-result">' + escapeHtml(JSON.stringify(card, null, 2)) + '</div>';
          }
        }
        cardsDiv.innerHTML =
          '<div class="chat-cards-container">' + cardsHtml + '</div>' +
          '<div class="chat-msg-meta">' + formatDuration(task.durationMs || 0) + '</div>';
        msgs.appendChild(cardsDiv);
      }

      // Show text result if no cards or result is different from card content
      if (task.result && !hasCards) {
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

  function renderCardVisual(card) {
    const statusBadge = card.status === 'finalized'
      ? '<span class="badge badge-green" style="font-size:10px">done</span>'
      : '<span class="badge badge-yellow" style="font-size:10px">streaming</span>';
    const toggle = renderCardToggle(card);

    if (card.template === 'html_stream' && card.data.html) {
      return '<div class="chat-card-rendered">' +
        '<div class="chat-card-header">HTML ' + statusBadge + toggle + '</div>' +
        '<div class="chat-card-html">' + card.data.html + '</div>' +
        '</div>';
    }

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

  $('chat-send').addEventListener('click', sendChat);
  $('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  });

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

  // Auto-connect SSE on load
  connectSSE();
  loadSessionList();
})();
