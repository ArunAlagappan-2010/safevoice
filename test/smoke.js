// End-to-end smoke test: boots the server on a spare port with a throwaway
// data file and walks the student -> counsellor -> student loop.
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { ruleTriage } from '../lib/triage.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}`;
const data = path.join(os.tmpdir(), `safevoice-test-${process.pid}.json`);

// --- rule engine ---
const r1 = ruleTriage("Some students keep mocking me near the Class 9 corridor at lunch. I'm scared to go there anymore.", { location: 'Corridor', pastSamePlace: 6 });
assert.equal(r1.urgency, 4);
assert.equal(r1.place, 'Class 9 corridor');
assert.deepEqual(r1.flags, ['Repeated harassment', 'Fear expressed', 'Same place as past reports']);
assert.equal(ruleTriage('I want to kill myself').urgency, 5);
assert.equal(ruleTriage('he said he will bring a knife').urgency, 5);
assert.equal(ruleTriage('தினமும் என் சாதியைப் பற்றி கேலி செய்கிறார்கள். பயமாக இருக்கிறது.').category, 'Identity-based bullying');
assert.equal(ruleTriage('they tease me sometimes').urgency, 1);
assert.equal(ruleTriage('Some seniors keep pushing my friend near the canteen.').category, 'Physical bullying');
console.log('ok  rule triage');

// --- HTTP flow ---
const env = { ...process.env, PORT: String(PORT), SAFEVOICE_DATA: data, ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '' };
const srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((res, rej) => {
  srv.stdout.on('data', (d) => d.toString().includes('SafeVoice is running') && res());
  srv.on('exit', (c) => rej(new Error(`server exited ${c}`)));
});

const j = async (p, body, token) => {
  const r = await fetch(BASE + p, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json() };
};

try {
  for (const p of ['/', '/counsellor', '/demo', '/pitch', '/join', '/student.js', '/counsellor.js', '/vendor/qrcode.js',
    '/qr.js', '/manifest.webmanifest', '/sw.js', '/icons/icon-192.png', '/fonts/inter-latin-400-normal.woff2']) {
    assert.equal((await fetch(BASE + p)).status, 200, p);
  }
  const apk = await fetch(BASE + '/download/SafeVoice.apk');
  if (apk.status === 200) assert.equal(apk.headers.get('content-type'), 'application/vnd.android.package-archive');
  console.log('ok  pages served', apk.status === 200 ? '+ Android app' : '(no APK built yet)');

  assert.equal((await j('/api/cases')).status, 401);
  assert.equal((await j('/api/login', { pin: '0000' })).status, 401);
  const { token } = (await j('/api/login', { pin: '2468' })).body;
  assert.ok(token);
  const seeded = (await j('/api/cases', null, token)).body.cases;
  assert.ok(seeded.length >= 15, 'seed data loaded');
  console.log('ok  counsellor auth + seed');

  const rep = await j('/api/reports', { text: 'A senior said he will bring a knife and hurt me after school', about: 'me', location: 'Playground', time: 'After school' });
  assert.equal(rep.status, 201);
  assert.match(rep.body.code, /^SV-[A-Z2-9]{4}-[A-Z2-9]{3}$/);
  assert.equal(rep.body.urgent, true);
  assert.equal(rep.body.helplines.length, 3);
  console.log('ok  urgent report -> helplines', rep.body.code);

  const cases = (await j('/api/cases', null, token)).body.cases;
  const c = cases.find((x) => x.code === rep.body.code);
  assert.equal(c.urgency, 5);
  assert.equal(c.about, 'me');
  assert.equal(JSON.stringify(c).includes('127.0.0.1'), false, 'no IP stored');

  const sug = await j(`/api/cases/${c.id}/suggest`, {}, token);
  assert.ok(sug.body.text.length > 20);
  await j(`/api/cases/${c.id}/reply`, { text: 'We hear you. Please come to the counsellor room today.' }, token);
  const view = (await j(`/api/case/${rep.body.code.toLowerCase()}`)).body;
  assert.equal(view.status, 'replied');
  assert.equal(view.messages.at(-1).from, 'counsellor');
  assert.equal(view.triage, undefined, 'student never sees internal triage');
  console.log('ok  counsellor reply visible with case code');

  const follow = await j(`/api/case/${rep.body.code}/message`, { text: 'thank you, I will come' });
  assert.equal(follow.status, 200);
  const hot = (await j('/api/hotspots?days=21', null, token)).body;
  assert.equal(hot.patterns[0].place, 'Class 9 corridor');
  assert.equal(hot.patterns[0].time, 'Lunch');
  assert.equal(hot.patterns[0].count, 7);
  console.log('ok  hotspots: Class 9 corridor · Lunch ·', hot.patterns[0].count, 'reports');

  // A phone with the app open counts as connected; closing it drops the count.
  const ctrl = new AbortController();
  const live = await fetch(BASE + '/api/presence', { signal: ctrl.signal });
  assert.equal(live.status, 200);
  await new Promise((r) => setTimeout(r, 200));
  const s1 = (await j('/api/settings', null, token)).body;
  assert.equal(s1.phones, 1);
  assert.ok(s1.network.studentUrl.startsWith('http://'));
  ctrl.abort();
  await new Promise((r) => setTimeout(r, 300));
  assert.equal((await j('/api/settings', null, token)).body.phones, 0);
  console.log('ok  phone presence count + network info');

  // Roles: the principal sees trends but never a report.
  const principal = (await j('/api/login', { pin: '9090' })).body;
  assert.equal(principal.staff.role, 'viewer');
  assert.equal((await j('/api/cases', null, principal.token)).status, 403);
  const ana = (await j('/api/analytics?days=30', null, principal.token)).body;
  assert.ok(ana.kpis.reports > 0 && ana.weeks.length === 8);
  assert.equal(JSON.stringify(ana).includes(rep.body.code), false, 'no case codes in insights');
  console.log('ok  roles: principal sees insights, not reports');

  // Case workflow: assign, note, escalate, resolve, then the student says if they feel safer.
  const staff = (await j('/api/staff', null, token)).body.staff;
  const arjun = staff.find((s) => s.name === 'Mr. Arjun Das');
  await j(`/api/cases/${c.id}/assign`, { staffId: arjun.id }, token);
  await j(`/api/cases/${c.id}/note`, { text: 'Spoke to the class teacher.' }, token);
  await j(`/api/cases/${c.id}/escalate`, { to: 'Principal', note: 'Weapon threat' }, token);
  const done = (await j(`/api/cases/${c.id}/status`, { status: 'resolved' }, token)).body;
  assert.equal(done.assignee, arjun.id);
  assert.equal(done.escalations[0].to, 'Principal');
  assert.ok(done.sla.met !== null, 'first reply recorded against the target');
  const sv = (await j(`/api/case/${rep.body.code}`)).body;
  assert.equal(sv.status, 'resolved');
  assert.equal(sv.notes, undefined, 'students never see private notes');
  const fb = (await j(`/api/case/${rep.body.code}/feedback`, { safer: 'no' })).body;
  assert.equal(fb.status, 'replied', 'not feeling safer reopens the case');
  const audit = (await j('/api/audit', null, token)).body.entries.map((a) => a.action);
  for (const a of ['case.assigned', 'case.note', 'case.escalated', 'case.status', 'login']) assert.ok(audit.includes(a), a);
  console.log('ok  workflow: assign, note, escalate, resolve, feedback, audit');

  // Peer support team: tasks and passing on concerns, never reading reports.
  const peer = (await j('/api/login', { pin: '1111' })).body;
  assert.equal(peer.staff.role, 'peer');
  assert.equal((await j('/api/cases', null, peer.token)).status, 403);
  const tasks = (await j('/api/tasks', null, peer.token)).body.tasks;
  assert.ok(tasks.length && tasks.every((t) => t.assignees.some((a) => a.id === peer.staff.id)), 'peer sees only own tasks');
  assert.equal((await j(`/api/tasks/${tasks[0].id}/update`, { text: 'All calm today.' }, peer.token)).status, 200);
  const passed = await j('/api/peer/concern', { text: 'A younger student said seniors take his money at the bus stop every day', location: 'School bus' }, peer.token);
  assert.equal(passed.status, 201);
  const fromPeer = (await j('/api/cases', null, token)).body.cases.find((x) => x.about === 'peer');
  assert.ok(fromPeer && fromPeer.viaPeer === peer.staff.id);
  const t2 = await j('/api/tasks', { title: 'Be at the bus stop after school', place: 'School bus', assignees: [peer.staff.id] }, token);
  assert.equal(t2.status, 201);
  assert.equal((await j('/api/tasks', { title: 'x', assignees: [peer.staff.id] }, peer.token)).status, 403, 'peers cannot create tasks');
  console.log('ok  peer support team: tasks, updates, pass-on concern');

  // Zone tracker and watched zones.
  const zone = (await j('/api/zones/corridor?days=365', null, token)).body;
  assert.equal(zone.name, 'Corridors');
  assert.ok(zone.total >= 7 && zone.series.length >= 12 && zone.step === 30, 'a year of history in monthly buckets');
  assert.ok(zone.actions.length >= 2, 'actions taken in the zone are listed');
  const zp = (await j('/api/zones/corridor?days=90', null, principal.token)).body;
  assert.equal(zp.cases, undefined, 'principal gets zone counts, not reports');
  assert.equal((await j('/api/zones/gate/watch', { threshold: 1, days: 7 }, principal.token)).status, 403);
  assert.equal((await j('/api/zones/gate/watch', { threshold: 1, days: 7 }, token)).status, 200);
  await j('/api/reports', { text: 'Seniors wait at the school gate and push us', location: 'School gate' });
  const hs = (await j('/api/hotspots?days=365', null, token)).body;
  assert.ok(hs.zones.gate.count >= 1 && hs.zones.stairs && hs.zones.labs, 'wider map zones');
  assert.equal(hs.watch.find((w) => w.zone === 'gate').rising, true);
  const alerts = (await j('/api/audit?q=zone', null, token)).body.entries.map((a) => a.action);
  assert.ok(alerts.includes('zone.alert'), 'watched zone raised an alert');
  console.log('ok  zone tracker, year range, watched-zone alert');

  const info = (await j('/api/info')).body;
  assert.ok(info.notices.length >= 1, '"you said, we did" updates reach students');

  assert.equal((await j('/api/case/SV-NOPE-000')).status, 404);
  assert.equal((await j('/api/reports', { text: '' })).status, 400);
  console.log('\nAll smoke tests passed.');
} finally {
  srv.kill();
  fs.rmSync(data, { force: true });
}
