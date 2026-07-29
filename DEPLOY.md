# Going live

This app deploys as **one service**: the Express/Socket.IO server serves the
built React app itself (see `server/src/index.js`), so you get a single URL
and never have to deal with CORS between two deployed domains. That single
URL is what you send to friends.

Recommended host: **Render** (free tier, native WebSocket support, simplest
setup). Railway and Fly.io work the same way if you'd rather use those —
just swap in their equivalent "connect repo → set build/start command" step.

## 1. Push the code to GitHub

Render deploys from a GitHub repo, so it needs to exist there first.

```bash
cd ~/Desktop/Project-Games
git init
git add .
git commit -m "Undercover game"
```

Then create an empty repo on https://github.com/new (don't initialize it
with a README), and push:

```bash
git remote add origin https://github.com/<your-username>/<repo-name>.git
git branch -M main
git push -u origin main
```

## 2. Create the Render service

1. Go to https://render.com, sign up/log in (GitHub login is easiest).
2. **New +** → **Web Service** → connect the GitHub repo you just pushed.
3. Fill in:
   - **Runtime**: Node
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`
   - **Instance type**: Free is fine to start.
4. Leave the root directory as the repo root (the root `package.json` I
   added handles building `client/` and installing `server/`'s deps).
5. Add an environment variable: `CLIENT_ORIGIN` — you can leave this unset
   for now since the client and server are served from the same origin in
   this setup; CORS only matters if you later split them into two services.
6. Click **Create Web Service**. First deploy takes a few minutes (it's
   running `npm install` + `vite build`).

When it's done, Render gives you a URL like
`https://undercover-game.onrender.com` — that's what you share. Anyone who
opens it lands on the join screen; no separate frontend URL needed.

## 3. Know the free-tier tradeoffs

- Render's free web services **spin down after ~15 minutes of no traffic**
  and take 30–60 seconds to wake back up on the next request. Fine for
  "let's play with friends tonight," annoying if you want it always
  instantly available — upgrade to a paid instance ($7/mo Starter) to avoid
  the cold start.
- In-memory game state (who's in which room) is wiped on every restart/
  redeploy/cold-start-sleep-cycle boundary. That's expected for a casual
  party game; if you want rooms to survive server restarts you'd need to
  move state to Redis — not necessary at this scale.

## 4. Redeploying after changes

Render auto-redeploys on every push to `main` by default. So:

```bash
git add .
git commit -m "some change"
git push
```

...and it rebuilds automatically. Check the Render dashboard's "Logs" tab
if a deploy fails — most common cause is a typo'd import or a dependency
that didn't get added to the right `package.json`.

## 5. Turning on AdSense (after you're live)

1. Apply at https://www.google.com/adsense using your own Google account —
   this has to be you personally; Claude can't create or verify the account.
   Use your Render URL (or custom domain, once you have one) as the site.
2. Approval isn't instant (can take anywhere from a day to a few weeks) and
   isn't guaranteed — Google reviews for content/policy compliance. A
   realtime party game with light UI text may face extra scrutiny for
   "insufficient content"; if rejected, the notice tells you why.
3. Once approved, create an ad unit in the AdSense dashboard — it gives you
   a **publisher ID** (`ca-pub-XXXXXXXXXXXXXXXX`) and an **ad slot ID**.
4. In the Render dashboard → your service → **Environment**, add:
   - `VITE_ADSENSE_CLIENT_ID` = your `ca-pub-...` ID
   - `VITE_ADSENSE_SLOT_ID` = your ad slot ID
5. Uncomment the `<script>` tag in `client/index.html` (it's a single block,
   clearly marked) and uncomment the real line in `client/public/ads.txt`
   (AdSense shows you the exact line to use).
6. Commit, push, redeploy (Render auto-redeploys on push). Ads will start
   appearing on the lobby and game-over screens within a few minutes to
   hours as Google's ad server picks up the change.

## Alternative: two separate deployments

If you'd rather host the frontend on something CDN-backed like Vercel or
Netlify (faster static asset loads, more generous free tier) and the
backend separately on Render/Railway/Fly.io:

- Deploy `server/` alone (root directory `server`, build `npm install`,
  start `npm start`) and set its `CLIENT_ORIGIN` env var to your frontend's
  deployed URL, e.g. `https://your-game.vercel.app`.
- Deploy `client/` alone (root directory `client`, build `npm run build`,
  publish directory `dist`) and set its `VITE_SERVER_URL` env var to your
  backend's deployed URL, e.g. `https://your-game-api.onrender.com`.

This is more moving parts for basically no benefit at this game's scale, so
stick with the single-service setup above unless you have a specific reason
not to.
