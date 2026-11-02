// Tiny JSON-file store. No database to install; survives restarts.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DEFAULT_SETTINGS = {
  schoolName: 'Demo School',
  retentionDays: 90,
  // Hours to first counsellor response, by urgency level.
  sla: { 5: 1, 4: 4, 3: 24, 2: 48, 1: 72 },
  // What the school calls its group of student helpers.
  peerTeamName: 'Peer support team',
};

const AUDIT_MAX = 5000;

export class Store {
  constructor(file) {
    this.file = file;
    this.data = { cases: [], staff: [], audit: [], notices: [], tasks: [], watch: [], settings: structuredClone(DEFAULT_SETTINGS) };
    this.saveTimer = null;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const k of ['cases', 'staff', 'audit', 'notices', 'tasks', 'watch']) this.data[k] = raw[k] || [];
      this.data.settings = { ...structuredClone(DEFAULT_SETTINGS), ...(raw.settings || {}) };
    } catch {
      /* first run */
    }
    for (const c of this.data.cases) migrate(c);
  }

  get cases() { return this.data.cases; }
  get staff() { return this.data.staff; }
  get audit() { return this.data.audit; }
  get notices() { return this.data.notices; }
  get tasks() { return this.data.tasks; }
  get watch() { return this.data.watch; }
  get settings() { return this.data.settings; }
  get isEmpty() { return this.data.cases.length === 0; }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 150);
  }

  flush() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  newCode() {
    // Unambiguous alphabet: no 0/O, 1/I.
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const pick = (n) => Array.from(crypto.randomBytes(n), (b) => A[b % A.length]).join('');
    let code;
    do code = `SV-${pick(4)}-${pick(3)}`;
    while (this.byCode(code));
    return code;
  }

  byCode(code) {
    const c = String(code || '').trim().toUpperCase().replace(/\s+/g, '');
    return this.data.cases.find((x) => x.code === c);
  }

  byId(id) { return this.data.cases.find((x) => x.id === id); }
  staffById(id) { return this.data.staff.find((x) => x.id === id); }

  add(c) {
    this.data.cases.push(migrate(c));
    this.save();
    return c;
  }

  replaceAll(cases) {
    this.data.cases = cases.map(migrate);
    this.save();
  }

  log(entry) {
    this.data.audit.push({ id: crypto.randomUUID(), at: new Date().toISOString(), ...entry });
    if (this.data.audit.length > AUDIT_MAX) this.data.audit.splice(0, this.data.audit.length - AUDIT_MAX);
    this.save();
  }

  // "Deleted on schedule" — reports are not kept forever.
  purgeExpired(now = Date.now()) {
    const cutoff = now - this.settings.retentionDays * 864e5;
    const before = this.data.cases.length;
    this.data.cases = this.data.cases.filter((c) => new Date(c.createdAt).getTime() >= cutoff);
    const removed = before - this.data.cases.length;
    if (removed) this.save();
    return removed;
  }
}

// Older data files used 'replied'; cases also gained workflow fields.
function migrate(c) {
  if (c.status === 'replied') c.status = 'waiting';
  c.assignee ??= null;
  c.notes ??= [];
  c.tags ??= [];
  c.events ??= [];
  c.escalations ??= [];
  if (!c.firstResponseAt) {
    const first = c.messages?.find((m) => m.from === 'counsellor');
    if (first) c.firstResponseAt = first.at;
  }
  return c;
}
