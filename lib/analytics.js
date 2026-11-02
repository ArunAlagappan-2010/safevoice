// School-level insights: outcomes and trends, never individual students.
const D = 864e5;
const W = 7 * D;

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const pct = (n, d) => (d ? Math.round((n / d) * 100) : null);

export function analytics(store, { days, effectiveUrgency, staffName }) {
  const now = Date.now();
  const since = now - days * D;
  const prevSince = since - days * D;
  const t = (iso) => new Date(iso).getTime();
  const cases = store.cases;
  const inRange = cases.filter((c) => t(c.createdAt) >= since);
  const prevRange = cases.filter((c) => t(c.createdAt) >= prevSince && t(c.createdAt) < since);
  const open = cases.filter((c) => c.status !== 'resolved');
  const slaDue = (c) => t(c.createdAt) + (store.settings.sla[effectiveUrgency(c)] ?? 48) * 36e5;

  const responded = inRange.filter((c) => c.firstResponseAt);
  const responseMins = responded.map((c) => (t(c.firstResponseAt) - t(c.createdAt)) / 60e3);
  const slaMet = responded.filter((c) => t(c.firstResponseAt) <= slaDue(c)).length;
  const overdue = open.filter((c) => !c.firstResponseAt && now > slaDue(c));
  const resolved = cases.filter((c) => c.resolvedAt && t(c.resolvedAt) >= since);
  const resolveHours = resolved.map((c) => (t(c.resolvedAt) - t(c.createdAt)) / 36e5);
  const feedback = cases.filter((c) => c.feedback && t(c.feedback.at) >= since);
  const safer = feedback.filter((c) => c.feedback.safer !== 'no').length;

  // Weekly buckets for the trend chart (always the last 8 weeks).
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const end = now - i * W;
    const start = end - W;
    const wc = cases.filter((c) => t(c.createdAt) >= start && t(c.createdAt) < end);
    weeks.push({
      start: new Date(start).toISOString(),
      total: wc.length,
      high: wc.filter((c) => effectiveUrgency(c) >= 4).length,
      resolved: cases.filter((c) => c.resolvedAt && t(c.resolvedAt) >= start && t(c.resolvedAt) < end).length,
    });
  }

  const count = (list, key) => list.reduce((m, c) => { const k = key(c); if (k) m[k] = (m[k] || 0) + 1; return m; }, {});
  const workload = store.staff
    .filter((s) => (s.role === 'admin' || s.role === 'counsellor') && s.active !== false)
    .map((s) => ({
      id: s.id,
      name: s.name,
      open: open.filter((c) => c.assignee === s.id).length,
      resolved: resolved.filter((c) => c.assignee === s.id).length,
    }));
  workload.push({ id: null, name: 'Unassigned', open: open.filter((c) => !c.assignee).length, resolved: 0 });

  return {
    days,
    generatedAt: new Date(now).toISOString(),
    schoolName: store.settings.schoolName,
    kpis: {
      reports: inRange.length,
      reportsPrev: prevRange.length,
      open: open.length,
      urgentOpen: open.filter((c) => effectiveUrgency(c) >= 5).length,
      unassigned: open.filter((c) => !c.assignee).length,
      overdue: overdue.length,
      medianResponseMins: responseMins.length ? Math.round(median(responseMins)) : null,
      slaPct: pct(slaMet, responded.length),
      resolved: resolved.length,
      medianResolveHours: resolveHours.length ? Math.round(median(resolveHours)) : null,
      saferPct: pct(safer, feedback.length),
      feedbackCount: feedback.length,
      bystanderPrevPct: pct(prevRange.filter((c) => c.about === 'friend' || c.about === 'saw').length, prevRange.length),
      bystanderPct: pct(inRange.filter((c) => c.about === 'friend' || c.about === 'saw').length, inRange.length),
    },
    weeks,
    byCategory: count(inRange, (c) => c.triage.category),
    byStatus: count(cases, (c) => c.status),
    byUrgency: count(inRange, (c) => String(effectiveUrgency(c))),
    byPlace: count(inRange, (c) => (c.triage.place !== 'Unspecified' ? c.triage.place : c.location)),
    workload,
    actions: store.notices.slice().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5).map(({ title, body, at, by }) => ({ title, body, at, by })),
    escalations: cases.flatMap((c) => c.escalations.filter((e) => t(e.at) >= since).map((e) => ({ ...e, code: c.code, by: staffName(e.by) || e.by }))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10),
  };
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function casesCsv(cases, store) {
  const name = (id) => store.staffById(id)?.name || '';
  const head = ['Case code', 'Received', 'Status', 'Urgency', 'Category', 'Place', 'Location', 'Time of day', 'About', 'Language', 'Assigned to', 'First response', 'Response target met', 'Resolved', 'Student feels safer', 'Tags', 'Escalated to', 'Report'];
  const rows = cases
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((c) => [c.code, c.createdAt, c.status, c.urgency, c.triage.category, c.triage.place, c.location, c.time, c.about, c.lang, name(c.assignee), c.firstResponseAt || '', c.sla?.met == null ? '' : c.sla.met ? 'yes' : 'no', c.resolvedAt || '', c.feedback?.safer || '', c.tags.join('; '), c.escalations.map((e) => e.to).join('; '), c.text]);
  // BOM so Excel opens Tamil text correctly.
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}
