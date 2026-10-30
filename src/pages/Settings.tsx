// Settings: profile, look & sound, game rules, save points/backups, resets, security, about.
import { useEffect, useRef, useState } from "react";
import { addDays, prettyDate } from "../../shared/dates";
import { DEFAULT_SETTINGS, type Settings as S } from "../../shared/rules";
import { api, download, g } from "../api";
import { useFx } from "../fx";
import { useGame } from "../store";
import { Bar, Field, HelpLink, Modal, Panel } from "../components/ui";
import { fmt } from "../util";

interface Snap {
  id: number;
  label: string;
  kind: string;
  created_at: string;
  size: number;
}

const RULES: { k: keyof S; label: string; help: string; step?: string }[] = [
  { k: "day_start_hour", label: "Day starts at (hour)", help: "Before this hour it still counts as yesterday (night owls: 4)" },
  { k: "grace_hours", label: "Grace hours", help: "Hours after a day ends that you can still tick it (default 12 → until 4pm next day)" },
  { k: "max_hp", label: "Max HP", help: "" },
  { k: "crit_chance", label: "Critical-hit chance", help: "0.1 = 10% of quests pay double", step: "0.01" },
  { k: "crit_mult", label: "Critical multiplier", help: "", step: "0.1" },
  { k: "streak_threshold", label: "Streak threshold", help: "Share of dailies needed to keep the streak (0.8 = 80%)", step: "0.05" },
  { k: "streak_bonus_per_day", label: "Streak AP bonus per day", help: "0.02 = +2% AP per streak day", step: "0.01" },
  { k: "streak_bonus_cap", label: "Streak bonus cap", help: "0.5 = max +50%", step: "0.05" },
  { k: "complete_heal", label: "HP healed per quest", help: "" },
  { k: "perfect_day_heal", label: "HP healed on a perfect day", help: "" },
  { k: "perfect_day_chest_chance", label: "Perfect-day chest chance", help: "", step: "0.05" },
  { k: "faint_ap_pct", label: "AP lost when fainting", help: "0.1 = 10% of balance", step: "0.01" },
  { k: "faint_min_ap", label: "Minimum AP lost when fainting", help: "" },
  { k: "revive_quests", label: "Quests needed to revive", help: "" },
  { k: "revive_hp", label: "HP after reviving", help: "" },
  { k: "fainted_earn_mult", label: "Earnings while fainted", help: "0.5 = half AP", step: "0.05" },
];

export default function Settings() {
  const { state, act } = useGame();
  const s = state.settings;
  const [prof, setProf] = useState({ player_name: s.player_name, pet_name: s.pet_name, height_m: s.height_m, birthday: s.birthday ?? "", timezone: s.timezone });
  const [rules, setRules] = useState<Record<string, number>>(() => Object.fromEntries(RULES.map((r) => [r.k, s[r.k] as number])));
  const [reset, setReset] = useState<null | "season" | "factory">(null);

  return (
    <>
      <div className="page-head">
        <h1>⚙️ Settings <HelpLink to="saves" /></h1>
      </div>
      <div className="grid2">
        <Panel title="🧑 Profile">
          <Field label="Your name">
            <input className="input" value={prof.player_name} onChange={(e) => setProf({ ...prof, player_name: e.target.value })} />
          </Field>
          <Field label="Pet name">
            <input className="input" value={prof.pet_name} onChange={(e) => setProf({ ...prof, pet_name: e.target.value })} />
          </Field>
          <Field label="Height (m)" help="Used for BMI">
            <input className="input" type="number" step="0.01" inputMode="decimal" value={prof.height_m} onChange={(e) => setProf({ ...prof, height_m: Number(e.target.value) })} />
          </Field>
          <Field label="Birthday (MM-DD)" help="Unlocks birthday voucher rules">
            <input className="input" placeholder="e.g. 03-27" value={prof.birthday} onChange={(e) => setProf({ ...prof, birthday: e.target.value })} />
          </Field>
          <Field label="Timezone">
            <input className="input" value={prof.timezone} onChange={(e) => setProf({ ...prof, timezone: e.target.value })} />
          </Field>
          <button className="btn good" onClick={() => act("settings", { ...prof, birthday: /^\d{2}-\d{2}$/.test(prof.birthday) ? prof.birthday : null }, "PUT").catch(() => {})}>
            Save profile
          </button>
        </Panel>

        <Panel title="🎨 Look & sound">
          <Field label="Theme">
            <select className="input" value={s.theme} onChange={(e) => act("settings", { theme: e.target.value }, "PUT").catch(() => {})}>
              <option value="auto">Auto (follow phone)</option>
              <option value="day">☀️ Day</option>
              <option value="night">🌙 Night</option>
            </select>
          </Field>
          <label className="check">
            <input type="checkbox" checked={s.sound} onChange={(e) => act("settings", { sound: e.target.checked }, "PUT").catch(() => {})} />
            8-bit sound effects
          </label>
          <p className="small ink2">Tip: tap your pet on the Camp page to change hats and colours.</p>
        </Panel>

        <Panel title="🎲 Game rules" className="span2">
          <p className="small ink2" style={{ marginTop: 0 }}>
            Tune the difficulty. Quest rewards and penalties are edited on each quest; shop prices on each item.
          </p>
          <div className="grid3">
            {RULES.map((r) => (
              <Field key={r.k} label={r.label} help={r.help || undefined}>
                <input className="input" type="number" step={r.step ?? "1"} inputMode="decimal" value={rules[r.k]} onChange={(e) => setRules({ ...rules, [r.k]: Number(e.target.value) })} />
              </Field>
            ))}
          </div>
          <div className="row">
            <button className="btn good" onClick={() => act("settings", rules, "PUT").catch(() => {})}>
              Save rules
            </button>
            <button className="btn" onClick={() => setRules(Object.fromEntries(RULES.map((r) => [r.k, DEFAULT_SETTINGS[r.k] as number])))}>
              Restore defaults
            </button>
          </div>
        </Panel>

        <SavePoints />

        <ExportData />

        <Pictures />

        <Panel title="💥 Danger zone">
          <div className="col">
            <div className="inset">
              <b>🌱 New Game+</b>
              <p className="small ink2">
                Archive this season to the Hall of Fame and start fresh: AP, XP, level, HP, streak, inventory and achievements reset. Your quests, shop,
                vouchers, trackers and health history are kept. A save point is made first.
              </p>
              <button className="btn gold" onClick={() => setReset("season")}>
                Start New Game+
              </button>
            </div>
            <div className="inset">
              <b>🧨 Factory reset</b>
              <p className="small ink2">Wipe everything back to the starter content (a save point is made first, so this can be undone from Save points).</p>
              <button className="btn danger" onClick={() => setReset("factory")}>
                Factory reset
              </button>
            </div>
          </div>
        </Panel>

        <Security />
      </div>
      {reset && <ResetModal kind={reset} onClose={() => setReset(null)} />}
    </>
  );
}

function SavePoints() {
  const { act } = useGame();
  const fx = useFx();
  const [snaps, setSnaps] = useState<Snap[] | null>(null);
  const [label, setLabel] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const load = () => api<Snap[]>(g("snapshots")).then(setSnaps).catch(() => setSnaps([]));
  useEffect(() => void load(), []);
  const kindLabel: Record<string, string> = { manual: "💾", auto: "🕒", "pre-reset": "🧯", "pre-restore": "↩️" };
  return (
    <Panel title="💾 Save points & backups" className="span2">
      <p className="small ink2" style={{ marginTop: 0 }}>
        Save points are full copies of your game stored in the cloud database. One is made automatically every week and before any reset or restore. For
        off-site safety, download a backup file now and then.
      </p>
      <div className="row wrap">
        <input className="input" style={{ flex: 1, minWidth: 180 }} placeholder="Name this save (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button
          className="btn good"
          onClick={async () => {
            try {
              await api(g("snapshots"), { body: { label: label || "Manual save" } });
              setLabel("");
              fx.toast("Game saved", "💾");
              void load();
            } catch (e) {
              fx.error((e as Error).message);
            }
          }}
        >
          Save now
        </button>
        <button className="btn" onClick={() => download(g("export"), `ap-life-quest-${new Date().toISOString().slice(0, 10)}.json`).catch((e) => fx.error(e.message))}>
          ⬇ Download backup
        </button>
        <button className="btn" onClick={() => file.current?.click()}>
          ⬆ Import backup
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          className="hide"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (!confirm(`Replace ALL current data with “${f.name}”? (A save point of the current game is made first.)`)) return;
            try {
              await act("import", JSON.parse(await f.text()));
              void load();
            } catch (err) {
              if (err instanceof SyntaxError) fx.error("That file isn't valid JSON");
            }
          }}
        />
      </div>
      <div className="list" style={{ marginTop: 10 }}>
        {snaps === null && <div className="muted small">Loading…</div>}
        {snaps?.length === 0 && <div className="muted small">No save points yet.</div>}
        {snaps?.map((sp) => (
          <div className="li" key={sp.id}>
            <span style={{ fontSize: 20 }}>{kindLabel[sp.kind] ?? "💾"}</span>
            <div className="grow">
              <b>{sp.label}</b>
              <div className="tiny muted">
                {new Date(sp.created_at.replace(" ", "T") + "Z").toLocaleString("en-SG")} · {fmt(sp.size / 1024, 0)} KB · {sp.kind}
              </div>
            </div>
            <button
              className="btn xs gold"
              onClick={async () => {
                if (!confirm(`Load “${sp.label}”? Your current game is saved first, then replaced.`)) return;
                const notes = confirm("Roll your notebook (notes & journal) back to this save point too?\n\nOK = yes, roll notes back · Cancel = keep today's notes");
                try {
                  await act(`snapshots/${sp.id}/restore`, { notes });
                  void load();
                } catch {}
              }}
            >
              Load
            </button>
            <button className="btn xs" onClick={() => download(g(`snapshots/${sp.id}/download`), `ap-life-quest-savepoint-${sp.id}.json`).catch((e) => fx.error(e.message))} aria-label="Download">
              ⬇
            </button>
            <button
              className="btn xs"
              aria-label="Delete"
              onClick={async () => {
                if (!confirm(`Delete save point “${sp.label}”?`)) return;
                await api(g(`snapshots/${sp.id}`), { method: "DELETE" }).catch((e) => fx.error(e.message));
                void load();
              }}
            >
              🗑
            </button>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** Your data as a spreadsheet (like the old APES sheet) or CSV files. */
type Preset = "all" | "this-month" | "last-month" | "last-30" | "this-year" | "custom";

/** First and last day of the month `date` is in. */
const monthOf = (date: string) => {
  const [y, m] = date.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${date.slice(0, 7)}-01`, to: `${date.slice(0, 7)}-${String(last).padStart(2, "0")}` };
};

function presetPeriod(p: Preset, today: string, custom: { from: string; to: string }) {
  switch (p) {
    case "this-month":
      return monthOf(today);
    case "last-month":
      return monthOf(addDays(`${today.slice(0, 7)}-01`, -1));
    case "last-30":
      return { from: addDays(today, -29), to: today };
    case "this-year":
      return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
    case "custom":
      return custom;
    default:
      return null;
  }
}

function ExportData() {
  const { state } = useGame();
  const fx = useFx();
  const [busy, setBusy] = useState<null | "xlsx" | "csv">(null);
  const [preset, setPreset] = useState<Preset>("all");
  const [custom, setCustom] = useState(() => monthOf(state.today));
  const period = presetPeriod(preset, state.today, custom);
  const badRange = !!period && (!period.from || !period.to || period.from > period.to);
  const run = async (kind: "xlsx" | "csv") => {
    if (badRange) return;
    setBusy(kind);
    try {
      const { exportData } = await import("../export");
      const n = await exportData(kind, state.settings.player_name, state.today, period);
      fx.toast(`Exported ${n.toLocaleString("en-SG")} rows`, "📊");
    } catch (e) {
      fx.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Panel title="📊 Export to Excel / CSV">
      <p className="small ink2" style={{ marginTop: 0 }}>
        Everything this character has collected, as a spreadsheet: trackers by date (weight, calories, BMI…), the AP ledger with a running balance, quests done,
        purchases, goals, sprints, trophies, events and your notes as text. Opens in Excel, Numbers or Google Sheets. (For restoring the game, use the backup file
        above instead.)
      </p>
      <Field label="Period">
        <select className="input" value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
          <option value="all">Everything</option>
          <option value="this-month">This month</option>
          <option value="last-month">Last month</option>
          <option value="last-30">Last 30 days</option>
          <option value="this-year">This year</option>
          <option value="custom">Choose dates…</option>
        </select>
      </Field>
      {preset === "custom" && (
        <div className="row wrap export-dates">
          <label className="field">
            <span>From</span>
            <input className="input" type="date" value={custom.from} max={custom.to || undefined} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
          </label>
          <label className="field">
            <span>To</span>
            <input className="input" type="date" value={custom.to} min={custom.from || undefined} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
          </label>
        </div>
      )}
      <p className={`small ${badRange ? "neg" : "ink2"}`} style={{ margin: "0 0 8px" }}>
        {badRange
          ? "Pick a start date on or before the end date."
          : period
            ? `${prettyDate(period.from)} – ${prettyDate(period.to)}: dated things (trackers, the AP log, quests done, purchases, events, notes, trophies won) in this range, plus totals for the period on the Summary tab. Your quest and goal lists are always included in full.`
            : "Everything since the start."}
      </p>
      <div className="row wrap">
        <button className="btn good" disabled={!!busy || badRange} onClick={() => run("xlsx")}>
          {busy === "xlsx" ? "Building…" : "⬇ Excel (.xlsx)"}
        </button>
        <button className="btn" disabled={!!busy || badRange} onClick={() => run("csv")}>
          {busy === "csv" ? "Building…" : "⬇ CSV files (.zip)"}
        </button>
      </div>
    </Panel>
  );
}

interface MediaStats {
  count: number;
  bytes: number;
  unused: number;
  limit: number;
}

function Pictures() {
  const { act } = useGame();
  const fx = useFx();
  const [m, setM] = useState<MediaStats | null>(null);
  const load = () => api<MediaStats>(g("media")).then(setM).catch(() => setM(null));
  useEffect(() => void load(), []);
  return (
    <Panel title="🖼️ Pictures & voice memos">
      {m ? (
        <>
          <p className="small">
            {m.count} file(s) · {fmt(m.bytes / 1024 / 1024, 1)} MB of {fmt(m.limit / 1024 / 1024, 0)} MB
          </p>
          <Bar value={m.bytes} max={m.limit} kind="gold" thin seg={false} />
          <div className="row wrap" style={{ marginTop: 10 }}>
            <button
              className="btn sm"
              disabled={!m.unused}
              onClick={() =>
                confirm(`Delete ${m.unused} picture(s) / voice memo(s) that nothing uses any more (notes in the trash still count as using them)? Older save points may then show a placeholder.`) &&
                act("media/cleanup").then(load).catch((e) => fx.error(e.message))
              }
            >
              🧹 Remove {m.unused} unused
            </button>
          </div>
        </>
      ) : (
        <p className="small muted">Loading…</p>
      )}
      <p className="tiny muted">Add pictures to quests, events, goals, shop items, vouchers, achievements and sprint bosses from their edit screens, and pictures, sketches and voice memos to notes.</p>
    </Panel>
  );
}

function ResetModal({ kind, onClose }: { kind: "season" | "factory"; onClose: () => void }) {
  const { act } = useGame();
  const [typed, setTyped] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState(false);
  const phrase = kind === "season" ? "NEW GAME" : "RESET EVERYTHING";
  return (
    <Modal
      title={kind === "season" ? "🌱 New Game+" : "🧨 Factory reset"}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className={`btn ${kind === "season" ? "gold" : "danger"}`}
            disabled={typed !== phrase}
            onClick={() =>
              act(kind === "season" ? "reset/season" : "reset/factory", { confirm: typed, name, notes })
                .then(() => {
                  onClose();
                  location.hash = "#/";
                })
                .catch(() => {})
            }
          >
            {kind === "season" ? "Begin new season" : "Wipe & restart"}
          </button>
        </>
      }
    >
      {kind === "season" ? (
        <>
          <p>A fresh start doesn't erase who you are. It just gives you a new run. Your history and setup stay.</p>
          <Field label="Name your new season">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Season 2: The Comeback" />
          </Field>
        </>
      ) : (
        <>
          <p>Everything goes back to the starter content. A save point is created first.</p>
          <p className="small ink2">Your notebook (notes & journal) is life, not game progress, so it stays unless you tick this:</p>
          <label className="check">
            <input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} /> Also delete my notebook
          </label>
        </>
      )}
      <Field label={`Type ${phrase} to confirm`}>
        <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" />
      </Field>
    </Modal>
  );
}

function Security() {
  const { state } = useGame();
  return (
    <Panel title="🔐 Security & about" className="span2">
      <div className="grid2">
        <div>
          <p className="small ink2" style={{ marginTop: 0 }}>
            Only you can get in: password (+ optional 2FA codes), sessions in secure HttpOnly cookies, and a lock-out after repeated wrong guesses.
          </p>
          <div className="row wrap">
            <button className="btn" onClick={() => api("auth/logout", { body: {} }).finally(() => location.reload())}>
              Log out
            </button>
            <button className="btn danger" onClick={() => confirm("Log out on every device (phone, laptop…)?") && api("account/logout-all", { body: {} }).finally(() => location.reload())}>
              Log out everywhere
            </button>
          </div>
          <p className="tiny muted">
            Password, 2FA and devices: <a href="#/account">Account page</a> · Switch or create characters: <a href="#/characters">Characters</a>
          </p>
        </div>
        <div className="small ink2">
          <div>
            App <b>v{__APP_VERSION__}</b> · server v{state.version}
          </div>
          <div>Built {new Date(__BUILD_TIME__).toLocaleString("en-SG")}</div>
          <div>
            Today (game day): {state.today} · closed through {state.closed}
          </div>
          <div className="tiny muted" style={{ marginTop: 6 }}>
            Update: <span className="kbd">npm run deploy</span> · Roll back: <span className="kbd">npm run rollback</span> · See README.md
          </div>
        </div>
      </div>
    </Panel>
  );
}
