# 🎧 Katz Studio Pro — DJ Telegram Mini App

Professional DJ mixer running as a Telegram Mini App. Two-deck system with real-time audio processing, SoundCloud-style waveforms, BPM detection, and beat sync.

![Version](https://img.shields.io/badge/version-3.4-blue)
![Platform](https://img.shields.io/badge/platform-Telegram%20Mini%20App-0088cc)
![Audio](https://img.shields.io/badge/engine-Tone.js-ff6600)

## ✨ Features

### 🎛 Dual Decks
- Independent Play/Pause per deck
- File loading from device or Telegram bot
- Animated vinyl turntable (Canvas)
- SoundCloud-style waveform with 200 amplitude bars + reflection
- Interactive timeline: click/touch seek, drag scrub
- Time display (current / duration)

### 🔄 Pro Sync System
- **BPM Detection** — onset energy flux + autocorrelation algorithm
- **Sync A** — Deck A adjusts pitch to match Deck B's BPM
- **Sync B** — Deck B adjusts pitch to match Deck A's BPM
- **Reset-before-Sync** — each sync resets both pitches first (no drift)
- **Double-tap Reset** — double-tap Sync A/B to reset both pitches to 0%
- **Sync Lock** — continuous per-frame phase correction with micro-nudge

### 🎚 Audio Controls
- **3-band EQ** (Low / Mid / High) per deck
- **Gain** per deck
- **Crossfader** with gradient A↔B track
- **Master Volume**
- **Pitch** ±50% per deck with percentage display
- **Double-tap reset** on all sliders

### 🎵 Effects (FX)
- **Delay** — FeedbackDelay (8n, 0.4 feedback)
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

---

## 🛠 Tech Stack

| Technology | Purpose |
|-----------|---------|
| **Tone.js** v14.7.77 | Audio engine (players, EQ, effects, routing) |
| **Canvas API** | Vinyl turntable animation, waveform rendering |
| **Telegram WebApp SDK** | Telegram integration (themes, safe areas, bot communication) |
| **CSS Custom Properties** | Design tokens, Telegram theme adaptation |
| **Google Fonts (Inter)** | Typography |

## 📁 Project Structure

```
├── index.html       # App markup + Telegram SDK
├── styles.css       # Design system (glassmorphism, neon, animations)
├── app.js           # Audio engine, UI logic, sync algorithms
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

### Local Development

```bash
# Serve with any static server
npx serve .

# Or Python
python3 -m http.server 8080

# Open in browser
open http://localhost:8080
```

### Telegram Deployment

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Set Web App URL: `/setmenubutton` → your hosted URL
3. Host files on any static server (GitHub Pages, Vercel, etc.)

---

## 🎮 Usage

1. **Load tracks** — tap 📁 on each deck to load audio files
2. **Play** — tap ▶ Play on each deck
3. **Mix** — use crossfader to blend between decks
4. **EQ** — adjust Low/Mid/High knobs per deck
5. **Sync** — tap `Sync A` (A follows B) or `Sync B` (B follows A)
6. **Lock** — tap 🔒 Lock for continuous beat sync
7. **Loop** — set A point, set B point, toggle loop
8. **Pitch** — drag pitch slider (double-tap to reset)
9. **FX** — toggle Delay/Reverb/Phaser per deck
10. **Record** — tap ⏺ to record and download your mix

> **Tip**: Double-tap any slider to reset it to default value.
> Double-tap Sync A or Sync B to reset both decks' pitch.

---

## 📝 Changelog

### v3.4 (Current)
- Directional sync: Sync A / Sync B buttons
- Reset-before-sync prevents pitch drift
- Double-tap sync for full pitch reset
- Sync Lock with continuous phase correction

### v3.3
- Onset-based BPM detection (energy flux + autocorrelation)
- Beat grid computation
- Phase alignment with firstBeat tracking

### v3.2
- SoundCloud-style waveform (200 bars + reflection)
- A-B Loop system
- Loop visualization on waveform

### v3.1
- Interactive waveform timeline (click/touch seek)
- BPM detection and display
- Pitch control per deck

### v3.0
- Complete UI rewrite (glassmorphism, neon accents)
- Tone.js audio engine with EQ3, FX chain
- Vinyl turntable canvas animation
- Crossfader, master volume, recording

---

## 📄 License

MIT
