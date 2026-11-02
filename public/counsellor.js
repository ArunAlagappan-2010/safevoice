(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const AI_NAME = { gemini: 'Gemini', claude: 'Claude' };
  const ABOUT = { me: 'About themself', friend: 'About a friend', saw: 'Something they saw', peer: 'Passed on by a peer supporter' };
  const STATUS = { new: 'New', open: 'In progress', waiting: 'Waiting on student', resolved: 'Resolved' };
  const ESCALATE_TO = ['Principal', 'Parents / guardians', 'Class teacher', 'Childline 1098', 'Police 112', 'Medical / nurse'];
  const SAFER = { yes: 'Feels safer', somewhat: 'Feels a bit safer', no: 'Does not feel safer' };

  let token = '';
  try { token = localStorage.getItem('sv-token') || ''; } catch {}
  const state = {
    me: null, cases: [], staff: [], filter: 'open', search: '', cat: '', sort: 'urgency', selected: null,
    tab: 'conversation', view: null, days: 21, period: 30, drafts: {}, loginPick: null,
  };
  let es = null;
  const canDo = (perm) => perm.split('|').some((p) => state.me?.can.includes(p));

  async function api(path, body, method) {
    const res = await fetch(path, {
      method: method || (body ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== '/api/login') { logout(true); throw new Error('Please sign in again'); }
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.hidden = true; }, 2600);
  }

  // ---------- time helpers ----------
  function ago(iso) {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return `${Math.floor(s / 86400)} d ago`;
  }
  const dur = (mins) => {
    if (mins == null) return '—';
    const m = Math.abs(mins);
    if (m < 60) return `${Math.round(m)} min`;
    if (m < 48 * 60) return `${Math.round(m / 60 * 10) / 10} h`;
    return `${Math.round(m / 1440)} d`;
  };
  const when = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const LEVEL = (u) => (u >= 5 ? 'Urgent' : u === 4 ? 'High' : u === 3 ? 'Medium' : 'Low');
  const staffName = (id) => state.staff.find((s) => s.id === id)?.name || (id ? 'Former staff' : 'Unassigned');
  const avatar = (id, cls = '') => {
    const s = state.staff.find((x) => x.id === id);
    return s ? `<span class="avatar sm ${cls}" title="${esc(s.name)}" data-hue="${hue(s.id)}">${esc(s.initials)}</span>` : `<span class="avatar sm none ${cls}" title="Unassigned">?</span>`;
  };
  const hue = (id) => [...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % 4;

  function slaChip(c) {
    if (c.status === 'resolved') return '';
    if (c.sla.met === true) return '<span class="sla ok">Replied in time</span>';
    if (c.sla.met === false) return '<span class="sla late">Replied late</span>';
    const mins = (new Date(c.sla.dueAt) - Date.now()) / 60e3;
    if (mins < 0) return `<span class="sla late">Overdue ${dur(-mins)}</span>`;
    return `<span class="sla ${mins < 60 ? 'soon' : ''}">Reply due in ${dur(mins)}</span>`;
  }

  // ---------- auth ----------
  async function showLogin() {
    $('#login').hidden = false;
    $('#shell').hidden = true;
    try {
      const d = await fetch('/api/staff/directory').then((r) => r.json());
      $('#loginSchool').textContent = d.schoolName;
      $('#whoList').innerHTML = d.staff.map((s) => `
        <button type="button" class="who-btn" role="radio" aria-checked="false" data-id="${s.id}">
          <span class="avatar" data-hue="${hue(s.id)}">${esc(s.initials)}</span>
          <span><b>${esc(s.name)}</b><small>${esc(s.title || s.roleLabel)}</small></span>
        </button>`).join('');
      $$('.who-btn').forEach((b) => b.addEventListener('click', () => {
        state.loginPick = b.dataset.id;
        $$('.who-btn').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
        $('#pin').focus();
      }));
    } catch {}
    $('#pin').focus();
  }
  function logout(expired) {
    if (!expired && token) fetch('/api/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    token = '';
    state.me = null;
    try { localStorage.removeItem('sv-token'); } catch {}
    if (es) es.close();
    showLogin();
  }
  $('#logoutBtn').addEventListener('click', () => logout(false));
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#loginErr').hidden = true;
    try {
      const r = await api('/api/login', { pin: $('#pin').value, staffId: state.loginPick || undefined });
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
      state.me = await api('/api/me');
      state.staff = (await api('/api/staff')).staff;
      if (canDo('cases')) await loadCases();
    } catch { return; }
    $('#login').hidden = true;
    $('#shell').hidden = false;
    const me = state.me;
    $('#meAvatar').textContent = me.initials;
    $('#meAvatar').dataset.hue = hue(me.id);
    $('#meName').textContent = me.name;
    $('#meRole').textContent = me.roleLabel;
    $$('[data-perm]').forEach((el) => { el.hidden = !canDo(el.dataset.perm); });
    connect();
    loadInfo();
    $('#navPeer').textContent = me.peerTeamName;
    switchView(canDo('analytics') ? 'overview' : canDo('cases') ? 'cases' : 'peer');
    if ('Notification' in window && Notification.permission === 'default' && canDo('cases')) {
      document.addEventListener('click', () => Notification.requestPermission().catch(() => {}), { once: true });
    }
  }

  // ---------- live updates ----------
  let flashId = null;
  let wasDown = false;
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
      refreshView();
    });
    es.addEventListener('stats', refreshView);
    es.addEventListener('notices', () => { if (state.view === 'notices') loadNotices(); });
    es.addEventListener('tasks', () => { if (state.view === 'peer') loadPeer(); });
    es.addEventListener('zone-alert', (e) => { zoneAlert(JSON.parse(e.data)); if (state.view === 'hotspots') loadHotspots(); });
    es.addEventListener('watch', () => { if (state.view === 'hotspots') loadHotspots(); });
    es.addEventListener('reload', () => { if (canDo('cases')) loadCases(); refreshView(true); });
    es.addEventListener('presence', (e) => {
      $('#phoneCount').textContent = JSON.parse(e.data).phones;
      $('#net').className = 'net live';
    });
    // EventSource reconnects on its own; when it does, refresh anything missed.
    es.addEventListener('hello', () => { if (wasDown) { wasDown = false; if (canDo('cases')) loadCases(); refreshView(); } });
    es.onerror = () => { wasDown = true; $('#net').className = 'net down'; $('#netName').textContent = 'Server unreachable, retrying…'; };
  }
  function refreshView(all) {
    clearTimeout(refreshView.t);
    refreshView.t = setTimeout(() => {
      if (state.view === 'overview') loadOverview();
      if (state.view === 'hotspots') loadHotspots();
      if (all && state.view === 'settings') loadSettings();
    }, 250);
  }

  function upsert(c) {
    const i = state.cases.findIndex((x) => x.id === c.id);
    if (i >= 0) state.cases[i] = c; else state.cases.push(c);
  }

  function urgentAlert(c) {
    chime(true);
    const el = $('#alert');
    el.textContent = 'Urgent case · counsellor alerted';
    el.classList.remove('zone-alert');
    el.hidden = false;
    el.onclick = () => { el.hidden = true; switchView('cases'); state.filter = 'open'; syncFilter(); select(c.id); };
    clearTimeout(urgentAlert.t);
    urgentAlert.t = setTimeout(() => { el.hidden = true; }, 12000);
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
    if (v === 'overview') loadOverview();
    if (v === 'cases') renderCases();
    if (v === 'hotspots') loadHotspots();
    if (v === 'notices') loadNotices();
    if (v === 'peer') loadPeer();
    if (v === 'team') loadTeam();
    if (v === 'audit') loadAudit();
    if (v === 'settings') loadSettings();
    $('.main').scrollTop = 0;
  }
  $$('.nav button').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-goto]');
    if (!g) return;
    if (g.dataset.filter) { state.filter = g.dataset.filter; syncFilter(); }
    switchView(g.dataset.goto);
    if (g.dataset.case) select(g.dataset.case);
  });

  // ---------- overview ----------
  $$('[data-period]').forEach((b) => b.addEventListener('click', () => {
    state.period = Number(b.dataset.period);
    $$('[data-period]').forEach((x) => x.classList.toggle('active', Number(x.dataset.period) === state.period));
    refreshView();
  }));

  function kpi({ label, value, unit = '', sub = '', tone = '', goto, filter }) {
    const tag = goto ? 'button' : 'div';
    return `<${tag} class="kpi ${tone}" ${goto ? `data-goto="${goto}" ${filter ? `data-filter="${filter}"` : ''}` : ''}>
      <span class="kpi-label">${label}</span>
      <span class="kpi-value">${value ?? '—'}${value != null && unit ? `<small>${unit}</small>` : ''}</span>
      <span class="kpi-sub">${sub}</span></${tag}>`;
  }
  const delta = (now, prev, { better = 'down', unit = '' } = {}) => {
    if (now == null || prev == null) return '';
    const d = Math.round((now - prev) * 10) / 10;
    if (!d) return '<span class="delta">no change</span>';
    const good = better === 'down' ? d < 0 : d > 0;
    return `<span class="delta ${good ? 'good' : 'bad'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}${unit} vs previous</span>`;
  };

  async function loadOverview() {
    const a = await api(`/api/analytics?days=${state.period}`);
    const k = a.kpis;
    const hour = new Date().getHours();
    $('#greeting').textContent = `Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, ${state.me.name.replace(/^(Dr|Mr|Ms|Mrs)\.?\s+/, '').split(' ')[0]}`;
    $('#greetDate').textContent = `${a.schoolName} · ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}`;
    $('#printMeta').textContent = `${a.schoolName} · Safety report · last ${a.days} days · generated ${when(a.generatedAt)} by ${state.me.name}`;
    const cases = canDo('cases');
    $('#kpis').innerHTML = [
      kpi({ label: 'Open cases', value: k.open, sub: `${k.urgentOpen} urgent · ${k.unassigned} unassigned`, tone: k.urgentOpen ? 'hot' : '', goto: cases && 'cases', filter: 'open' }),
      kpi({ label: 'Overdue first reply', value: k.overdue, sub: 'Past the response target', tone: k.overdue ? 'warn' : 'good', goto: cases && 'cases', filter: 'overdue' }),
      kpi({ label: 'Median first reply', value: k.medianResponseMins == null ? null : dur(k.medianResponseMins), sub: k.slaPct == null ? 'No replies yet' : `${k.slaPct}% within target` }),
      kpi({ label: `Reports, last ${a.days} days`, value: k.reports, sub: delta(k.reports, k.reportsPrev) || '&nbsp;' }),
      kpi({ label: 'Students feel safer', value: k.saferPct, unit: '%', sub: `${k.feedbackCount} answers after a case closed`, tone: k.saferPct >= 70 ? 'good' : '' }),
      kpi({ label: 'Reported by bystanders', value: k.bystanderPct, unit: '%', sub: delta(k.bystanderPct, k.bystanderPrevPct, { better: 'up', unit: ' pts' }) || 'About a friend or something seen' }),
    ].join('');

    $('#trend').innerHTML = trendChart(a.weeks);

    const ap = $('#attentionPanel');
    if (cases) {
      const now = Date.now();
      const need = state.cases
        .filter((c) => c.status !== 'resolved' && (c.urgency >= 4 || c.unread || !c.assignee || (c.sla.breached && !c.firstResponseAt)))
        .sort((x, y) => y.urgency - x.urgency || new Date(x.sla.dueAt) - new Date(y.sla.dueAt))
        .slice(0, 6);
      $('#attention').innerHTML = need.length ? need.map((c) => {
        const why = c.urgency >= 5 ? 'Urgent' : c.unread ? 'New student message' : !c.firstResponseAt && new Date(c.sla.dueAt) < now ? 'Overdue' : !c.assignee ? 'Unassigned' : 'High urgency';
        return `<button class="att" data-goto="cases" data-case="${c.id}">
          <span class="num u${c.urgency}">${c.urgency}</span>
          <span><b>${esc(c.triage.category)}</b><small>${esc(c.code)} · ${esc(why)}</small></span>
          ${avatar(c.assignee)}</button>`;
      }).join('') : '<div class="empty small">Nothing waiting. Well done.</div>';
    } else {
      $('#attention').innerHTML = `<div class="ov-note"><b>${k.open}</b> open cases, <b>${k.overdue}</b> overdue. Case details are visible to counsellors only.</div>`;
    }
    ap.hidden = false;

    const cats = Object.entries(a.byCategory).sort((x, y) => y[1] - x[1]).slice(0, 7);
    const cmax = Math.max(1, ...cats.map((c) => c[1]));
    $('#ovCats').innerHTML = cats.map(([n, v]) => `<div class="cat"><span>${esc(n)}</span><i style="width:${(v / cmax) * 100}%"></i><b>${v}</b></div>`).join('') || '<p class="dim">No reports in this period.</p>';

    const wmax = Math.max(1, ...a.workload.map((w) => w.open + w.resolved));
    $('#workload').innerHTML = a.workload.map((w) => `
      <div class="wl">${w.id ? avatar(w.id) : '<span class="avatar sm none">?</span>'}
        <span class="wl-name">${esc(w.name)}</span>
        <span class="wl-bar"><i class="o" style="width:${(w.open / wmax) * 100}%"></i><i class="r" style="width:${(w.resolved / wmax) * 100}%"></i></span>
        <span class="wl-n">${w.open} open${w.id ? ` · ${w.resolved} closed` : ''}</span></div>`).join('');

    $('#actions').innerHTML = a.actions.length ? a.actions.map((n) => `
      <div class="feed-row"><span class="dot ok"></span><span><b>${esc(n.title)}</b> · ${esc(n.body)}<small>${esc(n.by)} · ${ago(n.at)}</small></span></div>`).join('') : '<p class="dim">Nothing shared with students yet. Showing what changed is what keeps students reporting.</p>';
    $$('[data-perm-hide]').forEach((el) => { el.hidden = !canDo(el.dataset.permHide); });

    $('#escalations').innerHTML = a.escalations.length ? a.escalations.map((e) => `
      <div class="feed-row"><span class="dot"></span><span><b>${esc(e.to)}</b> · ${esc(e.code)}<small>${esc(e.by)} · ${ago(e.at)}${e.note ? ` · ${esc(e.note)}` : ''}</small></span></div>`).join('') : '<p class="dim">No escalations in this period.</p>';
  }

  // Bars for reports (with the high-urgency share) and a line for cases resolved each week.
  function trendChart(weeks) {
    const W = 640, H = 220, L = 34, R = 14, T = 14, B = 30;
    const iw = W - L - R, ih = H - T - B;
    const max = Math.max(4, ...weeks.map((w) => Math.max(w.total, w.resolved)));
    const step = iw / weeks.length;
    const bw = Math.min(34, step * 0.55);
    const y = (v) => T + ih - (v / max) * ih;
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Reports and resolved cases by week">`;
    for (let g = 0; g <= 4; g++) {
      const gy = T + (ih / 4) * g;
      svg += `<line x1="${L}" x2="${W - R}" y1="${gy}" y2="${gy}" class="grid"/><text x="${L - 8}" y="${gy + 4}" class="ax" text-anchor="end">${Math.round(max - (max / 4) * g)}</text>`;
    }
    weeks.forEach((w, i) => {
      const cx = L + step * i + step / 2;
      svg += `<rect x="${cx - bw / 2}" y="${y(w.total)}" width="${bw}" height="${T + ih - y(w.total)}" rx="5" class="b-all"><title>${w.total} reports</title></rect>`;
      if (w.high) svg += `<rect x="${cx - bw / 2}" y="${y(w.high)}" width="${bw}" height="${T + ih - y(w.high)}" rx="5" class="b-high"><title>${w.high} high urgency</title></rect>`;
      const d = new Date(w.start);
      svg += `<text x="${cx}" y="${H - 8}" class="ax" text-anchor="middle">${d.getDate()} ${d.toLocaleString('en', { month: 'short' })}</text>`;
    });
    const pts = weeks.map((w, i) => [L + step * i + step / 2, y(w.resolved)]);
    svg += `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" class="res-line"/>`;
    svg += pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="4" class="res-pt"><title>${weeks[i].resolved} resolved</title></circle>`).join('');
    return svg + '</svg>';
  }

  $('#printReport').addEventListener('click', () => {
    api('/api/report/printed', { days: state.period }).catch(() => {});
    document.body.classList.add('printing');
    setTimeout(() => { window.print(); document.body.classList.remove('printing'); }, 50);
  });

  // ---------- cases ----------
  function syncFilter() { $$('[data-filter]', $('.toolbar')).forEach((b) => b.classList.toggle('active', b.dataset.filter === state.filter)); renderCases(); }
  $$('.toolbar [data-filter]').forEach((b) => b.addEventListener('click', () => { state.filter = b.dataset.filter; syncFilter(); }));
  $('#caseSearch').addEventListener('input', (e) => { state.search = e.target.value.trim().toLowerCase(); renderCases(); });
  $('#catFilter').addEventListener('change', (e) => { state.cat = e.target.value; renderCases(); });
  $('#sortBy').addEventListener('change', (e) => { state.sort = e.target.value; renderCases(); });
  $('#exportCsv').addEventListener('click', async (e) => {
    e.preventDefault();
    const res = await fetch('/api/export/cases.csv', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return toast('Export failed');
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: `safevoice-cases-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Export downloaded · recorded in the audit log');
  });

  async function loadCases() {
    const r = await api('/api/cases');
    state.cases = r.cases;
    const cats = [...new Set(state.cases.map((c) => c.triage.category))].sort();
    $('#catFilter').innerHTML = '<option value="">All types</option>' + cats.map((c) => `<option ${c === state.cat ? 'selected' : ''}>${esc(c)}</option>`).join('');
    renderCases();
  }

  const overdue = (c) => c.status !== 'resolved' && !c.firstResponseAt && new Date(c.sla.dueAt) < Date.now();
  function visibleCases() {
    const f = state.filter;
    const q = state.search;
    return state.cases
      .filter((c) => {
        if (f === 'open' && c.status === 'resolved') return false;
        if (f === 'resolved' && c.status !== 'resolved') return false;
        if (f === 'mine' && (c.assignee !== state.me.id || c.status === 'resolved')) return false;
        if (f === 'unassigned' && (c.assignee || c.status === 'resolved')) return false;
        if (f === 'overdue' && !overdue(c)) return false;
        if (state.cat && c.triage.category !== state.cat) return false;
        if (q && !`${c.code} ${c.text} ${c.triage.place} ${c.location} ${c.triage.category} ${c.tags.join(' ')} ${staffName(c.assignee)}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        if (state.sort === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
        if (state.sort === 'due') return new Date(a.sla.dueAt) - new Date(b.sla.dueAt);
        return b.urgency - a.urgency || new Date(b.createdAt) - new Date(a.createdAt);
      });
  }

  function renderCases() {
    if (!canDo('cases')) return;
    const openN = state.cases.filter((c) => c.status === 'new' || c.unread).length;
    $('#navCount').textContent = openN || '';
    const list = visibleCases();
    const all = state.cases.filter((c) => c.status !== 'resolved');
    $('#casesSub').textContent = `${all.length} open · ${all.filter(overdue).length} overdue · ${all.filter((c) => !c.assignee).length} unassigned`;
    const box = $('#caseList');
    if (!list.length) {
      box.innerHTML = `<div class="empty">${state.search || state.cat ? 'No cases match these filters.' : state.filter === 'open' ? 'No open cases. New reports appear here instantly.' : 'Nothing here.'}</div>`;
    } else {
      box.innerHTML = list.map((c) => {
        const u = c.urgency;
        let tag = `<span class="tag l${Math.max(u, 2)}">${LEVEL(u)}</span>`;
        if (c.status !== 'new') tag = `<span class="tag st-${c.status}">${STATUS[c.status]}</span>`;
        if (c.unread) tag = '<span class="tag msg">New message</span>';
        const sub = [c.triage.place !== 'Unspecified' ? c.triage.place : c.location, c.time].filter(Boolean).join(' · ') || 'No place given';
        return `<button class="case ${u >= 5 && c.status !== 'resolved' ? 'urgent' : ''} ${state.selected === c.id ? 'selected' : ''} ${flashId === c.id ? 'flash' : ''}" data-id="${c.id}" role="listitem">
          <span class="num u${u}">${u}</span>
          <span class="case-main"><span class="code">${esc(c.code)} · ${ago(c.createdAt)}</span><span class="title">${esc(c.triage.category)}</span><span class="sub">${esc(sub)}</span>
            <span class="case-meta">${slaChip(c)}${c.tags.slice(0, 2).map((t) => `<span class="ctag">${esc(t)}</span>`).join('')}</span></span>
          <span class="right">${tag}${avatar(c.assignee)}</span>
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

  const viewed = new Set();
  function select(id) {
    saveDraft();
    if (state.selected !== id) state.tab = 'conversation';
    state.selected = id;
    $$('.case').forEach((b) => b.classList.toggle('selected', b.dataset.id === id));
    renderDetail();
    const c = state.cases.find((x) => x.id === id);
    // Opening a case is recorded in the audit log once per session.
    if (c && !viewed.has(id)) { viewed.add(id); api(`/api/cases/${id}`).catch(() => {}); }
    if (c?.unread) api(`/api/cases/${id}/read`, {}).then(upsertAndRender).catch(() => {});
  }
  function upsertAndRender(c) { upsert(c); renderCases(); }

  function saveDraft() {
    const ta = $('#replyText');
    if (ta && state.selected) state.drafts[state.selected] = ta.value;
  }

  const EVENT_LABEL = {
    created: 'Report received', reply: 'Replied to student', status: 'Status changed', urgency: 'Urgency changed', assigned: 'Assigned',
    note: 'Added a private note', tags: 'Tags updated', escalated: 'Escalated', 'student-message': 'Student wrote again', feedback: 'Student feedback',
  };

  function renderDetail() {
    const box = $('#detail');
    const c = state.cases.find((x) => x.id === state.selected);
    if (!c) { box.dataset.sig = ''; box.innerHTML = '<div class="empty">Select a case to see the AI triage and reply.</div>'; return; }
    // Don't rebuild (and steal focus from the reply box) unless something changed.
    const sig = `${c.id}|${c.updatedAt}|${c.urgency}|${c.status}|${c.messages.length}|${c.unread}|${state.tab}|${c.assignee}|${c.notes.length}`;
    if (box.dataset.sig === sig) return;
    box.dataset.sig = sig;
    const u = c.urgency;
    const overridden = c.urgencyOverride != null;
    const thread = c.messages.filter((m, i) => i > 0);
    const assignable = state.staff.filter((s) => s.active && (s.role === 'admin' || s.role === 'counsellor'));
    const tabs = [['conversation', `Conversation${thread.length ? ` (${thread.length})` : ''}`], ['notes', `Private notes${c.notes.length ? ` (${c.notes.length})` : ''}`], ['timeline', 'Timeline']];

    let body = '';
    if (state.tab === 'conversation') {
      body = `${thread.length ? `<div class="convo">${thread.map((m) => `<div class="msg ${m.from}"><span class="who">${m.from === 'student' ? 'Student' : m.from === 'counsellor' ? esc(m.by ? staffName(m.by) : 'Counsellor') : 'SafeVoice'} · ${ago(m.at)}</span>${esc(m.text)}</div>`).join('')}</div>` : '<p class="dim small">No replies yet. The student received the automatic supportive message.</p>'}
      <div class="reply-box">
        <textarea id="replyText" placeholder="Write a calm, kind reply. The student sees it with their case code."></textarea>
        <div class="reply-actions">
          <button class="btn ghost" id="suggestBtn">✦ Suggest reply</button>
          <button class="btn primary" id="sendBtn">Send to student</button>
          <span class="note">Anonymous · visible with the case code</span>
        </div>
      </div>`;
    } else if (state.tab === 'notes') {
      body = `<p class="dim small">Only staff with case access can read notes. Students never see them.</p>
        <div class="convo">${c.notes.map((n) => `<div class="msg note"><span class="who">${esc(staffName(n.by))} · ${when(n.at)}</span>${esc(n.text)}</div>`).join('') || '<p class="dim">No notes yet.</p>'}</div>
        <div class="reply-box"><textarea id="noteText" placeholder="What you did, who you spoke to, what's next…"></textarea>
        <div class="reply-actions"><button class="btn primary" id="noteBtn">Add note</button></div></div>`;
    } else {
      body = `<ol class="timeline">${c.events.slice().reverse().map((e) => `<li><span class="t-dot ${e.type}"></span><span><b>${esc(EVENT_LABEL[e.type] || e.type)}</b>${e.detail ? ` · ${esc(e.detail)}` : ''}<small>${esc(e.by)} · ${when(e.at)}</small></span></li>`).join('')}</ol>`;
    }

    box.innerHTML = `
      <div class="detail-head">
        <span class="mono">${esc(c.code)}</span>${c.helpNow ? '<span class="tag l4">Asked for help now</span>' : ''}${c.feedback ? `<span class="tag ${c.feedback.safer === 'no' ? 'l5' : 'replied'}">${SAFER[c.feedback.safer]}</span>` : ''}
        <span class="spacer"></span>${slaChip(c)}
      </div>
      <div class="props">
        <label>Status<select id="statusSel">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === c.status ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label>Assigned to<select id="assignSel"><option value="">Unassigned</option>${assignable.map((s) => `<option value="${s.id}" ${s.id === c.assignee ? 'selected' : ''}>${esc(s.name)}${s.id === state.me.id ? ' (me)' : ''}</option>`).join('')}</select></label>
        <div class="tags-edit"><span>Tags</span><div class="tag-row">${c.tags.map((t) => `<span class="ctag">${esc(t)}<button data-untag="${esc(t)}" aria-label="Remove tag">×</button></span>`).join('')}<input id="tagInput" placeholder="+ add tag" maxlength="32"></div></div>
      </div>
      <div class="triage${u >= 4 ? ' hot' : ''}">
        <p class="eyebrow"><span>AI triage</span><span class="dim">${AI_NAME[c.triage.source] || 'Rule engine'}</span></p>
        <div class="meter" aria-hidden="true">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= u ? 'on' : ''}"></i>`).join('')}</div>
        <p class="urg">Urgency ${u}/5 · <em>${LEVEL(u)}</em></p>
        <p class="summary">${esc(c.triage.summary)}</p>
        <div class="flags">${c.triage.flags.map((f) => `<span class="flag">${esc(f)}</span>`).join('')}</div>
        <div class="override">
          <span>Counsellor decides:</span>
          <button data-urg="-1" aria-label="Lower urgency">−</button>
          <button data-urg="1" aria-label="Raise urgency">+</button>
          ${overridden ? `<span>Changed from AI ${c.triage.urgency}/5</span> <button class="linkish" data-urg="reset" style="width:auto">reset</button>` : ''}
          <span class="spacer"></span>
          <button class="btn ghost sm" id="escBtn">Escalate…</button>
        </div>
        <div class="esc-form" id="escForm" hidden>
          <select id="escTo">${ESCALATE_TO.map((x) => `<option>${x}</option>`).join('')}</select>
          <input id="escNote" placeholder="Short reason (kept private)" maxlength="300">
          <button class="btn primary sm" id="escGo">Escalate</button>
        </div>
        ${c.escalations.length ? `<div class="esc-list">${c.escalations.map((e) => `<span>↗ ${esc(e.to)} · ${esc(staffName(e.by))} · ${ago(e.at)}</span>`).join('')}</div>` : ''}
      </div>
      <div>
        <p class="section-label">Student report</p>
        <p class="quote">“${esc(c.text)}”</p>
        <p class="meta">${c.about ? esc(ABOUT[c.about]) + ' · ' : ''}${esc([c.location, c.time].filter(Boolean).join(' · ') || 'No place or time given')} · ${when(c.createdAt)} · ${c.lang === 'ta' ? 'Tamil' : 'English'}</p>
      </div>
      <div class="tabs" role="tablist">${tabs.map(([k, v]) => `<button role="tab" data-tab="${k}" class="${state.tab === k ? 'active' : ''}">${v}</button>`).join('')}</div>
      <div class="tab-body">${body}</div>`;

    const act = async (path, payload, msg) => {
      try { upsertAndRender(await api(`/api/cases/${c.id}/${path}`, payload)); if (msg) toast(msg); } catch (ex) { toast(ex.message); }
    };
    $$('[data-tab]', box).forEach((b) => b.addEventListener('click', () => { saveDraft(); state.tab = b.dataset.tab; renderDetail(); }));
    $('#statusSel').addEventListener('change', (e) => act('status', { status: e.target.value }, `Status: ${STATUS[e.target.value]}`));
    $('#assignSel').addEventListener('change', (e) => act('assign', { staffId: e.target.value || null }, e.target.value ? `Assigned to ${staffName(e.target.value)}` : 'Unassigned'));
    $('#tagInput').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !e.target.value.trim()) return;
      e.preventDefault();
      act('tags', { tags: [...c.tags, e.target.value.trim()] });
    });
    $$('[data-untag]', box).forEach((b) => b.addEventListener('click', () => act('tags', { tags: c.tags.filter((t) => t !== b.dataset.untag) })));
    $$('[data-urg]', box).forEach((b) => b.addEventListener('click', () => {
      const v = b.dataset.urg === 'reset' ? c.triage.urgency : Math.min(5, Math.max(1, u + Number(b.dataset.urg)));
      act('urgency', { urgency: v });
    }));
    $('#escBtn').addEventListener('click', () => { $('#escForm').hidden = !$('#escForm').hidden; });
    $('#escGo').addEventListener('click', () => act('escalate', { to: $('#escTo').value, note: $('#escNote').value }, `Escalated to ${$('#escTo').value}`));

    if (state.tab === 'conversation') {
      const ta = $('#replyText');
      ta.value = state.drafts[c.id] || '';
      ta.addEventListener('input', saveDraft);
      $('#suggestBtn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'Drafting…';
        try {
          const r = await api(`/api/cases/${c.id}/suggest`, {});
          typeInto(ta, r.text);
        } catch (ex) { toast(ex.message); } finally {
          btn.disabled = false;
          btn.textContent = '✦ Suggest reply';
        }
      });
      $('#sendBtn').addEventListener('click', async (e) => {
        const text = ta.value.trim();
        if (!text) { ta.focus(); return; }
        e.currentTarget.disabled = true;
        delete state.drafts[c.id];
        act('reply', { text }, 'Reply sent');
      });
    }
    if (state.tab === 'notes') {
      $('#noteBtn').addEventListener('click', () => {
        const text = $('#noteText').value.trim();
        if (text) act('note', { text }, 'Note added');
      });
    }
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
  const MAP_ZONES = ['library', 'classrooms', 'labs', 'corridor', 'stairs', 'canteen', 'washrooms', 'playground', 'gate'];
  const rangeLabel = (d) => ({ 7: 'Last 7 days', 21: 'Last 3 weeks', 90: 'Last 90 days', 180: 'This term (180 days)', 365: 'Last 12 months' }[d] || `Last ${d} days`);
  $$('[data-days]').forEach((b) => b.addEventListener('click', () => {
    state.days = Number(b.dataset.days);
    $$('[data-days]').forEach((x) => x.classList.toggle('active', x === b));
    loadHotspots();
  }));

  async function loadHotspots() {
    const h = await api(`/api/hotspots?days=${state.days}`);
    const label = rangeLabel(state.days);
    $('#hotSub').textContent = `${label} · ${h.total} reports`;
    const watched = new Map(h.watch.map((w) => [w.zone, w]));
    const max = Math.max(1, ...Object.values(h.zones).map((z) => z.count));
    const zoneHtml = (id, extra) => {
      const z = h.zones[id];
      // Wider reach: circles grow up to 260px and spill over neighbouring zones.
      const size = z.count ? 60 + (z.count / max) * 200 : 0;
      const hot = z.count && (z.count / max >= 0.6 || z.weight / z.count >= 3.5);
      const w = watched.get(id);
      return `<button class="zone z-${id} ${state.zone === id ? 'sel' : ''} ${extra || ''}" data-zone="${id}" aria-label="${esc(z.name)}: ${z.count} reports">
        <span>${esc(z.name)}${w ? ` <i class="eye ${w.rising ? 'rising' : ''}" title="Watched">◉</i>` : ''}</span><b>${z.count || ''}</b>
        ${z.count && !extra ? `<div class="heat ${hot ? 'hot' : 'warm'}" style="width:${size}px;height:${size}px"></div>` : ''}</button>`;
    };
    $('#map').innerHTML = MAP_ZONES.map((id) => zoneHtml(id)).join('');
    $('#mapExtra').innerHTML = ['online', 'bus'].map((id) => zoneHtml(id, 'flat')).join('');
    $$('[data-zone]').forEach((b) => b.addEventListener('click', () => selectZone(b.dataset.zone)));

    $('#watchList').innerHTML = h.watch.length ? h.watch.map((w) => `
      <button class="watch-row ${w.rising ? 'rising' : ''}" data-zone="${w.zone}">
        <span class="w-dot"></span>
        <span><b>${esc(w.name)}</b><small>${w.count} of ${w.threshold} reports in ${w.days} days${w.note ? ` · ${esc(w.note)}` : ''}</small></span>
        <span class="tag ${w.rising ? 'l5' : 'replied'}">${w.rising ? 'Rising' : 'Quiet'}</span>
      </button>`).join('') : '<p class="dim">No zones watched yet. Select a zone and press Watch.</p>';
    $$('#watchList [data-zone]').forEach((b) => b.addEventListener('click', () => selectZone(b.dataset.zone)));

    const tmax = Math.max(1, ...Object.values(h.byTime));
    $('#timeBars').innerHTML = Object.entries(h.byTime).map(([k, v]) => `
      <div class="bar ${v === tmax && v > 0 ? 'max' : ''}"><b>${v}</b><i style="height:${(v / tmax) * 100}%"></i><small>${k === 'After school' ? 'After' : k}</small></div>`).join('');

    $('#patterns').innerHTML = h.patterns.length
      ? h.patterns.slice(0, 3).map((p) => `<div class="pattern"><p class="eyebrow">Pattern detected</p><h3>${esc(p.place)} · <em>${esc(p.time)}</em></h3><p>${p.count} reports, ${label.toLowerCase()}. Consider staff supervision here.</p></div>`).join('')
      : '<div class="empty">No repeating pattern yet. Patterns appear when 3 or more reports share a place and time.</div>';

    const cats = Object.entries(h.byCategory).sort((a, b) => b[1] - a[1]);
    const cmax = Math.max(1, ...cats.map((c) => c[1]));
    $('#catBars').innerHTML = cats.map(([k, v]) => `<div class="cat"><span>${esc(k)}</span><i style="width:${(v / cmax) * 100}%"></i><b>${v}</b></div>`).join('') || '<p class="dim">No reports in this range.</p>';
    if (state.zone) loadZone();
  }

  // ---------- zone tracker ----------
  function selectZone(id) {
    state.zone = id;
    $$('[data-zone]').forEach((b) => b.classList.toggle('sel', b.dataset.zone === id && b.classList.contains('zone')));
    loadZone();
    if (innerWidth < 1180) $('#tracker').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function loadZone() {
    const id = state.zone;
    const d = await api(`/api/zones/${id}?days=${Math.max(state.days, 7)}`);
    if (state.zone !== id) return;
    const runs = canDo('cases');
    const smax = Math.max(1, ...d.series.map((s) => s.total));
    const trend = d.total === d.prev ? 'same as' : d.total < d.prev ? `↓ ${d.prev - d.total} fewer than` : `↑ ${d.total - d.prev} more than`;
    const w = d.watch;
    const bucket = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    const tops = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 4);
    $('#tracker').innerHTML = `
      <div class="tr-head">
        <div><p class="eyebrow tint">Zone tracker</p><h2 class="serif">${esc(d.name)}</h2></div>
        ${runs ? (w ? `<button class="btn ghost sm" id="unwatchBtn">◉ Watching · stop</button>` : `<button class="btn primary sm" id="watchBtn">◉ Watch zone</button>`) : ''}
      </div>
      ${runs && !w ? `<div class="watch-form" id="watchForm" hidden>Alert me when <input type="number" id="wN" min="1" max="50" value="2"> reports come in within <input type="number" id="wD" min="1" max="60" value="7"> days <button class="btn primary sm" id="watchGo">Start watching</button></div>` : ''}
      ${w ? `<p class="watch-state ${w.rising ? 'rising' : ''}">${w.rising ? 'Rising' : 'Quiet'}: ${w.count} of ${w.threshold} reports in the last ${w.days} days · watched by ${esc(w.byName)}</p>` : ''}
      <div class="tr-kpis">
        <div><b>${d.total}</b><span>reports, ${rangeLabel(d.days).toLowerCase()}</span><small>${trend} the period before</small></div>
        <div><b>${d.avgUrgency ?? '—'}</b><span>average urgency</span></div>
        <div><b>${d.open}</b><span>open now</span></div>
      </div>
      <div class="spark" aria-label="Reports per ${d.step === 7 ? 'week' : 'month'}">${d.series.map((s) => `<i style="height:${Math.max(3, (s.total / smax) * 100)}%" class="${s.high ? 'hi' : ''}" title="${bucket(s.start)}: ${s.total} report${s.total === 1 ? '' : 's'}"></i>`).join('')}</div>
      <p class="dim small spark-cap">Reports per ${d.step === 7 ? 'week' : 'month'} · rose = includes high urgency</p>
      ${d.impact ? `<div class="impact ${d.impact.after < d.impact.before ? 'good' : ''}"><b>${d.impact.after < d.impact.before ? 'It\'s working' : 'Keep going'}</b> Since "${esc(d.impact.title)}" (${ago(d.impact.since)}): <b>${d.impact.after}</b> reports, against <b>${d.impact.before}</b> in the ${d.impact.days} days before.</div>` : ''}
      <div class="tr-cols">
        <div><p class="section-label">Exact places</p>${tops(d.places).map(([k, v]) => `<div class="kv-row"><span>${esc(k)}</span><b>${v}</b></div>`).join('') || '<p class="dim small">—</p>'}</div>
        <div><p class="section-label">When</p>${tops(d.byTime).map(([k, v]) => `<div class="kv-row"><span>${esc(k)}</span><b>${v}</b></div>`).join('') || '<p class="dim small">—</p>'}</div>
      </div>
      <div><p class="section-label">Types</p><div class="flags">${tops(d.byCategory).map(([k, v]) => `<span class="ctag">${esc(k)} · ${v}</span>`).join('') || '<span class="dim small">No reports</span>'}</div></div>
      <div><p class="section-label">What the school did here</p>${d.actions.length ? `<div class="feed">${d.actions.map((a) => `<div class="feed-row"><span class="dot ok"></span><span><b>${esc(a.kind)}</b> · ${esc(a.title)}${a.detail ? ` · <span class="dim">${esc(a.detail)}</span>` : ''}<small>${esc(a.by)} · ${ago(a.at)}</small></span></div>`).join('')}</div>` : '<p class="dim small">Nothing recorded yet. Give the peer support team a task here, or post a "you said, we did" update.</p>'}</div>
      ${runs ? `<div><p class="section-label">Recent reports here</p>${d.cases.length ? d.cases.map((c) => `<button class="att" data-goto="cases" data-case="${c.id}"><span class="num u${c.urgency}">${c.urgency}</span><span><b>${esc(c.category)}</b><small>${esc(c.code)} · ${ago(c.createdAt)} · ${STATUS[c.status]}</small></span></button>`).join('') : '<p class="dim small">None in this period.</p>'}</div>` : '<p class="dim small">Individual reports are visible to counsellors only.</p>'}`;
    $('#watchBtn')?.addEventListener('click', () => { $('#watchForm').hidden = false; $('#wN').focus(); });
    $('#watchGo')?.addEventListener('click', async () => {
      await api(`/api/zones/${id}/watch`, { threshold: Number($('#wN').value), days: Number($('#wD').value) });
      toast(`Watching ${d.name}`);
      loadHotspots();
    });
    $('#unwatchBtn')?.addEventListener('click', async () => {
      await api(`/api/zones/${id}/unwatch`, {});
      toast(`Stopped watching ${d.name}`);
      loadHotspots();
    });
  }

  function zoneAlert(d) {
    chime(false);
    const el = $('#alert');
    el.textContent = `Watched zone rising · ${d.name}: ${d.count} reports in ${d.days} days`;
    el.classList.add('zone-alert');
    el.hidden = false;
    el.onclick = () => { el.hidden = true; el.classList.remove('zone-alert'); switchView('hotspots'); selectZone(d.zone); };
    clearTimeout(urgentAlert.t);
    urgentAlert.t = setTimeout(() => { el.hidden = true; el.classList.remove('zone-alert'); }, 15000);
    try {
      if (Notification.permission === 'granted') new Notification('SafeVoice: watched zone rising', { body: `${d.name}: ${d.count} reports in ${d.days} days`, icon: '/logo.svg' });
    } catch {}
  }

  // ---------- peer support team ----------
  async function loadPeer() {
    const r = await api('/api/tasks');
    const runs = canDo('cases');
    $('#peerTitle').textContent = r.teamName;
    $('#navPeer').textContent = r.teamName;
    $('#peerSub').textContent = runs ? 'Students helping the counsellor prevent conflict. They never see reports.' : `Your tasks from the counsellor · ${state.me.name}`;
    const timeOpts = (sel, first) => { if (sel.options.length <= 1) sel.innerHTML = `<option value="">${first}</option>` + r.times.map((t) => `<option>${t}</option>`).join(''); };
    timeOpts($('#tTime'), 'Any time');
    timeOpts($('#cWhen'), 'Not sure');
    if ($('#cWhere').options.length <= 1) $('#cWhere').innerHTML = '<option value="">Not sure</option>' + ['Corridor', 'Classroom', 'Canteen', 'Playground', 'Washrooms', 'Library', 'School bus', 'Online'].map((l) => `<option>${l}</option>`).join('');
    if (runs) {
      $('#tPeers').innerHTML = r.team.length ? r.team.map((s) => `<label class="check"><input type="checkbox" value="${s.id}"> ${esc(s.name)} <small class="dim">${esc(s.title)}</small></label>`).join('') : '<p class="dim small">No peer supporters yet. Add them in Team &amp; roles.</p>';
      $('#teamList').innerHTML = r.team.map((s) => `<div class="wl">${avatar(s.id)}<span class="wl-name">${esc(s.name)}</span><span class="wl-n">${esc(s.title)} · ${s.open} open task${s.open === 1 ? '' : 's'}</span></div>`).join('') || '<p class="dim">Nobody yet.</p>';
    }
    $('#taskList').innerHTML = r.tasks.length ? r.tasks.map((t) => {
      const mine = runs || t.assignees.some((a) => a.id === state.me.id);
      const due = t.dueAt && t.status !== 'done' ? ` · until ${new Date(t.dueAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : '';
      return `<article class="task panel ${t.status}">
        <div class="task-head"><span class="tag ${t.status === 'done' ? 'replied' : 'st-open'}">${t.status === 'done' ? 'Done' : 'Open'}</span><span class="dim small">${esc([t.place, t.time].filter(Boolean).join(' · ') || 'Anywhere')}${due}</span><span class="spacer"></span><span class="task-who">${t.assignees.map((a) => avatar(a.id)).join('')}</span></div>
        <h3 class="serif">${esc(t.title)}</h3>
        ${t.details ? `<p>${esc(t.details)}</p>` : ''}
        <small class="dim">From ${esc(t.createdByName)} · ${ago(t.createdAt)} · ${t.assignees.map((a) => esc(a.name)).join(', ')}</small>
        ${t.updates.length ? `<div class="feed">${t.updates.map((u) => `<div class="feed-row"><span class="dot ok"></span><span>${esc(u.text)}<small>${esc(u.name)} · ${ago(u.at)}</small></span></div>`).join('')}</div>` : ''}
        ${mine ? `<div class="task-actions"><input placeholder="Add an update…" maxlength="1000" data-upd="${t.id}"><button class="btn ghost sm" data-post="${t.id}">Post</button><button class="btn ${t.status === 'done' ? 'ghost' : 'primary'} sm" data-done="${t.id}" data-to="${t.status === 'done' ? 'open' : 'done'}">${t.status === 'done' ? 'Reopen' : 'Mark done'}</button>${runs ? `<button class="linkish" data-tdel="${t.id}">Remove</button>` : ''}</div>` : ''}
      </article>`;
    }).join('') : `<div class="empty">${runs ? 'No tasks yet. Turn a hotspot into a task for the team.' : 'No tasks right now. Thank you for being part of the team.'}</div>`;
    const post = async (id, body, msg) => { try { await api(`/api/tasks/${id}/update`, body); toast(msg); loadPeer(); } catch (ex) { toast(ex.message); } };
    $$('[data-post]').forEach((b) => b.addEventListener('click', () => { const v = $(`[data-upd="${b.dataset.post}"]`).value.trim(); if (v) post(b.dataset.post, { text: v }, 'Update posted'); }));
    $$('[data-upd]').forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter' && i.value.trim()) post(i.dataset.upd, { text: i.value.trim() }, 'Update posted'); }));
    $$('[data-done]').forEach((b) => b.addEventListener('click', () => { const v = $(`[data-upd="${b.dataset.done}"]`).value.trim(); post(b.dataset.done, { status: b.dataset.to, text: v || undefined }, b.dataset.to === 'done' ? 'Marked done' : 'Reopened'); }));
    $$('[data-tdel]').forEach((b) => b.addEventListener('click', async () => { if (!confirm('Remove this task?')) return; await api(`/api/tasks/${b.dataset.tdel}/delete`, {}); loadPeer(); }));
  }
  $('#taskForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#tErr').hidden = true;
    try {
      await api('/api/tasks', { title: $('#tTitle').value, place: $('#tPlace').value, time: $('#tTime').value, dueAt: $('#tDue').value || undefined, details: $('#tDetails').value, assignees: $$('#tPeers input:checked').map((i) => i.value) });
      e.target.reset();
      toast('Task given to the team');
      loadPeer();
    } catch (ex) { $('#tErr').textContent = ex.message; $('#tErr').hidden = false; }
  });
  $('#concernForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#cErr').hidden = true;
    try {
      const r = await api('/api/peer/concern', { text: $('#cText').value, location: $('#cWhere').value, time: $('#cWhen').value, urgent: $('#cUrgent').checked });
      e.target.reset();
      toast(r.urgent ? 'Sent. The counsellor has been alerted now. If someone is in danger, find a teacher or call 112.' : 'Sent to the counsellor. Thank you for looking out for others.');
    } catch (ex) { $('#cErr').textContent = ex.message; $('#cErr').hidden = false; }
  });

  // ---------- notices ----------
  async function loadNotices() {
    const { notices } = await api('/api/notices');
    $('#noticeList').innerHTML = notices.length ? notices.map((n) => `
      <div class="notice panel ${n.pinned ? 'pinned' : ''}">
        ${n.pinned ? '<span class="tag replied">Pinned</span>' : ''}
        <h3 class="serif">${esc(n.title)}</h3>
        <p>${esc(n.body)}</p>
        <small class="dim">${esc(n.by)} · ${when(n.at)}</small>
        ${canDo('notices') ? `<button class="linkish" data-del="${n.id}">Remove</button>` : ''}
      </div>`).join('') : '<div class="empty">Nothing shared yet. When the school acts on a pattern, tell students here.</div>';
    $$('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Remove this update from the student app?')) return;
      await api(`/api/notices/${b.dataset.del}/delete`, {});
      loadNotices();
    }));
  }
  $('#noticeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#nErr').hidden = true;
    try {
      await api('/api/notices', { title: $('#nTitle').value, body: $('#nBody').value, pinned: $('#nPinned').checked });
      e.target.reset();
      toast('Published to the student app');
      loadNotices();
    } catch (ex) { $('#nErr').textContent = ex.message; $('#nErr').hidden = false; }
  });

  // ---------- team ----------
  async function loadTeam() {
    const r = await api('/api/staff');
    state.staff = r.staff;
    $('#sRole').innerHTML = Object.entries(r.roles).map(([k, v]) => `<option value="${k}" ${k === 'counsellor' ? 'selected' : ''}>${esc(v)}</option>`).join('');
    $('#teamTable').innerHTML = `<thead><tr><th>Member</th><th>Role</th><th>Open cases</th><th>Last sign-in</th><th>Status</th><th></th></tr></thead><tbody>${r.staff.map((s) => `
      <tr class="${s.active ? '' : 'inactive'}">
        <td><div class="who-cell">${avatar(s.id)}<span><b>${esc(s.name)}</b><small>${esc(s.title)}</small></span></div></td>
        <td><select data-role="${s.id}">${Object.entries(r.roles).map(([k, v]) => `<option value="${k}" ${k === s.role ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></td>
        <td>${s.role === 'viewer' || s.role === 'peer' ? '—' : s.open}</td>
        <td>${s.lastLoginAt ? ago(s.lastLoginAt) : 'Never'}</td>
        <td><span class="tag ${s.active ? 'replied' : ''}">${s.active ? 'Active' : 'Deactivated'}</span></td>
        <td class="row-actions"><button class="linkish" data-pin="${s.id}">Reset PIN</button><button class="linkish" data-active="${s.id}" data-on="${!s.active}">${s.active ? 'Deactivate' : 'Reactivate'}</button></td>
      </tr>`).join('')}</tbody>`;
    const upd = async (id, body, msg) => { try { await api(`/api/staff/${id}`, body); toast(msg); } catch (ex) { toast(ex.message); } loadTeam(); };
    $$('[data-role]').forEach((s) => s.addEventListener('change', () => upd(s.dataset.role, { role: s.value }, 'Role updated')));
    $$('[data-pin]').forEach((b) => b.addEventListener('click', () => {
      const pin = prompt('New PIN for this person (4–8 digits):');
      if (pin) upd(b.dataset.pin, { pin }, 'PIN reset');
    }));
    $$('[data-active]').forEach((b) => b.addEventListener('click', () => upd(b.dataset.active, { active: b.dataset.on === 'true' }, b.dataset.on === 'true' ? 'Reactivated' : 'Deactivated and signed out')));
  }
  $('#staffForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#sErr').hidden = true;
    try {
      await api('/api/staff', { name: $('#sName').value, title: $('#sTitle').value, role: $('#sRole').value, pin: $('#sPin').value });
      e.target.reset();
      toast('Team member added');
      loadTeam();
    } catch (ex) { $('#sErr').textContent = ex.message; $('#sErr').hidden = false; }
  });

  // ---------- audit ----------
  const ACTION_LABEL = {
    login: 'Signed in', logout: 'Signed out', 'login.failed': 'Wrong PIN', 'case.view': 'Opened case', 'case.reply': 'Replied', 'case.status': 'Changed status',
    'case.urgency': 'Changed urgency', 'case.assigned': 'Assigned case', 'case.note': 'Added note', 'case.tags': 'Edited tags', 'case.escalated': 'Escalated',
    'export.csv': 'Exported cases (CSV)', 'export.report': 'Printed safety report', 'notice.publish': 'Shared a "we did" update', 'notice.remove': 'Removed an update',
    'task.create': 'Gave peer team a task', 'task.update': 'Updated a peer task', 'task.remove': 'Removed a peer task', 'peer.concern': 'Peer passed on a concern', 'zone.watch': 'Started watching a zone', 'zone.unwatch': 'Stopped watching a zone', 'zone.alert': 'Watched zone alert', 'team.add': 'Added team member', 'team.update': 'Changed team member', 'settings.update': 'Changed settings', 'demo.reset': 'Reset demo data', 'data.delete-all': 'Deleted all reports',
  };
  let auditT;
  $('#auditSearch').addEventListener('input', () => { clearTimeout(auditT); auditT = setTimeout(loadAudit, 200); });
  async function loadAudit() {
    const r = await api(`/api/audit?q=${encodeURIComponent($('#auditSearch').value.trim())}`);
    $('#auditSub').textContent = `${r.total} entries · showing the latest ${r.entries.length}`;
    $('#auditTable').innerHTML = `<thead><tr><th>When</th><th>Who</th><th>Action</th><th>Case</th><th>Detail</th></tr></thead><tbody>${r.entries.map((a) => `
      <tr class="${a.action === 'login.failed' ? 'warn-row' : ''}"><td class="nowrap">${when(a.at)}</td><td>${esc(a.staff)}</td><td>${esc(ACTION_LABEL[a.action] || a.action)}</td><td class="mono small">${esc(a.target)}</td><td class="dim">${esc(a.detail)}</td></tr>`).join('')}</tbody>`;
  }

  // ---------- settings ----------
  async function loadInfo() {
    const s = await api('/api/settings');
    const pill = $('#aiPill');
    pill.textContent = `AI: ${AI_NAME[s.ai] || 'rule engine'}`;
    pill.classList.toggle('claude', s.ai in AI_NAME);
    $('#schoolName').textContent = s.schoolName;
    const n = s.network;
    $('#netName').textContent = n.hotspot && n.ssid ? `Wi-Fi: ${n.ssid}` : n.urls[0] ? n.urls[0].replace('http://', '') : 'This computer only';
    return s;
  }
  setInterval(() => { if (token && !document.hidden && state.me) loadInfo().catch(() => {}); }, 30_000);

  async function loadSettings() {
    const s = await loadInfo();
    const name = AI_NAME[s.ai];
    $('#aiTitle').textContent = name ? `${name} is triaging reports` : 'Built-in rule engine';
    $('#aiDesc').textContent = name
      ? `Each report is read by ${s.aiLabel || name}, which scores urgency, flags risk signals and writes a supportive first reply. A safety floor of hard rules (self-harm, weapons, abuse) always applies on top.`
      : 'Reports are scored by a transparent keyword engine in English and Tamil. Set GEMINI_API_KEY (or ANTHROPIC_API_KEY) on the server to switch on AI.';
    $('#retention').value = String(s.retentionDays);
    $('#schoolInput').value = s.schoolName;
    $('#teamInput').value = s.peerTeamName;
    $('#slaGrid').innerHTML = [5, 4, 3, 2, 1].map((u) => `<label><span class="num u${u}">${u}</span>${LEVEL(u)}<input type="number" min="1" max="720" data-sla="${u}" value="${s.sla[u]}"><small>hours</small></label>`).join('');
    $('#totalCases').textContent = `${s.total} reports stored right now.`;
    const n = s.network;
    $('#links').innerHTML = n.urls.length
      ? n.urls.map((u, i) => `<a href="${u}/" target="_blank" rel="noopener">${u.replace('http://', '')}</a>${i === 0 && n.hotspot ? ' <span class="dim">(SafeVoice Wi-Fi)</span>' : ''}`).join('')
      : '<span class="dim">Not on any network yet. Start the hotspot.</span>';
    SVQR.renderQR($('#qr'), n.studentUrl, { size: 120 });
    $('#ssid').textContent = n.ssid || 'not set up';
    $('#wpass').textContent = n.password || '—';
    $('#wband').textContent = { TwoPointFourGigahertz: '2.4 GHz · long', FiveGigahertz: '5 GHz · short', SixGigahertz: '6 GHz · short', Auto: 'Auto' }[n.band] || (n.ssid ? 'Auto' : '—');
    $('#wifiBox').classList.toggle('off', !n.ssid);
    $('#wifiQr').innerHTML = '';
    if (n.ssid) SVQR.renderQR($('#wifiQr'), SVQR.wifiText(n.ssid, n.password), { size: 120 });
    $('#netDesc').textContent = n.hotspot
      ? `SafeVoice Wi-Fi is on. Up to 8 phones can join "${n.ssid}". No internet needed.`
      : 'Hotspot is off. Run "Start SafeVoice.bat" to create the SafeVoice Wi-Fi. Phones on the same Wi-Fi as this computer can still connect.';
  }

  const saveSetting = async (body, msg) => { try { await api('/api/settings', body); toast(msg); loadSettings(); } catch (ex) { toast(ex.message); } };
  $('#saveRetention').addEventListener('click', () => saveSetting({ retentionDays: Number($('#retention').value) }, 'Retention saved'));
  $('#saveSchool').addEventListener('click', () => saveSetting({ schoolName: $('#schoolInput').value }, 'School name saved'));
  $('#saveTeam').addEventListener('click', async () => { await saveSetting({ peerTeamName: $('#teamInput').value }, 'Team name saved'); $('#navPeer').textContent = $('#teamInput').value; });
  $('#saveSla').addEventListener('click', () => saveSetting({ sla: Object.fromEntries($$('[data-sla]').map((i) => [i.dataset.sla, Number(i.value)])) }, 'Response targets saved'));
  $('#resetDemo').addEventListener('click', async () => {
    if (!confirm('Replace all reports and updates with the fictional demo data?')) return;
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
