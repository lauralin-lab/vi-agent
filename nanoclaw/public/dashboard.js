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

  function badgeClass(status) {
    if (status === 'ok' || status === 'live' || status === 'ready') return 'badge-green';
    if (status === 'error' || status === 'dead') return 'badge-red';
    if (status === 'warn' || status === 'busy') return 'badge-yellow';
    return 'badge-blue';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Health Page ──
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

  // ── Skills Page ──
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

  // ── SSE Monitor ──
  let evtSource = null;
  let sseCount = 0;

  $('sse-connect').addEventListener('click', connectSSE);
  $('sse-clear').addEventListener('click', () => {
    $('sse-log').innerHTML = '';
    sseCount = 0;
  });

  function connectSSE() {
    if (evtSource) {
      evtSource.close();
      evtSource = null;
    }
    const uid = $('sse-uid').value.trim();
    const url = '/api/dashboard/sse' + (uid ? '?uid=' + encodeURIComponent(uid) : '');
    evtSource = new EventSource(url);
    $('sse-status').textContent = 'Connecting...';
    $('sse-connect').textContent = 'Reconnect';

    evtSource.onopen = () => {
      $('sse-status').textContent = 'Connected';
      document.querySelector('.sidebar-footer').innerHTML = '<span class="status-dot live"></span> SSE Connected';
    };

    evtSource.onmessage = (evt) => {
      sseCount++;
      let parsed;
      try { parsed = JSON.parse(evt.data); } catch { parsed = evt.data; }
      appendSSEEntry(parsed);
      // Feed card preview
      if (parsed && parsed.op) handleCardOp(parsed);
    };

    evtSource.onerror = () => {
      $('sse-status').textContent = 'Disconnected';
      document.querySelector('.sidebar-footer').innerHTML = '<span class="status-dot off"></span> Disconnected';
    };
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

    // Auto-scroll if near bottom
    if (log.scrollHeight - log.scrollTop - log.clientHeight < 100) {
      log.scrollTop = log.scrollHeight;
    }

    // Keep max 500 entries
    while (log.children.length > 500) {
      log.removeChild(log.firstChild);
    }
  }

  // ── Card Preview ──
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
      canvas.innerHTML = '<div class="loading">No cards — connect SSE and trigger a skill</div>';
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

  // ── Task Inspector / Templates ──
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

  // ── Auto-refresh health on load ──
  fetchHealth();

  // Refresh health every 10s when visible
  setInterval(() => {
    if (document.querySelector('#page-health.active')) fetchHealth();
  }, 10000);
})();
