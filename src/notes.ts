// Notebook on the client: API calls, small parsers and the journal streak.
import { addDays } from "../shared/dates";
import type { PMNode } from "../shared/notedoc";
import type { Fx, GameState, Note, NoteCard, Notebook, NoteLabel } from "../shared/types";
import { api, g } from "./api";

export interface NotesData {
  notebooks: Notebook[];
  labels: NoteLabel[];
  notes: NoteCard[];
  trash_days: number;
}
export interface NoteWrite<T = unknown> {
  ok: true;
  fx: Fx[];
  data: T;
}

export const notesApi = {
  list: () => api<NotesData>(g("notes")),
  get: (id: number) => api<Note>(g(`notes/${id}`)),
  search: (q: string) => api<{ id: number; snippet: string }[]>(g(`notes/search?q=${encodeURIComponent(q)}`)),
  write: <T = unknown>(path: string, body: unknown = {}, method = "POST") => api<NoteWrite<T>>(g(path), { method, body }),
};

export function parseIds(raw: string | null | undefined): number[] {
  try {
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x) => Number.isInteger(x)) : [];
  } catch {
    return [];
  }
}

export function parseDoc(raw: string | null | undefined): PMNode | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as PMNode) : null;
  } catch {
    return null;
  }
}

export function parseExtras(raw: string | null | undefined): { audio: number; tasks: [number, number]; images: number } {
  try {
    const v = raw ? JSON.parse(raw) : {};
    return { audio: Number(v.audio) || 0, tasks: Array.isArray(v.tasks) ? [Number(v.tasks[0]) || 0, Number(v.tasks[1]) || 0] : [0, 0], images: Number(v.images) || 0 };
  } catch {
    return { audio: 0, tasks: [0, 0], images: 0 };
  }
}

/** Journal streak from the 📔 tracker: days in a row with words, counting today once it's written. */
export function journalStreak(state: GameState) {
  const days = new Set(state.values.filter((v) => v.metric_key === "journal" && v.value > 0).map((v) => v.date));
  const todayWords = state.values.find((v) => v.metric_key === "journal" && v.date === state.today)?.value ?? 0;
  let d = days.has(state.today) ? state.today : addDays(state.today, -1);
  let streak = 0;
  while (days.has(d) && streak < 1000) {
    streak++;
    d = addDays(d, -1);
  }
  const quest = state.quests.find((q) => q.metric_key === "journal" && q.active);
  const metric = state.metrics.find((m) => m.key === "journal");
  const goal = quest?.metric_value ?? metric?.target ?? 30;
  return { streak, todayWords, goal, quest };
}

/** "⏰ Tue 3:30 pm" style label for a reminder. */
export function reminderLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString("en-SG", { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today ${time}`;
  const tomorrow = new Date(now.getTime() + 86_400_000);
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`;
  return `${d.toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short" })} ${time}`;
}

export const reminderDue = (iso: string | null | undefined, now = Date.now()) => !!iso && Date.parse(iso) <= now;
