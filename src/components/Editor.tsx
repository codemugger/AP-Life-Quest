// One editor for every configurable thing. Field specs live here; the server whitelists columns.
import { useMemo, useState, type ReactElement } from "react";
import { PRIORITIES, PRIORITY_ORDER, priorityOf } from "../../shared/priority";
import { DIFFICULTY } from "../../shared/rules";
import type { GameState } from "../../shared/types";
import { useGame } from "../store";
import { ImagesInput } from "./Media";
import { DaysInput, EmojiInput, Field, Modal } from "./ui";

type FType = "text" | "textarea" | "number" | "select" | "emoji" | "date" | "bool" | "days" | "multi" | "json" | "images" | "url";
interface F {
  k: string;
  label: string;
  type: FType;
  options?: [string, string][];
  help?: string;
  show?: (d: Record<string, any>) => boolean;
  step?: string;
  list?: string[];
  max?: number;
}
interface Spec {
  title: string;
  pk: "id" | "key";
  defaults: Record<string, any>;
  fields: F[];
  /** turn editor draft into API body */
  toBody?: (d: Record<string, any>) => Record<string, any>;
  /** turn a stored row into an editor draft */
  fromRow?: (r: Record<string, any>) => Record<string, any>;
}

const AREAS: [string, string][] = [
  ["body", "💪 Body & health"],
  ["mind", "📚 Mind & learning"],
  ["career", "💼 Career & coaching"],
  ["family", "👪 Family"],
  ["social", "🫶 Friends & social"],
  ["money", "💰 Money"],
  ["home", "🏠 Home"],
  ["fun", "🎮 Fun"],
  ["life", "🌱 Life"],
];

const ACH_RULES: [string, string, "n" | "metric+n" | "metric" | "none"][] = [
  ["quests_done", "Complete N quests", "n"],
  ["streak", "Reach an N-day streak", "n"],
  ["level", "Reach level N", "n"],
  ["perfect_days", "N perfect days", "n"],
  ["metric_days", "Log a tracker on N days", "metric+n"],
  ["metric_total", "Tracker all-time total ≥ N", "metric+n"],
  ["metric_week_sum", "Tracker total in one week ≥ N", "metric+n"],
  ["under_target_streak", "N days in a row at/under tracker target", "metric+n"],
  ["metric_streak", "Log a tracker N days in a row", "metric+n"],
  ["notes", "Keep N notes in the notebook", "n"],
  ["metric_target", "Reach the tracker's target", "metric"],
  ["weight_lost", "Lose N kg from first weigh-in", "n"],
  ["bmi_below", "BMI below N", "n"],
  ["purchases", "Buy N things", "n"],
  ["ap_balance", "Hold N AP at once", "n"],
  ["chests_opened", "Open N chests", "n"],
  ["crits", "Land N critical hits", "n"],
  ["sprints_won", "Win N sprints", "n"],
  ["goals_done", "Complete N goals", "n"],
  ["revives", "Revive N times", "n"],
  ["manual", "I'll claim it myself", "none"],
];

const V_RULES: [string, string][] = [
  ["", "No automatic check (honour system)"],
  ["month_earned", "AP earned this month ≥ N"],
  ["metric_week_sum", "Tracker total this week ≥ N"],
  ["metric_total", "Tracker all-time total ≥ N"],
  ["metric_recent", "Latest value (today/yesterday) ≤ N"],
  ["metric_latest", "Latest value ever ≤ N"],
  ["metric_ema", "Tracker 30-day EMA ≤ N"],
  ["birthday", "Only on my birthday"],
  ["json", "Advanced (JSON)"],
];

function specs(s: GameState): Record<string, Spec> {
  const metricOpts: [string, string][] = s.metrics.map((m) => [m.key, `${m.emoji} ${m.name}`]);
  const categories = [...new Set(s.shop.map((i) => i.category))];
  return {
    quests: {
      title: "Quest",
      pk: "id",
      defaults: { type: "daily", title: "", emoji: "⭐", difficulty: "medium", ap: 10, xp: 20, hp_penalty: 5, polarity: 1, days: "1111111", weekly_target: 1, area: "life", active: 1 },
      fields: [
        { k: "type", label: "Type", type: "select", options: [["daily", "Daily — due every (chosen) day"], ["weekly", "Weekly — N times a week"], ["habit", "Habit — tap any time, good or bad"], ["todo", "To-do — one-off"]] },
        { k: "title", label: "Title", type: "text" },
        // to-dos: how pressing it is comes first
        {
          k: "priority",
          label: "Priority (Eisenhower matrix)",
          type: "select",
          options: [["", "— not sorted (no penalty) —"], ...PRIORITY_ORDER.map((p): [string, string] => [p, `${PRIORITIES[p].emoji} ${PRIORITIES[p].label} · ${PRIORITIES[p].quadrant}`])],
          help: "Sets what a missed deadline costs. 🔥 −HP and its AP, then keeps hurting · 📅 −HP, keeps hurting, +25% AP if early · ⚡ −HP once · 🧹 nothing. Late = half pay.",
          show: (d) => d.type === "todo",
        },
        {
          k: "due_date",
          label: "Due date",
          type: "date",
          help: "Deadline penalties need a due date (🔥 Do now defaults to today).",
          show: (d) => d.type === "todo",
        },
        { k: "emoji", label: "Icon", type: "emoji" },
        { k: "images", label: "Picture (optional, replaces the icon)", type: "images", max: 3 },
        { k: "difficulty", label: "Difficulty (sets rewards)", type: "select", options: Object.entries(DIFFICULTY).map(([k, v]) => [k, `${v.label} · ${v.ap} AP · ${v.xp} XP`]) },
        { k: "polarity", label: "Good or bad habit?", type: "select", options: [["1", "😇 Good (+AP)"], ["-1", "😈 Bad (−AP, −HP)"]], show: (d) => d.type === "habit" },
        { k: "ap", label: "AP", type: "number", help: "Per completion (per unit if the habit has a unit)" },
        { k: "xp", label: "XP", type: "number" },
        {
          k: "hp_penalty",
          label: "HP damage",
          type: "number",
          help: "Dailies/weeklies: when missed. Bad habits: per tap. To-dos: when the deadline passes (half of it each extra late day for 🔥/📅).",
          show: (d) => (d.type === "todo" ? !!d.priority && d.priority !== "later" : !(d.type === "habit" && Number(d.polarity) > 0)),
        },
        { k: "unit", label: "Unit (optional)", type: "text", help: "e.g. h — then you'll be asked how many (coaching hours)", show: (d) => d.type === "habit" },
        { k: "days", label: "Due on", type: "days", show: (d) => d.type === "daily" },
        { k: "weekly_target", label: "Times per week", type: "number", show: (d) => d.type === "weekly" },
        { k: "metric_key", label: "Auto-complete from a tracker", type: "select", options: [["", "— no, I'll tick it —"], ...metricOpts], show: (d) => d.type === "daily" || d.type === "todo" },
        { k: "metric_op", label: "Complete when…", type: "select", options: [["logged", "anything is logged"], ["<=", "value ≤ threshold"], [">=", "value ≥ threshold"]], show: (d) => !!d.metric_key },
        { k: "metric_value", label: "Threshold", type: "number", help: "Leave empty to follow the tracker's target", show: (d) => !!d.metric_key && d.metric_op !== "logged" },
        { k: "area", label: "Life area", type: "select", options: AREAS },
        { k: "notes", label: "Notes / instructions", type: "textarea", help: 'Supports **bold**, *italic*, "- " lists and links' },
        { k: "link", label: "Link (workout video, map, website…)", type: "url" },
        { k: "active", label: "Active", type: "bool" },
      ],
      toBody: (d) => ({
        ...d,
        metric_key: d.metric_key || null,
        metric_op: d.metric_key ? d.metric_op || "logged" : null,
        ...("priority" in d ? { priority: d.priority || null } : {}),
        // only habits show the good/bad choice; other quests keep the default (good)
        ...(d.polarity !== undefined && d.polarity !== null ? { polarity: Number(d.polarity) } : {}),
      }),
    },
    metrics: {
      title: "Tracker",
      pk: "key",
      defaults: { key: "", name: "", emoji: "📈", unit: "", mode: "set", direction: "none", decimals: 1, active: 1 },
      fields: [
        { k: "key", label: "Key (permanent id)", type: "text", help: "lowercase, e.g. steps, sleep, pushups", show: (d) => !d.__existing },
        { k: "name", label: "Name", type: "text" },
        { k: "emoji", label: "Icon", type: "emoji" },
        { k: "unit", label: "Unit", type: "text" },
        { k: "mode", label: "Logging", type: "select", options: [["set", "One value per day (weight, BP)"], ["add", "Adds up during the day (hours, glasses)"]] },
        { k: "direction", label: "Which way is good?", type: "select", options: [["down", "⬇️ Lower is better"], ["up", "⬆️ Higher is better"], ["none", "— neutral —"]] },
        { k: "target", label: "Target / budget", type: "number", step: "any" },
        { k: "decimals", label: "Decimals", type: "number" },
        { k: "quick", label: "Quick-add buttons", type: "text", help: "comma list, e.g. 0.5,1,2", show: (d) => d.mode === "add" },
        { k: "active", label: "Show this tracker", type: "bool" },
      ],
    },
    shop_items: {
      title: "Shop item",
      pk: "id",
      defaults: { name: "", emoji: "🎁", category: "Treats", base_price: 50, tax: 1, unit: "ticket", voucher_ok: 1, min_level: 0, active: 1 },
      fields: [
        { k: "name", label: "Name", type: "text" },
        { k: "emoji", label: "Icon", type: "emoji" },
        { k: "images", label: "Picture (optional)", type: "images", max: 3 },
        { k: "category", label: "Category", type: "text", list: categories },
        { k: "base_price", label: "Base price (AP)", type: "number" },
        { k: "tax", label: "Tax multiplier", type: "number", step: "any", help: "1 = no tax, 3 = x3 tax" },
        { k: "unit", label: "Unit", type: "text", help: "ticket, hour, pass…" },
        { k: "voucher_ok", label: "Vouchers allowed", type: "bool" },
        { k: "effect", label: "Special effect", type: "select", options: [["", "— none (real-life reward) —"], ["heal:30", "Heal 30 HP"], ["heal:60", "Heal 60 HP"], ["rest_day", "Rest day"], ["streak_freeze", "Streak shield (auto)"]] },
        { k: "trigger_metric", label: "Required automatically when a tracker…", type: "select", options: [["", "— never —"], ...metricOpts] },
        { k: "trigger_min", label: "…is at least", type: "number", show: (d) => !!d.trigger_metric },
        { k: "trigger_max", label: "…and at most (empty = no limit)", type: "number", step: "any", show: (d) => !!d.trigger_metric },
        { k: "min_level", label: "Unlocks at level", type: "number" },
        { k: "notes", label: "Notes / T&Cs", type: "textarea", help: 'Supports **bold**, *italic*, "- " lists and links' },
        { k: "active", label: "In stock", type: "bool" },
      ],
      toBody: (d) => ({ ...d, effect: d.effect || null, trigger_metric: d.trigger_metric || null }),
    },
    vouchers: {
      title: "Voucher",
      pk: "id",
      defaults: { name: "", emoji: "🎟️", discount: 0.2, scope: "all", limit_type: "infinite", limit_count: 1, active: 1, _rt: "" },
      fields: [
        { k: "name", label: "Name", type: "text" },
        { k: "emoji", label: "Icon", type: "emoji" },
        { k: "images", label: "Picture (optional)", type: "images", max: 1 },
        { k: "discount", label: "Discount (0.3 = 30% off)", type: "number", step: "0.05" },
        { k: "description", label: "Description", type: "text" },
        { k: "scope", label: "Applies to", type: "select", options: [["all", "All items (that allow vouchers)"], ["categories", "Only some categories"], ["items", "Only some items"]] },
        { k: "_cats", label: "Categories", type: "multi", options: categories.map((c) => [c, c]), show: (d) => d.scope === "categories" },
        { k: "_items", label: "Items", type: "multi", options: s.shop.map((i) => [String(i.id), `${i.emoji} ${i.name}`]), show: (d) => d.scope === "items" },
        { k: "limit_type", label: "Usage limit", type: "select", options: [["infinite", "Unlimited"], ["once", "Once per season"], ["per_week", "Per week"], ["per_month", "Per month"]] },
        { k: "limit_count", label: "Uses per period", type: "number", show: (d) => d.limit_type === "per_week" || d.limit_type === "per_month" },
        { k: "condition", label: "Condition (shown as a reminder)", type: "textarea" },
        { k: "_rt", label: "Automatic check", type: "select", options: V_RULES },
        { k: "_rm", label: "Tracker", type: "select", options: metricOpts, show: (d) => String(d._rt).startsWith("metric") },
        { k: "_rn", label: "N", type: "number", step: "any", show: (d) => !!d._rt && d._rt !== "birthday" && d._rt !== "json" },
        { k: "rule", label: "Rule JSON", type: "json", show: (d) => d._rt === "json", help: 'e.g. {"t":"all","rules":[{"t":"metric_latest","metric":"weight","max":55}]}' },
        { k: "active", label: "Active", type: "bool" },
      ],
      fromRow: (r) => {
        let rule: any = null;
        try {
          rule = r.rule ? JSON.parse(r.rule) : null;
        } catch {}
        let vals: string[] = [];
        try {
          vals = r.scope_values ? JSON.parse(r.scope_values) : [];
        } catch {}
        const simple = rule && rule.t !== "all";
        return {
          ...r,
          _cats: r.scope === "categories" ? vals : [],
          _items: r.scope === "items" ? vals.map(String) : [],
          _rt: !rule ? "" : simple ? rule.t : "json",
          _rm: rule?.metric ?? metricOpts[0]?.[0],
          _rn: rule ? (rule.min ?? rule.max ?? "") : "",
          rule: r.rule ?? "",
        };
      },
      toBody: (d) => {
        const { _cats, _items, _rt, _rm, _rn, ...rest } = d;
        let rule: any = null;
        const n = Number(_rn);
        if (_rt === "json") rule = d.rule || null;
        else if (_rt === "birthday") rule = { t: "birthday" };
        else if (_rt === "month_earned") rule = { t: _rt, min: n };
        else if (_rt === "metric_week_sum" || _rt === "metric_total") rule = { t: _rt, metric: _rm, min: n };
        else if (_rt === "metric_recent" || _rt === "metric_latest") rule = { t: _rt, metric: _rm, max: n };
        else if (_rt === "metric_ema") rule = { t: _rt, metric: _rm, period: 30, max: n };
        return { ...rest, rule, scope_values: d.scope === "categories" ? _cats : d.scope === "items" ? _items.map(Number) : null };
      },
    },
    achievements: {
      title: "Achievement",
      pk: "id",
      defaults: { name: "", emoji: "🏆", tier: "bronze", ap: 20, xp: 30, hidden: 0, active: 1, _t: "manual", _n: 1, _m: "weight" },
      fields: [
        { k: "name", label: "Name", type: "text" },
        { k: "emoji", label: "Icon", type: "emoji" },
        { k: "description", label: "Description", type: "text" },
        { k: "images", label: "Badge picture (optional)", type: "images", max: 1 },
        { k: "_t", label: "Unlocks when…", type: "select", options: ACH_RULES.map(([k, l]) => [k, l]) },
        { k: "_m", label: "Tracker", type: "select", options: metricOpts, show: (d) => ACH_RULES.find((r) => r[0] === d._t)?.[2].startsWith("metric") ?? false },
        { k: "_n", label: "N", type: "number", step: "any", show: (d) => ["n", "metric+n"].includes(ACH_RULES.find((r) => r[0] === d._t)?.[2] ?? "") },
        { k: "tier", label: "Tier", type: "select", options: [["bronze", "🥉 Bronze"], ["silver", "🥈 Silver"], ["gold", "🥇 Gold (+rare chest)"], ["platinum", "💎 Platinum (+epic chest)"]] },
        { k: "ap", label: "AP reward", type: "number" },
        { k: "xp", label: "XP reward", type: "number" },
        { k: "hidden", label: "Secret (hidden until unlocked)", type: "bool" },
        { k: "active", label: "Active", type: "bool" },
      ],
      fromRow: (r) => {
        let rule: any = {};
        try {
          rule = JSON.parse(r.rule);
        } catch {}
        return { ...r, _t: rule.t ?? "manual", _n: rule.n ?? rule.kg ?? rule.value ?? 1, _m: rule.metric ?? "weight" };
      },
      toBody: (d) => {
        const { _t, _n, _m, ...rest } = d;
        const n = Number(_n);
        const rule: any = { t: _t };
        if (_t === "weight_lost") rule.kg = n;
        else if (_t === "bmi_below") rule.value = n;
        else if (_t !== "manual" && _t !== "metric_target") rule.n = n;
        if (String(_t).startsWith("metric") || _t === "under_target_streak") rule.metric = _m;
        return { ...rest, rule };
      },
    },
    goals: {
      title: "Life goal",
      pk: "id",
      defaults: { title: "", emoji: "🎯", area: "life", mode: "milestones", progress: 0, ap: 200, xp: 200 },
      fields: [
        { k: "title", label: "Goal", type: "text" },
        { k: "emoji", label: "Icon", type: "emoji" },
        { k: "description", label: "Why it matters", type: "textarea", help: 'Supports **bold**, *italic*, "- " lists and links' },
        { k: "images", label: "Vision board pictures", type: "images", max: 6 },
        { k: "link", label: "Link (optional)", type: "url" },
        { k: "area", label: "Life area", type: "select", options: AREAS },
        { k: "target_date", label: "Target date", type: "date" },
        { k: "mode", label: "Progress from", type: "select", options: [["milestones", "🚩 Milestones checklist"], ["metric", "📈 A tracker reaching a value"], ["manual", "🎚️ Manual %"]] },
        { k: "metric_key", label: "Tracker", type: "select", options: [["", "—"], ...metricOpts], show: (d) => d.mode === "metric" },
        { k: "start_value", label: "Start value", type: "number", step: "any", help: "Empty = your first logged value", show: (d) => d.mode === "metric" },
        { k: "target_value", label: "Target value", type: "number", step: "any", show: (d) => d.mode === "metric" },
        { k: "progress", label: "Progress %", type: "number", show: (d) => d.mode === "manual" },
        { k: "ap", label: "AP reward", type: "number" },
        { k: "xp", label: "XP reward", type: "number" },
      ],
      toBody: (d) => ({ ...d, metric_key: d.metric_key || null }),
    },
    sprints: {
      title: "Sprint (boss raid)",
      pk: "id",
      defaults: { title: "", boss: "Procrastination Slime", boss_emoji: "👾", start_date: s.today, end_date: "", ap: 150, xp: 150, _tasks: "" },
      fields: [
        { k: "title", label: "Sprint name", type: "text" },
        { k: "boss", label: "Boss name", type: "text", help: "Name the thing you're fighting: Sugar Dragon, Doomscroll Demon…" },
        { k: "images", label: "Boss picture (try pixel art!)", type: "images", max: 1 },
        { k: "boss_emoji", label: "Boss", type: "select", options: [["👾", "👾 Slime"], ["🐉", "🐉 Dragon"], ["👹", "👹 Ogre"], ["🦑", "🦑 Kraken"], ["🧟", "🧟 Zombie"], ["🤖", "🤖 Robot"], ["👻", "👻 Ghost"], ["🦖", "🦖 Rex"]] },
        { k: "start_date", label: "Start", type: "date" },
        { k: "end_date", label: "End", type: "date", help: "1–4 weeks works well" },
        { k: "goal_id", label: "Part of goal", type: "select", options: [["", "—"], ...s.goals.filter((g) => g.status === "active").map((g) => [String(g.id), `${g.emoji} ${g.title}`] as [string, string])] },
        { k: "_tasks", label: "Tasks (one per line, add * for double damage)", type: "textarea", show: (d) => !d.__existing },
        { k: "ap", label: "AP reward", type: "number" },
        { k: "xp", label: "XP reward", type: "number" },
      ],
      toBody: (d) => {
        const { _tasks, ...rest } = d;
        return { ...rest, goal_id: d.goal_id ? Number(d.goal_id) : null };
      },
    },
    events: {
      title: "Event",
      pk: "id",
      defaults: { title: "", emoji: "📅", kind: "event", date: s.today },
      fields: [
        { k: "title", label: "What", type: "text" },
        { k: "emoji", label: "Icon", type: "emoji" },
        { k: "kind", label: "Type", type: "select", options: [["event", "📅 Event"], ["trip", "✈️ Trip / adventure"], ["milestone", "🏁 Life milestone"], ["memory", "📸 Memory"]] },
        { k: "date", label: "Date", type: "date" },
        { k: "end_date", label: "Until (optional)", type: "date" },
        { k: "images", label: "Photos", type: "images", max: 12 },
        { k: "notes", label: "Notes / story", type: "textarea", help: 'Supports **bold**, *italic*, "- " lists and links' },
        { k: "link", label: "Link (booking, map, album…)", type: "url" },
      ],
    },
  };
}

export function Editor({ entity, row, onClose }: { entity: string; row?: Record<string, any> | null; onClose: () => void }) {
  const { state, act } = useGame();
  const spec = useMemo(() => specs(state)[entity], [state, entity]);
  const existing = !!row && row[spec.pk] !== undefined;
  const [d, setD] = useState<Record<string, any>>(() => {
    const base = { ...spec.defaults, ...(row ? (spec.fromRow ? spec.fromRow(row) : row) : {}) };
    // new to-dos start as 📅 Schedule (important, not urgent)
    if (entity === "quests" && !existing && base.type === "todo" && base.priority === undefined) Object.assign(base, { priority: "schedule", hp_penalty: PRIORITIES.schedule.hp });
    return { ...base, __existing: existing };
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) =>
    setD((prev) => {
      const next = { ...prev, [k]: v };
      if (entity === "quests" && k === "difficulty" && DIFFICULTY[v])
        Object.assign(next, { ap: DIFFICULTY[v].ap, xp: DIFFICULTY[v].xp, hp_penalty: next.type === "todo" ? (priorityOf(next.priority)?.hp ?? 0) : DIFFICULTY[v].hp });
      // a to-do's priority sets its deadline damage; "Do now" is due today unless you pick a date
      if (entity === "quests" && k === "priority") {
        next.hp_penalty = priorityOf(v)?.hp ?? 0;
        if (v === "do" && !next.due_date) next.due_date = state.today;
      }
      if (entity === "quests" && k === "type" && v === "todo" && next.priority === undefined) Object.assign(next, { priority: "schedule", hp_penalty: PRIORITIES.schedule.hp });
      return next;
    });

  const visible = spec.fields.filter((f) => !f.show || f.show(d));

  const save = async () => {
    setSaving(true);
    try {
      const draft: Record<string, any> = {};
      for (const f of spec.fields) if (f.k in d) draft[f.k] = d[f.k];
      for (const f of spec.fields) if (f.show && !f.show(d) && !f.k.startsWith("_")) delete draft[f.k];
      let body = spec.toBody ? spec.toBody(draft) : draft;
      for (const k of Object.keys(body)) if (k.startsWith("_")) delete body[k];
      if (existing) await act(`data/${entity}/${row![spec.pk]}`, body, "PUT");
      else {
        const res = await act(`data/${entity}`, body, "POST");
        if (entity === "sprints" && d._tasks && res?.id) {
          const lines = String(d._tasks).split("\n").map((l) => l.trim()).filter(Boolean);
          for (const [i, l] of lines.entries())
            await act("data/sprint_tasks", { sprint_id: res.id, title: l.replace(/\*+$/, "").trim(), dmg: l.endsWith("*") ? 2 : 1, sort: i });
        }
      }
      onClose();
    } catch {
      /* error toast already shown */
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const name = row?.title ?? row?.name ?? "this";
    if (!confirm(`Delete “${name}”? This can't be undone (but save points can).`)) return;
    try {
      await act(`data/${entity}/${row![spec.pk]}`, {}, "DELETE");
      onClose();
    } catch {}
  };

  return (
    <Modal
      title={`${existing ? "Edit" : "New"} ${spec.title.toLowerCase()}`}
      onClose={onClose}
      actions={
        <>
          {existing && (
            <button className="btn danger sm" onClick={remove} style={{ marginRight: "auto" }}>
              Delete
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn good" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      {visible.map((f) => (
        <FieldInput key={f.k} f={f} value={d[f.k]} onChange={(v) => set(f.k, v)} />
      ))}
    </Modal>
  );
}

function FieldInput({ f, value, onChange }: { f: F; value: any; onChange: (v: any) => void }) {
  if (f.type === "bool")
    return (
      <label className="check">
        <input type="checkbox" checked={!!Number(value)} onChange={(e) => onChange(e.target.checked ? 1 : 0)} />
        {f.label}
      </label>
    );
  let input: ReactElement;
  switch (f.type) {
    case "textarea":
      input = <textarea className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={{ fontFamily: "inherit", fontSize: 16 }} />;
      break;
    case "json":
      input = (
        <textarea
          className="input"
          value={typeof value === "string" ? value : value ? JSON.stringify(value) : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case "number":
      input = (
        <input
          className="input"
          type="number"
          inputMode="decimal"
          step={f.step ?? "1"}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        />
      );
      break;
    case "select":
      input = (
        <select className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          {f.options!.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      );
      break;
    case "multi": {
      const arr: string[] = Array.isArray(value) ? value.map(String) : [];
      input = (
        <div className="row wrap">
          {f.options!.map(([v, l]) => (
            <label key={v} className="chip" style={{ cursor: "pointer", padding: "4px 8px", background: arr.includes(v) ? "var(--mint)" : undefined }}>
              <input type="checkbox" className="sr" checked={arr.includes(v)} onChange={() => onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])} />
              {l}
            </label>
          ))}
        </div>
      );
      break;
    }
    case "emoji":
      input = <EmojiInput value={value} onChange={onChange} />;
      break;
    case "images":
      input = <ImagesInput value={value ?? null} onChange={onChange} max={f.max} />;
      break;
    case "url":
      input = <input className="input" type="url" inputMode="url" placeholder="https://…" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} />;
      break;
    case "days":
      input = <DaysInput value={value} onChange={onChange} />;
      break;
    case "date":
      input = <input className="input" type="date" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} />;
      break;
    default:
      input = (
        <>
          <input className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)} list={f.list ? `dl-${f.k}` : undefined} />
          {f.list && (
            <datalist id={`dl-${f.k}`}>
              {f.list.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          )}
        </>
      );
  }
  return (
    <Field label={f.label} help={f.help}>
      {input}
    </Field>
  );
}
