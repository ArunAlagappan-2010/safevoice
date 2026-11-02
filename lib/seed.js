// Fictional demo data. Mirrors the pitch: a pattern building up in the
// Class 9 corridor at lunch, plus the four open cases shown in the video.
import crypto from 'node:crypto';
import { ruleTriage, supportiveReply, templateCounsellorReply } from './triage.js';

const H = 36e5;
const D = 24 * H;

// [ago(ms), code|null, location, time, text, status]
const SEED = [
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
  [4 * D, null, 'Classroom', 'Morning', 'A classmate keeps calling me stupid in the morning before the teacher comes.', 'resolved'],
  [3 * D, null, 'Corridor', 'Lunch', 'Again the class 9 corridor at lunch. They follow me and make noises. I feel afraid to go to the canteen now.', 'resolved'],
  [26 * H, 'SV-5Q1T-63H', 'Playground', 'Break', "Some boys tease me about my handwriting during break. It's not a big deal but it's annoying.", 'new'],
  [20 * H, 'SV-9D2F-07L', 'Online', 'After school', 'Someone made a meme about me and posted it in the class WhatsApp. People are calling me names.', 'new'],
  [5 * H, 'SV-3B8N-41X', 'Classroom', 'Morning', "The girls won't let me sit with them and tell everyone not to talk to me. It still happens every day.", 'new'],
  [40 * 60e3, 'SV-7K4M-92Q', 'Corridor', 'Lunch', "Some students keep mocking me near the Class 9 corridor at lunch. I'm scared to go there anymore.", 'new'],
];

export function buildSeed(store, now = Date.now()) {
  const cases = [];
  for (const [ago, code, location, time, text, status] of SEED) {
    const createdAt = new Date(now - ago).toISOString();
    const place = ruleTriage(text, { location }).place.toLowerCase();
    const pastSamePlace = cases.filter(
      (c) => c.triage.place.toLowerCase() === place && now - ago - new Date(c.createdAt).getTime() < 21 * D,
    ).length;
    const triage = ruleTriage(text, { location, pastSamePlace });
    delete triage.floor;
    const c = {
      id: crypto.randomUUID(),
      code: code || store.newCode(),
      createdAt,
      updatedAt: createdAt,
      text,
      location,
      time,
      helpNow: false,
      lang: 'en',
      triage,
      status,
      demo: true,
      messages: [{ from: 'safevoice', text: supportiveReply(triage.urgency), at: createdAt }],
    };
    if (status === 'resolved') {
      const at = new Date(now - ago + 6 * H).toISOString();
      c.messages.push({ from: 'counsellor', text: templateCounsellorReply(c), at });
      c.updatedAt = at;
    }
    cases.push(c);
  }
  return cases;
}
