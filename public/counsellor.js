(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const ABOUT = { me: 'About themself', friend: 'About a friend', saw: 'Something they saw' };

  let token = '';
  try { token = localStorage.getItem('sv-token') || ''; } catch {}
  const state = { cases: [], filter: 'open', selected: null, view: 'cases', days: 21, drafts: {} };
  let es = null;

  async function api(path, body, method) {
    const res = await fetch(path, {
      method: method || (body ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== '/api/login') { logout(); throw new Error('Please log in again'); }
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  // ---------- auth ----------
  function showLogin() { $('#login').hidden = false; $('#shell').hidden = true; $('#pin').focus(); }
  function logout() {
    token = '';
    try { localStorage.removeItem('sv-token'); } catch {}
    if (es) es.close();
    showLogin();
  }
  $('#logoutBtn').addEventListener('click', logout);
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#loginErr').hidden = true;
    try {
      const r = await api('/api/login', { pin: $('#pin').value });
      token = r.token;
      try { localStorage.setItem('sv-token', token); } catch {}
      $('#pin').value = '';
      start();
    } catch (ex) {
      $('#loginErr').textContent = ex.message;
      $('#loginErr').hidden = false;
    }
  });

  async function start() {
    try {
      await loadCases();
    } catch { return; }
    $('#login').hidden = true;
    $('#shell').hidden = false;
    connect();
    loadInfo();
    if ('Notification' in window && Notification.permission === 'default') {
      document.addEventListener('click', () => Notification.requestPermission().catch(() => {}), { once: true });
    }
  }

  // ---------- live updates ----------
  function connect() {
    if (es) es.close();
    es = new EventSource(`/api/stream?token=${encodeURIComponent(token)}`);
    es.addEventListener('case', (e) => {
      const d = JSON.parse(e.data);
      upsert(d.case);
      if (d.type === 'new' || d.urgent) {
        if (d.urgent) urgentAlert(d.case);
        else chime(false);
        flashId = d.case.id;
      }
      if (d.type === 'message') chime(false);
      renderCases();
      if (state.view === 'hotspots') loadHotspots();
    });
    es.addEventListener('reload', () => { loadCases(); if (state.view === 'hotspots') loadHotspots(); if (state.view === 'settings') loadSettings(); });
    es.addEventListener('presence', (e) => {
      $('#phoneCount').textContent = JSON.parse(e.data).phones;
      $('#net').className = 'net live';
    });
    // EventSource reconnects on its own; when it does, refresh anything missed.
    es.addEventListener('hello', () => { if (wasDown) { wasDown = false; loadCases(); } });
    es.onerror = () => { wasDown = true; $('#net').className = 'net down'; $('#netName').textContent = 'Server unreachable, retrying…'; };
  }
  let flashId = null;
  let wasDown = false;

  function upsert(c) {
    const i = state.cases.findIndex((x) => x.id === c.id);
    if (i >= 0) state.cases[i] = c; else state.cases.push(c);
  }

  function urgentAlert(c) {
    chime(true);
    const el = $('#alert');
    el.textContent = 'Urgent case · counsellor alerted';
    el.hidden = false;
    el.onclick = () => { el.hidden = true; switchView('cases'); state.filter = 'open'; syncFilter(); select(c.id); };
    clearTimeout(urgentAlert.t);
    urgentAlert.t = setTimeout(() => { el.hidden = true; }, 12000);
    // Urgent cases jump to the front of the counsellor's attention (drafts are kept per case).
    if (state.view === 'cases') setTimeout(() => select(c.id), 0);
    try {
      if (Notification.permission === 'granted') new Notification('SafeVoice: urgent case', { body: `${c.triage.category} · ${c.code}`, icon: '/logo.svg' });
    } catch {}
  }

  let audio;
  function chime(urgent) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const notes = urgent ? [880, 660, 880, 660] : [660, 880];
      notes.forEach((f, i) => {
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.frequency.value = f;
        o.type = 'sine';
        const t0 = audio.currentTime + i * 0.16;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
        o.connect(g).connect(audio.destination);
        o.start(t0);
        o.stop(t0 + 0.16);
      });
    } catch {}
  }

  // ---------- navigation ----------
  function switchView(v) {
    state.view = v;
    $$('.nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
    $$('.view').forEach((s) => { s.hidden = s.dataset.view !== v; });
    if (v === 'hotspots') loadHotspots();
    if (v === 'settings') loadSettings();
  }
  $$('.nav button').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));

  function syncFilter() { $$('[data-filter]').forEach((b) => b.classList.toggle('active', b.dataset.filter === state.filter)); renderCases(); }
  $$('[data-filter]').forEach((b) => b.addEventListener('click', () => { state.filter = b.dataset.filter; syncFilter(); }));

  // ---------- cases ----------
  async function loadCases() {
    const r = await api('/api/cases');
    state.cases = r.cases;
    renderCases();
  }

  const LEVEL = (u) => (u >= 5 ? 'Urgent' : u === 4 ? 'High' : u === 3 ? 'Medium' : 'Low');
  function ago(iso) {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return `${Math.floor(s / 86400)} d ago`;
  }

  function visibleCases() {
    return state.cases
      .filter((c) => state.filter === 'all' || (state.filter === 'resolved' ? c.status === 'resolved' : c.status !== 'resolved'))
      .sort((a, b) => b.urgency - a.urgency || new Date(b.createdAt) - new Date(a.createdAt));
  }

  function renderCases() {
    const open = state.cases.filter((c) => c.status === 'new' || c.unread).length;
    $('#navCount').textContent = open || '';
    const list = visibleCases();
    const box = $('#caseList');
    if (!list.length) {
      box.innerHTML = `<div class="empty">${state.filter === 'open' ? 'No open cases. New reports appear here instantly.' : 'Nothing here yet.'}</div>`;
    } else {
      box.innerHTML = list.map((c) => {
        const u = c.urgency;
        let tag = `<span class="tag l${Math.max(u, 2)}">${LEVEL(u)}</span>`;
        if (c.status === 'replied') tag = '<span class="tag replied">Replied</span>';
        if (c.status === 'resolved') tag = '<span class="tag">Resolved</span>';
        if (c.unread) tag = '<span class="tag msg">New message</span>';
        const sub = u >= 5 && c.status === 'new' ? 'Escalated · Counsellor alerted' : [c.triage.place !== 'Unspecified' ? c.triage.place : c.location, c.time].filter(Boolean).join(' · ') || 'No place given';
        return `<button class="case ${u >= 5 && c.status !== 'resolved' ? 'urgent' : ''} ${state.selected === c.id ? 'selected' : ''} ${flashId === c.id ? 'flash' : ''}" data-id="${c.id}" role="listitem">
          <span class="num u${u}">${u}</span>
          <span><span class="code">${esc(c.code)}</span><span class="title">${esc(c.triage.category)}</span><span class="sub">${esc(sub)}</span></span>
          <span class="right">${tag}<span class="time-ago">${ago(c.createdAt)}</span></span>
        </button>`;
      }).join('');
      flashId = null;
    }
    $$('.case', box).forEach((b) => b.addEventListener('click', () => select(b.dataset.id)));
    if (!state.selected || !state.cases.some((c) => c.id === state.selected)) {
      state.selected = list[0]?.id || null;
      if (state.selected) $(`.case[data-id="${state.selected}"]`)?.classList.add('selected');
    }
    renderDetail();
  }

  function select(id) {
    saveDraft();
    state.selected = id;
    $$('.case').forEach((b) => b.classList.toggle('selected', b.dataset.id === id));
    renderDetail();
    const c = state.cases.find((x) => x.id === id);
    if (c?.unread) api(`/api/cases/${id}/read`, {}).then(upsertAndRender).catch(() => {});
  }
  function upsertAndRender(c) { upsert(c); renderCases(); }

  function saveDraft() {
    const ta = $('#replyText');
    if (ta && state.selected) state.drafts[state.selected] = ta.value;
  }

  function renderDetail() {
    const box = $('#detail');
    const c = state.cases.find((x) => x.id === state.selected);
    if (!c) { box.dataset.sig = ''; box.innerHTML = '<div class="empty">Select a case to see the AI triage and reply.</div>'; return; }
    // Don't rebuild (and steal focus from the reply box) unless something changed.
    const sig = `${c.id}|${c.updatedAt}|${c.urgency}|${c.status}|${c.messages.length}|${c.unread}`;
    if (box.dataset.sig === sig) return;
    box.dataset.sig = sig;
    const u = c.urgency;
    const statusTag = c.status === 'new' ? '<span class="tag new">New</span>' : c.status === 'replied' ? '<span class="tag replied">Replied</span>' : '<span class="tag">Resolved</span>';
    const overridden = c.urgencyOverride != null;
    const thread = c.messages.filter((m, i) => i > 0);
    box.innerHTML = `
      <div class="detail-head"><span class="mono">${esc(c.code)}</span>${statusTag}${c.helpNow ? '<span class="tag l4">Asked for help now</span>' : ''}</div>
      <div class="triage${u >= 4 ? ' hot' : ''}">
        <p class="eyebrow"><span>AI triage</span><span class="dim">${c.triage.source === 'claude' ? 'Claude' : 'Rule engine'}</span></p>
        <div class="meter" aria-hidden="true">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= u ? 'on' : ''}"></i>`).join('')}</div>
        <p class="urg">Urgency ${u}/5 · <em>${LEVEL(u)}</em></p>
        <p class="summary">${esc(c.triage.summary)}</p>
        <div class="flags">${c.triage.flags.map((f) => `<span class="flag">${esc(f)}</span>`).join('')}</div>
        <div class="override">
          <span>Counsellor decides:</span>
          <button data-urg="-1" aria-label="Lower urgency">−</button>
          <button data-urg="1" aria-label="Raise urgency">+</button>
          ${overridden ? `<span>Changed from AI ${c.triage.urgency}/5</span> <button class="linkish" data-urg="reset" style="width:auto">reset</button>` : ''}
        </div>
      </div>
      <div>
        <p class="section-label">Student report</p>
        <p class="quote">“${esc(c.text)}”</p>
        <p class="meta">${c.about ? esc(ABOUT[c.about]) + ' · ' : ''}${esc([c.location, c.time].filter(Boolean).join(' · ') || 'No place or time given')} · ${ago(c.createdAt)} · ${c.lang === 'ta' ? 'Tamil' : 'English'}</p>
      </div>
      ${thread.length ? `<div><p class="section-label">Conversation</p><div class="convo">${thread.map((m) => `<div class="msg ${m.from}"><span class="who">${m.from === 'student' ? 'Student' : m.from === 'counsellor' ? 'You' : 'SafeVoice'} · ${ago(m.at)}</span>${esc(m.text)}</div>`).join('')}</div></div>` : ''}
      <div class="reply-box">
        <p class="section-label">Your reply · anonymous</p>
        <textarea id="replyText" placeholder="Write a calm, kind reply. The student sees it with their case code."></textarea>
        <div class="reply-actions">
          <button class="btn ghost" id="suggestBtn">✦ Suggest reply</button>
          <button class="btn primary" id="sendBtn">Send</button>
          <span class="note">Visible with the case code</span>
          <span class="spacer"></span>
          ${c.status === 'resolved' ? '<button class="btn ghost" id="statusBtn" data-status="new">Reopen</button>' : '<button class="btn done" id="statusBtn" data-status="resolved">Mark resolved</button>'}
        </div>
      </div>`;
    const ta = $('#replyText');
    ta.value = state.drafts[c.id] || '';
    ta.addEventListener('input', saveDraft);

    $$('[data-urg]', box).forEach((b) => b.addEventListener('click', async () => {
      const v = b.dataset.urg === 'reset' ? c.triage.urgency : Math.min(5, Math.max(1, u + Number(b.dataset.urg)));
      upsertAndRender(await api(`/api/cases/${c.id}/urgency`, { urgency: v }));
    }));
    $('#suggestBtn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Drafting…';
      try {
        const r = await api(`/api/cases/${c.id}/suggest`, {});
        typeInto(ta, r.text);
      } finally {
        btn.disabled = false;
        btn.textContent = '✦ Suggest reply';
      }
    });
    $('#sendBtn').addEventListener('click', async (e) => {
      const text = ta.value.trim();
      if (!text) { ta.focus(); return; }
      e.currentTarget.disabled = true;
      delete state.drafts[c.id];
      upsertAndRender(await api(`/api/cases/${c.id}/reply`, { text }));
    });
    $('#statusBtn').addEventListener('click', async (e) => {
      upsertAndRender(await api(`/api/cases/${c.id}/status`, { status: e.currentTarget.dataset.status }));
    });
  }

  function typeInto(ta, text) {
    ta.value = '';
    let i = 0;
    clearInterval(typeInto.t);
    typeInto.t = setInterval(() => {
      i += 3;
      ta.value = text.slice(0, i);
      if (i >= text.length) { clearInterval(typeInto.t); saveDraft(); }
    }, 14);
  }

  // ---------- hotspots ----------
  $$('[data-days]').forEach((b) => b.addEventListener('click', () => {
    state.days = Number(b.dataset.days);
    $$('[data-days]').forEach((x) => x.classList.toggle('active', x === b));
    loadHotspots();
  }));

  async function loadHotspots() {
    const h = await api(`/api/hotspots?days=${state.days}`);
    const label = state.days === 21 ? 'Last 3 weeks' : `Last ${state.days} days`;
    $('#hotSub').textContent = `${label} · ${h.total} reports${state.cases.some((c) => c.demo) ? ' · sample data' : ''}`;
    const max = Math.max(1, ...Object.values(h.zones).map((z) => z.count));
    const zoneHtml = (id) => {
      const z = h.zones[id];
      const size = z.count ? 40 + (z.count / max) * 150 : 0;
      const hot = z.count && (z.count / max >= 0.6 || z.weight / z.count >= 3.5);
      return `<div class="zone z-${id}"><span>${esc(z.name)}</span><b>${z.count || ''}</b>${z.count ? `<div class="heat ${hot ? 'hot' : 'warm'}" style="width:${size}px;height:${size}px"></div>` : ''}</div>`;
    };
    $('#map').innerHTML = ['library', 'classrooms', 'corridor', 'canteen', 'washrooms', 'playground'].map(zoneHtml).join('');
    $('#mapExtra').innerHTML = ['online', 'bus'].map((id) => {
      const z = h.zones[id];
      return `<div class="zone"><span>${esc(z.name)}</span><b>${z.count || 0} reports</b></div>`;
    }).join('');

    const tmax = Math.max(1, ...Object.values(h.byTime));
    $('#timeBars').innerHTML = Object.entries(h.byTime).map(([k, v]) => `
      <div class="bar ${v === tmax && v > 0 ? 'max' : ''}"><b>${v}</b><i style="height:${(v / tmax) * 100}%"></i><small>${k === 'After school' ? 'After' : k}</small></div>`).join('');

    $('#patterns').innerHTML = h.patterns.length
      ? h.patterns.slice(0, 3).map((p) => `<div class="pattern"><p class="eyebrow">Pattern detected</p><h3>${esc(p.place)} · <em>${esc(p.time)}</em></h3><p>${p.count} reports in ${label.toLowerCase().replace('last ', '')}. Consider staff supervision here.</p></div>`).join('')
      : '<div class="empty">No repeating pattern yet. Patterns appear when 3 or more reports share a place and time.</div>';

    const cats = Object.entries(h.byCategory).sort((a, b) => b[1] - a[1]);
    const cmax = Math.max(1, ...cats.map((c) => c[1]));
    $('#catBars').innerHTML = cats.map(([k, v]) => `<div class="cat"><span>${esc(k)}</span><i style="width:${(v / cmax) * 100}%"></i><b>${v}</b></div>`).join('') || '<p class="dim">No reports in this range.</p>';
  }

  // ---------- settings ----------
  async function loadInfo() {
    const s = await api('/api/settings');
    const pill = $('#aiPill');
    pill.textContent = s.ai === 'claude' ? 'AI: Claude' : 'AI: rule engine';
    pill.classList.toggle('claude', s.ai === 'claude');
    const n = s.network;
    $('#netName').textContent = n.hotspot && n.ssid ? `Wi-Fi: ${n.ssid}` : n.urls[0] ? n.urls[0].replace('http://', '') : 'This computer only';
    return s;
  }
  setInterval(() => { if (token && !document.hidden) loadInfo().catch(() => {}); }, 30_000);

  async function loadSettings() {
    const s = await loadInfo();
    $('#aiTitle').textContent = s.ai === 'claude' ? 'Claude is triaging reports' : 'Built-in rule engine';
    $('#aiDesc').textContent = s.ai === 'claude'
      ? 'Each report is read by Claude, which scores urgency, flags risk signals and writes a supportive first reply. A safety floor of hard rules (self-harm, weapons, abuse) always applies on top.'
      : 'Reports are scored by a transparent keyword engine in English and Tamil. Set ANTHROPIC_API_KEY on the server to switch on Claude.';
    $('#retention').value = String(s.retentionDays);
    $('#totalCases').textContent = `${s.total} reports stored right now.`;
    const n = s.network;
    $('#links').innerHTML = n.urls.length
      ? n.urls.map((u, i) => `<a href="${u}/" target="_blank" rel="noopener">${u.replace('http://', '')}</a>${i === 0 && n.hotspot ? ' <span class="dim">(SafeVoice Wi-Fi)</span>' : ''}`).join('')
      : '<span class="dim">Not on any network yet. Start the hotspot.</span>';
    SVQR.renderQR($('#qr'), n.studentUrl, { size: 120 });
    $('#ssid').textContent = n.ssid || 'not set up';
    $('#wpass').textContent = n.password || '—';
    $('#wifiBox').classList.toggle('off', !n.ssid);
    $('#wifiQr').innerHTML = '';
    if (n.ssid) SVQR.renderQR($('#wifiQr'), SVQR.wifiText(n.ssid, n.password), { size: 120 });
    $('#netDesc').textContent = n.hotspot
      ? `SafeVoice Wi-Fi is on. Up to 8 phones can join "${n.ssid}". No internet needed.`
      : 'Hotspot is off. Run "Start SafeVoice.bat" to create the SafeVoice Wi-Fi. Phones on the same Wi-Fi as this computer can still connect.';
  }

  $('#saveRetention').addEventListener('click', async () => {
    await api('/api/settings', { retentionDays: Number($('#retention').value) });
    loadSettings();
  });
  $('#resetDemo').addEventListener('click', async () => {
    if (!confirm('Replace all reports with the fictional demo data?')) return;
    await api('/api/demo/reset', {});
    state.selected = null;
    await loadCases();
    loadSettings();
  });
  $('#clearAll').addEventListener('click', async () => {
    if (!confirm('Delete every report? This cannot be undone.')) return;
    await api('/api/demo/clear', {});
    state.selected = null;
    await loadCases();
    loadSettings();
  });

  setInterval(() => { if (state.view === 'cases' && !document.hidden) { saveDraft(); renderCases(); } }, 60_000);

  if (token) start(); else showLogin();
})();
