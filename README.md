# SafeVoice

**Every student deserves to be heard. Safely.**

SafeVoice lets a student report bullying, harassment or conflict anonymously from any phone, uses AI to flag urgent cases within seconds, and gives the school counsellor one dashboard to reply, spot patterns and step in before things escalate.

> The White Hat · Hack Fest · Peace building & conflict prevention

## Run it in a school: no modem, no internet

The laptop becomes the Wi-Fi network, the server and the counsellor dashboard all at once.

```
   Student phones ── Wi-Fi "SafeVoice" ──►  Counsellor laptop
   (browser / home-screen app)             • creates the Wi-Fi (Windows Mobile Hotspot)
                                           • runs SafeVoice on http://192.168.137.1:3000
                                           • shows the dashboard in its own window
```

1. Double-click **`Start SafeVoice.bat`**. The first time only, Windows asks for administrator permission once. That adds a firewall rule letting phones on the local network reach the app.
   - It creates the Wi-Fi network **SafeVoice** (password `safevoice2026`) and keeps it on: if Windows switches the hotspot off, it comes back within 15 seconds.
   - It starts the server and opens the dashboard as an app window.
2. On the dashboard, go to **Settings → Connect phones**, or open **http://localhost:3000/join** on the projector, or print it as a poster.
3. Students scan **QR 1** to join the Wi-Fi, then **QR 2** to open SafeVoice. In the browser menu, **Add to Home screen** turns it into an app icon.

What keeps it connected:
- Each phone shows **● Connected / ● Offline** at the top.
- If a phone drops off the Wi-Fi, students can still write a report. It is saved on the phone and **sent automatically** when the phone reconnects; the case code then appears on screen.
- The dashboard shows live **phones connected** and reconnects by itself if the server restarts.

To stop the Wi-Fi, run **`Stop SafeVoice Wi-Fi.bat`**. For a desktop icon, run `network\make-shortcut.ps1` once (right-click → Run with PowerShell).

Change the Wi-Fi name or password: `powershell -ExecutionPolicy Bypass -File network\hotspot.ps1 -Ssid "MySchool-Voice" -Password "something-long"`

**Limits to know:**
- Windows Mobile Hotspot allows **8 phones at once**, with a range of about one classroom.
- Laptop sleep stops everything. Plug it in, and set Settings → System → Power → *Screen and sleep* → Never while it's in use.
- In Settings → Network → Mobile hotspot, turn **Power saving** off so Windows doesn't switch the hotspot off when no phones are connected. The keep-alive turns it back on either way.
- **For a whole school:** use any cheap Wi-Fi router, even with no internet or modem plugged in. Connect the laptop to it and run `node server.js`. Phones join the router's Wi-Fi and open the address shown in Settings. A router handles 30–50+ phones and covers more area. The app works the same; only the Wi-Fi comes from the router instead of the laptop.

## Download

- **Android app:** [SafeVoice.apk (latest release)](https://github.com/ArunAlagappan-2010/safevoice/releases/latest/download/SafeVoice.apk)
- **Everything else:** the green **Code** button → **Download ZIP**, then double-click `Start SafeVoice.bat`. Needs [Node.js](https://nodejs.org) 18 or newer.

## Android app (APK)

`android/SafeVoice.apk` (about 40 KB) is ready to install. Phones can also download it from the SafeVoice server: on the student home page, tap **Download the Android app**, or open `http://192.168.137.1:3000/download/SafeVoice.apk`. Android asks to allow installs from the browser once.

What the app adds over the website:
- **It stays on the school Wi-Fi.** A hotspot with no internet makes Android send traffic over mobile data instead; the app pins itself to Wi-Fi so it still reaches the laptop.
- **It works when the laptop is unreachable.** It reopens the last copy of SafeVoice, so a student can still write a report, which is sent when the connection is back. With nothing saved, it shows a calm offline screen with the helplines (tap to call), the Wi-Fi steps, and a field for a different server address.
- **Quick exit closes the app** and removes it from Recent apps. On Android 13+, the Recent apps preview never shows the screen.

Rebuild after changing anything in `android/app`. No Android Studio or Gradle needed:

```bash
powershell -ExecutionPolicy Bypass -File android\setup-tools.ps1
```

```bash
powershell -ExecutionPolicy Bypass -File android\build-apk.ps1
```

`setup-tools.ps1` downloads a portable JDK 17 and the Android SDK into `android\tools`, once. `make-icons.ps1` redraws all icons from the logo shapes. The APK is signed with a self-made key, `android\safevoice.keystore`. Keep that file: updates must be signed with the same key.

## Designed to feel safe

The design follows trauma-informed design principles: safety, trust and transparency, choice, and hope. It also draws on what students say makes them willing to report.
- **Calm colours ("Lagoon Dawn").** Muted teal and lavender on a cool mist background, with no black and no alarm colours on student screens. Rose appears only on the counsellor's urgent cases.
- **Tell students what happens.**
  - A "What happens next" panel explains the process: you write, only the counsellor reads, you get a reply with your code.
  - "Who can see this?" sits on the form itself.
  - "You won't get in trouble for telling" appears before the student starts.
- **Control and choice.**
  - Every field except the text is optional.
  - "Who is this about? Me / A friend / Something I saw" makes bystander reports normal.
  - A Clear button.
  - Quick exit (or Esc) wipes the screen and leaves.
- **Hope and grounding.** "Thank you for speaking up. That took courage." after sending. The help screen has a guided slow-breathing exercise next to the tap-to-call helplines.
- **Accessible.**
  - Large tap targets (46–56 px).
  - AA contrast on buttons.
  - Visible focus rings.
  - Respects reduced-motion settings.
  - English and Tamil throughout.

## Run the demo (Windows)

Double-click **`start.bat`**. It opens the presenter view (phone and dashboard side by side) in your browser.

Or from a terminal:

```bash
cd safevoice
node server.js
```

Node.js 18 or newer is the only requirement. There is no database to install: data lives in `data/db.json`, and fictional demo data loads on first run.

| Page | URL | Who |
|---|---|---|
| Student app | http://localhost:3000/ | Students (mobile-first) |
| Counsellor dashboard | http://localhost:3000/counsellor | Counsellor, PIN **2468** |
| Presenter view | http://localhost:3000/demo | You, on stage: phone and dashboard side by side |
| Pitch video | http://localhost:3000/pitch | Plays the pitch, then links to the live demo |
| Connect poster | http://localhost:3000/join | Wi-Fi QR + app QR, English and Tamil, printable |

## Demo script (about 3 minutes)

1. Play `/pitch`, or go straight to `/demo`.
2. Log in to the dashboard with PIN `2468`. Four open cases are listed, sorted by urgency, with **Verbal harassment · Class 9 corridor · Lunch** on top. The AI triage panel flags *Repeated harassment*, *Fear expressed* and *Same place as past reports*.
3. Click **Hotspots**: the Class 9 corridor glows, Lunch spikes, and a *Pattern detected* card reads "7 reports in 3 weeks".
4. Back on **Cases**, click the **Safety concern** scenario at the top, then **Submit anonymously** on the phone.
   - The phone shows a private case code and a calm reply, then the helplines (Tele-MANAS 14416, Childline 1098, 112).
   - The dashboard chimes and shows **Urgent case · counsellor alerted**, with the case at the top.
5. Click **✦ Suggest reply**, edit if you like, and click **Send**. On the phone, tap **Talk to a counsellor**: the reply is there under the case code.
6. Click **தமிழ் · Caste bullying** to show a report in Tamil, with Tamil UI, Tamil reply and an identity-based bullying flag.
7. Hand the judges the QR code: they can send a report from their own phones and watch it land on the dashboard live.

Reset the demo at any time with **Settings → Reset demo data**.

## Let judges use their phones

**SafeVoice Wi-Fi (best at a venue).** Run `Start SafeVoice.bat` and judges join the SafeVoice Wi-Fi from the `/join` poster. This doesn't depend on venue Wi-Fi at all.

**Same Wi-Fi.** The server listens on your whole network. The QR code on `/demo` and in Settings points to your laptop's address, such as `http://192.168.1.176:3000/`. The first time you run it, Windows asks whether to allow Node.js on networks: allow **Private networks**. Venue Wi-Fi often blocks device-to-device traffic; if phones can't connect, use a hotspot from your own phone, or a tunnel.

**Public link (works on any network, and gives HTTPS so voice input works on phones):**

```bash
winget install Cloudflare.cloudflared
```

```bash
cloudflared tunnel --url http://localhost:3000
```

It prints an `https://….trycloudflare.com` address that anyone can open. Keep that terminal running.

## Turn on AI (Gemini or Claude)

Without a key, triage runs on a built-in rule engine (English and Tamil keywords, repetition, fear, place history), so the demo works fully offline. To use AI:

1. Copy `.env.example` to `.env` (or open the existing `.env`).
2. Add **one** line:
   - Gemini: `GEMINI_API_KEY=...` (free key from https://aistudio.google.com/apikey). Model `gemini-2.5-flash`; change it with `GEMINI_MODEL=`.
   - Claude: `ANTHROPIC_API_KEY=...`
3. Restart the server. The dashboard sidebar shows **AI: Gemini** or **AI: Claude**.

If both keys are set, Gemini is used; set `SAFEVOICE_AI=claude` to prefer Claude.

The AI (structured JSON output) then scores urgency, writes the flags and the first supportive reply in the student's language, and drafts counsellor replies. The rule engine still runs underneath as a **safety floor**: self-harm, weapons and sexual abuse are always urgent, whatever the model says. If the API is unreachable, SafeVoice falls back to the rules automatically.

## What's in it

- **Report.** Anonymous, no login, any phone. Text or voice (English or Tamil). Where and when chips. "I need help right now" toggle. Quick-exit button.
- **Triage.** Urgency 1–5, category, risk flags, a supportive reply in seconds, and helplines straight away for urgent cases.
- **Support.** Two-way anonymous thread through a private case code. The counsellor can override any AI urgency, which keeps a human in the loop.
- **Prevent.** A hotspot map, a time-of-day chart, types of incident, and automatic pattern detection when 3 or more reports share a place and time.
- **Privacy.** No names, no accounts and no IP addresses, stored or logged. Reports are deleted on a schedule (Settings → Data retention). Students never see internal triage.

## Project layout

```
server.js          HTTP server + API + live updates (Server-Sent Events)
lib/triage.js      Gemini / Claude triage + rule engine + safety floor
lib/store.js       JSON file store, case codes, retention purge
lib/seed.js        Fictional demo data
public/            Student app (installable), counsellor dashboard, presenter view, pitch, /join poster
network/           hotspot.ps1 (creates + keeps the Wi-Fi alive, firewall), make-shortcut.ps1
test/smoke.js      End-to-end test:  npm test
```

## Settings (environment variables)

| Variable | Default | |
|---|---|---|
| `GEMINI_API_KEY` | (unset) | Turns on Gemini |
| `GEMINI_MODEL` | `gemini-2.5-flash` | |
| `ANTHROPIC_API_KEY` | (unset) | Turns on Claude |
| `COUNSELLOR_PIN` | `2468` | Dashboard PIN |
| `PORT` | `3000` | |
| `SEED` | `true` | Set to `false` to start with no demo data |

All demo data is fictional.
