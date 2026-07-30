# Undercover — a party word-deduction game

Inspired by what makes skribbl.io fun (fast rounds, real-time multiplayer,
social bluffing) but a different game so it's not another skribbl.io clone.
Everyone in a room gets a secret word; one or two players secretly get a
*different but similar* word ("undercover"), and optionally one player gets
no word at all ("Mr. White"). Players take turns giving a one-line clue
about their word, then vote out who they think is undercover. Civilians win
if they eliminate all undercover/Mr. White players; undercover wins if they
survive down to parity; Mr. White can steal a solo win by correctly
guessing the civilians' word after being caught. Host-configurable, synced
countdown timers keep clue-giving and voting moving.

Stack: **React (Vite) frontend** + **Node.js/Express + Socket.IO backend**,
communicating over WebSockets for realtime play. No database — game state
lives in server memory, which is all a game like this needs.

## Project layout

```
uneven-match/
  server/   Node + Socket.IO backend (game rooms & rules)
  client/   React frontend (Vite)
```

## 1. Check your local setup first

Open a terminal and run:

```bash
node -v      # need 18.x or newer
npm -v       # ships with Node, any recent version is fine
```

- If `node`/`npm` aren't found: install Node.js from https://nodejs.org
  (the LTS version). That single installer gives you both `node` and `npm`
  — npm is how you'll pull in React, Vite, Express, and Socket.IO.
- "React working" isn't a separate system install — it's a package your
  project pulls in via `npm install` (see below). Once that succeeds and
  `npm run dev` starts a dev server, React is working.

## 2. Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

## 3. Run it locally (two terminals)

```bash
# Terminal 1
cd server
cp .env.example .env
npm run dev

# Terminal 2
cd client
cp .env.example .env
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173). Open it in a
couple of browser tabs (or on other devices on the same network, using your
machine's LAN IP instead of localhost) to test with multiple players — you
need 3+ players to start a game.

## 4. Deploying so friends can play over the internet

Locally this only works on the same network. See **[DEPLOY.md](./DEPLOY.md)**
for step-by-step instructions — deploys as a single Render service (Express
serves the built React app + runs Socket.IO from one URL).

## 5. Google AdSense

Already live and wired:
- `client/src/components/AdSlot.jsx` — real ad units, placed in the lobby
  and game-over screens (non-intrusive spots; avoid ads mid-gameplay).
  Renders nothing if unconfigured, so there's no broken UI.
- `client/index.html` — AdSense loader script + site verification meta tag,
  reading the publisher ID from `VITE_ADSENSE_CLIENT_ID` at build time.
- `client/public/ads.txt` — filled in with the real AdSense line.

Only one env var is needed to activate ads: `VITE_ADSENSE_CLIENT_ID` (your
`ca-pub-...` publisher ID) set in Render's Environment tab — ad unit slot
IDs are hardcoded per-placement in `Lobby.jsx`/`GameOverScreen.jsx` already.
See DEPLOY.md's "Turning on AdSense" section for the full walkthrough.

## Game logic overview (server/src/rooms.js)

- `createRoom` / `joinRoom` — room + player management, 3–10 players.
- `startGame` — assigns 1 undercover (2 if 7+ players), an optional Mr.
  White (5+ players, host toggle), and a random word pair from
  `server/src/words.js`.
- Server-authoritative timers (`turnEndsAt`/`voteEndsAt`/`guessEndsAt`)
  broadcast the same countdown deadline to every player; auto-advances if
  someone stalls.
- `submitClue` — enforces turn order, blocks saying the actual word.
- `submitVote` / vote resolution — tallies votes, eliminates on a clear
  majority, ties eliminate nobody. Eliminating Mr. White triggers a timed
  guess phase instead of an immediate reveal.
- Win check runs after every elimination.
- `sanitizeForPlayer` — makes sure each socket only ever sees their own
  secret word (and revealed/eliminated players' roles), so no one can peek
  at the raw server state to cheat.

## Extending it

- Add more word pairs / categories in `server/src/words.js`.
- Swap `PlayerAvatar.jsx`'s generated color avatars for uploaded profile
  pictures if you want, or add downloaded category-themed art behind each
  word card — the whole UI is plain CSS in `client/src/styles.css`, no
  design system lock-in.
