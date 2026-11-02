// Staff accounts: salted scrypt PIN hashes, role permissions, sessions in memory.
import crypto from 'node:crypto';

export const ROLES = {
  admin: { label: 'Administrator', can: ['cases', 'analytics', 'audit', 'team', 'settings', 'notices'] },
  counsellor: { label: 'Counsellor', can: ['cases', 'analytics', 'notices'] },
  // Principals and management see trends and outcomes, never what a student wrote.
  viewer: { label: 'Principal (insights only)', can: ['analytics'] },
  // Trained students who help the counsellor on the ground. They get tasks
  // and can pass on concerns, but can never open a report.
  peer: { label: 'Peer supporter (student)', can: ['peer'] },
};

// Roles that can be given cases to handle.
export const CASE_ROLES = ['admin', 'counsellor'];

export const can = (staff, perm) => Boolean(staff && ROLES[staff.role]?.can.includes(perm));

export function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(String(pin), salt, 32).toString('hex')}`;
}

export function verifyPin(pin, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const got = crypto.scryptSync(String(pin ?? ''), salt, 32);
  return crypto.timingSafeEqual(got, Buffer.from(hash, 'hex'));
}

export const publicStaff = (s) => ({ id: s.id, name: s.name, role: s.role, title: s.title || '', active: s.active !== false, initials: initials(s.name) });

export function initials(name) {
  return String(name).replace(/^(Dr|Mr|Ms|Mrs)\.?\s+/i, '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

// Sessions: token -> { staffId, exp }. Lost on restart, which just means logging in again.
export class Sessions {
  constructor(ttlMs = 12 * 36e5) { this.ttl = ttlMs; this.map = new Map(); this.fails = []; }
  create(staffId) {
    const token = crypto.randomBytes(24).toString('hex');
    this.map.set(token, { staffId, exp: Date.now() + this.ttl });
    return token;
  }
  get(token) {
    const s = token && this.map.get(token);
    if (!s || s.exp < Date.now()) return null;
    return s;
  }
  drop(token) { this.map.delete(token); }
  dropStaff(staffId) { for (const [k, v] of this.map) if (v.staffId === staffId) this.map.delete(k); }
  // Slow down PIN guessing: 5 wrong PINs in 5 minutes locks login for a minute.
  // Counted globally so no IP address ever needs to be kept.
  locked() {
    const now = Date.now();
    this.fails = this.fails.filter((t) => now - t < 5 * 60e3);
    return this.fails.length >= 5 && now - this.fails.at(-1) < 60e3;
  }
  fail() { this.fails.push(Date.now()); }
  ok() { this.fails = []; }
}
