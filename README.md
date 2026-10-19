# 🐣 AP Life Quest

A private, cute pixel-RPG for your real life. Log your weight, calories, CSD hours and habits, clear daily quests, earn **AP** (Achievement Points) and **XP**, level up a pet called Mochi, and spend AP on real-life rewards in the AP Shop. Slack off and you lose HP, and the Calorie Court sends you a bill.

It runs as a website (laptop + iPhone home-screen app), only you can log in, and it costs **$0/month** on Cloudflare's free tier.

---

## Contents

1. [How the game works](#1-how-the-game-works)
2. [A day in the life (how to use it)](#2-a-day-in-the-life)
3. [First-time setup (≈10 minutes)](#3-first-time-setup)
4. [Install on your iPhone](#4-install-on-your-iphone)
5. [Updating the app](#5-updating-the-app)
6. [Rolling back: code, data, or both](#6-rolling-back)
7. [Resets: New Game+ and Factory reset](#7-resets)
8. [Making it yours: adding new things](#8-making-it-yours)
9. [Security](#9-security)
10. [Costs and free-tier limits](#10-costs-and-limits)
11. [Local development](#11-local-development)
12. [Project structure](#12-project-structure)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. How the game works

| Thing | What it means |
|---|---|
| **AP** 🪙 | Your currency. Earned from quests, chests, achievements, goals and sprints. Spent in the AP Shop. |
| **XP** ⭐ | Never spent. Fills your level bar. Level 1→2 needs 100 XP, then +50 more per level. |
| **HP** ❤️ | Your discipline health (max 100). Missed dailies hurt; completing quests heals a little; a perfect day heals 10; levelling up fully heals. |
| **Level & title** | Sprout → Wanderer → Apprentice → Adventurer → Knight → Ranger → Champion → Hero → Guardian → Legend → Mythic… |
| **Pet** | Mochi hatches from an egg and evolves at levels 3, 10, 20 and 35. Mood follows your HP and today's effort. Tap Mochi to change hats/colour. |
| **Streak** 🔥 | +1 for each day you finish ≥ 80% of your dailies. Each streak day adds +2% AP to every quest (max +50%). Streak milestones (3, 7, 14, 30, 60, 100) drop chests. |
| **Critical hits** | 10% of quest completions pay **double AP**. Fixed per quest per day, so undo/redo can't re-roll it. |
| **Chests** 🎁 | Drop on level-ups, perfect days (35% chance), streak milestones, gold/platinum achievements, sprint wins (epic) and goals (legendary). Open them for AP, XP, hats and free items. Level-up and goal rewards are paid once per season, so undo/redo can't farm them. |
| **Fainting** 😵 | If HP hits 0, Mochi faints: you lose 10% of your AP (min 20), your streak resets, and quests pay half until you complete **3 quests** to revive. |

### Quest types

- **Dailies:** due on chosen weekdays. Unfinished ones cost HP when the day closes. Many tick themselves: log your weight and "Morning weigh-in" completes; log calories ≤ budget and "Stay within calorie budget" completes. If you later correct the number, the quest un-ticks.
- **Weeklies:** do N times per week (checked Sunday night).
- **Habits:** tap any time. Good ones pay (e.g. *MU coaching* pays 10 AP **per hour**, the old G-Scheme rebate); bad ones cost AP + HP (e.g. *bubble tea*).
- **To-dos:** one-off quests, no penalty.

### When does a day "close"?

The game day starts at **4 am** (so 1 am still counts as yesterday). You get a **12-hour grace period**: yesterday stays open until **4 pm today**. Until then the Camp page shows a *Today / Yesterday* switch so you can catch up the morning after. When a day closes, the app:

1. deducts HP for missed dailies (and missed weeklies on Sundays),
2. updates the streak (a 🛡️ Streak Shield in your bag saves it once),
3. heals you +10 HP on a perfect day (and maybe drops a chest),
4. auto-bills any unsettled Calorie Court cases,
5. ends any sprint that ran out of time,
6. shows you a "While you were away" report next time you open the app.

Days are processed when you open the app, so nothing needs to run in the background. Each day can only ever be scored once, even if your phone and laptop open the app at the same moment.

### ⚖️ The Calorie Court (your waiver-ticket rule)

When a day's calories land in a waiver band (3000–3999, 4000–4999, 5000–5999, 6000+), the matching **Calorie Waiver Ticket** (×3 tax) is required. Before the day closes you can settle it in **Shop → Court**:

- use a ticket you already own,
- buy one now (vouchers allowed, e.g. SGH ROCKS −90%). Buying and using a waiver ticket from the Shop also settles the case, or
- grant an exception (honour system: for genuine cases only).

If you ignore it, it is **auto-billed at full taxed price**, with no vouchers, and that can push your AP negative.

### Vouchers

All 15 of your vouchers are pre-loaded. Some have an **automatic check** the app enforces:

| Voucher | Auto-check |
|---|---|
| DO THE HUSTLE! | AP earned this month ≥ 600 (once per month) |
| LIFELONG LEARNING | ≥ 42h CSD this week |
| 1080H OF FASTING | ≥ 1,080 fasting hours logged in total (use the fasting timer) |
| 55KG + 1800kcal 30EMA | latest weight ≤ 55 and 30-day calorie EMA ≤ 1,800 (once per season) |
| Stress Relief | calories (today/yesterday) ≤ 2,267, massage only |

The rest use the **honour system**: the condition is shown and you tick "I honestly meet this". Leap Passes allow no vouchers at all.

---

## 2. A day in the life

1. **Morning:** open the app. Read the overnight report. Weigh in (Camp → Quick log). The weigh-in quest ticks itself.
2. **During the day:** tap **+0.5 / +1 / +2** for CSD hours. Start the **fasting timer** when you start a fast. Tap habits as they happen (coaching hours, bonus workouts, the odd bubble tea…).
3. **Evening:** enter the day's total calories (one box, one tap). Tick "Move for 30 minutes". Open any chests.
4. **Treat yourself** in the Shop when you've earned it. Use items from your Bag when you actually enjoy them (massage, trip…).
5. **Weekly:** check Body (weight trend, BMI, 30-day EMA) and Journey (goals, sprint boss, upcoming trips).

---

## 3. First-time setup

You need:

- A computer with **Node.js 20+** (already installed on this PC: v24).
- A free **Cloudflare account**: <https://dash.cloudflare.com/sign-up> (no card needed for this app).

Then, in a terminal in this folder:

```bash
npm install
npm run setup
```

`npm run setup` will:

1. open a browser so you can log in to Cloudflare and click **Allow**,
2. create your private database (`ap-life-quest-db`) and save its ID in `wrangler.jsonc`,
3. run the checks and tests, build, apply the database schema (answer **y**), and deploy,
4. ask you to choose your **password** (min 10 characters; a passphrase like `mochi-eats-salad-55kg` is great),
5. offer to turn on **2FA codes** (recommended).

At the end you'll see your site address, something like `https://ap-life-quest.<your-name>.workers.dev`. Bookmark it.

> Commit the updated `wrangler.jsonc` afterwards (`git commit -am "Configure database"`). It only contains the database ID, which isn't a secret.

---

## 4. Install on your iPhone

1. Open your site in **Safari** and log in.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Launch it from the home screen. It opens full-screen like a real app, and stays logged in for 30 days (refreshed every time you use it).
4. Let iPhone save your password (and your 2FA code: Settings → Passwords → the entry → *Set Up Verification Code*), so logging in is one tap.

On the laptop, just use the website (or install it from Chrome/Edge's address-bar "Install app" button).

---

## 5. Updating the app

Every change is versioned three ways: **git** (your code history), **Cloudflare Worker versions** (every deploy is kept), and **save points** (your data).

```bash
# 1. make your changes (or ask Claude Code to)
npm run dev              # try it locally (see section 11)
# 2. bump "version" in package.json if you like, then save the change in git
git add -A && git commit -m "Add sleep quest"
git tag v1.1.0           # optional, makes rollback easy
# 3. ship it
npm run deploy           # typecheck + tests → build → migrate DB → deploy
```

`npm run deploy` refuses to ship if type checks or tests fail. The version shows in **Settings → Security & about** and at the bottom of the laptop sidebar.

**Database changes:** add a new file in `migrations/` (e.g. `0002_add_mood.sql`). Only ever **add** tables or columns (with defaults); never drop or rename. That way an older app version still works on the newer database, which keeps code rollbacks safe.

---

## 6. Rolling back

### Undo one mistake (most common)

- **Quest ticked by accident?** Tap it again (or the ↩ button).
- **Anything else?** Open **📜 Log**, find the entry, tap **↩ Void**. The AP/XP/HP are reversed (and quest/purchase records removed). Undoing whatever knocked Mochi out also undoes the faint. A purchase you've already used from your bag can't be refunded; use ± Adjust instead.
- **Need a manual fix?** Log → **± Adjust** (e.g. one-off rebates).

### Roll back the data (your game save)

- **In the app:** Settings → **Save points** → **Load**. A save point is made automatically every week and before every reset, restore or import, and the current game is saved before loading, so loading is itself undoable.
- **Download a backup file:** Settings → **⬇ Download backup** (JSON). Restore with **⬆ Import backup**.
- **Full database dump to your PC:** `npm run backup` → `backups/live-YYYY-MM-DD-HH-MM.sql` (git-ignored).
- **Cloudflare Time Travel** (point-in-time restore, last 7 days on the free plan):

  ```bash
  npx wrangler d1 time-travel info ap-life-quest-db --timestamp=2026-10-20T08:00:00+08:00
  npx wrangler d1 time-travel restore ap-life-quest-db --timestamp=2026-10-20T08:00:00+08:00
  ```

### Roll back the code (the app itself)

```bash
npm run versions         # list recent deployments
npm run rollback         # roll back to the previous version (asks to confirm)
```

Or in the Cloudflare dashboard: **Workers & Pages → ap-life-quest → Deployments → ⋯ → Rollback**. Rolling back code does **not** touch your data.

To redeploy an older tagged version from git: `git checkout v1.0.0 && npm run deploy && git checkout main`.

---

## 7. Resets

For when discipline slipped and you want a clean slate. Both are in **Settings → Danger zone**, both need you to type a confirmation, and both create a save point first, so they're reversible.

| | 🌱 **New Game+** (season reset) | 🧨 **Factory reset** |
|---|---|---|
| AP, XP, level, HP, streak | reset | reset |
| Inventory, achievements, chests | reset (achievements can be re-earned) | wiped |
| Quests, trackers, shop, vouchers, rules | **kept** | back to starter content |
| Weight/calorie/CSD history | **kept** | wiped |
| Old season | archived in the 🏛️ **Hall of Fame** with its stats | gone (except in the save point) |

New Game+ is the "fresh start, same you" button. Factory reset is the nuclear option.

---

## 8. Making it yours

Almost everything is editable **inside the app**, no code needed:

| What | Where |
|---|---|
| Quests (dailies/weeklies/habits/to-dos, rewards, penalties, days, auto-complete from a tracker) | Quests → ＋ New / edit |
| Trackers (anything: sleep, steps, water, push-ups, BP…; per-day value or adds-up; target; direction) | Body → ＋ Tracker (Sleep & Water are pre-made but hidden) |
| Shop items (price, ×tax, vouchers allowed, auto-required by a tracker band, level lock, effects) | Shop → ＋ New shop item / ✎ |
| Vouchers (discount, scope, limits, automatic check) | Shop → Vouchers |
| Achievements (19 rule types, or "claim manually") | Trophies → ＋ Custom achievement |
| Life goals (milestones, tracker target, or manual %) | Journey → Goals |
| Sprints (boss raids with damage tasks) | Journey → Sprints |
| Events, trips & memories (countdowns + timeline) | Journey → Events |
| Game rules (crit chance, streak bonus, HP, faint penalty, grace hours, day start…) | Settings → Game rules |
| Name, pet name, height (for BMI), birthday, timezone, theme, sound | Settings |

### Rule reference

**Achievement rules:** `quests_done`, `streak`, `level`, `perfect_days`, `metric_days`, `metric_total`, `metric_week_sum`, `under_target_streak`, `metric_target`, `weight_lost`, `bmi_below`, `purchases`, `ap_balance`, `chests_opened`, `crits`, `sprints_won`, `goals_done`, `revives`, `manual`.

**Voucher rules (JSON):** `{"t":"month_earned","min":600}`, `{"t":"metric_week_sum","metric":"csd","min":42}`, `{"t":"metric_total","metric":"fasting","min":1080}`, `{"t":"metric_recent","metric":"calories","max":2267}`, `{"t":"metric_latest","metric":"weight","max":55}`, `{"t":"metric_ema","metric":"calories","period":30,"max":1800}`, `{"t":"birthday"}`, and `{"t":"all","rules":[…]}` to combine.

**Shop item effects:** `heal:30` (potion), `rest_day` (no penalties today, streak frozen), `streak_freeze` (auto-used shield).

### Adding a brand-new feature in code

1. **Database:** new migration in `migrations/` (additive only).
2. **Server:** game logic lives in `worker/` (`game.ts` is the engine; `index.ts` lists every API route). To make a new column editable, add it to the whitelist in `worker/crud.ts`.
3. **UI:** pages are in `src/pages/`; the generic editor's field list is in `src/components/Editor.tsx`.
4. `npm run check` → `npm run dev` → `npm run deploy`.

---

## 9. Security

- **Only you can get in.** Every `/api` call except login needs a valid session; the page shell holds no personal data.
- **Password:** stored only as a salted PBKDF2-SHA256 hash in an encrypted Cloudflare secret, never in the code or database. Change it any time: `npm run set-password`.
- **2FA (optional):** standard 6-digit TOTP codes (iPhone Passwords, Google Authenticator, 1Password…). `npm run setup-2fa` to enable, `npm run setup-2fa -- --off` to disable.
- **Brute-force lock-out:** 5 wrong tries from one IP locks that IP out for 15 minutes (with a global backstop of 40 wrong tries per 15 minutes).
- **Sessions:** random 256-bit tokens in `HttpOnly`, `Secure`, `SameSite=Lax`, `__Host-` cookies; only a SHA-256 hash is stored server-side. 30-day sliding expiry. **Settings → Log out everywhere** kills every session (e.g. lost phone).
- **CSRF:** every write must carry a custom header and a same-origin `Origin`, so other sites can't act on your behalf.
- **Hardening headers:** strict Content-Security-Policy, no framing, `nosniff`, no referrer, HSTS, and `noindex` (search engines are told to stay away).
- **Secrets never committed:** `.dev.vars`, `backups/` and your old `.xlsx` files are git-ignored.

*Why only 10k PBKDF2 iterations?* The Worker free plan allows ~10 ms of CPU per request. The hash lives in an encrypted secret (an attacker would need your Cloudflare account to get it), and online guessing is stopped by the lock-out, so a long passphrase plus 2FA is what really protects you.

*Extra layer (optional):* you can put [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/) (free for up to 50 users) in front of the site for email-code login at the edge as well.

---

## 10. Costs and limits

Everything fits in Cloudflare's **free** plan:

| Resource | Free allowance | This app (typical day) |
|---|---|---|
| Worker requests | 100,000 / day | ~100–300 |
| Static assets (the UI) | unlimited, free | – |
| D1 storage | 5 GB | a few MB per year |
| D1 rows read | 5 million / day | ~0.3–2 million (grows slowly with history) |
| D1 rows written | 100,000 / day | ~100s |
| Time Travel | 7 days | – |

If you ever outgrow it, **Workers Paid is US$5/month** (25 billion rows read, 30-day Time Travel). No code changes needed.

---

## 11. Local development

```bash
npm install
npm run set-password -- --local   # writes .dev.vars (local only)
npm run db:migrate:local          # create the local SQLite database
npm run dev                       # http://localhost:5173 (UI + API, hot reload)
```

Useful commands:

| Command | What it does |
|---|---|
| `npm run check` | Type-check (UI + Worker) and run unit tests |
| `npm run test` | Unit tests only (`tests/`) |
| `npm run test:api` | 30 end-to-end API checks against `npm run dev` (resets the **local** game) |
| `npm run build` | Production build into `dist/` |
| `npm run deploy` | check → build → migrate remote DB → deploy |
| `npm run versions` / `npm run rollback` | List / roll back deployments |
| `npm run backup` (`-- --local`) | SQL dump of the live (or local) DB into `backups/` |
| `npm run set-password` / `npm run setup-2fa` | Security |
| `npm run icons` | Re-render the home-screen icons from the pet sprite |

The local database lives in `.wrangler/state` (git-ignored). Delete that folder and re-run `npm run db:migrate:local` for a fresh one.

---

## 12. Project structure

```
├── migrations/          D1 (SQLite) schema — additive migrations only
├── worker/              Cloudflare Worker API (Hono)
│   ├── index.ts         routes, auth gate, CSRF + security headers
│   ├── auth.ts          password, TOTP, sessions, lock-out
│   ├── game.ts          engine: rewards, crits, quests, trackers, closing days, fainting
│   ├── economy.ts       shop, vouchers, bag, calorie court, chests
│   ├── progress.ts      goals, milestones, sprints
│   ├── achievements.ts  stats + achievement rules
│   ├── state.ts         builds the full game state for the UI
│   ├── crud.ts          whitelisted create/update/delete for all config
│   ├── backup.ts        save points, export/import, New Game+, factory reset
│   └── seed.ts          starter quests, trackers, shop, vouchers, achievements
├── shared/              logic used by both sides (levels, dates, pricing, BMI/EMA, rules)
├── src/                 React UI (pages/, components/, pixel sprites, sounds, effects)
├── public/              icons, manifest, security headers, robots.txt
├── scripts/             setup, password, 2FA, backup, icon generator
└── tests/               unit tests (vitest)
```

---

## 13. Troubleshooting

| Problem | Fix |
|---|---|
| "No password set yet" on the login page | `npm run set-password` (live) or `npm run set-password -- --local` (dev) |
| Locked out after wrong passwords | Wait 15 minutes. |
| Forgot password | `npm run set-password` sets a new one (needs your Cloudflare login on the PC). |
| Lost the 2FA device | `npm run setup-2fa -- --off`, log in, then `npm run setup-2fa` again. |
| Lost/stolen phone | Settings → Log out everywhere (from the laptop), then change the password. |
| A day was scored unfairly (sick, public holiday) | Log → void the penalty entry. For planned rest, buy a 🏖️ Rest Day Pass. |
| Something broke after an update | `npm run rollback` (code) and/or Settings → Save points → Load (data). |
| `npm run deploy` fails on migrations | Make sure `wrangler.jsonc` has your real `database_id` (run `npm run setup` once). |
| Away for weeks | Only the last 14 days are scored when you return, so it won't be a total wipe-out. |

---

*Fonts: [Jersey 10](https://fonts.google.com/specimen/Jersey+10) and [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P), SIL Open Font License. Pixel art, sounds and game design made for this project.*
