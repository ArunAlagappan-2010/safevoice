// Fictional demo data. Mirrors the pitch: a pattern building up in the
// Class 9 corridor at lunch, plus the four open cases shown in the video.
// Around it: a school team, eight weeks of history and the school's "you said, we did" updates.
import crypto from 'node:crypto';
import { ruleTriage, supportiveReply, templateCounsellorReply } from './triage.js';
import { hashPin } from './auth.js';

const M = 60e3;
const H = 36e5;
const D = 24 * H;

export const SEED_STAFF = [
  { id: 'st-priya', name: 'Ms. Priya Raman', role: 'admin', title: 'Lead counsellor', pin: '2468' },
  { id: 'st-arjun', name: 'Mr. Arjun Das', role: 'counsellor', title: 'School counsellor', pin: '1357' },
  { id: 'st-meena', name: 'Dr. Meena Iyer', role: 'viewer', title: 'Principal', pin: '9090' },
  { id: 'st-kavya', name: 'Kavya S.', role: 'peer', title: 'Class 11 · peer supporter', pin: '1111' },
  { id: 'st-rahul', name: 'Rahul M.', role: 'peer', title: 'Class 12 · peer supporter', pin: '2222' },
];

export function buildStaff() {
  return SEED_STAFF.map(({ pin, ...s }) => ({ ...s, active: true, pinHash: hashPin(pin), createdAt: new Date().toISOString() }));
}

// [ago(ms), code|null, location, time, text, status]
const SEED = [
  // Older history (outside the 3-week hotspot window) so trends have a baseline.
  [55 * D, null, 'Classroom', 'Morning', 'Someone keeps hiding my bag before the first period.', 'resolved'],
  [52 * D, null, 'Online', 'After school', 'A group chat was made to make fun of me.', 'resolved'],
  [48 * D, null, 'Canteen', 'Lunch', 'Older students take our table in the canteen and shout at us.', 'resolved'],
  [45 * D, null, 'School bus', 'After school', 'On the school bus a senior pushes me off the seat every day.', 'resolved'],
  [41 * D, null, 'Playground', 'Break', 'They won\'t let me play football and laugh at me.', 'resolved'],
  [38 * D, null, 'Washrooms', 'Break', 'Somebody wrote my name with rude words in the washroom.', 'resolved'],
  [34 * D, null, 'Online', 'After school', 'My photo was edited and shared on WhatsApp status.', 'resolved'],
  [31 * D, null, 'Classroom', 'Morning', 'A classmate calls me names because of my accent.', 'resolved'],
  [27 * D, null, 'Library', 'Lunch', 'I feel left out, nobody talks to me in the library group.', 'resolved'],
  [24 * D, null, 'Canteen', 'Break', 'Seniors ask me for money near the canteen.', 'resolved'],
  // The last three weeks: the pattern from the pitch.
  [20 * D, null, 'Corridor', 'Lunch', 'Two older boys block the corridor near Class 9 at lunch and make fun of how I talk.', 'resolved'],
  [18 * D, null, 'Canteen', 'Break', 'Someone keeps taking my snack in the canteen and laughs at me when I say something.', 'resolved'],
  [17 * D, null, 'Corridor', 'Lunch', 'In the Class 9 corridor at lunch a group shouts names at me when I walk past.', 'resolved'],
  [15 * D, null, 'Playground', 'Break', 'They pushed me during break on the playground and said it was a joke.', 'resolved'],
  [14 * D, null, 'Corridor', 'Lunch', 'People in the class 9 corridor mock my friend every lunch. She is scared but will not tell anyone.', 'resolved'],
  [12 * D, null, 'Online', 'After school', 'Somebody posted my photo on Instagram with rude comments.', 'resolved'],
  [11 * D, null, 'Washrooms', 'Morning', 'Seniors wait outside the washrooms in the morning and ask juniors for money.', 'resolved'],
  [9 * D, null, 'Corridor', 'Lunch', 'Near the Class 9 corridor at lunch I get insulted about my caste. It happens again and again.', 'resolved'],
  [8 * D, null, 'Canteen', 'Lunch', 'A group in the canteen at lunch laughs at me and calls me fat.', 'resolved'],
  [6 * D, null, 'Corridor', 'Lunch', 'Class 9 corridor during lunch is not safe. Boys shove the younger kids into the wall.', 'resolved'],
  [5 * D, null, 'Library', 'After school', 'Someone wrote mean things about me on a library desk.', 'resolved'],
  [4 * D, null, 'Classroom', 'Morning', 'A classmate keeps calling me stupid in the morning before the teacher comes.', 'waiting'],
  [3 * D, null, 'Corridor', 'Lunch', 'Again the class 9 corridor at lunch. They follow me and make noises. I feel afraid to go to the canteen now.', 'open'],
  [26 * H, 'SV-5Q1T-63H', 'Playground', 'Break', "Some boys tease me about my handwriting during break. It's not a big deal but it's annoying.", 'new'],
  [20 * H, 'SV-9D2F-07L', 'Online', 'After school', 'Someone made a meme about me and posted it in the class WhatsApp. People are calling me names.', 'new'],
  [5 * H, 'SV-3B8N-41X', 'Classroom', 'Morning', "The girls won't let me sit with them and tell everyone not to talk to me. It still happens every day.", 'new'],
  [40 * M, 'SV-7K4M-92Q', 'Corridor', 'Lunch', "Some students keep mocking me near the Class 9 corridor at lunch. I'm scared to go there anymore.", 'new'],
];

const FEEDBACK = ['yes', 'yes', 'somewhat', 'yes', 'no', 'yes', 'somewhat', 'yes'];
const ev = (at, by, type, detail = '') => ({ at: new Date(at).toISOString(), by, type, detail });

export function buildSeed(store, now = Date.now()) {
  const cases = [];
  SEED.forEach(([ago, code, location, time, text, status], i) => {
    const t0 = now - ago;
    const createdAt = new Date(t0).toISOString();
    const place = ruleTriage(text, { location }).place.toLowerCase();
    const pastSamePlace = cases.filter(
      (c) => c.triage.place.toLowerCase() === place && t0 - new Date(c.createdAt).getTime() < 21 * D,
    ).length;
    const triage = ruleTriage(text, { location, pastSamePlace });
    delete triage.floor;
    const owner = i % 3 === 1 ? 'st-arjun' : 'st-priya';
    const c = {
      id: crypto.randomUUID(),
      code: code || store.newCode(),
      createdAt,
      updatedAt: createdAt,
      text,
      about: i % 4 === 2 ? 'friend' : 'me',
      location,
      time,
      helpNow: false,
      lang: 'en',
      triage,
      status,
      demo: true,
      assignee: null,
      notes: [],
      tags: [],
      escalations: [],
      events: [ev(t0, 'SafeVoice', 'created', `AI triage: urgency ${triage.urgency}/5`)],
      messages: [{ from: 'safevoice', text: supportiveReply(triage.urgency), at: createdAt }],
    };
    if (/class 9 corridor/i.test(triage.place)) c.tags.push('Class 9 corridor');
    if (status !== 'new') {
      // Mostly within target response time; one older case missed it.
      const respond = i === 3 ? 30 * H : (1 + (i % 5)) * H * (triage.urgency >= 4 ? 0.5 : 2);
      const at = t0 + Math.min(respond, ago - 10 * M);
      c.assignee = owner;
      c.events.push(ev(t0 + 10 * M, staffName(owner), 'assigned', staffName(owner)));
      c.messages.push({ from: 'counsellor', text: templateCounsellorReply(c), at: new Date(at).toISOString(), by: owner });
      c.firstResponseAt = new Date(at).toISOString();
      c.events.push(ev(at, staffName(owner), 'reply'));
      c.updatedAt = c.firstResponseAt;
    }
    if (status === 'resolved') {
      const at = Math.min(t0 + 3 * D, now - 2 * H);
      c.resolvedAt = new Date(at).toISOString();
      c.events.push(ev(at, staffName(owner), 'status', 'Resolved'));
      c.updatedAt = c.resolvedAt;
      if (i % 3 !== 2) c.feedback = { safer: FEEDBACK[i % FEEDBACK.length], at: new Date(at + 6 * H).toISOString() };
    }
    if (status === 'open') {
      c.notes.push({ by: owner, at: new Date(t0 + 2 * H).toISOString(), text: 'Same place and time as the earlier corridor reports. Asked the Class 9 teacher to stand at the corridor during lunch this week.' });
      c.escalations.push({ to: 'Principal', note: 'Repeated pattern in Class 9 corridor at lunch. Requesting staff supervision rota.', at: new Date(t0 + 3 * H).toISOString(), by: owner });
      c.events.push(ev(t0 + 2 * H, staffName(owner), 'note'), ev(t0 + 3 * H, staffName(owner), 'escalated', 'Principal'));
      c.tags.push('Supervision requested');
    }
    cases.push(c);
  });
  // The headline urgent-ish case from the pitch is already being looked at.
  const headline = cases.find((c) => c.code === 'SV-7K4M-92Q');
  headline.assignee = 'st-priya';
  headline.events.push(ev(now - 30 * M, staffName('st-priya'), 'assigned', staffName('st-priya')));
  return cases;
}

function staffName(id) { return SEED_STAFF.find((s) => s.id === id)?.name || 'Staff'; }

// "You said, we did": what the school changed because of reports. Shown to
// students so they can see that speaking up leads to action.
export function buildNotices(now = Date.now()) {
  return [
    { id: crypto.randomUUID(), title: 'Class 9 corridor at lunch', body: 'Two teachers now stand in the Class 9 corridor every lunch break.', at: new Date(now - 2 * D).toISOString(), by: 'Ms. Priya Raman', pinned: true },
    { id: crypto.randomUUID(), title: 'Money being taken near the washrooms', body: 'A staff member now checks the washroom area every morning before first period.', at: new Date(now - 9 * D).toISOString(), by: 'Dr. Meena Iyer', pinned: false },
    { id: crypto.randomUUID(), title: 'Photos shared online without permission', body: 'Classes 8 and 9 had a session on how to report a post and get it taken down. Tell us here if it happens to you.', at: new Date(now - 11 * D).toISOString(), by: 'Mr. Arjun Das', pinned: false },
  ];
}

// Work the counsellor has given the peer support team. Tasks describe places
// and times, never a student or a report.
export function buildTasks(now = Date.now()) {
  const at = (ago) => new Date(now - ago).toISOString();
  return [
    {
      id: crypto.randomUUID(), title: 'Be around the Class 9 corridor at lunch', place: 'Class 9 corridor', time: 'Lunch',
      details: 'Walk through the corridor in pairs during lunch this week. Be friendly to younger students. If you see pushing or name-calling, find the duty teacher straight away. Do not step in yourselves.',
      assignees: ['st-kavya', 'st-rahul'], status: 'open', createdBy: 'st-priya', createdAt: at(2 * D), dueAt: at(-3 * D),
      updates: [
        { by: 'st-kavya', at: at(D + 20 * H), text: 'Monday: calm. A teacher was there too. Some Class 9 boys were crowding the stairs end.' },
        { by: 'st-rahul', at: at(4 * H), text: 'Tuesday: one group shouting at younger kids near the stairs. Told the duty teacher, who spoke to them.' },
      ],
    },
    {
      id: crypto.randomUUID(), title: 'Lunch buddies for new students in the canteen', place: 'Canteen', time: 'Lunch',
      details: 'Sit with new Class 6 students at lunch for their first two weeks so nobody eats alone.',
      assignees: ['st-kavya'], status: 'done', createdBy: 'st-arjun', createdAt: at(16 * D), dueAt: at(2 * D),
      updates: [{ by: 'st-kavya', at: at(3 * D), text: 'Done. Four of us took turns. Two students said they now have a group to sit with.' }],
    },
    {
      id: crypto.randomUUID(), title: 'Short online-safety talk for Class 8', place: 'Online', time: '',
      details: 'Ten minutes in each Class 8 section: how to report a post, why not to share photos of others, and that SafeVoice is anonymous.',
      assignees: ['st-rahul'], status: 'open', createdBy: 'st-arjun', createdAt: at(5 * D), dueAt: at(-6 * D), updates: [],
    },
  ];
}

// Zones the counsellor keeps an eye on: alert when reports there pick up again.
export function buildWatch(now = Date.now()) {
  return [
    { zone: 'corridor', threshold: 2, days: 7, by: 'st-priya', at: new Date(now - 10 * D).toISOString(), note: 'Class 9 corridor pattern' },
    { zone: 'washrooms', threshold: 2, days: 7, by: 'st-arjun', at: new Date(now - 9 * D).toISOString(), note: 'After the money-taking reports' },
  ];
}

export function buildAudit(cases, now = Date.now()) {
  const out = [];
  for (const c of cases) {
    for (const e of c.events) {
      if (e.by === 'SafeVoice') continue;
      out.push({ id: crypto.randomUUID(), at: e.at, staff: e.by, action: `case.${e.type}`, target: c.code, detail: e.detail });
    }
  }
  for (let d = 20; d >= 0; d -= 2) {
    out.push({ id: crypto.randomUUID(), at: new Date(now - d * D - 9 * H).toISOString(), staff: 'Ms. Priya Raman', action: 'login', target: '', detail: '' });
  }
  out.push({ id: crypto.randomUUID(), at: new Date(now - 7 * D).toISOString(), staff: 'Dr. Meena Iyer', action: 'export.report', target: '', detail: 'Monthly safety report' });
  return out.sort((a, b) => a.at.localeCompare(b.at));
}
