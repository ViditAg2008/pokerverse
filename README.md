# PokerVerse — Complete Multiplayer & AI Texas Hold'em Platform

PokerVerse is a full-stack, server-authoritative No-Limit Texas Hold'em poker platform built with React 19, TypeScript, Tailwind CSS, Framer Motion, Express, and Socket.IO.

> **Important Note**: PokerVerse is a social entertainment card game using **virtual chips only**. There is no real-money gambling, deposits, withdrawals, or cash prizes.

---

## Features

1. **Complete Texas Hold'em Poker Engine (`src/poker/engine.ts` & `src/poker/evaluator.ts`)**
   - Cryptographically secure 52-card Fisher-Yates shuffle.
   - Standard 3+ player and 2-player Heads-Up blind rules and dealer button rotation.
   - Full betting validation: `Fold`, `Check`, `Call`, `Bet`, `Raise`, and `All-In`.
   - Exact minimum raise tracking, short all-in raise protection, uncalled bet refunds, and multi-way **Main Pot + Side Pots** resolution.
   - Deterministic 7-card evaluator supporting all **10 standard poker hand rankings** (`Royal Flush` down to `High Card`), kicker tie-breaking, split pots, and Ace-low (`A-2-3-4-5`) / Ace-high straights.

2. **Intelligent AI Opponents (`src/poker/ai.ts`)**
   - Three difficulty tiers (`Beginner`, `Intermediate`, `Advanced`) and four distinct playing personalities (`Conservative`, `Aggressive`, `Balanced`, `Unpredictable`).
   - Evaluates hole card strength, post-flop made hands, flush/straight draw equity, pot odds, and table position without ever accessing hidden opponent hole cards or undealt deck order.

3. **Private Multiplayer Rooms & Shareable Invitation Links (`server.ts`)**
   - Create private rooms with custom starting chips, small/big blinds, turn timers, max seats, and optional AI bots.
   - Shareable invitation URLs (`?room=XXXXXX`) and 6-character room codes allow friends to join immediately without complicated registration.
   - Strict hole-card privacy: the server sanitizes every client payload so each player only receives their own private cards until a multi-player Showdown.
   - Supports Spectator Mode, automatic seat reconnection, in-room text chat, and animated table emotes.

4. **Premium Casino Table Interface, Animations & Procedural Web Audio**
   - Oval luxury poker table with selectable felt themes (`Classic Emerald`, `Monte Carlo Royal`, `High-Roller Crimson`) and optional Four-Color Deck.
   - Synthesized Web Audio API sound effects for card shuffling, dealing, chip clinks, wood table check taps, folding, turn alerts, and pot victories.

---

## Project Structure

```text
/
├── server.ts                      # Express + Socket.IO + Vite full-stack server
├── index.html                     # Entry HTML with Cinzel, Plus Jakarta Sans & JetBrains Mono
├── package.json                   # Project scripts and dependencies
├── .env.example                   # Environment variable template
├── data/
│   └── pokerverse_store.json      # Auto-generated persistent store for stats & hand history
└── src/
    ├── App.tsx                    # Main application controller, lobby & Socket.IO client
    ├── main.tsx                   # React DOM root
    ├── index.css                  # Tailwind CSS v4 + casino table surface utilities
    ├── poker/
    │   ├── types.ts               # Shared TypeScript interfaces and types
    │   ├── evaluator.ts           # 7-card Texas Hold'em hand evaluator (all 10 rankings)
    │   ├── engine.ts              # Server-authoritative Texas Hold'em state machine
    │   ├── ai.ts                  # Multi-difficulty AI decision engine
    │   ├── engine.test.ts         # Automated unit tests for evaluator, side pots, and AI
    │   └── multiplayer.test.ts    # Automated Socket.IO multiplayer integration tests
    ├── components/
    │   ├── PokerTable.tsx         # 8-seat oval poker table, board, pots, and HUD
    │   ├── ActionPanel.tsx        # Dynamic betting controls, slider, and presets
    │   ├── PlayingCard.tsx        # Animated SVG playing cards with 4-color option
    │   ├── ChipStack.tsx          # Denomination-colored casino chip stacks
    │   ├── AvatarIcon.tsx         # Custom SVG player emblems
    │   └── Modals.tsx             # Lobby modals, How to Play, History, Stats & Settings
    └── utils/
        └── sound.ts               # Procedural Web Audio API casino sound synthesizer
```

---

## Running Locally on Your Machine

### 1. Download or Export the Source Code
- In Google AI Studio, click **Download / Export Project** (or clone from your linked GitHub repository) and extract the folder on your computer.

### 2. Open in VS Code
- Open **Visual Studio Code**, select **File -> Open Folder...**, and choose the extracted `pokerverse` project directory.

### 3. Install Node.js
- Ensure **Node.js v20+** (or v22 LTS) is installed from [https://nodejs.org](https://nodejs.org).
- Verify in your terminal:
  ```bash
  node -v
  npm -v
  ```

### 4. Install Project Dependencies
```bash
npm install
```

### 5. Configure Environment Variables
Copy `.env.example` to `.env` (no external paid API keys are required to run the full multiplayer and AI poker platform):
```bash
cp .env.example .env
```

### 6. Run Automated Unit & Multiplayer Tests
Run the built-in test suites for hand rankings, side pots, betting rules, and Socket.IO multiplayer synchronization:
```bash
npx tsx --test src/poker/engine.test.ts
npx tsx --test src/poker/multiplayer.test.ts
```

### 7. Start the Full-Stack Development Server (Frontend + Backend)
The Express + Socket.IO backend and Vite React frontend run together on port `3000`:
```bash
npm run dev
```

### 8. Access the Application Locally
- Open **`http://localhost:3000`** in your browser.
- To test multiplayer locally across multiple players, open a second browser window (or an Incognito window) and paste the **Invitation Link** (`http://localhost:3000/?room=XXXXXX`) copied from your private room!

---

## Online Deployment Guide (Sharing With Friends Over the Internet)

> **Note**: `http://localhost:3000` is only accessible on your own computer. To invite friends over the internet using shareable room links, deploy the full-stack Node.js server to a public host that supports WebSockets (Socket.IO).

### Recommended Hosting Options

1. **Google Cloud Run (Built-in AI Studio Deployment)**
   - Click **Deploy** directly inside Google AI Studio, or deploy via `gcloud run deploy --source .`.
   - Cloud Run supports concurrent WebSocket connections out of the box and provides an HTTPS `.run.app` public URL.
2. **Render.com / Railway.app / Fly.io**
   - Connect your GitHub repository as a **Node.js Web Service**.
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `NODE_ENV=production npm start`
   - **Environment Variables**:
     - `NODE_ENV=production`
     - `PORT=3000` (or assigned automatically by host)

### Sharing Private Invitation Links & Testing Across Devices
1. Once deployed to your public HTTPS URL (e.g. `https://your-pokerverse-app.run.app`), click **Create Private Room**.
2. Click **Copy Invitation Link**, which copies `https://your-pokerverse-app.run.app/?room=ABCDEF`.
3. Send that URL to friends on Desktop, iPhone, Android, or Tablet — opening the link takes them straight into your room's join prompt.
