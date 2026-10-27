// Shapes exchanged between the Worker API and the UI.
import type { Rarity } from "./levels";
import type { Settings } from "./rules";

export type Fx =
  | { t: "ap"; v: number; crit?: boolean; label?: string }
  | { t: "xp"; v: number }
  | { t: "hp"; v: number }
  | { t: "levelup"; level: number; title: string }
  | { t: "achievement"; name: string; emoji: string; tier: string; ap: number }
  | { t: "chest"; rarity: Rarity; source: string }
  | { t: "loot"; rarity: Rarity; ap: number; xp: number; hat?: string; item?: string }
  | { t: "fainted"; ap_lost: number }
  | { t: "revived" }
  | { t: "hat"; hat: string }
  | { t: "boss"; title: string; boss: string; won: boolean }
  | { t: "goal"; title: string; emoji: string }
  | { t: "obligation"; id: number; item: string; emoji: string; price: number; date: string }
  | {
      t: "report";
      date: string;
      due: number;
      done: number;
      missed: string[];
      /** to-dos past their deadline (missed today, or still overdue) */
      late?: string[];
      hp: number;
      streak: number;
      perfect: boolean;
      billed: string[];
      rest: boolean;
    }
  | { t: "toast"; msg: string; emoji?: string };

export interface Quest {
  id: number;
  type: "daily" | "weekly" | "habit" | "todo";
  title: string;
  emoji: string;
  notes: string | null;
  area: string;
  difficulty: string;
  ap: number;
  xp: number;
  hp_penalty: number;
  polarity: number;
  days: string;
  weekly_target: number;
  unit: string | null;
  metric_key: string | null;
  metric_op: string | null;
  metric_value: number | null;
  due_date: string | null;
  priority: string | null; // to-dos: do | schedule | delegate | later (see shared/priority.ts)
  repeat_rule: string | null; // JSON schedule (shared/schedule.ts): dailies' due days / to-dos' next occurrence
  repeat_of: number | null; // to-dos: the occurrence this one follows
  active: number;
  sort: number;
  created_at: string;
  images: string | null;
  link: string | null;
}

export interface QuestLog {
  id: number;
  quest_id: number;
  date: string;
  qty: number;
  auto: number;
}

export interface Metric {
  key: string;
  name: string;
  emoji: string;
  unit: string;
  mode: "set" | "add";
  direction: "up" | "down" | "none";
  target: number | null;
  decimals: number;
  quick: string | null;
  builtin: number;
  active: number;
  sort: number;
}

export interface MetricValue {
  metric_key: string;
  date: string;
  value: number;
  note: string | null;
}

export interface ShopItem {
  id: number;
  name: string;
  emoji: string;
  category: string;
  base_price: number;
  tax: number;
  unit: string;
  notes: string | null;
  voucher_ok: number;
  effect: string | null;
  trigger_metric: string | null;
  trigger_min: number | null;
  trigger_max: number | null;
  min_level: number;
  active: number;
  sort: number;
  images: string | null;
}

export interface Voucher {
  id: number;
  name: string;
  emoji: string;
  description: string | null;
  discount: number;
  scope: string;
  scope_values: string | null;
  limit_type: string;
  limit_count: number;
  condition: string | null;
  rule: string | null;
  active: number;
  sort: number;
  images: string | null;
  used: number; // uses in the current limit period
  rule_ok: boolean;
  rule_text: string;
}

export interface Obligation {
  id: number;
  date: string;
  metric_key: string;
  item_id: number;
  value: number;
  status: string;
}

export interface Chest {
  id: number;
  rarity: Rarity;
  source: string;
  created_at: string;
}

export interface Achievement {
  id: number;
  key: string | null;
  name: string;
  emoji: string;
  description: string | null;
  rule: string;
  tier: string;
  ap: number;
  xp: number;
  hidden: number;
  active: number;
  sort: number;
  images: string | null;
  unlocked_at: string | null;
  progress: [number, number] | null;
  past_seasons: number;
}

export interface Milestone {
  id: number;
  goal_id: number;
  title: string;
  ap: number;
  done_at: string | null;
  sort: number;
}

export interface Goal {
  id: number;
  title: string;
  emoji: string;
  area: string;
  description: string | null;
  target_date: string | null;
  status: string;
  mode: "manual" | "metric" | "milestones";
  progress: number;
  metric_key: string | null;
  start_value: number | null;
  target_value: number | null;
  ap: number;
  xp: number;
  completed_at: string | null;
  sort: number;
  created_at: string;
  images: string | null;
  link: string | null;
  milestones: Milestone[];
  pct: number;
}

export interface SprintTask {
  id: number;
  sprint_id: number;
  title: string;
  dmg: number;
  done_at: string | null;
  sort: number;
}

export interface Sprint {
  id: number;
  title: string;
  goal_id: number | null;
  boss: string;
  boss_emoji: string;
  start_date: string;
  end_date: string;
  status: string;
  ap: number;
  xp: number;
  images: string | null;
  tasks: SprintTask[];
}

export interface LifeEvent {
  id: number;
  date: string;
  end_date: string | null;
  title: string;
  emoji: string;
  kind: string;
  notes: string | null;
  images: string | null;
  link: string | null;
}

export interface Notebook {
  id: number;
  name: string;
  emoji: string;
  color: string;
  kind: "notes" | "journal";
  sort: number;
}

export interface NoteLabel {
  id: number;
  name: string;
  color: string | null;
}

/** A note as shown on the board (no full doc). */
export interface NoteCard {
  id: number;
  notebook_id: number | null;
  title: string;
  preview: string | null; // JSON doc
  words: number;
  cover: number | null;
  extras: string | null; // JSON {audio, tasks:[done,total], images}
  color: string | null;
  paper: string;
  font: string;
  mood: string | null;
  labels: string | null; // JSON ids
  pinned: number;
  pin_today: number;
  archived: number;
  trashed_at: string | null;
  journal_date: string | null;
  goal_id: number | null;
  sprint_id: number | null;
  event_id: number | null;
  remind_at: string | null;
  remind_repeat: string | null;
  rev: number;
  created_at: string;
  updated_at: string;
}

export interface Note extends NoteCard {
  doc: string | null;
}

/** Notes the rest of the game needs to know about (Camp pins, reminders, links on goals…). */
export interface NoteRef {
  id: number;
  title: string;
  color: string | null;
  paper: string;
  font: string;
  preview: string | null; // only for Today pins
  cover: number | null;
  pin_today: number;
  archived: number;
  remind_at: string | null;
  remind_repeat: string | null;
  goal_id: number | null;
  sprint_id: number | null;
  event_id: number | null;
  journal_date: string | null;
}

export interface LedgerRow {
  id: number;
  ts: string;
  date: string;
  kind: string;
  ap: number;
  xp: number;
  hp: number;
  source: string | null;
  description: string | null;
  crit: number;
  voided: number;
}

export interface Season {
  id: number;
  name: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
}

export interface Purchase {
  id: number;
  item_id: number | null;
  item_name: string;
  qty: number;
  total: number;
  voucher_name: string | null;
  date: string;
  note: string | null;
}

export interface Player {
  hp: number;
  max_hp: number;
  fainted: number;
  revive_progress: number;
  streak: number;
  best_streak: number;
  fast_started_at: number | null;
  ap: number;
  xp: number;
  level: number;
  into: number;
  needed: number;
  title: string;
  stage: number;
  mult: number;
  earned_today: number;
  month_earned: number;
}

export interface GameState {
  version: string;
  today: string;
  closed: string;
  editable: string[];
  settings: Settings;
  season: Season;
  seasons: Season[];
  player: Player;
  quests: Quest[];
  log: QuestLog[];
  metrics: Metric[];
  values: MetricValue[];
  totals: Record<string, number>;
  shop: ShopItem[];
  vouchers: Voucher[];
  inventory: Record<number, number>;
  purchases: Purchase[];
  obligations: Obligation[];
  chests: Chest[];
  achievements: Achievement[];
  goals: Goal[];
  sprints: Sprint[];
  events: LifeEvent[];
  ledger: LedgerRow[];
  rest_days: string[];
  stats: Record<string, number>;
  notes: NoteRef[];
}
