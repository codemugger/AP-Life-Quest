# ðŸ£ AP Life Quest

A cute pixel-RPG for your real life. Log your weight, calories, focus hours and habits, clear daily quests, earn **AP** (Achievement Points) and **XP**, raise a pet that evolves as you level up, and spend AP on real-life rewards in the AP Shop. Slack off and you lose HP, and the Calorie Court sends you a bill.

It runs as a website (laptop + iPhone home-screen app). It's **invite-only**: you're the owner, and anyone you invite gets their own private account with their own characters. It costs **$0/month** on Cloudflare's free tier.

---

## Contents

1. [How the game works](#1-how-the-game-works)
2. [A day in the life](#2-a-day-in-the-life)
3. [Accounts, characters and invites](#3-accounts-characters-and-invites)
4. [Make it yours: looks, pictures, notes and links](#4-make-it-yours-looks-pictures-notes-and-links)
5. [Notebook & journal](#5-notebook--journal)
6. [First-time setup (â‰ˆ10 minutes)](#6-first-time-setup)
7. [Upgrading from v1](#7-upgrading-from-v1)
8. [Install on your iPhone](#8-install-on-your-iphone)
9. [Updating the app](#9-updating-the-app)
10. [Rolling back: code, data, or both](#10-rolling-back)
11. [Resets: New Game+ and Factory reset](#11-resets)
12. [Adding new things](#12-adding-new-things)
13. [Security](#13-security)
14. [Costs and free-tier limits](#14-costs-and-limits)
15. [Thinking of going commercial?](#15-thinking-of-going-commercial)
16. [Local development](#16-local-development)
17. [Project structure](#17-project-structure)
18. [Troubleshooting](#18-troubleshooting)

---

## 1. How the game works

| Thing | What it means |
|---|---|
| **AP** ðŸª™ | Your currency. Earned from quests, chests, achievements, goals and sprints. Spent in the AP Shop. |
| **XP** â­ | Never spent. Fills your level bar. Level 1â†’2 needs 100 XP, then +50 more per level. |
| **HP** â¤ï¸ | Your discipline health (max 100). Missed dailies hurt; completing quests heals a little; a perfect day heals 10; levelling up fully heals. |
| **Level & title** | Sprout â†’ Wanderer â†’ Apprentice â†’ Adventurer â†’ Knight â†’ Ranger â†’ Champion â†’ Hero â†’ Guardian â†’ Legend â†’ Mythicâ€¦ |
| **Pet** | Hatches from an egg and evolves at levels 3, 10, 20 and 35. Mood follows your HP and today's effort. |
| **Streak** ðŸ”¥ | +1 for each day you finish â‰¥ 80% of your dailies. Each streak day adds +2% AP to every quest (max +50%). Milestones (3, 7, 14, 30, 60, 100) drop chests. |
| **Critical hits** | 10% of quest completions pay **double AP** (fixed per quest per day, so undo/redo can't re-roll it). |
| **Chests** ðŸŽ | Drop on level-ups, perfect days, streak milestones, gold/platinum achievements, sprint wins and goals. Open them for AP, XP, hats, scenes and free items. Level-up and goal rewards are paid once per season, so undo/redo can't farm them. |
| **Fainting** ðŸ˜µ | If HP hits 0 your pet faints: you lose 10% of your AP (min 20), your streak resets, and quests pay half until you complete **3 quests** to revive. Undoing whatever knocked you out undoes the faint. |

**Quest types**

- **Dailies:** due on chosen weekdays; missing one costs HP when the day closes. Many tick themselves when you log a tracker (weigh-in, calories â‰¤ budget, CSD â‰¥ 6 hâ€¦).
- **Weeklies:** do N times a week.
- **Habits:** tap any time. Good ones pay (e.g. *coaching* pays per hour); bad ones cost AP + HP.
- **To-dos:** one-offs, sorted by the **Eisenhower matrix** (Quests â†’ To-dos shows the four squares; Camp shows the most pressing ones under your dailies). Penalties need a due date:

  | Priority | Deadline missed | Each extra day late (up to 7) | Pay |
  |---|---|---|---|
  | ðŸ”¥ **Do now** (urgent + important) | âˆ’HP (default 10) **and** its AP | âˆ’half the HP | half if late |
  | ðŸ“… **Schedule** (important, not urgent) | âˆ’HP (default 6) | âˆ’half the HP | **+25% if done early**, half if late |
  | âš¡ **Quick task** (urgent, not important) | âˆ’HP (default 3) | none | half if late |
  | ðŸ§¹ **Someday** (neither) | none | none | normal |

  "Do now" without a date is due today. Unsorted to-dos (like ones made before priorities existed) have no penalty. Rest days skip deadline damage too.

**When does a day close?** The game day starts at **4 am**. Yesterday stays open until **4 pm** (12 h grace) so you can catch up in the morning. Closing applies missed-quest damage, the streak, perfect-day healing, Calorie Court auto-billing and sprint deadlines, then shows a "While you were away" report. Each day can only ever be scored once, even if your phone and laptop open the app at the same moment.

**âš–ï¸ Calorie Court:** a day in a waiver band (3000â€“3999, 4000â€“4999â€¦) requires that Calorie Waiver Ticket (Ã—3 tax). Settle it in **Shop â†’ Court**:

- use a ticket from your bag,
- buy one (vouchers allowed). Buying and using a waiver ticket from the Shop also settles the case, or
- grant an exception.

If you ignore it, it's auto-billed at full price.

**Vouchers** can have automatic checks (AP earned this month, CSD this week, fasting total, weight + 30-day calorie EMA, recent calories, birthdayâ€¦) or use the honour system.

---

## 2. A day in the life

1. **Morning:** open the app and read the overnight report. Weigh in (Camp â†’ Quick log); the weigh-in quest ticks itself.
2. **During the day:** tap **+0.5 / +1 / +2** for focus or CSD hours, start the **fasting timer**, and tap habits as they happen.
3. **Evening:** enter the day's calories (one box), tick what you did, open chests.
4. **Treat yourself** in the Shop, and use rewards from your Bag when you enjoy them.
5. **Weekly:** check Body (weight trend, BMI, 30-day EMA) and Journey (goals, sprint boss, upcoming trips).

---

## 3. Accounts, characters and invites

- **Your account** = your login (username + password, optional 2FA). Manage it under **Account**.
- **Characters** = separate games, like save files. Each has its own name, pet, looks, quests, shop, trackers, history, pictures and save points. Switch with **Characters** ("Choose your save"). You can have up to 10; members get 3 by default.
- **New character wizard:** name â†’ design your pet â†’ pick a starting template:
  - **Healthy-life starter**: water, sleep, movement, focus, and everyday rewards. For anyone.
  - **Anson's original**: your full v1 setup (CSD, calorie court, your 15 vouchers). Owner only.
  - **Copy one of your characters**: the same quests, trackers, shop and vouchers, with fresh progress.
  - **Blank**: build everything yourself.
- **Inviting someone (owner):** **Admin â†’ Invite someone** â†’ send the link. Each invite works once and expires (default 14 days). In Admin you can also set someone's character limit, disable an account, or give them a temporary password.
- **Privacy:** every character lives in its **own separate database**. Nobody, including you as owner, can open someone else's characters through the app.

---

## 4. Make it yours: looks, pictures, notes and links

**ðŸŽ€ Wardrobe** (tap your pet on the Camp page):

| | Options | How to get them |
|---|---|---|
| Species | Neko (cat), Mochi blob, Usagi (bunny), Kuma (bear), Dino | free |
| Eyes | Classic, Big & shiny, Sparkly | free |
| Colour | 9 presets **or any colour** you pick | free |
| Hats | Beanie (free), Headband (Lv 5), Party hat (Lv 10), Flower (Lv 15), Wizard (Lv 25), Crown (Lv 40), Bow & Coach cap (chest drops) | level up / chests |
| Face | Round glasses (free), Cool shades (chest) | free / chests |
| Scene | Meadow & Beach (free), City Lights (Lv 8), Sakura Park (Lv 12), Moon Base (Lv 20) | level up / chests |

Chests can drop locked items early.

**ðŸ–¼ï¸ Pictures:** you can add pictures to quests, events, goals, shop items, vouchers, achievements and sprint bosses. When adding one you choose:

- **ðŸ“· Photo**: resized on your phone to keep it small, or
- **ðŸ‘¾ Pixel art**: turns any picture into a crunchy 8-bit icon that matches the game.

The first picture is the icon or cover; tap â­ on another to make it the cover. Events become a photo **timeline of memories**, and goals get a **vision board**. Each character can store 150 MB of pictures, and **Settings â†’ Pictures** shows usage and can remove unused ones.

**ðŸ“ Notes** support `**bold**`, `*italic*`, `- lists` and links.

**ðŸ”— Links** (workout videos, maps, booking pagesâ€¦) show as a button on the quest, event or goal card.

---

## 5. Notebook & journal

**ðŸ“’ Notes** (tab bar) is your Google Keep + OneNote inside the game.

- **Binders:** coloured tabs at the top (ðŸ“’ Notes and ðŸ“” Journal to start). Make more with **ï¼‹**, for example â° CET, ðŸ’¼ Work or ðŸ’¡ Ideas. Tap an open tab again to rename, recolour, move or delete it. Deleting a binder moves its notes; nothing is lost.
- **The board:** Keep-style cards with ðŸ“Œ **pinned** notes first. Every note has a **card colour** ðŸŽ¨ and a **paper** ðŸ“„ (plain, lined, grid or dots).
- **Labels** ðŸ· work across binders, like tags. Tap a label chip to filter.
- **Search** looks inside every note, not just titles.
- **ðŸ—„ï¸ Archive** puts notes out of the way. **ðŸ—‘ï¸ Trash** keeps them for 30 days.
- **"Take a noteâ€¦"** starts a note. The buttons next to it start a checklist â˜‘, a sketch âœï¸, a voice memo ðŸŽ™ï¸ or a photo note ðŸ“·.

**Writing** (the toolbar scrolls sideways on a phone):

| | |
|---|---|
| Text | **bold**, *italic*, underline, ~~strike~~, 9 text colours, 6 highlighter pens, 4 sizes |
| Fonts | Pixel, Arcade, Clean, Serif, Mono, Handwritten (per selection, or ðŸ”¤ for the whole note) |
| Blocks | headings, bullet / numbered lists, â˜‘ checklists, quotes, code, dividers, alignment |
| Tables | ï¼‹ â†’ Table, then add/remove rows and columns, header row, merge cells (handy for a CET timetable) |
| Media | ðŸ“· photos, ðŸ‘¾ pixel art, âœï¸ **sketches** (finger, mouse or Apple Pencil with pressure; tap a sketch to draw on it again), ðŸŽ™ï¸ **voice memos** (up to ~5 min, or pick an audio file) |
| Extras | ðŸ”— links, ðŸ• time stamp, ðŸ“… today's date, paste or drag pictures straight in |

Typing shortcuts also work: `# ` heading, `- ` list, `[ ] ` checklist, `> ` quote, `---` divider, Ctrl/âŒ˜+B / I / U.

**Notes save themselves** as you type ("Saved âœ“"). If the same note was changed on another device, you'll be asked which version to keep.

**In the game:**

- **ðŸ“” Journal:** entries are dated (one tap: **âœï¸ Today's entry**), with a mood row and optional **âœ¨ Prompts** (wins, gratitude, lessons, tomorrow's to-dos). The words you write each day go into the ðŸ“” *Journal* tracker. Writing **30+ words** ticks the daily quest **"Write in your journal"** (+5 AP, +15 XP, no HP penalty), and your writing streak ðŸ”¥ shows on the Journal tab. Trophies: *Dear Diary*, *Scribe* (7 days in a row), *Chronicler* (30 days), *Wordsmith* (10,000 words), *Bookworm* (25 notes). Change the target or the penalty like any other quest or tracker.
- **â˜€ï¸ Show on Camp:** pin a note (today's timetable, your rules) to the Camp page.
- **ðŸ”— Link to a goal, sprint or event:** the note shows on that card in Journey, and **ï¼‹ note** there writes a new linked one.
- **â° Reminders:** a date and time, optionally repeating daily, weekly or monthly. When one is due, the app shows a nudge on Camp, a toast and a badge on ðŸ“’ Notes (in the app only, no push notifications). **âœ“ Done** clears it, or moves a repeating one to its next time.

**Your notebook is life, not game progress:**

- loading a save point leaves it alone unless you choose to roll it back too;
- a factory reset keeps it unless you tick *Also delete my notebook*;
- New Game+ never touches it.

Pictures and voice memos share the character's media storage (**Settings â†’ Pictures & voice memos**).

---

## 6. First-time setup

You need **Node.js 20+** (already on this PC) and a free **Cloudflare account** (<https://dash.cloudflare.com/sign-up>). In a terminal in this folder:

```bash
npm install
npm run setup
```

This logs you in to Cloudflare in the browser, creates the database, checks, builds and deploys, then asks for a **setup password** (and offers 2FA).

Open the site address it prints (`https://ap-life-quest.<you>.workers.dev`). The first visit shows **Claim your castle**: enter the setup password and choose your owner username and password. Then create your first character. Commit the updated `wrangler.jsonc` afterwards (it holds the database ID, which isn't secret).

---

## 7. Upgrading from v1

If v1 is already deployed and you've been logging in it:

1. In the main project folder: `git merge v2` (your `wrangler.jsonc` there already has the real database ID).
2. `npm install`, then `npm run deploy`. It adds the accounts tables and leaves your v1 data untouched.
3. Open the site and click **Claim your castle**. The setup password is your **v1 password**, and if you had 2FA in v1, your current code (it keeps working for your new owner account).
4. On **Choose your save**, click **Import** on the "Your v1 save is waiting" banner. Everything you logged becomes your first character.

---

## 8. Install on your iPhone

Open the site in **Safari** â†’ **Share** â†’ **Add to Home Screen**. It opens full-screen, stays logged in for 30 days (refreshed as you use it), and iPhone can save your password and 2FA codes (Settings â†’ Passwords).

---

## 9. Updating the app

```bash
npm run dev              # try changes locally (section 16)
git add -A && git commit -m "Describe the change"
git tag v2.1.0           # optional: easy rollback point
npm run deploy           # typecheck + tests â†’ build â†’ migrate DB â†’ deploy
```

**Database changes:** only ever **add** tables or columns (with defaults); never drop or rename. That keeps code rollbacks safe.

- Account tables: new file in `migrations/`.
- Character tables: new file in `worker/schema/`, plus one line in the `SCHEMA` list in `worker/character.ts`. Every character upgrades itself automatically the next time it's opened.

---

## 10. Rolling back

**Undo one mistake:**

- tap the quest again, or
- **ðŸ“œ Log â†’ â†© Void** (AP/XP/HP reversed), or
- **Â± Adjust** for manual corrections.

**Roll back a character's data:**

- **Settings â†’ Save points â†’ Load**. A save point is made weekly and before every reset, import or load. You choose whether your notebook goes back in time too (default: keep today's notes).
- **â¬‡ Download backup** / **â¬† Import backup** (a JSON file; pictures aren't included in the file).

**Roll back the code:**

```bash
npm run versions         # recent deployments
npm run rollback         # back to the previous version
```

Or use the Cloudflare dashboard: **Workers & Pages â†’ ap-life-quest â†’ Deployments â†’ Rollback**. Rolling back code never touches data. To redeploy an older tag: `git checkout v1.0.0 && npm run deploy`.

**Account database:** `npm run backup` saves a SQL dump. For a point-in-time restore over the last 7 days:

```bash
npx wrangler d1 time-travel restore ap-life-quest-db --timestamp=<time>
```

---

## 11. Resets

Both are in **Settings â†’ Danger zone** (per character). Both need you to type a confirmation and make a save point first.

| | ðŸŒ± **New Game+** | ðŸ§¨ **Factory reset** |
|---|---|---|
| AP, XP, level, HP, streak, inventory, achievements | reset | reset |
| Quests, trackers, shop, vouchers, rules | **kept** | back to the template |
| Tracker history | **kept** | wiped |
| Notebook (notes, journal, labels) | **kept** | **kept**, unless you tick *Also delete my notebook* |
| Old season | archived in the ðŸ›ï¸ Hall of Fame | gone (except in the save point) |

To start over completely, create a new character (or delete one under **Characters**).

---

## 12. Adding new things

**In the app (no code):**

- quests, trackers, shop items, vouchers, achievements (21 rule types or "claim manually"), goals, sprints and events, all with pictures, notes and links;
- notebooks, labels and notes (see [Notebook & journal](#5-notebook--journal));
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
{"t":"all","rules":[â€¦]}
```

**Shop item effects:** `heal:30`, `rest_day`, `streak_freeze`.

**In code:**

- Game engine: `worker/game.ts`. Game routes: `worker/game/api.ts`. Accounts and admin: `worker/index.ts`.
- Make a new column editable: add it in a migration, then to the whitelist in `worker/crud.ts` and the field list in `src/components/Editor.tsx`.
- New pet hats or faces: `shared/petgrid.ts` (pixel grids) and `shared/levels.ts` (unlock rules).
- New templates: `worker/seed.ts`.
- Notebook: server in `worker/notes.ts`; what a note may contain (nodes, marks, fonts, colours) in `shared/notedoc.ts`; the editor in `src/components/notes/NoteEditor.tsx`. A new formatting option needs all three: the editor extension, the whitelist entry, and a case in `src/components/NoteView.tsx` (cards).

---

## 13. Security

- **Invite-only:** the owner is created once with the setup password; everyone else needs a single-use, expiring invite code (stored hashed).
- **Passwords:** salted PBKDF2-SHA256 hashes. **Optional 2FA** (TOTP) per user, set up with a QR code under Account. Each code works only once. Turning 2FA on or off, changing your password and deleting your account all re-ask for your password.
- **Lock-outs:**
  - 10 wrong attempts per IP (IPv6 per /64) per 15 min;
  - 10 per username;
  - a 40-per-15-min global backstop.

  Devices you've logged in from before skip the per-username and global limits, so a stranger spamming wrong passwords can't lock you out. Login timing doesn't reveal which usernames exist.
- **Sessions:** random 256-bit tokens in `HttpOnly`, `Secure`, `SameSite=Lax`, `__Host-` cookies, stored hashed, with a 30-day sliding expiry. Changing your password logs out your other devices; **Log out everywhere** is in Account. Disabled accounts are locked out immediately.
- **Isolation:** each character is its own Durable Object database. Every request is checked for login and ownership before it's forwarded. Only the headers the game needs are passed on, and the internal operations can't be reached from the internet. Owner-only templates are protected by a flag that backups can't change.
- **Fair use:** per character, members get 200 MB of storage with 50 MB of pictures and voice memos (owner: 1 GB / 150 MB). Other limits: 12 manual save points, 120 changes a minute, 8 MB per upload or import, 5,000 notes of up to ~15,000 words each. Character creation can't exceed each person's limit.
- **Pictures:** only JPEG, PNG, WebP or GIF, checked by their actual bytes (no SVG or HTML), max 1.5 MB, served with `nosniff` and a locked-down Content-Security-Policy. Access is re-checked against your login on every view (nothing readable from the browser cache after logging out).
- **Voice memos:** M4A/MP4, MP3, WebM, OGG or WAV, also checked by their bytes, max ~1.9 MB. The microphone is only used while you're recording and is allowed for this site alone.
- **Imports** are validated like typed input: bad links and picture lists are dropped, sizes are capped, and imported notes are cleaned like typed ones.
- **Notes** are rendered without HTML. Rich notes are stored as editor JSON, and the server keeps only whitelisted formatting (fonts, colours and sizes from fixed lists; links only `http(s)`, `mailto:` and `tel:`; pictures only by their id in your own storage), so a note can't carry scripts or outside content.
- **CSRF guard** (custom header + same-origin check), strict security headers, and `noindex` so search engines stay away.
- **Secrets never committed:** `.dev.vars`, `backups/` and your `.xlsx` files are git-ignored.

**Recovery:**

- A member forgot their password â†’ **Admin â†’ Reset password**.
- You (owner) forgot yours, or lost your 2FA phone â†’ `npm run reset-owner` (needs your Cloudflare login on this PC).

---

## 14. Costs and limits

Everything fits Cloudflare's **free** plan for you plus a handful of invited people:

| Resource | Free allowance |
|---|---|
| Requests (Worker + character databases) | 100,000 / day |
| Storage (account DB + all characters) | 5 GB total |
| Account DB rows read / written | 5 M / 100 k per day |
| Per character (app limit) | members 200 MB incl. 50 MB pictures; owner 1 GB incl. 150 MB |

Beyond roughly 20â€“50 active players, move to **Workers Paid (US$5/month)**. No code changes are needed.

---

## 15. Thinking of going commercial?

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

## 16. Local development

```bash
npm install
npm run set-password -- --local   # local setup password (.dev.vars)
npm run db:migrate:local          # local account database
npm run dev                       # http://localhost:5173 (UI + API + character databases)
```

| Command | What it does |
|---|---|
| `npm run check` | Type-check (UI + Worker) and unit tests |
| `npm run test:api` | 117 end-to-end API checks (needs a **fresh** local server; see the top of `tests/api-regression.mjs`) |
| `npm run build` / `npm run deploy` | Production build / check â†’ build â†’ migrate â†’ deploy |
| `npm run versions` / `npm run rollback` | Deployments |
| `npm run backup` | SQL dump of the account database |
| `npm run set-password` / `npm run setup-2fa` | Setup password (for claiming the owner account) |
| `npm run reset-owner` | Set a new owner password (`-- --local` for dev) |
| `npm run icons` | Re-render the home-screen icons |

Local data lives in `.wrangler/state` (git-ignored). Delete it and re-run `npm run db:migrate:local` for a fresh start.

---

## 17. Project structure

```
â”œâ”€â”€ migrations/            account database (D1): 0001 = v1 game tables (kept), 0002 = accounts
â”œâ”€â”€ worker/
â”‚   â”œâ”€â”€ index.ts           accounts, invites, admin, v1 import, secure proxy to characters
â”‚   â”œâ”€â”€ auth.ts            passwords, TOTP, sessions, lock-outs
â”‚   â”œâ”€â”€ accounts.ts        users, invites, character registry
â”‚   â”œâ”€â”€ character.ts       the per-character Durable Object (own SQLite, self-migrating)
â”‚   â”œâ”€â”€ schema/            character database migrations (0002 = pictures & links, 0003 = notebook)
â”‚   â”œâ”€â”€ do-db.ts           D1-style adapter over Durable Object SQL
â”‚   â”œâ”€â”€ game/api.ts        the game API for one character (+ pictures)
â”‚   â”œâ”€â”€ game.ts            engine: rewards, crits, quests, trackers, closing days, fainting
â”‚   â”œâ”€â”€ economy.ts         shop, vouchers, bag, calorie court, chests
â”‚   â”œâ”€â”€ progress.ts        goals, milestones, sprints
â”‚   â”œâ”€â”€ achievements.ts    stats + achievement rules
â”‚   â”œâ”€â”€ state.ts           the full game state for the UI
â”‚   â”œâ”€â”€ crud.ts            whitelisted create/update/delete for everything editable
â”‚   â”œâ”€â”€ backup.ts          save points (built inside SQLite), export/import, resets
â”‚   â”œâ”€â”€ notes.ts           notebook: notes, binders, labels, reminders, journal â†’ game
â”‚   â””â”€â”€ seed.ts            templates: Healthy-life starter, Anson's original, Blank
â”œâ”€â”€ shared/                levels & cosmetics, pixel pet, dates, pricing, BMI/EMA, rules,
â”‚                          notedoc (what a rich note may contain + previews/word counts)
â”œâ”€â”€ src/                   React UI (pages/, components/, account flow, pictures, effects)
â”‚   â”œâ”€â”€ pages/Notes.tsx    binder tabs, board, journal, labels/notebook managers
â”‚   â””â”€â”€ components/notes/  editor (TipTap, loaded on demand), sketch pad, voice recorder
â”œâ”€â”€ public/                icons, manifest, security headers
â”œâ”€â”€ scripts/               setup, passwords, 2FA, owner reset, backup, icons
â””â”€â”€ tests/                 unit tests + end-to-end API checks
```

---

## 18. Troubleshooting

| Problem | Fix |
|---|---|
| "Almost there: no owner yet" | Run `npm run set-password` (or `-- --local`), then reload |
| Locked out after wrong passwords | Wait 15 minutes |
| Member forgot password / lost 2FA | Owner: **Admin â†’ Reset password** (also removes their 2FA) |
| Owner forgot password / lost 2FA | `npm run reset-owner` |
| Lost or stolen phone | Account â†’ **Log out everywhere** (from another device), then change your password |
| A day was scored unfairly | Log â†’ void the penalty. For planned rest days, buy a ðŸ–ï¸ Rest Day Pass |
| Something broke after an update | `npm run rollback` (code) and/or Save points â†’ Load (data) |
| Picture won't upload | Max 1.5 MB after compression; JPEG, PNG, WebP or GIF; 50 MB per character for members, 150 MB for the owner |
| "Storage is full" | Settings â†’ delete old save points or remove unused pictures; empty the notebook trash |
| Voice memo says the microphone is blocked | iPhone: Settings â†’ Safari (or the home-screen app) â†’ Microphone â†’ Allow. Laptop: click the ðŸ”’ in the address bar â†’ Microphone â†’ Allow |
| "This note was changed on another device" | Choose **Load theirs** (keep the other device's version) or **Keep mine** (overwrite with this one) |
| Journal quest didn't tick | It needs 30+ words in that day's entries (change the threshold in Quests). Entries for days already closed still count toward the tracker and trophies |

---

*Fonts: [Jersey 10](https://fonts.google.com/specimen/Jersey+10), [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) and [Patrick Hand](https://fonts.google.com/specimen/Patrick+Hand) (SIL Open Font License). Note editor: [Tiptap](https://tiptap.dev) / ProseMirror (MIT). QR codes: [uqr](https://github.com/unjs/uqr) (MIT). Pixel art, sounds and game design made for this project.*
