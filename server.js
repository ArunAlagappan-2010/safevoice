// SafeVoice server. Zero required dependencies: `node server.js` and go.
// Privacy by design: no accounts for students, no names, no IP addresses
// stored or logged, reports deleted on a schedule.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Store } from './lib/store.js';
import { triage, ruleTriage, suggestReply, aiAvailable, aiLabel, TIMES } from './lib/triage.js';
import { buildSeed, buildStaff, buildNotices, buildTasks, buildWatch, buildAudit, SEED_STAFF } from './lib/seed.js';
import { ROLES, CASE_ROLES, can, hashPin, verifyPin, publicStaff, Sessions } from './lib/auth.js';
import { analytics, casesCsv } from './lib/analytics.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.join(ROOT, '.env'));

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC = path.join(ROOT, 'public');
const store = new Store(process.env.SAFEVOICE_DATA || path.join(ROOT, 'data', 'db.json'));

const SEEDING = process.env.SEED !== 'false';
if (!store.staff.length) {
  store.data.staff = SEEDING
    ? buildStaff()
    : [{ id: 'st-admin', name: 'School counsellor', role: 'admin', title: 'Counsellor', active: true, pinHash: hashPin(process.env.COUNSELLOR_PIN || '2468'), createdAt: new Date().toISOString() }];
  if (SEEDING && process.env.COUNSELLOR_PIN) store.staff[0].pinHash = hashPin(process.env.COUNSELLOR_PIN);
}
// Demo installs from before the peer support team existed get the demo peers too.
if (SEEDING) {
  for (const s of buildStaff()) if (s.id.startsWith('st-') && SEED_STAFF.some((x) => x.id === s.id) && !store.staffById(s.id)) store.staff.push(s);
  if (!store.tasks.length) store.data.tasks = buildTasks();
  if (!store.watch.length) store.data.watch = buildWatch();
}
if (store.isEmpty && SEEDING) seedDemo();
store.flush();

function seedDemo() {
  const cases = buildSeed(store);
  store.replaceAll(cases);
  store.data.notices = buildNotices();
  store.data.tasks = buildTasks();
  store.data.watch = buildWatch();
  store.data.audit = buildAudit(cases);
}

const LOCATIONS = ['Corridor', 'Classroom', 'Canteen', 'Playground', 'Washrooms', 'Library', 'Staircase', 'School gate', 'School bus', 'Online'];
// The school map. Order matters: the first zone whose words match wins.
const ZONES = [
  { id: 'gate', name: 'School gate', match: ['gate', 'entrance'] },
  { id: 'stairs', name: 'Staircase', match: ['staircase', 'stairs'] },
  { id: 'labs', name: 'Labs', match: ['lab'] },
  { id: 'library', name: 'Library', match: ['library'] },
  { id: 'classrooms', name: 'Classrooms', match: ['classroom', 'class 10', 'class 11', 'class 12'] },
  { id: 'corridor', name: 'Corridors', match: ['corridor'] },
  { id: 'canteen', name: 'Canteen', match: ['canteen'] },
  { id: 'washrooms', name: 'Washrooms', match: ['washroom', 'toilet', 'bathroom'] },
  { id: 'playground', name: 'Playground', match: ['playground', 'ground'] },
  { id: 'online', name: 'Online', match: ['online'] },
  { id: 'bus', name: 'School bus', match: ['bus'] },
];
const zoneName = (id) => ZONES.find((z) => z.id === id)?.name || 'Other';

// ---------- watched zones ----------
function zoneCount(zone, days, now = Date.now()) {
  return store.cases.filter((c) => zoneOf(c) === zone && now - new Date(c.createdAt) < days * 864e5).length;
}
function watchStatus(w) {
  const count = zoneCount(w.zone, w.days);
  return { ...w, name: zoneName(w.zone), count, rising: count >= w.threshold, byName: store.staffById(w.by)?.name || '' };
}
// After every new report: if its zone is watched and has reached the
// threshold, alert counsellors (at most once a day per zone).
function checkWatch(c) {
  const w = store.watch.find((x) => x.zone === zoneOf(c));
  if (!w) return;
  const s = watchStatus(w);
  if (!s.rising) return;
  if (w.lastAlertAt && Date.now() - new Date(w.lastAlertAt) < 864e5) return;
  w.lastAlertAt = new Date().toISOString();
  store.log({ staff: 'SafeVoice', role: 'system', action: 'zone.alert', target: '', detail: `${s.name}: ${s.count} reports in ${w.days} days` });
  broadcast('zone-alert', { zone: w.zone, name: s.name, count: s.count, days: w.days });
}
const zoneOf = (c) => {
  const s = `${c.triage.place} ${c.location}`.toLowerCase();
  return (ZONES.find((z) => z.match.some((m) => s.includes(m))) || { id: 'other' }).id;
};

// ---------- auth (staff only; students never log in) ----------
const sessions = new Sessions();
function currentStaff(req, url) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : url.searchParams.get('token');
  const s = sessions.get(token);
  const staff = s && store.staffById(s.staffId);
  return staff && staff.active !== false ? staff : null;
}

// ---------- live updates (SSE) ----------
const streams = new Set(); // { res, cases: may this viewer see case contents }
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const counts = event === 'case' ? 'event: stats\ndata: {}\n\n' : msg;
  for (const s of streams) s.res.write(s.cases ? msg : counts);
}

// ---------- helpers ----------
function loadEnvFile(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* optional */ }
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 32_000) { reject(new Error('too large')); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Error('bad json')); }
    });
  });
}

const clean = (s, max = 4000) => String(s ?? '').replace(/\u0000/g, '').trim().slice(0, max);
const effectiveUrgency = (c) => c.urgencyOverride ?? c.triage.urgency;

function pastSamePlace(place, now = Date.now()) {
  const p = place.toLowerCase();
  return store.cases.filter((c) => c.triage.place.toLowerCase() === p && now - new Date(c.createdAt) < 21 * 864e5).length;
}

// What a counsellor sees. There is nothing identifying to hide: we never collect it.
const counsellorView = (c) => ({ ...c, urgency: effectiveUrgency(c), zone: zoneOf(c), sla: slaOf(c) });

// Response target: hours to the first counsellor reply, by urgency.
function slaOf(c) {
  const hours = store.settings.sla[effectiveUrgency(c)] ?? 48;
  const due = new Date(c.createdAt).getTime() + hours * 36e5;
  const answered = c.firstResponseAt ? new Date(c.firstResponseAt).getTime() : null;
  return { hours, dueAt: new Date(due).toISOString(), met: answered ? answered <= due : null, breached: answered ? answered > due : Date.now() > due };
}

// What a student sees with their code: their own words and replies, no internal
// triage, notes or workflow. Internal states collapse to received / replied / closed.
const studentView = (c) => ({
  code: c.code,
  status: c.status === 'resolved' ? 'resolved' : c.messages.some((m) => m.from === 'counsellor') ? 'replied' : 'new',
  feedback: c.feedback?.safer || null,
  createdAt: c.createdAt,
  location: c.location,
  time: c.time,
  messages: c.messages.map(({ from, text, at }) => ({ from, text, at })),
});

// Phones can't reach a laptop through its VPN or virtual adapters (e.g. Proton VPN's "ProTUN").
const VIRTUAL_ADAPTER = /vpn|tun|tap|wireguard|tailscale|zerotier|vethernet|virtualbox|vmware|docker|wsl/i;

function lanUrls() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254')) continue;
      // Windows Mobile Hotspot always hosts on 192.168.137.1: list it first when it's up.
      const rank = a.address.startsWith('192.168.137.') ? 0 : VIRTUAL_ADAPTER.test(name) ? 2 : 1;
      out.push({ url: `http://${a.address}:${PORT}`, rank });
    }
  }
  return out.sort((a, b) => a.rank - b.rank).map((u) => u.url);
}

// Wi-Fi details written by network/hotspot.ps1. Re-read on each request so a
// hotspot started after the server shows up without a restart.
function networkInfo() {
  const env = {};
  try {
    for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*(HOTSPOT_SSID|HOTSPOT_PASSWORD|HOTSPOT_BAND)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no hotspot configured */ }
  const urls = lanUrls();
  const hotspot = urls.some((u) => u.includes('192.168.137.'));
  // .env keeps the last hotspot's details after it's switched off; don't send phones to a network that isn't there.
  return {
    ssid: hotspot ? env.HOTSPOT_SSID || '' : '',
    password: hotspot ? env.HOTSPOT_PASSWORD || '' : '',
    band: hotspot ? env.HOTSPOT_BAND || '' : '',
    hotspot,
    studentUrl: `${urls[0] || `http://localhost:${PORT}`}/`,
    urls,
  };
}

// ---------- presence: how many student phones have the app open ----------
// Counted from open connections only; nothing about the phone is recorded.
const phones = new Set();
const presence = () => broadcast('presence', { phones: phones.size });

const HELPLINES = [
  { name: 'Tele-MANAS', number: '14416', note: 'Free mental health support, 24×7' },
  { name: 'Childline', number: '1098', note: 'Free helpline for children, 24×7' },
  { name: 'Emergency', number: '112', note: 'If you are in immediate danger' },
];

// ---------- API ----------
const STATUSES = { new: 'New', open: 'In progress', waiting: 'Waiting on student', resolved: 'Resolved' };
const ESCALATE_TO = ['Principal', 'Parents / guardians', 'Class teacher', 'Childline 1098', 'Police 112', 'Medical / nurse'];

const needs = (res, staff, perm) => {
  if (can(staff, perm)) return false;
  send(res, 403, { error: 'Your role does not allow this.' });
  return true;
};

function audit(staff, action, target = '', detail = '') {
  store.log({ staff: staff ? staff.name : 'SafeVoice', role: staff?.role || 'system', action, target, detail: String(detail).slice(0, 200) });
}

function caseEvent(c, staff, type, detail = '') {
  const at = new Date().toISOString();
  c.events.push({ at, by: staff.name, type, detail });
  c.updatedAt = at;
  audit(staff, `case.${type}`, c.code, detail);
}

const publicNotices = () => store.notices
  .slice()
  .sort((a, b) => (b.pinned - a.pinned) || b.at.localeCompare(a.at))
  .map(({ id, title, body, at, pinned }) => ({ id, title, body, at, pinned }));

async function api(req, res, url) {
  const p = url.pathname;
  const m = req.method;

  if (p === '/api/info' && m === 'GET') {
    return send(res, 200, {
      ai: (await aiAvailable()) || 'rules',
      schoolName: store.settings.schoolName,
      lanUrls: lanUrls(),
      network: networkInfo(),
      locations: LOCATIONS,
      times: TIMES,
      helplines: HELPLINES,
      notices: publicNotices(),
      retentionDays: store.settings.retentionDays,
    });
  }

  // Student phones keep this open: it tells the phone it is connected and lets
  // the dashboard show how many phones are online.
  if (p === '/api/presence' && m === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('retry: 3000\nevent: hello\ndata: {}\n\n');
    phones.add(res);
    presence();
    const ping = setInterval(() => res.write('event: ping\ndata: {}\n\n'), 15_000);
    req.on('close', () => { clearInterval(ping); phones.delete(res); presence(); });
    return;
  }

  // Student: submit a report. Nothing about the sender is recorded.
  if (p === '/api/reports' && m === 'POST') {
    const b = await readBody(req);
    const text = clean(b.text);
    if (text.length < 3) return send(res, 400, { error: 'Please tell us a little about what happened.' });
    const location = LOCATIONS.includes(b.location) ? b.location : '';
    const time = TIMES.includes(b.time) ? b.time : '';
    const lang = b.lang === 'ta' ? 'ta' : 'en';
    const helpNow = Boolean(b.helpNow);
    const about = ['me', 'friend', 'saw'].includes(b.about) ? b.about : '';
    const place = ruleTriage(text, { location }).place;
    const t = await triage(text, { location, time, helpNow, lang, pastSamePlace: pastSamePlace(place) });
    const now = new Date().toISOString();
    const { reply, floor, ...tri } = t;
    const c = store.add({
      id: crypto.randomUUID(),
      code: store.newCode(),
      createdAt: now,
      updatedAt: now,
      text,
      about,
      location,
      time,
      helpNow,
      lang,
      triage: tri,
      status: 'new',
      events: [{ at: now, by: 'SafeVoice', type: 'created', detail: `${tri.source === 'rules' ? 'Rule engine' : 'AI'} triage: urgency ${tri.urgency}/5` }],
      messages: [{ from: 'safevoice', text: reply, at: now }],
    });
    const urgent = effectiveUrgency(c) >= 5 || helpNow;
    broadcast('case', { type: 'new', urgent: effectiveUrgency(c) >= 5, case: counsellorView(c) });
    checkWatch(c);
    return send(res, 201, { code: c.code, reply, urgent, helplines: urgent ? HELPLINES : [] });
  }

  // Student: check a case with the private code.
  let mm = p.match(/^\/api\/case\/([A-Za-z0-9-]+)$/);
  if (mm && m === 'GET') {
    const c = store.byCode(mm[1]);
    if (!c) return send(res, 404, { error: 'No case found with that code. Check it and try again.' });
    return send(res, 200, studentView(c));
  }

  // Student: follow-up message on their own case.
  mm = p.match(/^\/api\/case\/([A-Za-z0-9-]+)\/message$/);
  if (mm && m === 'POST') {
    const c = store.byCode(mm[1]);
    if (!c) return send(res, 404, { error: 'No case found with that code.' });
    const text = clean((await readBody(req)).text);
    if (!text) return send(res, 400, { error: 'Message is empty.' });
    const now = new Date().toISOString();
    c.messages.push({ from: 'student', text, at: now });
    c.updatedAt = now;
    if (c.status === 'resolved' || c.status === 'waiting') c.status = 'open';
    c.unread = true;
    c.events.push({ at: now, by: 'Student', type: 'student-message' });
    // Re-check follow-ups for hard-risk signals.
    const r = ruleTriage(text, { location: c.location });
    let urgent = false;
    if (r.floor >= 5 && c.triage.urgency < 5) {
      c.triage = { ...c.triage, urgency: 5, level: 'Urgent', category: r.category, flags: [...new Set([...r.flags, ...c.triage.flags])].slice(0, 5) };
      delete c.urgencyOverride;
      urgent = true;
      c.events.push({ at: now, by: 'SafeVoice', type: 'escalated', detail: 'Follow-up raised urgency to 5/5' });
    }
    store.save();
    broadcast('case', { type: 'message', urgent, case: counsellorView(c) });
    return send(res, 200, { ...studentView(c), helplines: urgent ? HELPLINES : [] });
  }

  // Student: "Do you feel safer now?" on a closed case. Closes the loop.
  mm = p.match(/^\/api\/case\/([A-Za-z0-9-]+)\/feedback$/);
  if (mm && m === 'POST') {
    const c = store.byCode(mm[1]);
    if (!c) return send(res, 404, { error: 'No case found with that code.' });
    const safer = (await readBody(req)).safer;
    if (!['yes', 'somewhat', 'no'].includes(safer)) return send(res, 400, { error: 'Pick an answer.' });
    const now = new Date().toISOString();
    c.feedback = { safer, at: now };
    c.events.push({ at: now, by: 'Student', type: 'feedback', detail: safer === 'yes' ? 'Feels safer' : safer === 'somewhat' ? 'Feels a bit safer' : 'Does not feel safer' });
    // Not feeling safer reopens the case so it can't quietly stay closed.
    if (safer === 'no' && c.status === 'resolved') { c.status = 'open'; c.unread = true; }
    c.updatedAt = now;
    store.save();
    broadcast('case', { type: safer === 'no' ? 'message' : 'update', case: counsellorView(c) });
    return send(res, 200, studentView(c));
  }

  if (p === '/api/login' && m === 'POST') {
    if (sessions.locked()) return send(res, 429, { error: 'Too many wrong PINs. Wait a minute and try again.' });
    const b = await readBody(req);
    // Pick a name and enter a PIN; a PIN alone also works (quick demo login).
    const pool = store.staff.filter((s) => s.active !== false && (!b.staffId || s.id === b.staffId));
    const staff = pool.find((s) => verifyPin(b.pin, s.pinHash));
    if (!staff) {
      sessions.fail();
      audit(null, 'login.failed', '', b.staffId ? store.staffById(b.staffId)?.name || '' : '');
      return send(res, 401, { error: 'Incorrect PIN' });
    }
    sessions.ok();
    const token = sessions.create(staff.id);
    staff.lastLoginAt = new Date().toISOString();
    audit(staff, 'login');
    return send(res, 200, { token, staff: { ...publicStaff(staff), can: ROLES[staff.role].can } });
  }

  if (p === '/api/staff/directory' && m === 'GET') {
    // Login screen: names only, so people can pick themselves.
    return send(res, 200, { schoolName: store.settings.schoolName, staff: store.staff.filter((s) => s.active !== false).map((s) => ({ ...publicStaff(s), roleLabel: ROLES[s.role].label })) });
  }

  // ----- staff only below -----
  const me = currentStaff(req, url);
  if (!me) return send(res, 401, { error: 'Staff login required' });

  if (p === '/api/me' && m === 'GET') return send(res, 200, { ...publicStaff(me), can: ROLES[me.role].can, roleLabel: ROLES[me.role].label, peerTeamName: store.settings.peerTeamName });
  if (p === '/api/logout' && m === 'POST') {
    const h = req.headers.authorization || '';
    sessions.drop(h.slice(7));
    audit(me, 'logout');
    return send(res, 200, { ok: true });
  }

  if (p === '/api/stream' && m === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(`event: hello\ndata: {}\n\nevent: presence\ndata: ${JSON.stringify({ phones: phones.size })}\n\n`);
    // Insights-only staff get counts, never case contents.
    const s = { res, cases: can(me, 'cases') };
    streams.add(s);
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => { clearInterval(ping); streams.delete(s); });
    return;
  }

  if (p === '/api/staff' && m === 'GET') {
    return send(res, 200, { staff: store.staff.map((s) => ({ ...publicStaff(s), roleLabel: ROLES[s.role].label, lastLoginAt: can(me, 'team') ? s.lastLoginAt || null : undefined, open: store.cases.filter((c) => c.assignee === s.id && c.status !== 'resolved').length })), roles: Object.fromEntries(Object.entries(ROLES).map(([k, v]) => [k, v.label])) });
  }
  if (p === '/api/staff' && m === 'POST') {
    if (needs(res, me, 'team')) return;
    const b = await readBody(req);
    const name = clean(b.name, 60);
    const pin = String(b.pin || '');
    if (!name || !ROLES[b.role] || !/^\d{4,8}$/.test(pin)) return send(res, 400, { error: 'Give a name, a role and a 4–8 digit PIN.' });
    const s = { id: `st-${crypto.randomUUID().slice(0, 8)}`, name, role: b.role, title: clean(b.title, 60), active: true, pinHash: hashPin(pin), createdAt: new Date().toISOString() };
    store.staff.push(s);
    store.save();
    audit(me, 'team.add', '', `${name} (${ROLES[b.role].label})`);
    return send(res, 201, publicStaff(s));
  }
  mm = p.match(/^\/api\/staff\/([a-z0-9-]+)$/);
  if (mm && m === 'POST') {
    if (needs(res, me, 'team')) return;
    const s = store.staffById(mm[1]);
    if (!s) return send(res, 404, { error: 'Not found' });
    const b = await readBody(req);
    const admins = store.staff.filter((x) => x.role === 'admin' && x.active !== false);
    const removingLastAdmin = s.role === 'admin' && admins.length === 1 && ((b.role && b.role !== 'admin') || b.active === false);
    if (removingLastAdmin) return send(res, 400, { error: 'Keep at least one active administrator.' });
    const changes = [];
    if (b.role && ROLES[b.role] && b.role !== s.role) { s.role = b.role; changes.push(`role → ${ROLES[b.role].label}`); }
    if (typeof b.active === 'boolean' && b.active !== (s.active !== false)) { s.active = b.active; changes.push(b.active ? 'reactivated' : 'deactivated'); if (!b.active) sessions.dropStaff(s.id); }
    if (b.pin) {
      if (!/^\d{4,8}$/.test(String(b.pin))) return send(res, 400, { error: 'PIN must be 4–8 digits.' });
      s.pinHash = hashPin(b.pin);
      changes.push('PIN reset');
    }
    if (b.title !== undefined) s.title = clean(b.title, 60);
    store.save();
    audit(me, 'team.update', '', `${s.name}: ${changes.join(', ') || 'details'}`);
    return send(res, 200, publicStaff(s));
  }

  if (p === '/api/cases' && m === 'GET') {
    if (needs(res, me, 'cases')) return;
    return send(res, 200, { cases: store.cases.map(counsellorView) });
  }

  if (p === '/api/export/cases.csv' && m === 'GET') {
    if (needs(res, me, 'cases')) return;
    audit(me, 'export.csv', '', `${store.cases.length} cases`);
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="safevoice-cases-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' });
    return res.end(casesCsv(store.cases.map(counsellorView), store));
  }

  mm = p.match(/^\/api\/cases\/([a-f0-9-]+)(?:\/(reply|status|urgency|suggest|read|assign|note|tags|escalate))?$/);
  if (mm) {
    if (needs(res, me, 'cases')) return;
    const c = store.byId(mm[1]);
    if (!c) return send(res, 404, { error: 'Case not found' });
    const action = mm[2];
    const now = new Date().toISOString();
    if (!action && m === 'GET') {
      // Opening a case is recorded: who read which report, and when.
      audit(me, 'case.view', c.code);
      return send(res, 200, counsellorView(c));
    }
    if (action === 'reply' && m === 'POST') {
      const text = clean((await readBody(req)).text);
      if (!text) return send(res, 400, { error: 'Reply is empty' });
      c.messages.push({ from: 'counsellor', text, at: now, by: me.id });
      c.firstResponseAt ??= now;
      if (c.status !== 'resolved') c.status = 'waiting';
      c.unread = false;
      if (!c.assignee) { c.assignee = me.id; caseEvent(c, me, 'assigned', me.name); }
      caseEvent(c, me, 'reply');
    } else if (action === 'status' && m === 'POST') {
      const s = (await readBody(req)).status;
      if (!STATUSES[s]) return send(res, 400, { error: 'Bad status' });
      if (s === c.status) return send(res, 200, counsellorView(c));
      c.status = s;
      if (s === 'resolved') { c.resolvedAt = now; c.unread = false; } else delete c.resolvedAt;
      caseEvent(c, me, 'status', STATUSES[s]);
    } else if (action === 'urgency' && m === 'POST') {
      const u = Number((await readBody(req)).urgency);
      if (!(u >= 1 && u <= 5)) return send(res, 400, { error: 'Urgency must be 1-5' });
      const from = effectiveUrgency(c);
      c.urgencyOverride = u === c.triage.urgency ? undefined : u;
      caseEvent(c, me, 'urgency', `${from}/5 → ${u}/5`);
    } else if (action === 'assign' && m === 'POST') {
      const id = (await readBody(req)).staffId || null;
      const s = id && store.staffById(id);
      if (id && (!s || !CASE_ROLES.includes(s.role))) return send(res, 400, { error: 'That person cannot take cases.' });
      c.assignee = id;
      if (id && c.status === 'new') c.status = 'open';
      caseEvent(c, me, 'assigned', s ? s.name : 'Unassigned');
    } else if (action === 'note' && m === 'POST') {
      const text = clean((await readBody(req)).text, 2000);
      if (!text) return send(res, 400, { error: 'Note is empty' });
      c.notes.push({ by: me.id, at: now, text });
      caseEvent(c, me, 'note');
    } else if (action === 'tags' && m === 'POST') {
      const tags = (await readBody(req)).tags;
      c.tags = [...new Set((Array.isArray(tags) ? tags : []).map((t) => clean(t, 32)).filter(Boolean))].slice(0, 8);
      caseEvent(c, me, 'tags', c.tags.join(', ') || 'cleared');
    } else if (action === 'escalate' && m === 'POST') {
      const b = await readBody(req);
      if (!ESCALATE_TO.includes(b.to)) return send(res, 400, { error: 'Pick who to escalate to.' });
      c.escalations.push({ to: b.to, note: clean(b.note, 1000), at: now, by: me.id });
      if (c.status === 'new') c.status = 'open';
      caseEvent(c, me, 'escalated', b.to);
    } else if (action === 'read' && m === 'POST') {
      c.unread = false;
    } else if (action === 'suggest' && m === 'POST') {
      return send(res, 200, await suggestReply(c));
    } else {
      return send(res, 405, { error: 'Method not allowed' });
    }
    c.updatedAt = now;
    store.save();
    broadcast('case', { type: 'update', case: counsellorView(c) });
    return send(res, 200, counsellorView(c));
  }

  // ----- peer support team -----
  // Counsellors (and admins) run the team; peer supporters see only their own tasks.
  const runsTeam = can(me, 'cases');
  const taskView = (t) => ({ ...t, assignees: t.assignees.map((id) => ({ id, name: store.staffById(id)?.name || 'Former member' })), updates: t.updates.map((u) => ({ ...u, name: store.staffById(u.by)?.name || 'Former member' })), createdByName: store.staffById(t.createdBy)?.name || '' });
  if (p === '/api/tasks' && m === 'GET') {
    if (!runsTeam && !can(me, 'peer')) return send(res, 403, { error: 'Your role does not allow this.' });
    const tasks = store.tasks.filter((t) => runsTeam || t.assignees.includes(me.id)).sort((a, b) => (a.status === 'done') - (b.status === 'done') || b.createdAt.localeCompare(a.createdAt));
    const team = store.staff.filter((s) => s.role === 'peer' && s.active !== false).map((s) => ({ ...publicStaff(s), open: store.tasks.filter((t) => t.status !== 'done' && t.assignees.includes(s.id)).length }));
    return send(res, 200, { teamName: store.settings.peerTeamName, tasks: tasks.map(taskView), team: runsTeam ? team : undefined, times: TIMES });
  }
  if (p === '/api/tasks' && m === 'POST') {
    if (needs(res, me, 'cases')) return;
    const b = await readBody(req);
    const title = clean(b.title, 100);
    const peers = (Array.isArray(b.assignees) ? b.assignees : []).filter((id) => store.staffById(id)?.role === 'peer');
    if (!title || !peers.length) return send(res, 400, { error: 'Give the task a title and pick at least one peer supporter.' });
    const t = { id: crypto.randomUUID(), title, place: clean(b.place, 60), time: TIMES.includes(b.time) ? b.time : '', details: clean(b.details, 1000), assignees: peers, status: 'open', createdBy: me.id, createdAt: new Date().toISOString(), dueAt: b.dueAt ? new Date(b.dueAt).toISOString() : null, updates: [] };
    store.tasks.push(t);
    store.save();
    audit(me, 'task.create', '', `${title} → ${peers.map((id) => store.staffById(id).name).join(', ')}`);
    broadcast('tasks', {});
    return send(res, 201, taskView(t));
  }
  mm = p.match(/^\/api\/tasks\/([a-f0-9-]+)\/(update|delete)$/);
  if (mm && m === 'POST') {
    const t = store.tasks.find((x) => x.id === mm[1]);
    if (!t) return send(res, 404, { error: 'Task not found' });
    if (mm[2] === 'delete') {
      if (needs(res, me, 'cases')) return;
      store.tasks.splice(store.tasks.indexOf(t), 1);
      audit(me, 'task.remove', '', t.title);
    } else {
      if (!runsTeam && !t.assignees.includes(me.id)) return send(res, 403, { error: 'This task is not yours.' });
      const b = await readBody(req);
      const text = clean(b.text, 1000);
      if (text) t.updates.push({ by: me.id, at: new Date().toISOString(), text });
      if (b.status === 'done' || b.status === 'open') t.status = b.status;
      if (!text && !b.status) return send(res, 400, { error: 'Write an update.' });
      audit(me, 'task.update', '', `${t.title}${b.status ? ` · ${b.status === 'done' ? 'marked done' : 'reopened'}` : ''}`);
    }
    store.save();
    broadcast('tasks', {});
    return send(res, 200, { ok: true });
  }
  // A student told a peer supporter something. It goes straight to the
  // counsellor as a new case; the peer cannot open it afterwards.
  if (p === '/api/peer/concern' && m === 'POST') {
    if (needs(res, me, 'peer')) return;
    const b = await readBody(req);
    const text = clean(b.text);
    if (text.length < 3) return send(res, 400, { error: 'Write what you heard or saw.' });
    const location = LOCATIONS.includes(b.location) ? b.location : '';
    const time = TIMES.includes(b.time) ? b.time : '';
    const place = ruleTriage(text, { location }).place;
    const t = await triage(text, { location, time, helpNow: Boolean(b.urgent), lang: 'en', pastSamePlace: pastSamePlace(place) });
    const now = new Date().toISOString();
    const { reply, floor, ...tri } = t;
    const c = store.add({
      id: crypto.randomUUID(), code: store.newCode(), createdAt: now, updatedAt: now, text, about: 'peer', location, time,
      helpNow: Boolean(b.urgent), lang: 'en', triage: tri, status: 'new', viaPeer: me.id,
      events: [{ at: now, by: me.name, type: 'created', detail: `Passed on by ${store.settings.peerTeamName.toLowerCase()} · urgency ${tri.urgency}/5` }],
      messages: [{ from: 'safevoice', text: reply, at: now }],
    });
    audit(me, 'peer.concern', c.code);
    broadcast('case', { type: 'new', urgent: effectiveUrgency(c) >= 5, case: counsellorView(c) });
    checkWatch(c);
    return send(res, 201, { ok: true, urgent: effectiveUrgency(c) >= 5 || Boolean(b.urgent), helplines: HELPLINES });
  }

  if (p === '/api/analytics' && m === 'GET') {
    if (needs(res, me, 'analytics')) return;
    const days = Math.min(365, Math.max(7, Number(url.searchParams.get('days')) || 30));
    return send(res, 200, analytics(store, { days, effectiveUrgency, staffName: (id) => store.staffById(id)?.name }));
  }

  if (p === '/api/report/printed' && m === 'POST') {
    if (needs(res, me, 'analytics')) return;
    const days = Number((await readBody(req)).days) || 30;
    audit(me, 'export.report', '', `Safety report, last ${days} days`);
    return send(res, 200, { ok: true });
  }

  if (p === '/api/hotspots' && m === 'GET') {
    if (needs(res, me, 'analytics')) return;
    const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 21));
    const since = Date.now() - days * 864e5;
    const recent = store.cases.filter((c) => new Date(c.createdAt) >= since);
    const zones = Object.fromEntries(ZONES.map((z) => [z.id, { name: z.name, count: 0, weight: 0 }]));
    const byTime = Object.fromEntries(TIMES.map((t) => [t, 0]));
    const byCategory = {};
    const groups = new Map();
    for (const c of recent) {
      const z = zones[zoneOf(c)];
      if (z) { z.count++; z.weight += effectiveUrgency(c); }
      if (c.time in byTime) byTime[c.time]++;
      byCategory[c.triage.category] = (byCategory[c.triage.category] || 0) + 1;
      const key = `${c.triage.place}|${c.time || 'Any time'}`;
      groups.set(key, (groups.get(key) || 0) + 1);
    }
    const patterns = [...groups.entries()]
      .filter(([, n]) => n >= 3)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => { const [place, time] = k.split('|'); return { place, time, count: n }; });
    return send(res, 200, { days, total: recent.length, zones, byTime, byCategory, patterns, watch: store.watch.map(watchStatus) });
  }

  // Zone tracker: one place on the map, over time. Counts and outcomes for
  // everyone with insights; the list of cases only for counsellors.
  mm = p.match(/^\/api\/zones\/([a-z]+)(?:\/(watch|unwatch))?$/);
  if (mm && ZONES.some((z) => z.id === mm[1])) {
    const zone = mm[1];
    const z = ZONES.find((x) => x.id === zone);
    if (mm[2]) {
      if (needs(res, me, 'cases')) return;
      const i = store.watch.findIndex((w) => w.zone === zone);
      if (mm[2] === 'unwatch') {
        if (i >= 0) store.watch.splice(i, 1);
        audit(me, 'zone.unwatch', '', z.name);
      } else {
        const b = await readBody(req);
        const w = { zone, threshold: Math.min(50, Math.max(1, Number(b.threshold) || 2)), days: Math.min(60, Math.max(1, Number(b.days) || 7)), by: me.id, at: new Date().toISOString(), note: clean(b.note, 120) };
        if (i >= 0) store.watch[i] = w; else store.watch.push(w);
        audit(me, 'zone.watch', '', `${z.name}: alert at ${w.threshold} reports in ${w.days} days`);
      }
      store.save();
      broadcast('watch', {});
      return send(res, 200, { ok: true });
    }
    if (m !== 'GET' || needs(res, me, 'analytics')) return m !== 'GET' ? send(res, 405, { error: 'Method not allowed' }) : undefined;
    const days = Math.min(365, Math.max(7, Number(url.searchParams.get('days')) || 90));
    const now = Date.now();
    const t = (iso) => new Date(iso).getTime();
    const all = store.cases.filter((c) => zoneOf(c) === zone);
    const inRange = all.filter((c) => now - t(c.createdAt) < days * 864e5);
    const prev = all.filter((c) => now - t(c.createdAt) >= days * 864e5 && now - t(c.createdAt) < 2 * days * 864e5);
    // Weekly buckets up to 3 months, monthly (30-day) buckets beyond.
    const step = days <= 90 ? 7 : 30;
    const series = [];
    for (let end = now; end > now - days * 864e5; end -= step * 864e5) {
      const start = end - step * 864e5;
      const b = inRange.filter((c) => t(c.createdAt) >= start && t(c.createdAt) < end);
      series.unshift({ start: new Date(start).toISOString(), total: b.length, high: b.filter((c) => effectiveUrgency(c) >= 4).length });
    }
    const count = (list, key) => list.reduce((acc, c) => { const k = key(c); if (k) acc[k] = (acc[k] || 0) + 1; return acc; }, {});
    const words = z.match.concat(z.name.toLowerCase());
    const about = (txt) => words.some((w) => String(txt).toLowerCase().includes(w));
    // What the school did here, and whether reports fell afterwards.
    const actions = [
      ...store.notices.filter((n) => about(`${n.title} ${n.body}`)).map((n) => ({ kind: 'We did', title: n.title, detail: n.body, at: n.at, by: n.by })),
      ...store.tasks.filter((k) => about(`${k.place} ${k.title}`)).map((k) => ({ kind: `${store.settings.peerTeamName} task`, title: k.title, detail: k.status === 'done' ? 'Done' : 'In progress', at: k.createdAt, by: store.staffById(k.createdBy)?.name || '' })),
      ...all.flatMap((c) => c.escalations.map((e) => ({ kind: 'Escalated', title: `To ${e.to}`, detail: e.note, at: e.at, by: store.staffById(e.by)?.name || '' }))),
    ].sort((a, b) => b.at.localeCompare(a.at));
    let impact = null;
    const first = actions.length ? actions.reduce((a, b) => (a.at < b.at ? a : b)) : null;
    if (first) {
      const ft = t(first.at);
      const win = 21 * 864e5;
      const span = Math.min(win, now - ft);
      if (span >= 3 * 864e5) {
        const before = all.filter((c) => t(c.createdAt) >= ft - span && t(c.createdAt) < ft).length;
        const after = all.filter((c) => t(c.createdAt) >= ft).length;
        impact = { since: first.at, title: first.title, days: Math.round(span / 864e5), before, after };
      }
    }
    const watch = store.watch.find((w) => w.zone === zone);
    return send(res, 200, {
      zone, name: z.name, days,
      total: inRange.length, prev: prev.length,
      avgUrgency: inRange.length ? Math.round((inRange.reduce((a, c) => a + effectiveUrgency(c), 0) / inRange.length) * 10) / 10 : null,
      open: all.filter((c) => c.status !== 'resolved').length,
      series, step,
      byTime: count(inRange, (c) => c.time || 'Not given'),
      byCategory: count(inRange, (c) => c.triage.category),
      places: count(inRange, (c) => (c.triage.place !== 'Unspecified' ? c.triage.place : c.location)),
      actions: actions.slice(0, 8), impact,
      watch: watch ? watchStatus(watch) : null,
      cases: can(me, 'cases') ? inRange.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8).map((c) => ({ id: c.id, code: c.code, category: c.triage.category, urgency: effectiveUrgency(c), status: c.status, createdAt: c.createdAt })) : undefined,
    });
  }

  if (p === '/api/audit' && m === 'GET') {
    if (needs(res, me, 'audit')) return;
    const q = String(url.searchParams.get('q') || '').toLowerCase();
    const rows = store.audit.filter((a) => !q || `${a.staff} ${a.action} ${a.target} ${a.detail}`.toLowerCase().includes(q));
    return send(res, 200, { total: rows.length, entries: rows.slice(-300).reverse() });
  }

  if (p === '/api/notices' && m === 'GET') return send(res, 200, { notices: store.notices.slice().sort((a, b) => b.at.localeCompare(a.at)) });
  if (p === '/api/notices' && m === 'POST') {
    if (needs(res, me, 'notices')) return;
    const b = await readBody(req);
    const title = clean(b.title, 80);
    const body = clean(b.body, 600);
    if (!title) return send(res, 400, { error: 'Give the notice a title.' });
    const n = { id: crypto.randomUUID(), title, body, at: new Date().toISOString(), by: me.name, pinned: Boolean(b.pinned) };
    store.notices.push(n);
    store.save();
    audit(me, 'notice.publish', '', title);
    broadcast('notices', {});
    return send(res, 201, n);
  }
  mm = p.match(/^\/api\/notices\/([a-f0-9-]+)\/delete$/);
  if (mm && m === 'POST') {
    if (needs(res, me, 'notices')) return;
    const i = store.notices.findIndex((n) => n.id === mm[1]);
    if (i < 0) return send(res, 404, { error: 'Not found' });
    const [n] = store.notices.splice(i, 1);
    store.save();
    audit(me, 'notice.remove', '', n.title);
    broadcast('notices', {});
    return send(res, 200, { ok: true });
  }

  if (p === '/api/settings' && m === 'GET') {
    return send(res, 200, { ...store.settings, ai: (await aiAvailable()) || 'rules', aiLabel: await aiLabel(), lanUrls: lanUrls(), network: networkInfo(), phones: phones.size, total: store.cases.length });
  }
  if (p === '/api/settings' && m === 'POST') {
    if (needs(res, me, 'settings')) return;
    const b = await readBody(req);
    const changes = [];
    if (b.retentionDays) { store.settings.retentionDays = Math.min(3650, Math.max(7, Number(b.retentionDays) || 90)); changes.push(`retention ${store.settings.retentionDays} days`); }
    if (b.schoolName) { store.settings.schoolName = clean(b.schoolName, 80); changes.push(`school name "${store.settings.schoolName}"`); }
    if (b.peerTeamName) { store.settings.peerTeamName = clean(b.peerTeamName, 40); changes.push(`team name "${store.settings.peerTeamName}"`); }
    if (b.sla && typeof b.sla === 'object') {
      for (const k of ['1', '2', '3', '4', '5']) {
        const h = Number(b.sla[k]);
        if (h > 0 && h <= 720) store.settings.sla[k] = h;
      }
      changes.push('response targets');
    }
    store.save();
    store.purgeExpired();
    audit(me, 'settings.update', '', changes.join(', '));
    broadcast('reload', {});
    return send(res, 200, store.settings);
  }

  if (p === '/api/demo/reset' && m === 'POST') {
    if (needs(res, me, 'settings')) return;
    seedDemo();
    audit(me, 'demo.reset');
    broadcast('reload', {});
    return send(res, 200, { ok: true, total: store.cases.length });
  }
  if (p === '/api/demo/clear' && m === 'POST') {
    if (needs(res, me, 'settings')) return;
    store.replaceAll([]);
    audit(me, 'data.delete-all');
    broadcast('reload', {});
    return send(res, 200, { ok: true, total: 0 });
  }

  return send(res, 404, { error: 'Not found' });
}

// ---------- static ----------
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.apk': 'application/vnd.android.package-archive',
};
const PAGES = { '/': 'student.html', '/counsellor': 'counsellor.html', '/demo': 'demo.html', '/pitch': 'pitch.html', '/join': 'join.html' };

function serveStatic(req, res, url) {
  const rel = PAGES[url.pathname.replace(/\/$/, '') || '/'] || decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const type = TYPES[path.extname(file)] || 'application/octet-stream';
    const range = req.headers.range;
    if (range && type === 'video/mp4') {
      const [s, e] = range.replace('bytes=', '').split('-');
      const start = Number(s);
      const end = e ? Number(e) : st.size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  // Note: deliberately no request logging. We never record who sent what.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return serveStatic(req, res, url);
  } catch (err) {
    console.error('[error]', err.message);
    if (!res.headersSent) send(res, 400, { error: 'Something went wrong. Please try again.' });
  }
});

setInterval(() => {
  const n = store.purgeExpired();
  if (n) broadcast('reload', {});
}, 36e5).unref();

process.on('SIGINT', () => { store.flush(); process.exit(0); });

server.listen(PORT, HOST, async () => {
  const ai = (await aiLabel()) || 'built-in rule engine (set GEMINI_API_KEY or ANTHROPIC_API_KEY to use AI)';
  const lan = lanUrls();
  console.log(`
  SafeVoice is running.

    Student app       http://localhost:${PORT}/
    Staff dashboard   http://localhost:${PORT}/counsellor   (demo PINs: lead counsellor 2468 · counsellor 1357 · principal 9090)
    Presenter demo    http://localhost:${PORT}/demo
${lan.map((u) => `    ${u.includes('192.168.137.') ? 'SafeVoice Wi-Fi ' : 'On your network  '}  ${u}/`).join('\n')}
    Connect poster    http://localhost:${PORT}/join

    AI triage: ${ai}
    Cases loaded: ${store.cases.length}   Retention: ${store.settings.retentionDays} days
  `);
});
