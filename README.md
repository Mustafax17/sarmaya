# Sarmaya

An **assumption-free, multi-currency** personal-finance app. It never guesses what you earn, spend, or save — it asks, and every number on screen is either something you told us (clearly labelled) or computed from your own transactions.

- **Client:** Vite + React 18 (JavaScript), `recharts`, `lucide-react`. Inline style tokens + one `GlobalStyle`. No Tailwind, no CSS-in-JS library.
- **Server:** Node + Express (ES modules), SQLite via `better-sqlite3`. Real auth (bcrypt + JWT in an httpOnly cookie). REST API under `/api`, every query scoped to the signed-in user.
- **Theme:** layered smoky-grey (graphite dark / ash light), fog + grain atmosphere, WCAG-AA body text, persisted preference.

## Requirements

- **Node.js 20.9+** (tested on Node 24). npm 9+.

## Install

```bash
# from the repo root — installs root, server and client
npm run install:all
```

## Configure the server

```bash
cd server
cp .env.example .env
# generate a strong secret and paste it into JWT_SECRET:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

`server/.env` needs at least:

```
JWT_SECRET=<a long random string>   # required; the server refuses to start without it
PORT=4000
NODE_ENV=development
```

## Migrate (and optionally seed a demo sandbox)

```bash
npm run migrate          # create/verify the SQLite schema
npm run seed             # ALSO create a labelled demo account with real dated data
```

The demo login is **`demo@sarmaya.app` / `demodemo`** — a self-contained sandbox whose numbers are genuinely computed from seeded transactions (nothing fabricated).

## Run (both halves together)

```bash
npm run dev
```

- API: <http://localhost:4000>
- App: <http://localhost:5173> (the Vite dev server proxies `/api` to the API, so the auth cookie is same-origin)

Open the app, create an account (or use the demo), and go through onboarding.

## Build

```bash
npm run build            # builds the client (client/dist)
```

To serve in production, host `client/dist` behind your web server and run `npm start` (the API) with `NODE_ENV=production` so the session cookie is `Secure`. Point the client's `/api` at the API origin.

## Project layout

```
client/  src/{theme.js, lib/, hooks/, components/, pages/, App.jsx}
server/  index.js, db.js, migrate.js, auth.js, config.js, validate.js, constants.js, routes/
```

## Design guarantees

- **Money is integer minor units** (paisa/cents/yen) end to end — never a float. Converted to major units only at the display edge with `Intl.NumberFormat`.
- **One source of truth** for spending analysis (`client/src/lib/stats.js` → `spendStats`). Every chart, insight and headline derives from it; empty data shows an honest empty state.
- **Self-reported vs computed** figures are visually distinguished ("you told us" tag), and computed data replaces the self-report once it exists.
- **Authorization on every route:** each read and write filters by the session `userId`; fetching another user's row 404s.
- **No currency conversion** — one currency per user; changing it re-labels, never silently converts (that would require live rates we won't fake).
