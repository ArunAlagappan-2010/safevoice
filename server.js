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
import { buildSeed } from './lib/seed.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.join(ROOT, '.env'));

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PIN = String(process.env.COUNSELLOR_PIN || '2468');
const PUBLIC = path.join(ROOT, 'public');
const store = new Store(process.env.SAFEVOICE_DATA || path.join(ROOT, 'data', 'db.json'));

if (store.isEmpty && process.env.SEED !== 'false') {
  store.replaceAll(buildSeed(store));
  store.flush();
}

const LOCATIONS = ['Corridor', 'Classroom', 'Canteen', 'Playground', 'Washrooms', 'Library', 'School bus', 'Online'];
const ZONES = [
  { id: 'library', name: 'Library', match: ['library'] },
  { id: 'classrooms', name: 'Classrooms', match: ['classroom', 'class 10', 'class 11', 'class 12', 'lab'] },
  { id: 'corridor', name: 'Corridors', match: ['corridor', 'staircase', 'stairs'] },
  { id: 'canteen', name: 'Canteen', match: ['canteen'] },
  { id: 'washrooms', name: 'Washrooms', match: ['washroom', 'toilet', 'bathroom'] },
  { id: 'playground', name: 'Playground', match: ['playground', 'ground'] },
  { id: 'online', name: 'Online', match: ['online'] },
  { id: 'bus', name: 'School bus', match: ['bus'] },
];
const zoneOf = (c) => {
  const s = `${c.triage.place} ${c.location}`.toLowerCase();
  return (ZONES.find((z) => z.match.some((m) => s.includes(m))) || { id: 'other' }).id;
};

// ---------- auth (counsellor only) ----------
const sessions = new Map(); // token -> expiry
const TOKEN_TTL = 12 * 36e5;
const authed = (req, url) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : url.searchParams.get('token');
  const exp = token && sessions.get(token);
  return Boolean(exp && exp > Date.now());
};

// ---------- live updates (SSE) ----------
const streams = new Set();
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of streams) res.write(msg);
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
const counsellorView = (c) => ({ ...c, urgency: effectiveUrgency(c), zone: zoneOf(c) });

// What a student sees with their code: their own words and replies, no internal triage.
const studentView = (c) => ({
  code: c.code,
  status: c.status,
  createdAt: c.createdAt,
  location: c.location,
  time: c.time,
  messages: c.messages,
});

function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254')) out.push(`http://${a.address}:${PORT}`);
    }
  }
  // Windows Mobile Hotspot always hosts on 192.168.137.1: list it first when it's up.
  return out.sort((a, b) => b.includes('192.168.137.') - a.includes('192.168.137.'));
}

// Wi-Fi details written by network/hotspot.ps1. Re-read on each request so a
// hotspot started after the server shows up without a restart.
function networkInfo() {
  const env = {};
  try {
    for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*(HOTSPOT_SSID|HOTSPOT_PASSWORD)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no hotspot configured */ }
  const urls = lanUrls();
  return {
    ssid: env.HOTSPOT_SSID || '',
    password: env.HOTSPOT_PASSWORD || '',
    hotspot: urls.some((u) => u.includes('192.168.137.')),
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
async function api(req, res, url) {
  const p = url.pathname;
  const m = req.method;

  if (p === '/api/info' && m === 'GET') {
    return send(res, 200, {
      ai: (await aiAvailable()) || 'rules',
      lanUrls: lanUrls(),
      network: networkInfo(),
      locations: LOCATIONS,
      times: TIMES,
      helplines: HELPLINES,
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
      messages: [{ from: 'safevoice', text: reply, at: now }],
    });
    const urgent = effectiveUrgency(c) >= 5 || helpNow;
    broadcast('case', { type: 'new', urgent: effectiveUrgency(c) >= 5, case: counsellorView(c) });
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
    if (c.status === 'resolved') c.status = 'new';
    c.unread = true;
    // Re-check follow-ups for hard-risk signals.
    const r = ruleTriage(text, { location: c.location });
    let urgent = false;
    if (r.floor >= 5 && c.triage.urgency < 5) {
      c.triage = { ...c.triage, urgency: 5, level: 'Urgent', category: r.category, flags: [...new Set([...r.flags, ...c.triage.flags])].slice(0, 5) };
      delete c.urgencyOverride;
      urgent = true;
    }
    store.save();
    broadcast('case', { type: 'message', urgent, case: counsellorView(c) });
    return send(res, 200, { ...studentView(c), helplines: urgent ? HELPLINES : [] });
  }

  if (p === '/api/login' && m === 'POST') {
    const b = await readBody(req);
    const ok = crypto.timingSafeEqual(
      crypto.createHash('sha256').update(String(b.pin ?? '')).digest(),
      crypto.createHash('sha256').update(PIN).digest(),
    );
    if (!ok) return send(res, 401, { error: 'Incorrect PIN' });
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, Date.now() + TOKEN_TTL);
    return send(res, 200, { token });
  }

  // ----- counsellor-only below -----
  if (!authed(req, url)) return send(res, 401, { error: 'Counsellor login required' });

  if (p === '/api/stream' && m === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(`event: hello\ndata: {}\n\nevent: presence\ndata: ${JSON.stringify({ phones: phones.size })}\n\n`);
    streams.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => { clearInterval(ping); streams.delete(res); });
    return;
  }

  if (p === '/api/cases' && m === 'GET') {
    return send(res, 200, { cases: store.cases.map(counsellorView) });
  }

  mm = p.match(/^\/api\/cases\/([a-f0-9-]+)(?:\/(reply|status|urgency|suggest|read))?$/);
  if (mm) {
    const c = store.byId(mm[1]);
    if (!c) return send(res, 404, { error: 'Case not found' });
    const action = mm[2];
    const now = new Date().toISOString();
    if (action === 'reply' && m === 'POST') {
      const text = clean((await readBody(req)).text);
      if (!text) return send(res, 400, { error: 'Reply is empty' });
      c.messages.push({ from: 'counsellor', text, at: now });
      c.status = 'replied';
      c.unread = false;
    } else if (action === 'status' && m === 'POST') {
      const s = (await readBody(req)).status;
      if (!['new', 'replied', 'resolved'].includes(s)) return send(res, 400, { error: 'Bad status' });
      c.status = s;
    } else if (action === 'urgency' && m === 'POST') {
      const u = Number((await readBody(req)).urgency);
      if (!(u >= 1 && u <= 5)) return send(res, 400, { error: 'Urgency must be 1-5' });
      c.urgencyOverride = u === c.triage.urgency ? undefined : u;
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

  if (p === '/api/hotspots' && m === 'GET') {
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
    return send(res, 200, { days, total: recent.length, zones, byTime, byCategory, patterns });
  }

  if (p === '/api/settings' && m === 'GET') {
    return send(res, 200, { ...store.settings, ai: (await aiAvailable()) || 'rules', lanUrls: lanUrls(), network: networkInfo(), phones: phones.size, total: store.cases.length });
  }
  if (p === '/api/settings' && m === 'POST') {
    const b = await readBody(req);
    if (b.retentionDays) store.settings.retentionDays = Math.min(3650, Math.max(7, Number(b.retentionDays) || 90));
    if (b.schoolName) store.settings.schoolName = clean(b.schoolName, 80);
    store.save();
    store.purgeExpired();
    broadcast('reload', {});
    return send(res, 200, store.settings);
  }

  if (p === '/api/demo/reset' && m === 'POST') {
    store.replaceAll(buildSeed(store));
    broadcast('reload', {});
    return send(res, 200, { ok: true, total: store.cases.length });
  }
  if (p === '/api/demo/clear' && m === 'POST') {
    store.replaceAll([]);
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
    Counsellor view   http://localhost:${PORT}/counsellor   (PIN: ${PIN === '2468' ? '2468' : 'set via COUNSELLOR_PIN'})
    Presenter demo    http://localhost:${PORT}/demo
${lan.map((u) => `    ${u.includes('192.168.137.') ? 'SafeVoice Wi-Fi ' : 'On your network  '}  ${u}/`).join('\n')}
    Connect poster    http://localhost:${PORT}/join

    AI triage: ${ai}
    Cases loaded: ${store.cases.length}   Retention: ${store.settings.retentionDays} days
  `);
});
