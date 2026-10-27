// The in-game guide: how everything works, with this character's own rule values filled in.
// Pages link here with a small "?" (HelpLink) that opens the matching chapter.
import { useEffect, type ReactNode } from "react";
import { PRIORITIES, PRIORITY_ORDER, drainHp } from "../../shared/priority";
import type { Settings } from "../../shared/rules";
import { DIFFICULTY } from "../../shared/rules";
import { useGame } from "../store";
import { Panel } from "../components/ui";

const pct = (n: number) => `${Math.round(n * 100)}%`;

interface Chapter {
  id: string;
  emoji: string;
  title: string;
  body: (s: Settings) => ReactNode;
}

const CHAPTERS: Chapter[] = [
  {
    id: "start",
    emoji: "🌱",
    title: "Your first day",
    body: () => (
      <ol>
        <li>
          <b>Camp</b> is home: your pet, today's dailies, your to-dos and quick logging. Open it every morning: it shows a <i>While you were away</i> report for the
          day that just closed.
        </li>
        <li>
          Tick quests as you do them. Each pays <b>AP</b> (spend it) and <b>XP</b> (level up).
        </li>
        <li>Log weight and calories in the Quick log; trackers tick their own quests.</li>
        <li>Spend AP on real treats in the Shop, and use them from your Bag when you enjoy them.</li>
        <li>Make it yours: everything (quests, rewards, rules) is editable. Look for ✎ and ＋.</li>
      </ol>
    ),
  },
  {
    id: "points",
    emoji: "🪙",
    title: "AP, XP, HP and levels",
    body: (s) => (
      <ul>
        <li>
          <b>AP 🪙</b> is money: earned from quests, chests, trophies, goals and sprints; spent in the Shop.
        </li>
        <li>
          <b>XP ⭐</b> is never spent. Level 1→2 needs 100 XP, then 50 more for each level. Every level-up drops a chest, fully heals you, and some unlock hats
          and scenes.
        </li>
        <li>
          <b>HP ❤️</b> (max {s.max_hp}) is your discipline health. Missed dailies, bad habits and late to-dos hurt; each finished quest heals {s.complete_heal}; a
          perfect day heals {s.perfect_day_heal}.
        </li>
        <li>
          <b>Your pet</b> evolves at levels 3, 10, 20 and 35, and its mood follows your HP and today's effort.
        </li>
        <li>
          <b>Difficulty</b> sets a quest's rewards: {Object.values(DIFFICULTY).map((d) => `${d.label} ${d.ap} AP`).join(" · ")}.
        </li>
      </ul>
    ),
  },
  {
    id: "quests",
    emoji: "⚔️",
    title: "Quests and schedules",
    body: () => (
      <ul>
        <li>
          <b>Dailies</b> are due on their days; missing one costs its HP when the day closes. Schedules: chosen weekdays, every N days, every N weeks on some
          weekdays (alternate Sundays), monthly on a date (the 26th) or a weekday (the 2nd Sunday), or yearly. Off-days don't count.
        </li>
        <li>
          <b>Weeklies</b>: do them N times a week (checked Sunday night).
        </li>
        <li>
          <b>Habits</b>: tap any time. Good ones pay (per hour if they have a unit); bad ones cost AP and HP.
        </li>
        <li>
          <b>To-dos</b>: one-offs with a priority and a due date (next chapter). They can repeat too: finish one and the next appears with its new date.
        </li>
        <li>
          <b>Tracker quests</b> (🍱, ⚖️, 📔…) tick themselves when you log the tracker, and untick if you change the value.
        </li>
        <li>Made a mistake? Tap the tick again to undo; everything is reversed.</li>
      </ul>
    ),
  },
  {
    id: "todos",
    emoji: "📋",
    title: "To-do priorities (Eisenhower matrix)",
    body: () => (
      <>
        <p>Sort each to-do by how urgent and how important it is. A missed deadline costs HP depending on the square:</p>
        <ul>
          {PRIORITY_ORDER.map((p) => {
            const x = PRIORITIES[p];
            return (
              <li key={p}>
                <b>
                  {x.emoji} {x.label}
                </b>{" "}
                ({x.quadrant}):{" "}
                {x.hp
                  ? `−${x.hp} HP when the deadline passes${x.fine ? " and you lose its AP" : ""}${x.drain ? `, then −${drainHp(x.hp)} HP each day it's still late (up to 7)` : ""}${x.early ? "; done early pays +25%" : ""}.`
                  : "no penalty, ever."}
              </li>
            );
          })}
        </ul>
        <p>
          Finishing late pays half. Penalties need a due date (🔥 Do now is due today unless you pick one). Unsorted to-dos have no penalty. The HP amount can be
          changed on each to-do.
        </p>
      </>
    ),
  },
  {
    id: "streaks",
    emoji: "🔥",
    title: "Streaks, crits and chests",
    body: (s) => (
      <ul>
        <li>
          <b>Streak</b>: +1 for each day you finish at least {pct(s.streak_threshold)} of the day's dailies. Each streak day adds +{pct(s.streak_bonus_per_day)} AP to
          every quest (max +{pct(s.streak_bonus_cap)}). Days 3, 7, 14, 30, 60 and 100 drop chests. A 🛡️ Streak Shield saves it once.
        </li>
        <li>
          <b>Critical hits</b>: {pct(s.crit_chance)} of quest completions pay ×{s.crit_mult} AP.
        </li>
        <li>
          <b>Perfect day</b> (every daily done): +{s.perfect_day_heal} HP and a {pct(s.perfect_day_chest_chance)} chance of a chest.
        </li>
        <li>
          <b>Chests 🎁</b> come from level-ups, streaks, perfect days, gold/platinum trophies, sprint wins and goals. Open them on Camp for AP, XP, hats and
          scenes.
        </li>
        <li>
          <b>The day</b> starts at {s.day_start_hour}:00 and stays open {s.grace_hours} hours after it ends, so you can tick yesterday in the morning. 🏖️ Rest Day
          Passes freeze everything for a sick day.
        </li>
      </ul>
    ),
  },
  {
    id: "faint",
    emoji: "😵",
    title: "Fainting and getting back up",
    body: (s) => (
      <p>
        If HP hits 0 your pet faints: you lose {pct(s.faint_ap_pct)} of your AP (at least {s.faint_min_ap}), your streak resets, and quests pay ×{s.fainted_earn_mult}{" "}
        until you finish {s.revive_quests} quests to revive (with {s.revive_hp} HP). Undoing whatever knocked you out undoes the faint. A 🧪 Health Potion from the
        Shop heals 30.
      </p>
    ),
  },
  {
    id: "body",
    emoji: "💗",
    title: "Trackers and health",
    body: () => (
      <ul>
        <li>Body shows each tracker's chart, your BMI (Singapore cut-offs) and the 30-day moving average, which is steadier than daily weigh-ins.</li>
        <li>"Add" trackers (water, CSD hours) sum up during the day; "set" trackers (weight, calories) keep one value per day.</li>
        <li>Make your own trackers with ＋ Tracker; then link quests, trophies and vouchers to them.</li>
      </ul>
    ),
  },
  {
    id: "shop",
    emoji: "🛒",
    title: "Shop, vouchers, bag and court",
    body: () => (
      <ul>
        <li>Buy rewards with AP. Some carry a tax multiplier; items you buy go to your Bag until you use them.</li>
        <li>Vouchers take a % off. Some have automatic checks (e.g. AP earned this month, CSD this week, your birthday); others are on your honour.</li>
        <li>
          <b>⚖️ Calorie Court</b>: a day in a waiver band needs that ticket. Settle it in Shop → Court (use one, buy one, or grant an exception); ignore it and it's
          auto-billed at full price when the day closes.
        </li>
        <li>Bought by mistake? Void it in the Log (only if you haven't used it).</li>
      </ul>
    ),
  },
  {
    id: "journey",
    emoji: "🗺️",
    title: "Goals, sprints and events",
    body: () => (
      <ul>
        <li>
          <b>Goals</b> track big dreams by milestones, a tracker (e.g. reach 55 kg) or by hand. Finishing one pays its reward and a legendary chest.
        </li>
        <li>
          <b>Sprints</b> are 1–4 week boss raids: each task you finish hits the boss. Win before the end date for an epic chest. Tap ✕ in the battle history to
          tidy it up (your rewards stay).
        </li>
        <li>
          <b>Events</b> are things to look forward to, and become a photo timeline once they've passed.
        </li>
        <li>Link notes (meeting minutes, plans) to any of them from the note's 🔗 menu.</li>
      </ul>
    ),
  },
  {
    id: "trophies",
    emoji: "🏆",
    title: "Trophies",
    body: () => (
      <p>
        Trophies unlock by themselves when you reach them (quests done, streaks, weight lost, journal days…), or you claim "manual" ones yourself. Gold and
        platinum trophies also drop a chest. Make your own with ＋; they reset each season so you can earn them again.
      </p>
    ),
  },
  {
    id: "notebook",
    emoji: "📒",
    title: "Notebook and journal",
    body: () => (
      <ul>
        <li>Binder tabs on top, Keep-style cards below. Pin, colour, label, search, archive; the trash keeps notes for 30 days.</li>
        <li>Rich text, checklists, tables, photos, sketches and voice memos. Notes save themselves.</li>
        <li>
          <b>📔 Journal</b>: one tap for today's entry. 30+ words ticks the journal quest; writing every day builds a streak and unlocks writing trophies.
        </li>
        <li>☀️ shows a note on Camp, 🔗 links it to a goal/sprint/event, ⏰ reminds you (in the app).</li>
      </ul>
    ),
  },
  {
    id: "log",
    emoji: "📜",
    title: "The log (undo anything)",
    body: () => (
      <p>
        Every AP, XP and HP change is a line in the Log. ↩ Void reverses one (quests, purchases, penalties). ± Adjust adds a manual correction with a reason. A
        voided faint gives you your streak back.
      </p>
    ),
  },
  {
    id: "saves",
    emoji: "💾",
    title: "Save points, exports and resets",
    body: () => (
      <ul>
        <li>
          <b>Save points</b> are copies of your game in the cloud: weekly, before every reset, and whenever you like. Loading one can leave your notebook as it is.
        </li>
        <li>
          <b>Backup file</b> (.json) restores the game; <b>Excel / CSV export</b> is for looking at your data in a spreadsheet.
        </li>
        <li>
          <b>🌱 New Game+</b> starts a fresh season (AP, XP, level, streak, trophies) but keeps your setup and history. <b>🧨 Factory reset</b> goes back to the
          starter content. Both make a save point first, and both keep your notebook.
        </li>
      </ul>
    ),
  },
];

export default function Guide({ sub }: { sub?: string }) {
  const { state } = useGame();
  const s = state.settings;
  useEffect(() => {
    if (!sub) return;
    const el = document.getElementById(`guide-${sub}`);
    if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, [sub]);
  return (
    <>
      <div className="page-head">
        <h1>📖 Adventurer's guide</h1>
      </div>
      <p className="small ink2" style={{ margin: "0 4px 12px" }}>
        How {s.pet_name}'s world works. Numbers below are {s.player_name}'s own game rules (change them in Settings → Game rules).
      </p>
      <nav className="guide-index" aria-label="Chapters">
        {CHAPTERS.map((c) => (
          <a key={c.id} className={`chip-btn ${sub === c.id ? "on" : ""}`} href={`#/guide/${c.id}`}>
            {c.emoji} {c.title}
          </a>
        ))}
      </nav>
      {CHAPTERS.map((c) => (
        <section key={c.id} id={`guide-${c.id}`} className="guide-chapter">
          <Panel title={`${c.emoji} ${c.title}`} className={sub === c.id ? "guide-on" : ""}>
            <div className="guide-body">{c.body(s)}</div>
          </Panel>
        </section>
      ))}
    </>
  );
}
