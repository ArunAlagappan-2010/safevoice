(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const T = {
    en: {
      exit: 'Quick exit', eyebrow: 'Anonymous · Safe · Heard', h1a: 'Say what', h1b: 'happened.',
      lede: 'Tell us about bullying, harassment or anything that makes school feel unsafe. A counsellor reads every report and replies.',
      btnReport: 'Report something', btnCheck: 'Check your case', btnHelp: 'I need help right now',
      p1a: 'No name.', p1b: 'We never ask who you are.', p2a: 'No login.', p2b: 'Just a private case code.',
      p3a: 'Deleted on schedule.', p3b: 'Reports are not kept forever.',
      privacy: 'No name · No login · No IP logged', newReport: 'New report', anonymous: 'Anonymous',
      whatHappened: 'What happened?', placeholder: "Write it in your own words. You don't need to give any names.",
      speak: 'Speak', listening: 'Listening…', where: 'Where?', when: 'When?', helpNowToggle: 'I need help right now',
      submit: 'Submit anonymously', sending: 'Sending safely…', back: 'Back', sent: 'Report sent',
      yourCode: 'Your private case code', saveCode: 'Save this code. It is the only way to check replies.',
      supportive: 'SafeVoice · Supportive reply', getHelp: 'See helplines now', openCase: 'Open my case', done: 'Done',
      notAlone: 'You are not alone.', supportAvail: 'Support is available right now, any time of day.',
      talkCounsellor: 'Talk to a counsellor', checkTitle: 'Check your case', caseCode: 'Case code', viewReply: 'View reply',
      addMessage: 'Add something or reply…', sendMsg: 'Send', copied: 'Code copied', tapCopy: 'Tap to copy',
      you: 'You', counsellor: 'Counsellor reply', safevoice: 'SafeVoice',
      waiting: "A counsellor hasn't replied yet. Most replies come within 24 hours. Check back with your code.",
      st_new: 'Received', st_replied: 'Counsellor replied', st_resolved: 'Closed',
      errText: 'Please tell us a little about what happened.', errCode: 'Please enter your case code.',
      errNet: 'Could not reach SafeVoice. Check your connection and try again.',
      locs: { Corridor: 'Corridor', Classroom: 'Classroom', Canteen: 'Canteen', Playground: 'Playground', Washrooms: 'Washrooms', Library: 'Library', 'School bus': 'School bus', Online: 'Online' },
      times: { Morning: 'Morning', Break: 'Break', Lunch: 'Lunch', 'After school': 'After school' },
      hl: { 'Tele-MANAS': 'Free mental health support, 24×7', Childline: 'Free helpline for children, 24×7', Emergency: 'If you are in immediate danger' },
    },
    ta: {
      exit: 'வெளியேறு', eyebrow: 'அநாமதேயம் · பாதுகாப்பு · கேட்கப்படும்', h1a: 'என்ன நடந்தது', h1b: 'சொல்லுங்கள்.',
      lede: 'கேலி, துன்புறுத்தல் அல்லது பள்ளியில் பாதுகாப்பற்றதாக உணர வைக்கும் எதையும் எங்களிடம் சொல்லுங்கள். ஒவ்வொரு புகாரையும் ஒரு ஆலோசகர் படித்து பதிலளிப்பார்.',
      btnReport: 'புகார் செய்ய', btnCheck: 'உங்கள் புகாரைப் பார்க்க', btnHelp: 'எனக்கு இப்போதே உதவி தேவை',
      p1a: 'பெயர் இல்லை.', p1b: 'நீங்கள் யார் என்று நாங்கள் கேட்பதில்லை.', p2a: 'உள்நுழைவு இல்லை.', p2b: 'ஒரு ரகசிய குறியீடு மட்டும்.',
      p3a: 'தானாக நீக்கப்படும்.', p3b: 'புகார்கள் நிரந்தரமாக வைக்கப்படுவதில்லை.',
      privacy: 'பெயர் இல்லை · உள்நுழைவு இல்லை · IP பதிவு இல்லை', newReport: 'புதிய புகார்', anonymous: 'அநாமதேயம்',
      whatHappened: 'என்ன நடந்தது?', placeholder: 'உங்கள் வார்த்தைகளில் எழுதுங்கள். யாருடைய பெயரும் தேவையில்லை.',
      speak: 'பேசுங்கள்', listening: 'கேட்கிறது…', where: 'எங்கே?', when: 'எப்போது?', helpNowToggle: 'எனக்கு இப்போதே உதவி தேவை',
      submit: 'அநாமதேயமாக அனுப்பு', sending: 'பாதுகாப்பாக அனுப்புகிறது…', back: 'பின்செல்', sent: 'புகார் அனுப்பப்பட்டது',
      yourCode: 'உங்கள் ரகசிய குறியீடு', saveCode: 'இந்தக் குறியீட்டைச் சேமியுங்கள். பதில்களைப் பார்க்க இது மட்டுமே வழி.',
      supportive: 'SafeVoice · ஆதரவு பதில்', getHelp: 'உதவி எண்களைப் பார்', openCase: 'என் புகாரைத் திற', done: 'முடிந்தது',
      notAlone: 'நீங்கள் தனியாக இல்லை.', supportAvail: 'எந்த நேரத்திலும் உதவி கிடைக்கும்.',
      talkCounsellor: 'ஆலோசகரிடம் பேசுங்கள்', checkTitle: 'உங்கள் புகாரைப் பார்க்க', caseCode: 'குறியீடு', viewReply: 'பதிலைப் பார்',
      addMessage: 'மேலும் எழுதுங்கள் அல்லது பதிலளியுங்கள்…', sendMsg: 'அனுப்பு', copied: 'குறியீடு நகலெடுக்கப்பட்டது', tapCopy: 'நகலெடுக்கத் தட்டவும்',
      you: 'நீங்கள்', counsellor: 'ஆலோசகர் பதில்', safevoice: 'SafeVoice',
      waiting: 'ஆலோசகர் இன்னும் பதிலளிக்கவில்லை. பெரும்பாலும் 24 மணி நேரத்திற்குள் பதில் வரும். உங்கள் குறியீட்டுடன் மீண்டும் பாருங்கள்.',
      st_new: 'பெறப்பட்டது', st_replied: 'ஆலோசகர் பதிலளித்தார்', st_resolved: 'முடிக்கப்பட்டது',
      errText: 'என்ன நடந்தது என்று கொஞ்சம் சொல்லுங்கள்.', errCode: 'உங்கள் குறியீட்டை உள்ளிடவும்.',
      errNet: 'SafeVoice-ஐ அடைய முடியவில்லை. இணைப்பைச் சரிபார்த்து மீண்டும் முயலவும்.',
      locs: { Corridor: 'நடைபாதை', Classroom: 'வகுப்பறை', Canteen: 'உணவகம்', Playground: 'விளையாட்டு மைதானம்', Washrooms: 'கழிவறை', Library: 'நூலகம்', 'School bus': 'பள்ளிப் பேருந்து', Online: 'ஆன்லைன்' },
      times: { Morning: 'காலை', Break: 'இடைவேளை', Lunch: 'மதிய உணவு', 'After school': 'பள்ளி முடிந்ததும்' },
      hl: { 'Tele-MANAS': 'இலவச மனநல உதவி, 24×7', Childline: 'குழந்தைகளுக்கான இலவச உதவி எண், 24×7', Emergency: 'நீங்கள் உடனடி ஆபத்தில் இருந்தால்' },
    },
  };

  Object.assign(T.en, {
    online: 'Connected', offline: 'Offline',
    offlineBanner: "Not connected to SafeVoice. Join the school's SafeVoice Wi-Fi. You can still write a report: it will send by itself.",
    queuedTitle: 'Saved on this phone',
    queuedBody: "You're not connected to SafeVoice right now. Your report is safe here and will send by itself as soon as you're back on the school Wi-Fi. Keep this page open.",
    delivered: 'Your saved report was sent. Your private case code:', open: 'Open', dismiss: 'Hide',
    installTitle: 'Keep SafeVoice on your phone', installHow: 'Browser menu ⋮ → Add to Home screen',
    installHowIos: 'Share ⎋ → Add to Home Screen', installBtn: 'Install',
  });
  Object.assign(T.ta, {
    online: 'இணைந்துள்ளது', offline: 'இணைப்பு இல்லை',
    offlineBanner: 'SafeVoice உடன் இணைப்பு இல்லை. பள்ளியின் SafeVoice Wi-Fi-யுடன் இணையுங்கள். நீங்கள் புகாரை எழுதலாம், அது தானாக அனுப்பப்படும்.',
    queuedTitle: 'இந்தத் தொலைபேசியில் சேமிக்கப்பட்டது',
    queuedBody: 'இப்போது SafeVoice உடன் இணைப்பு இல்லை. உங்கள் புகார் இங்கே பாதுகாப்பாக உள்ளது. பள்ளி Wi-Fi-யுடன் மீண்டும் இணைந்ததும் தானாக அனுப்பப்படும். இந்தப் பக்கத்தைத் திறந்தே வைத்திருங்கள்.',
    delivered: 'சேமித்த உங்கள் புகார் அனுப்பப்பட்டது. உங்கள் ரகசிய குறியீடு:', open: 'திற', dismiss: 'மறை',
    installTitle: 'SafeVoice-ஐ உங்கள் தொலைபேசியில் வைத்திருங்கள்', installHow: 'உலாவி மெனு ⋮ → முகப்புத் திரையில் சேர்',
    installHowIos: 'பகிர் ⎋ → முகப்புத் திரையில் சேர்', installBtn: 'நிறுவு',
  });

  // Copy that tells students what happens to their words, that they are not in
  // trouble, and that they stay in control (trauma-informed: safety, trust, choice).
  Object.assign(T.en, {
    reassure: "You won't get in trouble for telling. Reporting for a friend is okay too.",
    howTitle: 'What happens next', how1: 'You write what happened. No name needed.',
    how2: 'Only the school counsellor reads it.',
    how3: 'You get a reply here with your private code, usually within one school day.',
    about: 'Who is this about?', optional: 'optional',
    aboutOpts: { me: 'Me', friend: 'A friend', saw: 'Something I saw' },
    noNames: 'No names needed. You can stop any time.', clear: 'Clear',
    helpNowHint: 'A counsellor is alerted straight away.',
    whoSees: 'Who can see this?',
    whoSeesBody: "Only your school counsellor. We don't store your name, phone number or IP address, and reports are deleted on a schedule.",
    thanks: 'Thank you for speaking up. That took courage.',
    breatheTitle: 'Take a slow breath with me', breatheStart: 'Start breathing', breatheStop: 'Stop',
    breatheIn: 'Breathe in…', breatheHold: 'Hold…', breatheOut: 'Breathe out…',
    apkLink: 'Or download the Android app',
  });
  Object.assign(T.ta, {
    reassure: 'சொன்னதற்காக நீங்கள் சிக்கலில் மாட்ட மாட்டீர்கள். நண்பருக்காகப் புகார் செய்வதும் சரியே.',
    howTitle: 'அடுத்து என்ன நடக்கும்', how1: 'என்ன நடந்தது என்று எழுதுங்கள். பெயர் தேவையில்லை.',
    how2: 'பள்ளி ஆலோசகர் மட்டுமே இதைப் படிப்பார்.',
    how3: 'உங்கள் ரகசிய குறியீட்டுடன் இங்கே பதில் கிடைக்கும், பெரும்பாலும் ஒரு பள்ளி நாளுக்குள்.',
    about: 'இது யாரைப் பற்றியது?', optional: 'விருப்பம்',
    aboutOpts: { me: 'நான்', friend: 'ஒரு நண்பர்', saw: 'நான் பார்த்தது' },
    noNames: 'பெயர்கள் தேவையில்லை. எப்போது வேண்டுமானாலும் நிறுத்தலாம்.', clear: 'அழி',
    helpNowHint: 'உடனே ஒரு ஆலோசகருக்குத் தெரிவிக்கப்படும்.',
    whoSees: 'இதை யார் பார்க்க முடியும்?',
    whoSeesBody: 'உங்கள் பள்ளி ஆலோசகர் மட்டுமே. உங்கள் பெயர், தொலைபேசி எண் அல்லது IP முகவரியை நாங்கள் சேமிப்பதில்லை. புகார்கள் குறிப்பிட்ட காலத்தில் நீக்கப்படும்.',
    thanks: 'பேசியதற்கு நன்றி. அதற்குத் துணிவு வேண்டும்.',
    breatheTitle: 'என்னுடன் மெதுவாக மூச்சு விடுங்கள்', breatheStart: 'மூச்சுப் பயிற்சி தொடங்கு', breatheStop: 'நிறுத்து',
    breatheIn: 'மூச்சை உள்ளிழுங்கள்…', breatheHold: 'நிறுத்துங்கள்…', breatheOut: 'மூச்சை வெளியே விடுங்கள்…',
    apkLink: 'அல்லது Android செயலியைப் பதிவிறக்குங்கள்',
  });

  // Inside the Android app (WebView) a native bridge is available.
  const nativeApp = window.SafeVoiceApp || null;

  const params = new URLSearchParams(location.search);
  if (params.has('embed')) document.body.classList.add('embed');

  let lang = 'en';
  try { lang = sessionStorage.getItem('sv-lang') || 'en'; } catch {}
  let info = {
    locations: ['Corridor', 'Classroom', 'Canteen', 'Playground', 'Washrooms', 'Library', 'School bus', 'Online'],
    times: ['Morning', 'Break', 'Lunch', 'After school'],
    helplines: [
      { name: 'Tele-MANAS', number: '14416' }, { name: 'Childline', number: '1098' }, { name: 'Emergency', number: '112' },
    ],
  };
  const state = { about: '', location: '', time: '', code: '', current: 'home' };
  const t = (k) => T[lang][k] ?? T.en[k] ?? k;

  // ---------- i18n ----------
  function applyLang() {
    document.documentElement.lang = lang;
    $$('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
    $$('[data-tp]').forEach((el) => { el.placeholder = t(el.dataset.tp); });
    $('#langBtn').textContent = lang === 'en' ? 'தமிழ்' : 'English';
    renderChips();
    renderHelplines();
    renderConn();
    renderDelivered();
    if (state.current === 'thread' && state.thread) renderThread(state.thread);
    if (recognition) recognition.lang = lang === 'ta' ? 'ta-IN' : 'en-IN';
  }
  $('#langBtn').addEventListener('click', () => {
    lang = lang === 'en' ? 'ta' : 'en';
    try { sessionStorage.setItem('sv-lang', lang); } catch {}
    applyLang();
  });

  // Quick exit: wipe what's on screen, then leave. The app closes itself; the
  // browser jumps to a neutral page and drops this one from history. Esc works too.
  function quickExit() {
    $('#text').value = '';
    $('#msgText').value = '';
    try { sessionStorage.clear(); localStorage.removeItem('sv-delivered'); } catch {}
    if (nativeApp) { nativeApp.exit(); return; }
    const target = 'https://www.google.com/search?q=weather';
    if (window.top !== window) window.top.location.replace(target); else location.replace(target);
  }
  $('#exitBtn').addEventListener('click', quickExit);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !document.body.classList.contains('embed')) quickExit(); });

  // ---------- navigation ----------
  function go(name) {
    state.current = name;
    $$('[data-screen]').forEach((s) => { s.hidden = s.dataset.screen !== name; });
    window.scrollTo(0, 0);
    if (name === 'thread' && state.code) loadThread(state.code);
    if (name === 'check') setTimeout(() => $('#codeInput').focus(), 50);
    if (name !== 'report') stopMic();
    if (name !== 'help') stopBreathing();
  }
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-go]');
    if (!el) return;
    e.preventDefault();
    go(el.dataset.go);
  });

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { el.hidden = true; }, 2200);
  }

  async function api(path, body, timeoutMs = 10000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(path, {
        signal: ctrl.signal,
        ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
    } catch {
      const err = new Error(t('errNet'));
      err.offline = true;
      throw err;
    } finally {
      clearTimeout(timer);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || t('errNet'));
    return data;
  }

  // ---------- connection to the SafeVoice server ----------
  // The phone keeps a live line open to the laptop. If it drops (left the Wi-Fi,
  // laptop asleep), we show it and reconnect on our own.
  let online = null;
  let es = null;
  let lastBeat = 0;
  function setOnline(v) {
    if (online === v) return;
    online = v;
    renderConn();
    if (v) flushOutbox();
  }
  function renderConn() {
    const el = $('#conn');
    el.className = `conn ${online === true ? 'on' : online === false ? 'off' : ''}`;
    $('#connLabel').textContent = online === false ? t('offline') : online ? t('online') : '';
    const b = $('#offlineBanner');
    b.hidden = online !== false;
    b.textContent = t('offlineBanner') + (outbox.length ? ` (${outbox.length})` : '');
  }
  function connectLive() {
    if (es) es.close();
    lastBeat = Date.now();
    es = new EventSource('/api/presence');
    es.addEventListener('hello', () => { lastBeat = Date.now(); setOnline(true); });
    es.addEventListener('ping', () => { lastBeat = Date.now(); setOnline(true); });
    es.onerror = () => setOnline(false);
  }
  // Heartbeats arrive every 15 s; a silent Wi-Fi drop shows up as missing beats.
  setInterval(() => {
    if (Date.now() - lastBeat > 40000) { setOnline(false); connectLive(); }
  }, 5000);
  window.addEventListener('online', connectLive);
  window.addEventListener('offline', () => setOnline(false));

  // ---------- outbox: reports written while offline ----------
  let outbox = [];
  try { outbox = JSON.parse(localStorage.getItem('sv-outbox') || '[]'); } catch {}
  function saveOutbox() {
    try { localStorage.setItem('sv-outbox', JSON.stringify(outbox)); } catch {}
    renderConn();
  }
  let flushing = false;
  async function flushOutbox() {
    if (flushing || !outbox.length) return;
    flushing = true;
    try {
      while (outbox.length) {
        const r = await api('/api/reports', outbox[0], 8000);
        outbox.shift();
        saveOutbox();
        delivered.push(r.code);
        try { localStorage.setItem('sv-delivered', JSON.stringify(delivered)); } catch {}
        if (r.helplines?.length) info.helplines = r.helplines;
      }
    } catch (ex) {
      if (ex.offline) setOnline(false);
    } finally {
      flushing = false;
      renderDelivered();
    }
  }

  let delivered = [];
  try { delivered = JSON.parse(localStorage.getItem('sv-delivered') || '[]'); } catch {}
  function renderDelivered() {
    const b = $('#deliveredBanner');
    b.hidden = !delivered.length;
    if (!delivered.length) return;
    b.innerHTML = `${esc(t('delivered'))} ${delivered.map((c) => `<b class="mono">${esc(c)}</b> <button type="button" data-open="${esc(c)}">${esc(t('open'))}</button>`).join(' ')}
      <button type="button" data-dismiss>${esc(t('dismiss'))}</button>`;
    $$('[data-open]', b).forEach((x) => x.addEventListener('click', () => { state.code = x.dataset.open; go('thread'); }));
    $('[data-dismiss]', b).addEventListener('click', () => {
      delivered = [];
      try { localStorage.removeItem('sv-delivered'); } catch {}
      renderDelivered();
    });
  }

  // ---------- chips ----------
  function renderChips() {
    const mk = (box, items, key, labels) => {
      box.innerHTML = '';
      for (const v of items) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(state[key] === v));
        b.textContent = labels[v] || v;
        b.addEventListener('click', () => {
          state[key] = state[key] === v ? '' : v;
          renderChips();
        });
        box.appendChild(b);
      }
    };
    mk($('#aboutChips'), ['me', 'friend', 'saw'], 'about', t('aboutOpts'));
    mk($('#whereChips'), info.locations, 'location', t('locs'));
    mk($('#whenChips'), info.times, 'time', t('times'));
  }

  $('#clearBtn').addEventListener('click', () => { $('#text').value = ''; $('#text').focus(); });

  // ---------- grounding: slow breathing (4 in, 4 hold, 6 out) ----------
  let breathTimer = null;
  function stopBreathing() {
    clearTimeout(breathTimer);
    breathTimer = null;
    $('#breathe').classList.remove('in');
    $('#breatheCue').textContent = '';
    $('#breatheBtn').textContent = t('breatheStart');
  }
  function breathe(step = 0) {
    const [cue, ms, grow] = [['breatheIn', 4000, true], ['breatheHold', 4000, true], ['breatheOut', 6000, false]][step];
    $('#breatheCue').textContent = t(cue);
    $('#breathe').classList.toggle('in', grow);
    breathTimer = setTimeout(() => breathe((step + 1) % 3), ms);
  }
  $('#breatheBtn').addEventListener('click', () => {
    if (breathTimer) return stopBreathing();
    $('#breatheBtn').textContent = t('breatheStop');
    breathe();
  });

  function renderHelplines() {
    $('#helplines').innerHTML = info.helplines.map((h) => `
      <a class="helpline" href="tel:${h.number}">
        <b>${h.name}</b><span class="num">${h.number}</span><small>${t('hl')[h.name] || h.note || ''}</small>
      </a>`).join('');
  }

  $('#talkBtn').addEventListener('click', () => {
    if (state.code) return go('thread');
    $('#helpNow').checked = true;
    go('report');
  });

  // ---------- voice input (English or Tamil) ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let listening = false;
  if (SR) {
    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang === 'ta' ? 'ta-IN' : 'en-IN';
    let base = '';
    recognition.onstart = () => { base = $('#text').value.trim(); };
    recognition.onresult = (e) => {
      let finalText = '';
      let interim = '';
      for (let i = 0; i < e.results.length; i++) {
        (e.results[i].isFinal ? (finalText += e.results[i][0].transcript) : (interim += e.results[i][0].transcript));
      }
      $('#text').value = [base, (finalText + interim).trim()].filter(Boolean).join(' ');
    };
    recognition.onend = () => setMic(false);
    recognition.onerror = () => setMic(false);
    $('#micBtn').hidden = false;
    $('#micBtn').addEventListener('click', () => {
      if (listening) return stopMic();
      try { recognition.start(); setMic(true); } catch { setMic(false); }
    });
  }
  function setMic(on) {
    listening = on;
    $('#micBtn').setAttribute('aria-pressed', String(on));
    $('#micLabel').textContent = on ? t('listening') : t('speak');
  }
  function stopMic() { if (recognition && listening) recognition.stop(); setMic(false); }

  // ---------- submit report ----------
  $('#reportForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    stopMic();
    const err = $('#reportError');
    err.hidden = true;
    const text = $('#text').value.trim();
    if (text.length < 3) { err.textContent = t('errText'); err.hidden = false; $('#text').focus(); return; }
    const btn = $('#submitBtn');
    btn.disabled = true;
    btn.textContent = t('sending');
    const payload = { text, about: state.about, location: state.location, time: state.time, helpNow: $('#helpNow').checked, lang };
    try {
      let r;
      try {
        r = await api('/api/reports', payload, online === false ? 3000 : 8000);
      } catch (ex) {
        if (!ex.offline) throw ex;
        // No connection: keep it on the phone and send it when the Wi-Fi is back.
        outbox.push(payload);
        saveOutbox();
        $('#reportForm').reset();
        state.about = state.location = state.time = '';
        renderChips();
        setOnline(false);
        go(payload.helpNow ? 'help' : 'queued');
        return;
      }
      state.code = r.code;
      if (r.helplines?.length) info.helplines = r.helplines;
      $('#codeBtn').textContent = r.code;
      $('#codeBtn').title = t('tapCopy');
      $('#sentHelpBtn').hidden = !r.urgent;
      $('#reportForm').reset();
      state.about = state.location = state.time = '';
      renderChips();
      go('sent');
      typeOut($('#replyText'), r.reply);
      if (r.urgent) setTimeout(() => go('help'), 4200);
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = t('submit');
    }
  });

  function typeOut(el, text) {
    el.textContent = '';
    el.classList.add('typing');
    let i = 0;
    clearInterval(typeOut.timer);
    typeOut.timer = setInterval(() => {
      i += 2;
      el.textContent = text.slice(0, i);
      if (i >= text.length) { clearInterval(typeOut.timer); el.classList.remove('typing'); }
    }, 18);
  }

  $('#codeBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(state.code); toast(t('copied')); } catch {}
  });

  // ---------- check case ----------
  $('#codeInput').addEventListener('input', (e) => {
    let v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (v.startsWith('SV')) v = v.slice(2);
    v = v.slice(0, 7);
    e.target.value = v ? `SV-${v.slice(0, 4)}${v.length > 4 ? '-' + v.slice(4) : ''}` : '';
  });
  $('#checkForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#checkError');
    err.hidden = true;
    const code = $('#codeInput').value.trim();
    if (!code) { err.textContent = t('errCode'); err.hidden = false; return; }
    try {
      const c = await api(`/api/case/${encodeURIComponent(code)}`);
      state.code = c.code;
      state.thread = c;
      go('thread');
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }
  });

  async function loadThread(code) {
    try {
      const c = await api(`/api/case/${encodeURIComponent(code)}`);
      state.thread = c;
      renderThread(c);
    } catch (ex) {
      $('#msgError').textContent = ex.message;
      $('#msgError').hidden = false;
    }
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fmt = (iso) => new Date(iso).toLocaleString(lang === 'ta' ? 'ta-IN' : 'en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

  function renderThread(c) {
    $('#threadCode').textContent = c.code;
    const st = $('#threadStatus');
    st.textContent = t(`st_${c.status}`);
    st.className = `badge ${c.status === 'replied' ? 'teal' : ''}`;
    const msgs = c.messages.map((m) => `
      <div class="bubble ${m.from}">
        <span class="who">${esc(t(m.from === 'student' ? 'you' : m.from))}</span>
        ${esc(m.text)}
        <time datetime="${m.at}">${fmt(m.at)}</time>
      </div>`);
    if (!c.messages.some((m) => m.from === 'counsellor')) msgs.push(`<div class="waiting">${esc(t('waiting'))}</div>`);
    $('#thread').innerHTML = msgs.join('');
  }

  $('#msgForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('#msgText').value.trim();
    if (!text) return;
    $('#msgError').hidden = true;
    try {
      const c = await api(`/api/case/${encodeURIComponent(state.code)}/message`, { text });
      $('#msgText').value = '';
      state.thread = c;
      renderThread(c);
      if (c.helplines?.length) { info.helplines = c.helplines; renderHelplines(); go('help'); }
    } catch (ex) {
      $('#msgError').textContent = ex.message;
      $('#msgError').hidden = false;
    }
  });

  // Keep an open case fresh so counsellor replies appear without reloading.
  setInterval(() => {
    if (state.current === 'thread' && state.code && !document.hidden) loadThread(state.code);
  }, 5000);

  // ---------- boot ----------
  fetch('/api/info').then((r) => r.json()).then((d) => {
    info = { ...info, ...d };
    applyLang();
  }).catch(() => {});
  applyLang();
  connectLive();

  // ---------- "app" on the phone: Add to Home screen ----------
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  let dismissedInstall = false;
  try { dismissedInstall = localStorage.getItem('sv-install-hidden') === '1'; } catch {}
  if (!standalone && !nativeApp && !dismissedInstall && !document.body.classList.contains('embed') && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)) {
    $('#installCard').hidden = false;
    if (/iPhone|iPad/i.test(navigator.userAgent)) $('#installHow').dataset.t = 'installHowIos';
    if (/Android/i.test(navigator.userAgent)) $('#apkLink').hidden = false;
    applyLang();
  }
  let installEvent = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e;
    $('#installBtn').hidden = false;
  });
  $('#installBtn').addEventListener('click', async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice.catch(() => {});
    $('#installCard').hidden = true;
  });
  $('#installClose').addEventListener('click', () => {
    $('#installCard').hidden = true;
    try { localStorage.setItem('sv-install-hidden', '1'); } catch {}
  });
  if ('serviceWorker' in navigator && window.isSecureContext && !document.body.classList.contains('embed')) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Used by the presenter page (/demo) to pre-fill a scenario. Nothing is sent until "Submit".
  window.SafeVoiceDemo = {
    fill({ text, about = 'me', location: loc = '', time = '', helpNow = false, lang: l }) {
      if (l && l !== lang) { lang = l; applyLang(); }
      go('report');
      $('#text').value = text;
      $('#helpNow').checked = helpNow;
      state.about = about;
      state.location = loc;
      state.time = time;
      renderChips();
    },
  };
})();
