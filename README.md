<div align="center">

# 🏏 CricAuction
### *Real-Time Multiplayer Cricket Auction & Live Match Simulation Platform*

[![React](https://img.shields.io/badge/React-19.2-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.0-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Firebase](https://img.shields.io/badge/Firebase-Realtime-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

**Version:** `7.0.0` · **Status:** `Stable`

A high-performance, real-time multiplayer cricket simulation platform — run your own auction, build your squad, compete in a live tournament, and watch every ball play out over-by-over.

[Features](#-features) · [Tech Stack](#-tech-stack) · [Getting Started](#-getting-started) · [Project Structure](#-project-structure) · [Scripts](#-scripts)

</div>

---

## ✨ Features

### 🏢 Real-Time Auction Engine
- **Three formats** — Mega (25-player squad, 8 overseas, ₹120 Cr), Sprint 11 (11-player, 4 overseas, ₹90 Cr), Sprint 5 (5-player, 2 overseas, ₹60 Cr)
- **Sub-second sync** via Firebase Realtime Database with universal clock offset for bid timers
- **Live bid feed**, animated SOLD/UNSOLD cards, confetti celebrations
- **Flexible lobby** — team assignment, live chat, kick/ban controls, voice chat

### 🏆 Dream Match Tournament
- **10-team round-robin** with IPL-style playoffs (Qualifier 1, Eliminator, Qualifier 2, Final)
- **Randomised fixtures** per season — every new tournament gets a different schedule
- **Host-start** — tournament starts even if some players are offline
- **Season Winners** hall of fame — tracks champions across seasons

### 🎮 Live Match Arena
- **Interactive over-by-over play** — set Defend / Normal / Attack tactics before each over
- **Ball-by-ball mode** — watch every delivery with 2D wagon wheel, play/pause/speed controls
- **Full innings skip** — simulate instantly when you want fast results
- **Toss screen** — call Heads/Tails, coin flip animation, Bat/Bowl decision
- **Live scorecard tabs** — Field, Batting, Bowling, Overs history
- **Innings break** → Target display → second innings chase

### 📊 Ranking & Stats
- **Ranking leaderboard** — fantasy points based on match performances
- **Top Expenses** — most expensive squad buys across teams
- **Season Winners** — per-season champion record with team and manager name

### 🔊 Voice Chat
- **WebRTC in-room voice** — fixed top-right panel, collapsible
- **Auto audio recovery** — reconnects dropped streams automatically
- **Mute / deafen / per-player volume** controls

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19.2 + Vite 6 |
| Styling | Tailwind CSS v4 + Framer Motion |
| Database | Firebase Realtime Database |
| Auth | Firebase Authentication |
| Voice | WebRTC (signalling over RTDB) |
| Icons | Lucide React |

---

## 🚀 Getting Started

### Prerequisites
- Node.js v18+
- Firebase project (Realtime Database + Authentication enabled)

### Installation

```bash
git clone https://github.com/Shaurya01836/ipl-auction.git
cd ipl-auction
npm install
```

### Environment Setup

Copy `.env.example` to `.env` and fill in your Firebase config:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://your_project-default-rtdb.firebaseio.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# Optional
VITE_ADMIN_EMAIL=admin@example.com
VITE_CRICKET_API_KEY=your_cricapi_key
```

### Run

```bash
npm run dev      # Development server
npm run build    # Production build
npm run preview  # Preview production build
```

### Test

```bash
npm run test:phase2       # Auction engine tests
npm run test:phase3       # Tournament + simulation tests
npm run test:match-state  # Match arena state tests
```

---

## 📂 Project Structure

```
ipl-auction/
├── public/
│   └── readme-assets/        # Screenshots
├── scripts/
│   ├── autoUpdateFantasy.js        # Auto-calculates fantasy points
│   ├── backfillIPL2026.js          # Import historical match data
│   ├── deployDatabaseRules.js      # Sync Firebase RTDB security rules
│   └── uploadConsolidatedPoints.js
├── src/
│   ├── components/
│   │   ├── MatchArena.jsx          # Live over-by-over match engine
│   │   ├── TournamentSeason.jsx    # Round-robin + playoffs UI
│   │   ├── TournamentHub.jsx       # Tournament entry + XI selector
│   │   ├── DreamMatch.jsx          # Head-to-head quick match
│   │   ├── RoomVoiceChat.jsx       # WebRTC voice panel
│   │   └── fantasy/                # Ranking + squad selector
│   ├── contexts/
│   │   ├── AuctionContext.jsx      # Global auction state
│   │   └── AuthContext.jsx
│   ├── data/
│   │   ├── players.js              # Full player database
│   │   └── teams.js                # Franchise info
│   ├── lib/
│   │   ├── t20Engine.js            # Ball-by-ball simulation engine
│   │   ├── tournamentModel.js      # Fixture generation + standings
│   │   ├── tournamentSeason.js     # Season lifecycle management
│   │   └── aiSquadBuilder.js       # AI auto-XI selection
│   ├── pages/
│   │   ├── AuctionRoom.jsx         # Live bidding screen
│   │   ├── AuctionSummary.jsx      # Post-auction hub
│   │   ├── LandingPage.jsx         # Room selector
│   │   └── Lobby.jsx               # Pre-auction lobby
│   └── App.jsx
├── database.rules.json
├── firebase.json
└── vite.config.js
```

---

## ⚙️ Scripts

| Command | Purpose |
|---|---|
| `node scripts/deployDatabaseRules.js` | Push security rules to Firebase RTDB |
| `node scripts/backfillIPL2026.js` | Seed historical match scorecard data |
| `node scripts/autoUpdateFantasy.js` | Recalculate fantasy leaderboard |
| `node scripts/uploadConsolidatedPoints.js` | Bulk-upload player points |

---

## 🗺 Roadmap

- [x] Real-time multiplayer auction (Mega / Sprint formats)
- [x] Dream Match tournament (round-robin + playoffs)
- [x] Live Match Arena (over-by-over, ball-by-ball, wagon wheel)
- [x] Voice chat with auto-recovery
- [x] Season Winners hall of fame
- [ ] PWA / mobile app wrapper
- [ ] Public spectator mode
- [ ] AI commentary audio

---

<div align="center">
  <p>Built for cricket fans · Designed for pro experience · Open source · MIT License</p>
</div>
