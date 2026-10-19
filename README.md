# 🐣 AP Life Quest

A cute pixel-RPG for your real life. Log your weight, calories, focus hours and habits, clear daily quests, earn **AP** (Achievement Points) and **XP**, raise a pet that evolves as you level up, and spend AP on real-life rewards in the AP Shop. Slack off and you lose HP, and the Calorie Court sends you a bill.

It runs as a website (laptop + iPhone home-screen app). It's **invite-only**: you're the owner, and anyone you invite gets their own private account with their own characters. It costs **$0/month** on Cloudflare's free tier.

---

## Contents

1. [How the game works](#1-how-the-game-works)
2. [A day in the life](#2-a-day-in-the-life)
3. [Accounts, characters and invites](#3-accounts-characters-and-invites)
4. [Make it yours: looks, pictures, notes and links](#4-make-it-yours-looks-pictures-notes-and-links)
5. [First-time setup (≈10 minutes)](#5-first-time-setup)
6. [Upgrading from v1](#6-upgrading-from-v1)
7. [Install on your iPhone](#7-install-on-your-iphone)
8. [Updating the app](#8-updating-the-app)
9. [Rolling back: code, data, or both](#9-rolling-back)
10. [Resets: New Game+ and Factory reset](#10-resets)
11. [Adding new things](#11-adding-new-things)
12. [Security](#12-security)
13. [Costs and free-tier limits](#13-costs-and-limits)
14. [Thinking of going commercial?](#14-thinking-of-going-commercial)
15. [Local development](#15-local-development)
16. [Project structure](#16-project-structure)
17. [Troubleshooting](#17-troubleshooting)

---

## 1. How the game works

| Thing | What it means |
|---|---|
| **AP** 🪙 | Your currency. Earned from quests, chests, achievements, goals and sprints. Spent in the AP Shop. |
| **XP** ⭐ | Never spent. Fills your level bar. Level 1→2 needs 100 XP, then +50 more per level. |
| **HP** ❤️ | Your discipline health (max 100). Missed dailies hurt; completing quests heals a little; a perfect day heals 10; levelling up fully heals. |
| **Level & title** | Sprout → Wanderer → Apprentice → Adventurer → Knight → Ranger → Champion → Hero → Guardian → Legend → Mythic… |
| **Pet** | Hatches from an egg and evolves at levels 3, 10, 20 and 35. Mood follows your HP and today's effort. |
| **Streak** 🔥 | +1 for each day you finish ≥ 80% of your dailies. Each streak day adds +2% AP to every quest (max +50%). Milestones (3, 7, 14, 30, 60, 100) drop chests. |
| **Critical hits** | 10% of quest completions pay **double AP** (fixed per quest per day, so undo/redo can't re-roll it). |
| **Chests** 🎁 | Drop on level-ups, perfect days, streak milestones, gold/platinum achievements, sprint wins and goals. Open them for AP, XP, hats, scenes and free items. Level-up and goal rewards are paid once per season, so undo/redo can't farm them. |
| **Fainting** 😵 | If HP hits 0 your pet faints: you lose 10% of your AP (min 20), your streak resets, and quests pay half until you complete **3 quests** to revive. Undoing whatever knocked you out undoes the faint. |

**Quest types**

- **Dailies:** due on chosen weekdays; missing one costs HP when the day closes. Many tick themselves when you log a tracker (weigh-in, calories ≤ budget, CSD ≥ 6 h…).
- **Weeklies:** do N times a week.
- **Habits:** tap any time. Good ones pay (e.g. *coaching* pays per hour); bad ones cost AP + HP.
- **To-dos:** one-offs.

**When does a day close?** The game day starts at **4 am**. Yesterday stays open until **4 pm** (12 h grace) so you can catch up in the morning. Closing applies missed-quest damage, the streak, perfect-day healing, Calorie Court auto-billing and sprint deadlines, then shows a "While you were away" report. Each day can only ever be scored once, even if your phone and laptop open the app at the same moment.

**⚖️ Calorie Court:** a day in a waiver band (3000–3999, 4000–4999…) requires that Calorie Waiver Ticket (×3 tax). Settle it in **Shop → Court**:

- use a ticket from your bag,
- buy one (vouchers allowed). Buying and using a waiver ticket from the Shop also settles the case, or
- grant an exception.

If you ignore it, it's auto-billed at full price.

**Vouchers** can have automatic checks (AP earned this month, CSD this week, fasting total, weight + 30-day calorie EMA, recent calories, birthday…) or use the honour system.

---

## 2. A day in the life

1. **Morning:** open the app and read the overnight report. Weigh in (Camp → Quick log); the weigh-in quest ticks itself.
2. **During the day:** tap **+0.5 / +1 / +2** for focus or CSD hours, start the **fasting timer**, and tap habits as they happen.
3. **Evening:** enter the day's calories (one box), tick what you did, open chests.
4. **Treat yourself** in the Shop, and use rewards from your Bag when you enjoy them.
5. **Weekly:** check Body (weight trend, BMI, 30-day EMA) and Journey (goals, sprint boss, upcoming trips).

---

## 3. Accounts, characters and invites

- **Your account** = your login (username + password, optional 2FA). Manage it under **Account**.
- **Characters** = separate games, like save files. Each has its own name, pet, looks, quests, shop, trackers, history, pictures and save points. Switch with **Characters** ("Choose your save"). You can have up to 10; members get 3 by default.
- **New character wizard:** name → design your pet → pick a starting template:
  - **Healthy-life starter**: water, sleep, movement, focus, and everyday rewards. For anyone.
  - **Anson's original**: your full v1 setup (CSD, calorie court, your 15 vouchers). Owner only.
  - **Copy one of your characters**: the same quests, trackers, shop and vouchers, with fresh progress.
  - **Blank**: build everything yourself.
- **Inviting someone (owner):** **Admin → Invite someone** → send the link. Each invite works once and expires (default 14 days). In Admin you can also set someone's character limit, disable an account, or give them a temporary password.
- **Privacy:** every character lives in its **own separate database**. Nobody, including you as owner, can open someone else's characters through the app.

---

## 4. Make it yours: looks, pictures, notes and links

**🎀 Wardrobe** (tap your pet on the Camp page):

| | Options | How to get them |
|---|---|---|
| Species | Neko (cat), Mochi blob, Usagi (bunny), Kuma (bear), Dino | free |
| Eyes | Classic, Big & shiny, Sparkly | free |
| Colour | 9 presets **or any colour** you pick | free |
| Hats | Beanie (free), Headband (Lv 5), Party hat (Lv 10), Flower (Lv 15), Wizard (Lv 25), Crown (Lv 40), Bow & Coach cap (chest drops) | level up / chests |
| Face | Round glasses (free), Cool shades (chest) | free / chests |
| Scene | Meadow & Beach (free), City Lights (Lv 8), Sakura Park (Lv 12), Moon Base (Lv 20) | level up / chests |

Chests can drop locked items early.

**🖼️ Pictures:** you can add pictures to quests, events, goals, shop items, vouchers, achievements and sprint bosses. When adding one you choose:

- **📷 Photo**: resized on your phone to keep it small, or
- **👾 Pixel art**: turns any picture into a crunchy 8-bit icon that matches the game.

The first picture is the icon or cover; tap ⭐ on another to make it the cover. Events become a photo **timeline of memories**, and goals get a **vision board**. Each character can store 150 MB of pictures, and **Settings → Pictures** shows usage and can remove unused ones.

**📝 Notes** support `**bold**`, `*italic*`, `- lists` and links.

**🔗 Links** (workout videos, maps, booking pages…) show as a button on the quest, event or goal card.

---

## 5. First-time setup

You need **Node.js 20+** (already on this PC) and a free **Cloudflare account** (<https://dash.cloudflare.com/sign-up>). In a terminal in this folder:

```bash
npm install
npm run setup
```

This logs you in to Cloudflare in the browser, creates the database, checks, builds and deploys, then asks for a **setup password** (and offers 2FA).

Open the site address it prints (`https://ap-life-quest.<you>.workers.dev`). The first visit shows **Claim your castle**: enter the setup password and choose your owner username and password. Then create your first character. Commit the updated `wrangler.jsonc` afterwards (it holds the database ID, which isn't secret).

---

## 6. Upgrading from v1

If v1 is already deployed and you've been logging in it:

1. In the main project folder: `git merge v2` (your `wrangler.jsonc` there already has the real database ID).
2. `npm install`, then `npm run deploy`. It adds the accounts tables and leaves your v1 data untouched.
3. Open the site and click **Claim your castle**. The setup password is your **v1 password**, and if you had 2FA in v1, your current code (it keeps working for your new owner account).
4. On **Choose your save**, click **Import** on the "Your v1 save is waiting" banner. Everything you logged becomes your first character.

---

## 7. Install on your iPhone

Open the site in **Safari** → **Share** → **Add to Home Screen**. It opens full-screen, stays logged in for 30 days (refreshed as you use it), and iPhone can save your password and 2FA codes (Settings → Passwords).

---

## 8. Updating the app

```bash
npm run dev              # try changes locally (section 15)
git add -A && git commit -m "Describe the change"
git tag v2.1.0           # optional: easy rollback point
npm run deploy           # typecheck + tests → build → migrate DB → deploy
```

**Database changes:** only ever **add** tables or columns (with defaults); never drop or rename. That keeps code rollbacks safe.

- Account tables: new file in `migrations/`.
- Character tables: new file in `worker/schema/`, plus one line in the `SCHEMA` list in `worker/character.ts`. Every character upgrades itself automatically the next time it's opened.

---

## 9. Rolling back

**Undo one mistake:**

- tap the quest again, or
- **📜 Log → ↩ Void** (AP/XP/HP reversed), or
- **± Adjust** for manual corrections.

**Roll back a character's data:**

- **Settings → Save points → Load**. A save point is made weekly and before every reset, import or load.
- **⬇ Download backup** / **⬆ Import backup** (a JSON file; pictures aren't included in the file).

**Roll back the code:**

```bash
npm run versions         # recent deployments
npm run rollback         # back to the previous version
```

Or use the Cloudflare dashboard: **Workers & Pages → ap-life-quest → Deployments → Rollback**. Rolling back code never touches data. To redeploy an older tag: `git checkout v1.0.0 && npm run deploy`.

**Account database:** `npm run backup` saves a SQL dump. For a point-in-time restore over the last 7 days:

```bash
npx wrangler d1 time-travel restore ap-life-quest-db --timestamp=<time>
```

---

## 10. Resets

Both are in **Settings → Danger zone** (per character). Both need you to type a confirmation and make a save point first.

| | 🌱 **New Game+** | 🧨 **Factory reset** |
|---|---|---|
| AP, XP, level, HP, streak, inventory, achievements | reset | reset |
| Quests, trackers, shop, vouchers, rules | **kept** | back to the template |
| Tracker history | **kept** | wiped |
| Old season | archived in the 🏛️ Hall of Fame | gone (except in the save point) |

To start over completely, create a new character (or delete one under **Characters**).

---

## 11. Adding new things

**In the app (no code):**

- quests, trackers, shop items, vouchers, achievements (19 rule types or "claim manually"), goals, sprints and events, all with pictures, notes and links;
- game rules (crit chance, streak bonus, HP, faint penalty, day start, grace hours);
- profile and looks.

**Voucher rule JSON:**

```
{"t":"month_earned","min":600}
{"t":"metric_week_sum","metric":"csd","min":42}
{"t":"metric_total","metric":"fasting","min":1080}
{"t":"metric_recent","metric":"calories","max":2267}
{"t":"metric_latest","metric":"weight","max":55}
{"t":"metric_ema","metric":"calories","period":30,"max":1800}
{"t":"birthday"}
{"t":"all","rules":[…]}
```

**Shop item effects:** `heal:30`, `rest_day`, `streak_freeze`.

**In code:**

- Game engine: `worker/game.ts`. Game routes: `worker/game/api.ts`. Accounts and admin: `worker/index.ts`.
- Make a new column editable: add it in a migration, then to the whitelist in `worker/crud.ts` and the field list in `src/components/Editor.tsx`.
- New pet hats or faces: `shared/petgrid.ts` (pixel grids) and `shared/levels.ts` (unlock rules).
- New templates: `worker/seed.ts`.

---

## 12. Security

- **Invite-only:** the owner is created once with the setup password; everyone else needs a single-use, expiring invite code (stored hashed).
- **Passwords:** salted PBKDF2-SHA256 hashes. **Optional 2FA** (TOTP) per user, set up with a QR code under Account.
- **Lock-outs:**
  - 5 wrong logins per IP per 15 min;
  - 10 per username;
  - a 40-per-15-min global backstop.

  Login timing doesn't reveal which usernames exist.
- **Sessions:** random 256-bit tokens in `HttpOnly`, `Secure`, `SameSite=Lax`, `__Host-` cookies, stored hashed, with a 30-day sliding expiry. Changing your password logs out your other devices; **Log out everywhere** is in Account. Disabled accounts are locked out immediately.
- **Isolation:** each character is its own Durable Object database. Every request is checked for login and ownership before it's forwarded, and the internal operations can't be reached from the internet.
- **Pictures:** only JPEG, PNG, WebP or GIF, checked by their actual bytes (no SVG or HTML), max 1.5 MB, served with `nosniff` and a locked-down Content-Security-Policy.
- **Notes** are rendered without HTML, and links must be `http(s)`.
- **CSRF guard** (custom header + same-origin check), strict security headers, and `noindex` so search engines stay away.
- **Secrets never committed:** `.dev.vars`, `backups/` and your `.xlsx` files are git-ignored.

**Recovery:**

- A member forgot their password → **Admin → Reset password**.
- You (owner) forgot yours, or lost your 2FA phone → `npm run reset-owner` (needs your Cloudflare login on this PC).

---

## 13. Costs and limits

Everything fits Cloudflare's **free** plan for you plus a handful of invited people:

| Resource | Free allowance |
|---|---|
| Requests (Worker + character databases) | 100,000 / day |
| Storage (account DB + all characters) | 5 GB total |
| Account DB rows read / written | 5 M / 100 k per day |
| Pictures | 150 MB per character (app limit) |

Beyond roughly 20–50 active players, move to **Workers Paid (US$5/month)**. No code changes are needed.

---

## 14. Thinking of going commercial?

The architecture is already multi-tenant (a private database per character), so scaling up is mostly *product* and *legal* work rather than a rewrite. Before taking strangers or payments:

1. **Personal data law (Singapore PDPA):** weight, BMI, blood pressure and calories are sensitive health data. You'd need:
   - a privacy policy and clear consent at sign-up;
   - data export and delete-my-account for users (delete already exists);
   - a breach-response plan and someone responsible for data protection.

   Keep it entirely separate from your day job: no work devices, accounts or data.
2. **Terms of use** and a medical disclaimer: "not medical advice"; calorie and weight goals should be healthy and safe.
3. **Public sign-up:** you'd add email verification and password-reset emails (an email service such as Resend or Postmark, with free tiers), plus abuse protection (Cloudflare Turnstile).
4. **Payments:** Stripe Checkout + webhooks to switch an account's plan (for example `max_characters` or picture storage). As a web app (PWA) there's no App Store cut.
5. **Generic content and branding:** the *Healthy-life starter* template is the base for public users. Your personal template stays owner-only. Pick a product name and check the trademark.
6. **Operations:** Workers Paid plan, monitoring (Cloudflare observability is already on), backups, and a support email.

---

## 15. Local development

```bash
npm install
npm run set-password -- --local   # local setup password (.dev.vars)
npm run db:migrate:local          # local account database
npm run dev                       # http://localhost:5173 (UI + API + character databases)
```

| Command | What it does |
|---|---|
| `npm run check` | Type-check (UI + Worker) and unit tests |
| `npm run test:api` | 60+ end-to-end API checks (needs a **fresh** local server; see the top of `tests/api-regression.mjs`) |
| `npm run build` / `npm run deploy` | Production build / check → build → migrate → deploy |
| `npm run versions` / `npm run rollback` | Deployments |
| `npm run backup` | SQL dump of the account database |
| `npm run set-password` / `npm run setup-2fa` | Setup password (for claiming the owner account) |
| `npm run reset-owner` | Set a new owner password (`-- --local` for dev) |
| `npm run icons` | Re-render the home-screen icons |

Local data lives in `.wrangler/state` (git-ignored). Delete it and re-run `npm run db:migrate:local` for a fresh start.

---

## 16. Project structure

```
├── migrations/            account database (D1): 0001 = v1 game tables (kept), 0002 = accounts
├── worker/
│   ├── index.ts           accounts, invites, admin, v1 import, secure proxy to characters
│   ├── auth.ts            passwords, TOTP, sessions, lock-outs
│   ├── accounts.ts        users, invites, character registry
│   ├── character.ts       the per-character Durable Object (own SQLite, self-migrating)
│   ├── schema/            character database migrations (0002 = pictures & links)
│   ├── do-db.ts           D1-style adapter over Durable Object SQL
│   ├── game/api.ts        the game API for one character (+ pictures)
│   ├── game.ts            engine: rewards, crits, quests, trackers, closing days, fainting
│   ├── economy.ts         shop, vouchers, bag, calorie court, chests
│   ├── progress.ts        goals, milestones, sprints
│   ├── achievements.ts    stats + achievement rules
│   ├── state.ts           the full game state for the UI
│   ├── crud.ts            whitelisted create/update/delete for everything editable
│   ├── backup.ts          save points (built inside SQLite), export/import, resets
│   └── seed.ts            templates: Healthy-life starter, Anson's original, Blank
├── shared/                levels & cosmetics, pixel pet, dates, pricing, BMI/EMA, rules
├── src/                   React UI (pages/, components/, account flow, pictures, effects)
├── public/                icons, manifest, security headers
├── scripts/               setup, passwords, 2FA, owner reset, backup, icons
└── tests/                 unit tests + end-to-end API checks
```

---

## 17. Troubleshooting

| Problem | Fix |
|---|---|
| "Almost there: no owner yet" | Run `npm run set-password` (or `-- --local`), then reload |
| Locked out after wrong passwords | Wait 15 minutes |
| Member forgot password / lost 2FA | Owner: **Admin → Reset password** (also removes their 2FA) |
| Owner forgot password / lost 2FA | `npm run reset-owner` |
| Lost or stolen phone | Account → **Log out everywhere** (from another device), then change your password |
| A day was scored unfairly | Log → void the penalty. For planned rest days, buy a 🏖️ Rest Day Pass |
| Something broke after an update | `npm run rollback` (code) and/or Save points → Load (data) |
| Picture won't upload | Max 1.5 MB after compression; JPEG, PNG, WebP or GIF; 150 MB per character |

---

*Fonts: [Jersey 10](https://fonts.google.com/specimen/Jersey+10) and [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) (SIL Open Font License). QR codes: [uqr](https://github.com/unjs/uqr) (MIT). Pixel art, sounds and game design made for this project.*
