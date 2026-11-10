# Cricket Auction Night

A public multiplayer cricket player auction. One host runs it, 2 to 10 owners join from their phones with a link. No accounts. One Node service (Express + `ws`), a static front end with no build step, state in memory with a JSON-file backup.

## Run locally

```bash
npm install
npm start          # http://localhost:3000
npm test           # game-logic tests (bid rules, maxBid, sold/unsold, re-auction, base prices)
```

To try it alone, open the host link in one browser window and the share link in a private window (each browser profile is one "person").

## Deploy free on Render (from GitHub)

1. Create a GitHub account if needed, then a new **empty repository** (for example `cricket-auction-night`).
2. Put this folder's contents in it. The simplest way:
   ```bash
   git init && git add . && git commit -m "Cricket Auction Night"
   git branch -M main
   git remote add origin https://github.com/YOUR-NAME/cricket-auction-night.git
   git push -u origin main
   ```
   (`node_modules` and `data` are already in `.gitignore`.)
3. Go to https://render.com, sign up with GitHub, then **New + → Web Service** and pick the repository.
4. Fill in:
   - **Runtime / Language:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
   - Under Advanced, set **Health Check Path** to `/healthz` (optional).
5. Click **Create Web Service** and wait for the log to say `Cricket Auction Night on ...`.
6. Your public URL is shown at the top of the service page, like `https://cricket-auction-night.onrender.com`. WebSockets work on the same URL, so there is nothing else to configure.

Button names on Render can change slightly over time. Any host that runs `npm install` and `npm start` and sets a `PORT` variable works the same way.

## Host a game

1. Open your public URL and tap **Host a new auction**.
2. Set purse, squad size, bid step and 2 to 10 team names. Tick the players you want (Select all, Clear, Pick random N, or add your own as `Name, ROLE, base`). Base prices only allow 0.5, 1, 1.5 or 2. You need at least teams × squad size players.
3. Tap **Create room**. You land in the lobby as host. **Bookmark that page**: the secret host token is in its URL and in your browser, so a refresh or reconnect keeps control.
4. Tap **Copy link** and send it to the owners (WhatsApp, etc). They type a name and tap a team. First tap wins. You can **Release** a team's phone.
5. Tap **Start bidding**. Use Sold / Unsold / Undo. For teams without a phone, tap their paddle and bid for them.

Never share the URL that has `&host=...` in it. Share only the link shown in the lobby.

## Free hosts: read this before game night

- **They sleep when idle.** On Render's free tier a service goes to sleep after about 15 minutes without traffic and takes up to a minute to wake. Open the link a minute before playing.
- **The JSON backup may not survive sleeping.** The backup protects against a crash or restart where the disk is kept. Free instances typically have a temporary disk that resets when the service sleeps, redeploys, or moves. Treat a game as lost if the server sits idle for 15+ minutes mid-auction, and keep a phone open on the page during breaks. For a backup that always survives, use a host with a persistent disk (usually paid) and set `DATA_FILE` to a path on it.
- Rooms are deleted 72 hours after their last activity.

## Environment variables

| Name | Default | Purpose |
|---|---|---|
| `PORT` | 3000 | Set by the host automatically |
| `DATA_FILE` | `./data/rooms.json` | Where the JSON backup is written |

## Files

- `server.js`: HTTP + WebSocket, rooms, permissions, JSON backup
- `logic.js`: all auction rules (the server is authoritative; clients only send intents)
- `test.js`: logic tests
- `public/`: `index.html`, `style.css`, `app.js`, `players.js` (the 100 players)

Base prices are custom tiers for this game, not official IPL base prices. Roles are each player's main role.
