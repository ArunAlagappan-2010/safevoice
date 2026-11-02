// AI triage: Claude when ANTHROPIC_API_KEY is set, otherwise (or on any failure)
// a transparent rule engine. The rule engine also acts as a safety floor: the AI
// can raise urgency but never lower it below what the hard-risk rules detect.

const MODEL = process.env.SAFEVOICE_MODEL || 'claude-opus-5-5';

export const CATEGORIES = [
  'Safety concern',
  'Sexual harassment',
  'Physical bullying',
  'Verbal harassment',
  'Identity-based bullying',
  'Intimidation',
  'Exclusion from group',
  'Name-calling online',
  'Teasing',
  'Other concern',
];

export const TIMES = ['Morning', 'Break', 'Lunch', 'After school'];

const LEXICON = {
  selfHarm: ['kill myself', 'suicide', 'end my life', 'want to die', 'wanna die', 'hurt myself', 'cut myself',
    'no reason to live', 'better off dead', 'self harm', 'self-harm', 'not want to live', "don't want to live",
    'தற்கொலை', 'சாக வேண்டும்', 'சாகணும்', 'சாகப் போகிறேன்', 'உயிரை மாய்'],
  weapon: ['knife', 'gun', 'weapon', 'blade', 'kill you', 'kill me', 'going to kill', 'threatened to', 'threaten',
    'கத்தி', 'கொல்லுவேன்', 'கொன்றுவிடுவேன்'],
  physical: ['hit me', 'hits me', 'beat me', 'beats me', 'beaten', 'punch', 'kick', 'slap', 'push me', 'pushed me',
    'pushes me', 'pushing', 'hitting', 'beating', 'hit him', 'hit her', 'beat him', 'beat her', 'pushed him', 'pushed her', 'shove', 'hurt me', 'choke', 'attacked', 'trip me', 'tripped me', 'அடிக்கிறான்', 'அடித்தான்', 'அடிக்கிறார்கள்', 'அடித்தார்கள்', 'தள்ளி'],
  sexual: ['touch me', 'touched me', 'touches me', 'inappropriate', 'private parts', 'sexual', 'nude', 'naked',
    'photos of me', 'pictures of me', 'grope', 'molest', 'தவறாக தொட'],
  online: ['online', 'instagram', 'whatsapp', 'snapchat', 'group chat', 'facebook', 'posted', ' dm', 'comments',
    'youtube', 'reel', 'status', 'meme'],
  exclusion: ['ignore me', 'ignores me', 'left out', 'leave me out', 'exclude', 'no one talks', 'nobody talks',
    "won't let me sit", "won't let me play", 'not allowed to sit', 'alone at', 'isolat', 'ஒதுக்கி'],
  intimidation: ['follow me', 'follows me', 'followed me', 'money', 'extort', 'block the', 'blocks the', 'wait for me',
    'waits for me', 'waiting for me', 'stare at me', 'snatch', 'taking my', 'takes my', 'took my', 'பணம்'],
  verbal: ['mock', 'call me', 'calls me', 'called me', 'names', 'insult', 'laugh at', 'laughing at', 'abuse',
    'shout', 'yell', 'laughs at', 'laughed at', 'mean things', 'rude', 'make noises', 'fat', 'ugly', 'stupid', 'idiot', 'humiliat', 'கேலி', 'கிண்டல்', 'திட்டு'],
  teasing: ['tease', 'teasing', 'joke about', 'make fun', 'makes fun', 'made fun', 'prank'],
  identity: ['caste', 'religion', 'skin colour', 'skin color', 'dark skin', 'my accent', 'my language',
    'because i am muslim', 'because i am christian', 'because i am hindu', 'tribal', 'disability', 'ஜாதி', 'சாதி', 'மதம்'],
  fear: ['scared', 'afraid', 'fear', 'terrified', 'frightened', 'anxious', "don't want to come to school",
    'dont want to come to school', "can't sleep", 'crying', 'cry every', 'பயம்', 'பயமா'],
  repeated: ['keep', 'keeps', 'every day', 'everyday', 'always', 'again', 'daily', 'for weeks', 'for months',
    'still', 'every time', 'all the time', 'தினமும்', 'மீண்டும்', 'எப்போதும்'],
  adult: ['teacher', 'sir ', ' sir', 'madam', 'staff', 'driver', 'coach', 'warden', 'ஆசிரியர்'],
  group: ['they ', 'group', 'gang', 'seniors', 'boys', 'girls', 'everyone'],
};

const has = (t, list) => list.some((w) => t.includes(w));

export function extractPlace(text, location) {
  const t = ` ${text.toLowerCase()} `;
  const m = t.match(/\b(class|grade|std|standard)\s*-?\s*(\d{1,2})\s*([a-e]\b)?\s*(corridor|classroom|room|block|lab)?/);
  if (m) {
    const name = `Class ${m[2]}${m[3] ? m[3].toUpperCase() : ''}`;
    if (m[4]) return `${name} ${m[4]}`;
    if (/corridor/.test(t)) return `${name} corridor`;
    return `${name} classroom`;
  }
  const named = [
    ['canteen', 'Canteen'], ['cafeteria', 'Canteen'], ['library', 'Library'], ['school bus', 'School bus'],
    [' bus', 'School bus'], ['toilet', 'Washrooms'], ['washroom', 'Washrooms'], ['bathroom', 'Washrooms'],
    ['playground', 'Playground'], ['ground', 'Playground'], ['staircase', 'Staircase'], ['stairs', 'Staircase'],
    ['lab', 'Lab'], ['gate', 'School gate'],
  ];
  for (const [k, v] of named) if (t.includes(k)) return v;
  return location || 'Unspecified';
}

const LEVEL = (u) => (u >= 5 ? 'Urgent' : u === 4 ? 'High' : u === 3 ? 'Medium' : 'Low');

export function ruleTriage(text, ctx = {}) {
  const t = ` ${String(text).toLowerCase()} `;
  const flags = [];
  let category = 'Other concern';
  let urgency = 2;
  let floor = 1;

  if (has(t, LEXICON.teasing)) { category = 'Teasing'; urgency = 1; }
  if (has(t, LEXICON.online) || ctx.location === 'Online') { category = 'Name-calling online'; urgency = 2; }
  if (has(t, LEXICON.exclusion)) { category = 'Exclusion from group'; urgency = 2; }
  if (has(t, LEXICON.verbal)) { category = ctx.location === 'Online' || has(t, LEXICON.online) ? 'Name-calling online' : 'Verbal harassment'; urgency = 2; }
  if (has(t, LEXICON.intimidation)) { category = 'Intimidation'; urgency = 3; flags.push('Intimidation'); }
  if (has(t, LEXICON.identity)) { category = 'Identity-based bullying'; urgency = 3; flags.push('Identity-based targeting'); }
  if (has(t, LEXICON.physical)) { category = 'Physical bullying'; urgency = 4; floor = 4; flags.push('Physical harm'); }
  if (has(t, LEXICON.sexual)) { category = 'Sexual harassment'; urgency = 5; floor = 5; flags.push('Possible sexual misconduct'); }
  if (has(t, LEXICON.weapon)) { category = 'Safety concern'; urgency = 5; floor = 5; flags.push('Threat of violence'); }
  if (has(t, LEXICON.selfHarm)) { category = 'Safety concern'; urgency = 5; floor = 5; flags.push('Self-harm risk'); }

  if (has(t, LEXICON.repeated)) { urgency += 1; flags.push('Repeated harassment'); }
  if (has(t, LEXICON.fear)) { urgency += 1; flags.push('Fear expressed'); }
  if (has(t, LEXICON.adult)) { urgency += 1; flags.push('Adult involved'); }
  if (has(t, LEXICON.group) && urgency >= 2 && category !== 'Other concern') flags.push('Group involved');
  if (ctx.helpNow) { floor = Math.max(floor, 4); flags.push('Asked for help now'); }
  if ((ctx.pastSamePlace || 0) >= 2) { urgency += 1; flags.push('Same place as past reports'); }

  // Contextual bumps never make a case "urgent" on their own; only hard-risk rules do.
  urgency = Math.min(urgency, 4);
  urgency = Math.max(urgency, floor);

  const repeated = flags.includes('Repeated harassment');
  return {
    urgency,
    level: LEVEL(urgency),
    category,
    summary: `${category}${repeated ? ' · repeated' : ''}`,
    flags: [...new Set(flags)].slice(0, 5),
    place: extractPlace(String(text), ctx.location),
    floor,
    source: 'rules',
  };
}

const REPLIES = {
  en: {
    normal: "Thank you for telling us. What you're feeling is valid, and you did the right thing. A counsellor will respond within 24 hours. You are not alone.",
    urgent: 'Thank you for telling us. This matters, and a counsellor has been alerted right now. If you are in danger, call 112 or Childline 1098. You are not alone.',
  },
  ta: {
    normal: 'எங்களிடம் சொன்னதற்கு நன்றி. நீங்கள் உணர்வது சரியானதே, நீங்கள் சரியானதைச் செய்தீர்கள். ஒரு ஆலோசகர் 24 மணி நேரத்திற்குள் பதிலளிப்பார். நீங்கள் தனியாக இல்லை.',
    urgent: 'எங்களிடம் சொன்னதற்கு நன்றி. இது முக்கியமானது, ஒரு ஆலோசகருக்கு உடனே தெரிவிக்கப்பட்டுள்ளது. நீங்கள் ஆபத்தில் இருந்தால் 112 அல்லது சைல்ட்லைன் 1098 ஐ அழைக்கவும். நீங்கள் தனியாக இல்லை.',
  },
};

export function supportiveReply(urgency, lang = 'en') {
  const r = REPLIES[lang] || REPLIES.en;
  return urgency >= 5 ? r.urgent : r.normal;
}

export function templateCounsellorReply(c) {
  const where = c.triage?.place && c.triage.place !== 'Unspecified' ? `the ${c.triage.place}` : 'that area';
  const when = c.time ? ` at ${c.time.toLowerCase()}` : '';
  if (c.triage?.urgency >= 5) {
    return "Thank you for trusting us with this. You are not in trouble, and you did exactly the right thing. Please come to the counsellor's room today, or reply here and tell us a safe time to talk. If you feel unsafe right now, call 112 or Childline 1098.";
  }
  return `Thank you for telling us. You did the right thing. We are adding staff supervision in ${where}${when}. If you want to talk, reply here or visit the counsellor's room any time.`;
}

// ---------- Claude ----------

let clientPromise = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!clientPromise) {
    clientPromise = import('@anthropic-ai/sdk')
      .then((m) => new m.default({ timeout: 20_000, maxRetries: 1 }))
      .catch(() => null);
  }
  return clientPromise;
}

export async function aiAvailable() {
  return Boolean(await getClient());
}

const TRIAGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['urgency', 'category', 'flags', 'summary', 'place', 'supportive_reply'],
  properties: {
    urgency: { type: 'integer', description: '1 (minor) to 5 (immediate risk to safety)' },
    category: { type: 'string', enum: CATEGORIES },
    flags: { type: 'array', items: { type: 'string' }, description: '1-4 short risk signals, 2-4 words each' },
    summary: { type: 'string', description: 'Under 8 words, e.g. "Verbal harassment · repeated"' },
    place: { type: 'string', description: 'Most specific place mentioned, e.g. "Class 9 corridor"' },
    supportive_reply: { type: 'string', description: 'Warm 2-4 sentence reply to the student in their language' },
  },
};

const SYSTEM = `You are the triage assistant inside SafeVoice, an anonymous reporting tool for school students (India).
A student has written about bullying, harassment, conflict or distress. Your output is shown to a school counsellor, who makes every decision; you only prioritise.

Urgency scale:
5 = immediate risk: self-harm or suicidal thoughts, weapons, threats of serious violence, sexual abuse, an adult harming a child.
4 = serious and ongoing: physical bullying, repeated harassment with fear, identity-based (caste, religion, skin colour) targeting with fear.
3 = clear harm that needs follow-up this week.
2 = a one-off unkind incident.
1 = minor teasing or a general question.

Flags are short signals a counsellor can scan (e.g. "Repeated harassment", "Fear expressed", "Same place as past reports").
The supportive_reply goes straight to the student: validate their feelings, thank them, say a counsellor will respond within 24 hours (or has been alerted now, for urgency 5), and never promise outcomes, ask for their name, or blame them. For urgency 5 mention 112 and Childline 1098. Reply in the language the student wrote in (Tamil if they wrote Tamil).`;

async function claudeTriage(text, ctx) {
  const client = await getClient();
  if (!client) return null;
  const context = [
    `Location chosen: ${ctx.location || 'not given'}`,
    `Time of day: ${ctx.time || 'not given'}`,
    `Student pressed "I need help right now": ${ctx.helpNow ? 'yes' : 'no'}`,
    `Earlier reports from the same place in the last 3 weeks: ${ctx.pastSamePlace || 0}`,
  ].join('\n');
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 2000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: TRIAGE_SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: `${context}\n\n<student_report>\n${text}\n</student_report>` }],
  });
  if (response.stop_reason === 'refusal') return null;
  const block = response.content.find((b) => b.type === 'text');
  if (!block) return null;
  return JSON.parse(block.text);
}

export async function triage(text, ctx = {}) {
  const rules = ruleTriage(text, ctx);
  let ai = null;
  try {
    ai = await claudeTriage(text, ctx);
  } catch (err) {
    console.warn('[triage] Claude unavailable, using rule engine:', err?.message || err);
  }
  if (!ai) return { ...rules, reply: supportiveReply(rules.urgency, ctx.lang) };

  const urgency = Math.max(Math.min(5, Math.max(1, Math.round(ai.urgency))), rules.floor);
  const ruleOnlyFlags = rules.flags.filter((f) => ['Same place as past reports', 'Asked for help now', 'Self-harm risk', 'Threat of violence'].includes(f));
  return {
    urgency,
    level: LEVEL(urgency),
    category: urgency >= 5 && rules.floor >= 5 ? rules.category : ai.category,
    summary: ai.summary,
    flags: [...new Set([...ai.flags, ...ruleOnlyFlags])].slice(0, 5),
    place: ai.place || rules.place,
    source: 'claude',
    reply: ai.supportive_reply || supportiveReply(urgency, ctx.lang),
  };
}

export async function suggestReply(c) {
  const client = await getClient();
  if (client) {
    try {
      const thread = c.messages.map((m) => `${m.from}: ${m.text}`).join('\n');
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 1500,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        system: 'You draft replies for a school counsellor answering an anonymous student report in SafeVoice. Write 2-4 warm, plain sentences the counsellor can send as-is: thank the student, name one concrete action the school will take (e.g. supervision at the place and time), and invite them to reply or visit the counsellor\'s room. Never ask for their name. Output only the reply text, in the language the student used.',
        messages: [{
          role: 'user',
          content: `Category: ${c.triage.category}. Place: ${c.triage.place}. Time: ${c.time || 'unknown'}. Urgency ${c.triage.urgency}/5.\n<thread>\n${thread}\n</thread>`,
        }],
      });
      const block = response.stop_reason !== 'refusal' && response.content.find((b) => b.type === 'text');
      if (block?.text?.trim()) return { text: block.text.trim(), source: 'claude' };
    } catch (err) {
      console.warn('[suggest] Claude unavailable:', err?.message || err);
    }
  }
  return { text: templateCounsellorReply(c), source: 'template' };
}
