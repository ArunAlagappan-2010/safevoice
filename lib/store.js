// Tiny JSON-file store. No database to install; survives restarts.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DEFAULT_SETTINGS = {
  schoolName: 'Demo School',
  retentionDays: 90,
};

export class Store {
  constructor(file) {
    this.file = file;
    this.data = { cases: [], settings: { ...DEFAULT_SETTINGS } };
    this.saveTimer = null;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      this.data.cases = raw.cases || [];
      this.data.settings = { ...DEFAULT_SETTINGS, ...(raw.settings || {}) };
    } catch {
      /* first run */
    }
  }

  get cases() { return this.data.cases; }
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

  add(c) {
    this.data.cases.push(c);
    this.save();
    return c;
  }

  replaceAll(cases) {
    this.data.cases = cases;
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
