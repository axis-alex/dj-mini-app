# 🎧 Katz Studio Pro — DJ Telegram Mini App

Professional DJ mixer running as a Telegram Mini App. Two-deck system with real-time audio processing, stacked waveforms with pinch-to-zoom, BPM detection, phase-accurate beat sync, CUE points, and a Telegram bot for track library management.

![Version](https://img.shields.io/badge/version-4.0-blue)
![Platform](https://img.shields.io/badge/platform-Telegram%20Mini%20App-0088cc)
![Audio](https://img.shields.io/badge/engine-Tone.js-ff6600)

## ✨ Features

### 🎛 Dual Decks
- Independent Play/Pause per deck
- File loading from device or Telegram bot library
- **Stacked waveforms** — both decks visible side-by-side for visual beat matching
- **High-resolution waveform** — 2000 amplitude bars with reflection
- **Pinch-to-zoom** — two-finger gesture on waveform for detailed view
- **Scrubbing** — drag to seek when zoomed in
- Time display (current / duration)
- **CUE button** — jump to cue point, hold-to-preview

### 🔄 Pro Sync System
- **BPM Detection** — onset energy flux + autocorrelation with smart first-beat detection
- **Sync A** — Deck A adjusts pitch and phase to match Deck B
- **Sync B** — Deck B adjusts pitch and phase to match Deck A
- **Phase Alignment** — beat-accurate phase jump using shortest-path algorithm
- **Double-tap Reset** — double-tap Sync A/B to reset both pitches to 0%
- **Sync Lock** — continuous per-frame phase correction with micro-nudge

### 🎚 Audio Controls
- **3-band EQ** (Low / Mid / High) per deck
- **Gain** per deck
- **Crossfader** with gradient A↔B track
- **Master Volume**
- **Pitch** ±10% per deck (maps to playback rate 0.9–1.1)
- **Double-tap reset** on all sliders

### 🎵 Effects (FX)
- **Echo** — FeedbackDelay (8n, 0.4 feedback)
- **Reverb** — 1.5s reverb
- **Phaser** — 2Hz, 3 octaves

### 🔁 A-B Loop
- Set point A (loop start)
- Set point B (loop end, auto-activates)
- Toggle loop on/off
- Clear loop
- Visual loop region on waveform

### ⏺ Recording
- Record mix via MediaRecorder API
- Download as `.webm` file

### 🤖 Telegram Bot
- Send audio files (MP3, WAV, FLAC, M4A, OGG) to add to your library
- Send files as **documents** — bot auto-detects audio by extension
- `/list` — view your track library
- `/delete <number>` — remove a track
- `/help` — usage guide

### 📱 iOS Compatibility
- Silent audio loop hack for background playback
- Touch-optimized file input
- `Tone.start()` on all user interactions

---

## 🛠 Tech Stack

| Technology | Purpose |
|-----------|---------|
| **Tone.js** v14.7.77 | Audio engine (players, EQ, effects, routing) |
| **Canvas API** | Waveform rendering with zoom |
| **Telegram WebApp SDK** | Telegram integration |
| **Node.js / Express** | Backend API server |
| **Telegraf** | Telegram bot framework |
| **SQLite** | Track library storage |
| **Google Fonts (Inter)** | Typography |

## 📁 Project Structure

```
├── index.html       # App markup + Telegram SDK
├── styles.css       # Design system (glassmorphism, neon, animations)
├── app.js           # Audio engine, UI logic, sync algorithms
├── server.js        # Express API + Telegram bot
├── database.js      # SQLite setup and schema
├── package.json     # Dependencies and scripts
├── .env             # Environment variables (BOT_TOKEN, PORT)
└── README.md        # This file
```

## 🎵 Audio Graph

```
Player A → EQ3 → Delay → Reverb → Phaser → Gain → CrossFade.a ─┐
                                                                  ├→ Master → 🔊
Player B → EQ3 → Delay → Reverb → Phaser → Gain → CrossFade.b ─┘
                                                                  └→ MediaStream (Rec)
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Telegram Bot Token (from [@BotFather](https://t.me/BotFather))

### Setup

```bash
# Install dependencies
npm install

# Create .env file
echo "BOT_TOKEN=your_bot_token_here" > .env
echo "PORT=3000" >> .env
echo "WEBAPP_URL=https://your-domain.com/" >> .env

# Start server
npm start
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_TOKEN` | ✅ | Telegram bot token from @BotFather |
| `PORT` | ❌ | Server port (default: 3000) |
| `WEBAPP_URL` | ❌ | Mini App URL for bot buttons (default: GitHub Pages) |

### Telegram Deployment

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Set Web App URL: `/setmenubutton` → your hosted URL
3. Host backend on a persistent server (Glitch, Render, Railway, etc.)
4. Frontend can be on GitHub Pages (set `API_BASE` in `app.js` to your server URL)

---

## 🎮 Usage

1. **Add tracks** — send audio files to your bot in Telegram chat
2. **Open mixer** — tap the "🎧 Открыть Mixer" button in the bot
3. **Load tracks** — tap 📁 (local file) or 💬 (Telegram library) on each deck
4. **Play** — tap ▶ Play on each deck
5. **Mix** — use crossfader to blend between decks
6. **Zoom** — pinch on waveform to zoom in and see beats
7. **Sync** — tap `Sync A` (A follows B) or `Sync B` (B follows A)
8. **CUE** — tap CUE to jump to start; hold CUE to preview
9. **EQ/FX** — adjust Low/Mid/High and toggle Echo/Reverb/Phaser
10. **Record** — tap ⏺ to record and download your mix

> **Tip**: Double-tap any slider to reset it to default value.

---

## 📝 Changelog

### v4.0 (Current)
- 🤖 Bot: document handler (MP3/WAV as files), `/list`, `/delete` commands
- 🔍 Code review: removed dead code, fixed CSS variables, security cleanup
- 📦 Proper `package.json` with `npm start` script
- 📚 Full documentation rewrite

### v3.5
- 🎯 Phase-accurate Beat Sync (shortest-path jump)
- 🔍 Pinch-to-zoom waveforms (2000 bars, up to 20x zoom)
- 📌 CUE button with hold-to-preview
- 🎚 Pitch range: ±10% (professional standard)
- 📱 iOS background audio hack
- 🗂 Stacked waveform layout (vinyl removed)

### v3.4
- Directional sync: Sync A / Sync B buttons
- Sync Lock with continuous phase correction

### v3.3
- BPM detection (onset energy flux + autocorrelation)
- Beat grid computation
- Phase alignment with firstBeat tracking

### v3.0
- Complete UI rewrite (glassmorphism, neon accents)
- Tone.js audio engine with EQ3, FX chain
- Crossfader, master volume, recording

---

## 📄 License

MIT
