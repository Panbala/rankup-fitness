# Rankup Fitness (full stack)

Gamified daily fitness tracker: wake up on time, drink water, train, sleep on schedule.
Clear quests to earn XP, level up, and raise your rank (E to S).

This is the full-stack version of the single-file Rankup Fitness page. The old page kept
everything in the browser (`localStorage`). Now accounts and progress live on a server, so
you can log in from any phone or laptop, and the game rules run on the server so they
cannot be edited from the browser.

## Run it

Needs **Node 22.13 or newer**. No `npm install` is needed: there are zero dependencies.

```bash
npm start            # http://localhost:3000
npm test             # 17 tests (game rules + API)
npm run dev          # restart on file changes
```

Settings (all optional environment variables):

| Variable      | Default            | Meaning                                              |
| ------------- | ------------------ | ---------------------------------------------------- |
| `PORT`        | `3000`             | Port to listen on                                    |
| `DB_FILE`     | `./data/rankup.db` | SQLite database file                                 |
| `AUTH_SECRET` | generated          | Secret that signs login tokens (kept in `data/secret.key` when not set) |

## Folder map

```
server/
  index.js     start-up, HTTP server, security headers, rate limit
  http.js      JSON body reader, error type, static file server
  routes.js    every API route in one list
  service.js   loads a player, runs one action, saves, builds the response
  game.js      ALL game rules (XP, levels, ranks, penalties). No database, no HTTP
  db.js        SQLite tables and queries
  auth.js      password hashing (scrypt) and signed login tokens
  time.js      timezone helpers (the quest day resets at 4 AM local time)
public/
  index.html   page shell
  styles.css   the Rankup look
  js/app.js    controller: state, clicks, timers (alarm and reminders)
  js/views.js  screens as HTML strings
  js/api.js    fetch wrapper for the API
  js/ui.js     toasts, overlays, alarm sound
  js/format.js small formatting helpers
test/
  game.test.js unit tests for the rules
  api.test.js  end-to-end tests against a real server
```

## How a request flows

`click "Done"` -> `POST /api/quests/exercise` -> `routes.js` -> `service.act()` ->
`game.completeExercise()` changes the player -> saved in one database transaction ->
server replies with the new state plus `events` ("+15 XP", "level up") -> `app.js` draws it.

The browser never calculates XP. It only displays what the server returns.

## API

All routes except register and login need the header `Authorization: Bearer <token>`.
Every successful response is JSON. Errors are `{ "error": "message" }`.

| Method | Path                      | Body                                              | Does                                   |
| ------ | ------------------------- | ------------------------------------------------- | -------------------------------------- |
| POST   | `/api/auth/register`      | `name, email, password, tz`                       | Create account, returns `token`        |
| POST   | `/api/auth/login`         | `email, password`                                 | Returns `token`                        |
| GET    | `/api/me`                 |                                                   | Full state to draw the app             |
| PUT    | `/api/me/profile`         | `age, gender, height, weight, act, goal, wake, bed, water, tz` | Onboarding or edit data  |
| PUT    | `/api/me/plan`            | any of `wake, bed, water, alarm, remind`          | Change schedule and alerts             |
| POST   | `/api/quests/wake`        |                                                   | Log wake up (+20 XP on time)           |
| POST   | `/api/quests/water`       | `ml` (for example 250, 500 or -250)               | Add or remove water                    |
| POST   | `/api/quests/exercise`    | `id` = `push`, `squat`, `sit` or `run`            | Mark a training set done               |
| POST   | `/api/quests/sleep`       |                                                   | Log going to bed (from 6 PM)           |
| POST   | `/api/me/dismiss-notice`  |                                                   | Hide the penalty message               |
| POST   | `/api/me/reset`           |                                                   | Reset level, XP and history            |

## Game rules (in `server/game.js`)

- Quests: wake on time +20 XP, water goal +30, each of 4 training sets +15, sleep on time +25.
  Clearing all 4 quests gives +50 bonus XP and +1 day streak.
- Level `n` needs `150 + (n-1) * 60` XP. A level up gives +1 to every stat.
- Power = `level * 40 + (STR + AGI + VIT + INT + SENSE) * 6`.
- Ranks: E (1), D (5), C (10), B (20), A (35), S (50).
- Missing the daily clear breaks the streak. Finishing fewer than 2 quests also costs 40 XP.

## Putting it online

It is one Node process plus one SQLite file, so any small host works (Render, Railway,
Fly.io, a VPS). Set `AUTH_SECRET`, keep `DB_FILE` on a persistent disk, and put it behind
HTTPS (the host usually does this). Back up the `.db` file to back up everything.

## Ideas to build next

- Push notifications so the alarm works when the page is closed (service worker + Web Push)
- Weekly leaderboard or friends (add a `friends` table and a `/api/leaderboard` route)
- Body weight log and a progress chart
- Move to Postgres if you need many servers (only `db.js` has to change)
