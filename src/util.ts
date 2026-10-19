// UI helpers: formatting, lookups and pet mood/speech.
import { daysBetween, hourInTz, weekStart, isDue } from "../shared/dates";
import type { GameState, Quest } from "../shared/types";
import type { Mood } from "./sprites";

export const fmt = (n: number | null | undefined, d = 0) =>
  n === null || n === undefined || Number.isNaN(n)
    ? "–"
    : Number(n).toLocaleString("en-SG", { minimumFractionDigits: d, maximumFractionDigits: d });

export const fmtAP = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(Math.round(n)).toLocaleString("en-SG")}`;

export function relDay(date: string, today: string) {
  const n = daysBetween(today, date);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

export function valueOn(s: GameState, key: string, date: string) {
  return s.values.find((v) => v.metric_key === key && v.date === date)?.value ?? null;
}

export function series(s: GameState, key: string) {
  return s.values.filter((v) => v.metric_key === key);
}

export function latest(s: GameState, key: string) {
  const xs = series(s, key);
  return xs.length ? xs[xs.length - 1] : null;
}

export function doneOn(s: GameState, questId: number, date: string) {
  return s.log.filter((l) => l.quest_id === questId && l.date === date);
}

export function weekCount(s: GameState, questId: number, date: string) {
  const ws = weekStart(date);
  return s.log.filter((l) => l.quest_id === questId && l.date >= ws && l.date <= date).length;
}

export function dailiesFor(s: GameState, date: string): Quest[] {
  return s.quests.filter((q) => q.type === "daily" && q.active && isDue(q.days, date));
}

export function inventoryOf(s: GameState, itemId: number) {
  return Math.max(0, Math.round((s.inventory[itemId] ?? 0) * 100) / 100);
}

export function localHour(s: GameState) {
  return hourInTz(new Date(), s.settings.timezone);
}

export function isNight(s: GameState) {
  if (s.settings.theme === "night") return true;
  if (s.settings.theme === "day") return false;
  const h = localHour(s);
  return h >= 19 || h < 7;
}

export function petMood(s: GameState): Mood {
  const p = s.player;
  if (p.fainted) return "fainted";
  const h = localHour(s);
  if (h >= 1 && h < 6) return "sleep";
  if (p.hp < 35) return "sad";
  if (p.hp >= 70 && p.earned_today > 0) return "happy";
  if (p.hp >= 55) return "content";
  return "meh";
}

const IDLE = [
  "Let's do one quest together!",
  "Small steps, big levels. ✨",
  "I believe in you!",
  "Drink some water~ 💧",
  "Every log makes me stronger!",
  "You + me = unstoppable.",
  "Shall we check today's quests?",
];

export function petLine(s: GameState): string {
  const p = s.player;
  const name = s.settings.player_name || "hero";
  if (p.fainted) return `I fainted… finish ${Math.max(0, s.settings.revive_quests - p.revive_progress)} more quest(s) to revive me 🥺`;
  if (s.obligations.length) return "Uh oh… the Calorie Court wants to see you. ⚖️";
  if (s.chests.length) return `There's a chest! Open it, open it! 🎁`;
  const h = localHour(s);
  if (h >= 1 && h < 6) return "Zzz… (it's late, go to sleep!)";
  const due = dailiesFor(s, s.today);
  const done = due.filter((q) => doneOn(s, q.id, s.today).length);
  if (due.length && done.length === due.length) return `Perfect day, ${name}! You're amazing 🌟`;
  if (valueOn(s, "weight", s.today) === null && h >= 6 && h < 11) return "Good morning! Hop on the scale? ⚖️";
  if (valueOn(s, "calories", s.today) === null && h >= 20) return "Did we log calories today? 🍱";
  if (p.hp < 35) return "I'm feeling weak… a quest or a potion would help 🧪";
  if (p.streak >= 3) return `🔥 ${p.streak}-day streak! Don't break it!`;
  const seed = new Date().getHours() + new Date().getDate();
  return IDLE[seed % IDLE.length];
}

export const EMOJI_SUGGEST = [
  "⭐", "💪", "🏃", "🥗", "🍱", "📚", "🧘", "💧", "😴", "🩺", "⚖️", "🦷", "🧹", "💼", "🧑‍🏫", "🤸",
  "🥋", "🪢", "🎯", "✈️", "🗺️", "🎂", "💰", "📈", "🎮", "🎁", "💆", "🍺", "🍔", "🐉", "👾", "🏆",
];
