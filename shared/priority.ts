// To-do priorities, after the Eisenhower matrix (urgent × important). They decide what a missed
// deadline costs; the HP amount is stored on the quest (hp_penalty) so it can be tuned per to-do.

export type Priority = "do" | "schedule" | "delegate" | "later";

export interface PriorityInfo {
  label: string;
  emoji: string;
  /** which square of the matrix */
  quadrant: string;
  /** default HP lost when the deadline passes */
  hp: number;
  /** also lose the to-do's AP when the deadline passes */
  fine: boolean;
  /** keeps costing half the HP every day it's late (up to OVERDUE_DAYS) */
  drain: boolean;
  /** finishing before the due date pays EARLY_BONUS */
  early: boolean;
}

export const PRIORITIES: Record<Priority, PriorityInfo> = {
  do: { label: "Do now", emoji: "🔥", quadrant: "Urgent + important", hp: 10, fine: true, drain: true, early: false },
  schedule: { label: "Schedule", emoji: "📅", quadrant: "Important, not urgent", hp: 6, fine: false, drain: true, early: true },
  delegate: { label: "Quick task", emoji: "⚡", quadrant: "Urgent, not important (delegate if you can)", hp: 3, fine: false, drain: false, early: false },
  later: { label: "Someday", emoji: "🧹", quadrant: "Not urgent, not important", hp: 0, fine: false, drain: false, early: false },
};

export const PRIORITY_ORDER: Priority[] = ["do", "schedule", "delegate", "later"];
export const OVERDUE_DAYS = 7;
export const EARLY_BONUS = 1.25;
export const LATE_PAY = 0.5;

export const priorityOf = (p: string | null | undefined): PriorityInfo | null => (p && Object.hasOwn(PRIORITIES, p) ? PRIORITIES[p as Priority] : null);

/** HP lost per extra day a draining to-do is late. */
export const drainHp = (hp: number) => Math.ceil(Math.max(0, hp) / 2);

/** What finishing a to-do on `date` pays, as a multiplier, plus a label for the log. */
export function todoPay(priority: string | null | undefined, due: string | null | undefined, date: string): { mult: number; tag: string } {
  if (!due) return { mult: 1, tag: "" };
  if (date > due) return { mult: LATE_PAY, tag: " — late, half pay" };
  if (date < due && priorityOf(priority)?.early) return { mult: EARLY_BONUS, tag: " — early bird!" };
  return { mult: 1, tag: "" };
}
