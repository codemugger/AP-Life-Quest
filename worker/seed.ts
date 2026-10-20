// Starter content. Used on first run and by "Factory reset". Everything here is editable in-app.
import { DEFAULT_SETTINGS } from "../shared/rules";

type Row = Record<string, unknown>;

/** Words written in journal entries each day (filled in by the notebook, see worker/notes.ts). */
export const JOURNAL_METRIC = { key: "journal", name: "Journal", emoji: "📔", unit: "words", mode: "set", direction: "up", target: 30, decimals: 0, builtin: 1, active: 1, sort: 50 };
const JOURNAL_QUEST: Row = { type: "daily", title: "Write in your journal", emoji: "📔", area: "mind", difficulty: "easy", ap: 5, xp: 15, hp_penalty: 0, metric_key: "journal", metric_op: ">=", sort: 40 };

/** Binders every character starts with. */
export const SEED_NOTEBOOKS: Row[] = [
  { name: "Notes", emoji: "📒", color: "lemon", kind: "notes", sort: 1 },
  { name: "Journal", emoji: "📔", color: "pink", kind: "journal", sort: 2 },
];

export const SEED_METRICS: Row[] = [
  { key: "weight", name: "Weight", emoji: "⚖️", unit: "kg", mode: "set", direction: "down", target: 55, decimals: 1, quick: null, builtin: 1, sort: 1 },
  { key: "calories", name: "Calories", emoji: "🍱", unit: "kcal", mode: "set", direction: "down", target: 1800, decimals: 0, quick: null, builtin: 1, sort: 2 },
  { key: "csd", name: "CSD", emoji: "📚", unit: "h", mode: "add", direction: "up", target: 6, decimals: 2, quick: "0.5,1,2", builtin: 1, sort: 3 },
  { key: "fasting", name: "Fasting", emoji: "⏳", unit: "h", mode: "add", direction: "up", target: 16, decimals: 1, quick: null, builtin: 1, sort: 4 },
  { key: "bp_sys", name: "BP systolic", emoji: "🩺", unit: "mmHg", mode: "set", direction: "down", target: 120, decimals: 0, quick: null, builtin: 0, sort: 5 },
  { key: "bp_dia", name: "BP diastolic", emoji: "🩺", unit: "mmHg", mode: "set", direction: "down", target: 80, decimals: 0, quick: null, builtin: 0, sort: 6 },
  { key: "sleep", name: "Sleep", emoji: "😴", unit: "h", mode: "set", direction: "up", target: 7, decimals: 1, quick: null, builtin: 0, active: 0, sort: 7 },
  { key: "water", name: "Water", emoji: "💧", unit: "glasses", mode: "add", direction: "up", target: 8, decimals: 0, quick: "1,2", builtin: 0, active: 0, sort: 8 },
  JOURNAL_METRIC,
];

export const SEED_QUESTS: Row[] = [
  // Dailies — missing one costs HP when the day closes.
  { type: "daily", title: "Morning weigh-in", emoji: "⚖️", area: "body", difficulty: "easy", ap: 5, xp: 10, hp_penalty: 3, metric_key: "weight", metric_op: "logged", sort: 1 },
  { type: "daily", title: "Log today's calories", emoji: "🍱", area: "body", difficulty: "easy", ap: 5, xp: 10, hp_penalty: 5, metric_key: "calories", metric_op: "logged", sort: 2 },
  { type: "daily", title: "Stay within calorie budget", emoji: "🥗", area: "body", difficulty: "hard", ap: 20, xp: 35, hp_penalty: 8, metric_key: "calories", metric_op: "<=", metric_value: 1800, sort: 3 },
  { type: "daily", title: "Clock 6h of CSD", emoji: "📚", area: "mind", difficulty: "hard", ap: 20, xp: 35, hp_penalty: 8, metric_key: "csd", metric_op: ">=", metric_value: 6, sort: 4 },
  { type: "daily", title: "Move for 30 minutes", emoji: "💪", area: "body", difficulty: "medium", ap: 10, xp: 20, hp_penalty: 5, sort: 5 },
  { type: "daily", title: "Check blood pressure", emoji: "🩺", area: "body", difficulty: "trivial", ap: 3, xp: 5, hp_penalty: 2, metric_key: "bp_sys", metric_op: "logged", sort: 6 },
  // Weeklies
  { type: "weekly", title: "Training session (Aikido / Gym / JR / KB / MT)", emoji: "🥋", area: "body", difficulty: "hard", ap: 20, xp: 35, hp_penalty: 8, weekly_target: 3, sort: 10 },
  { type: "weekly", title: "Quality time with parents", emoji: "👨‍👩‍👦", area: "family", difficulty: "medium", ap: 10, xp: 20, hp_penalty: 5, weekly_target: 1, sort: 11 },
  // Habits — tap any time. Good ones pay, bad ones cost AP and HP.
  { type: "habit", title: "MU coaching", emoji: "🧑‍🏫", area: "career", difficulty: "medium", ap: 10, xp: 10, hp_penalty: 0, unit: "h", polarity: 1, sort: 20 },
  { type: "habit", title: "BGYM coaching", emoji: "🤸", area: "career", difficulty: "medium", ap: 8, xp: 10, hp_penalty: 0, unit: "h", polarity: 1, sort: 21 },
  { type: "habit", title: "Bonus workout", emoji: "🏋️", area: "body", difficulty: "medium", ap: 10, xp: 20, hp_penalty: 0, polarity: 1, sort: 22 },
  { type: "habit", title: "Sugary drink / bubble tea", emoji: "🧋", area: "body", difficulty: "easy", ap: 5, xp: 0, hp_penalty: 3, polarity: -1, sort: 23 },
  { type: "habit", title: "Late-night supper", emoji: "🍜", area: "body", difficulty: "medium", ap: 10, xp: 0, hp_penalty: 5, polarity: -1, sort: 24 },
  JOURNAL_QUEST,
];

export const SEED_SHOP: Row[] = [
  { name: "3000–3999 Calorie Waiver Ticket", emoji: "🍔", category: "Calorie Waiver", base_price: 60, tax: 3, notes: "x3 tax (WLP-E & HRA)", trigger_metric: "calories", trigger_min: 3000, trigger_max: 3999.99, sort: 1 },
  { name: "4000–4999 Calorie Waiver Ticket", emoji: "🍕", category: "Calorie Waiver", base_price: 80, tax: 3, notes: "x3 tax (WLP-E & HRA); eating a buffet automatically warrants this ticket", trigger_metric: "calories", trigger_min: 4000, trigger_max: 4999.99, sort: 2 },
  { name: "5000–5999 Calorie Waiver Ticket", emoji: "🍰", category: "Calorie Waiver", base_price: 110, tax: 3, notes: "x3 tax (WLP-E & HRA); eating a buffet automatically warrants this ticket", trigger_metric: "calories", trigger_min: 5000, trigger_max: 5999.99, sort: 3 },
  { name: "6000+ Calorie Waiver Ticket", emoji: "🎂", category: "Calorie Waiver", base_price: 150, tax: 3, notes: "x3 tax (WLP-E & HRA); eating a buffet automatically warrants this ticket", trigger_metric: "calories", trigger_min: 6000, trigger_max: null, sort: 4 },
  { name: "Massage Ticket", emoji: "💆", category: "Wellness", base_price: 50, tax: 1, notes: "If in JB, price is reduced to AP 36. Does not matter if you use ClassPass.", sort: 5 },
  { name: "4D Ticket", emoji: "🎲", category: "Fun", base_price: 2, tax: 1, notes: "1 qty = $2 spending; 50% rebate if you win", sort: 6 },
  { name: "Alcohol Ticket (Individual)", emoji: "🍺", category: "Alcohol", base_price: 60, tax: 3, notes: "x3 tax (WLP-E & HRA)", sort: 7 },
  { name: "Alcohol Ticket (Social)", emoji: "🍻", category: "Alcohol", base_price: 40, tax: 3, notes: "x3 tax (WLP-E & HRA)", sort: 8 },
  { name: "JB Trip (Hourly Rate)", emoji: "🚌", category: "Travel", base_price: 50, tax: 1, unit: "hour", notes: "Per hour; elevated price due to WLP-E", sort: 9 },
  { name: "MSIA 1 Day Pass", emoji: "🇲🇾", category: "Travel", base_price: 400, tax: 1, unit: "pass", notes: "Elevated price due to WLP-E", sort: 10 },
  { name: "Burning World Leap Pass", emoji: "✈️", category: "Travel", base_price: 2000, tax: 1, unit: "pass", voucher_ok: 0, notes: "NO VOUCHERS ALLOWED; excludes cruises", sort: 11 },
  { name: "Cruise Leap Pass", emoji: "🛳️", category: "Travel", base_price: 1600, tax: 1, unit: "pass", voucher_ok: 0, notes: "NO VOUCHERS ALLOWED", sort: 12 },
  // In-game items
  { name: "Health Potion", emoji: "🧪", category: "Game", base_price: 40, tax: 1, unit: "potion", notes: "Restores 30 HP when used.", effect: "heal:30", sort: 20 },
  { name: "Streak Shield", emoji: "🛡️", category: "Game", base_price: 60, tax: 1, unit: "shield", notes: "Auto-used when a bad day would break your streak.", effect: "streak_freeze", sort: 21 },
  { name: "Rest Day Pass", emoji: "🏖️", category: "Game", base_price: 80, tax: 1, unit: "pass", notes: "Use to make today a rest day: no penalties, streak frozen. For sick days and public holidays.", effect: "rest_day", sort: 22 },
];

const ALL_BUT_LEAP = "All items (Leap Passes excluded: they allow no vouchers)";

export const SEED_VOUCHERS: Row[] = [
  { name: "SPORTS FOR THE WIN!", emoji: "🏅", discount: 0.2, description: ALL_BUT_LEAP, condition: "Aikido / Gymnastics / Jump Rope / Kickboxing / Muay Thai", sort: 1 },
  { name: "XENONITE PARTY", emoji: "🎉", discount: 0.3, description: "Activities with Xenonites, including travel", condition: "Activity is with the Xenonites", sort: 2 },
  { name: "1BRO KX", emoji: "🤜", discount: 0.3, description: "Activities with 1bro kx", condition: "Activity is with 1bro kx", sort: 3 },
  { name: "DO THE HUSTLE!", emoji: "💼", discount: 0.3, description: ALL_BUT_LEAP, condition: "Must earn ≥ AP 600 in that month", limit_type: "per_month", limit_count: 1, rule: { t: "month_earned", min: 600 }, sort: 4 },
  { name: "OP CF", emoji: "🥦", discount: 0.3, description: ALL_BUT_LEAP, condition: "Must consume OP CF potent food 5x/week with healthier living habits", sort: 5 },
  { name: "FILIAL PIETY", emoji: "👪", discount: 0.4, description: "Travel-related items with parents", scope: "categories", scope_values: ["Travel"], limit_type: "per_week", limit_count: 1, condition: "Travel with parents", sort: 6 },
  { name: "NUS JR ALUMNI", emoji: "🪢", discount: 0.5, description: "All items, for justified events within NUS Jump Rope", condition: "Justified events within NUS Jump Rope", sort: 7 },
  { name: "LIFELONG LEARNING", emoji: "🎓", discount: 0.5, description: ALL_BUT_LEAP, condition: "Must clock 42h of CSD in a week", rule: { t: "metric_week_sum", metric: "csd", min: 42 }, sort: 8 },
  { name: "1080H OF FASTING", emoji: "⏳", discount: 0.8, description: ALL_BUT_LEAP, condition: "Complete 1080h of intermittent fasting within a stipulated period", rule: { t: "metric_total", metric: "fasting", min: 1080 }, sort: 9 },
  { name: "55KG + 1800kcal 30EMA Milestone", emoji: "🏆", discount: 0.5, description: ALL_BUT_LEAP, limit_type: "once", condition: "Achieve 55 kg and 1800 kcal 30EMA", rule: { t: "all", rules: [{ t: "metric_latest", metric: "weight", max: 55 }, { t: "metric_ema", metric: "calories", period: 30, max: 1800 }] }, sort: 10 },
  { name: "Parent Birthday", emoji: "🎂", discount: 0.6, description: "ONLY Calorie Waiver tickets", scope: "categories", scope_values: ["Calorie Waiver"], condition: "On a parent's birthday", sort: 11 },
  { name: "SGH ROCKS", emoji: "🏥", discount: 0.9, description: "All items, for justified events within full-time job @ SGH", condition: "Justified events within ft job @ SGH. T&Cs apply.", sort: 12 },
  { name: "It's your Birthday", emoji: "🥳", discount: 0.9, description: ALL_BUT_LEAP, condition: "Only on your birthday! Choose either English or Chinese birthday.", sort: 13 },
  { name: "WEBULL P&L 30% MILESTONE", emoji: "📈", discount: 1, description: ALL_BUT_LEAP, limit_type: "once", condition: "Webull P&L reaches +30%", sort: 14 },
  { name: "Stress Relief - Hypertension and WLP-E", emoji: "💆", discount: 1, description: "Massage only, to ameliorate hypertension and obesity", scope: "categories", scope_values: ["Wellness"], condition: "Temporary measure. Calories (today or yesterday) must not exceed 2267.", rule: { t: "metric_recent", metric: "calories", max: 2267 }, sort: 15 },
];

const A = (key: string, name: string, emoji: string, description: string, rule: object, tier = "bronze", extra: Row = {}): Row => {
  const reward: Record<string, [number, number]> = { bronze: [20, 30], silver: [50, 75], gold: [100, 150], platinum: [250, 300] };
  const [ap, xp] = reward[tier];
  return { key, name, emoji, description, rule, tier, ap, xp, ...extra };
};

export const SEED_ACHIEVEMENTS: Row[] = [
  A("first_quest", "First Step", "👣", "Complete your first quest", { t: "quests_done", n: 1 }),
  A("quests_50", "Quest Rookie", "✅", "Complete 50 quests", { t: "quests_done", n: 50 }, "silver"),
  A("quests_250", "Quest Veteran", "🗡️", "Complete 250 quests", { t: "quests_done", n: 250 }, "gold"),
  A("quests_1000", "Quest Legend", "👑", "Complete 1,000 quests", { t: "quests_done", n: 1000 }, "platinum"),
  A("streak_3", "On Fire", "🔥", "Reach a 3-day streak", { t: "streak", n: 3 }),
  A("streak_7", "Week Warrior", "🗓️", "Reach a 7-day streak", { t: "streak", n: 7 }, "silver"),
  A("streak_14", "Fortnight Fury", "🌋", "Reach a 14-day streak", { t: "streak", n: 14 }, "silver"),
  A("streak_30", "Unstoppable", "☄️", "Reach a 30-day streak", { t: "streak", n: 30 }, "gold"),
  A("streak_100", "Centurion", "💯", "Reach a 100-day streak", { t: "streak", n: 100 }, "platinum"),
  A("level_5", "Getting Stronger", "⭐", "Reach level 5", { t: "level", n: 5 }),
  A("level_10", "Double Digits", "🌟", "Reach level 10", { t: "level", n: 10 }, "silver"),
  A("level_20", "Champion", "🏅", "Reach level 20", { t: "level", n: 20 }, "gold"),
  A("level_35", "Legendary Form", "🐉", "Reach level 35 (your pet evolves!)", { t: "level", n: 35 }, "platinum"),
  A("perfect_1", "Flawless", "💎", "Finish every daily in a day", { t: "perfect_days", n: 1 }),
  A("perfect_10", "Perfectionist", "🌈", "10 perfect days", { t: "perfect_days", n: 10 }, "silver"),
  A("weigh_30", "Scale Whisperer", "⚖️", "Log your weight on 30 days", { t: "metric_days", metric: "weight", n: 30 }, "silver"),
  A("food_30", "Food Detective", "🍱", "Log calories on 30 days", { t: "metric_days", metric: "calories", n: 30 }, "silver"),
  A("budget_7", "Budget Keeper", "🥗", "7 days in a row within calorie budget", { t: "under_target_streak", metric: "calories", n: 7 }, "silver"),
  A("budget_30", "Iron Discipline", "🛡️", "30 days in a row within calorie budget", { t: "under_target_streak", metric: "calories", n: 30 }, "gold"),
  A("lost_1", "First Kilo Down", "📉", "Lose 1 kg from your first weigh-in", { t: "weight_lost", kg: 1 }),
  A("lost_3", "Three Down", "🎈", "Lose 3 kg", { t: "weight_lost", kg: 3 }, "silver"),
  A("lost_5", "Feather Light", "🪶", "Lose 5 kg", { t: "weight_lost", kg: 5 }, "gold"),
  A("goal_weight", "Dream Weight", "🏆", "Reach your target weight", { t: "metric_target", metric: "weight" }, "platinum"),
  A("bmi_healthy", "Healthy BMI", "💚", "BMI below 23 (Singapore healthy range)", { t: "bmi_below", value: 23 }, "gold"),
  A("fast_100", "Hunger Games", "⏳", "100 hours of fasting logged", { t: "metric_total", metric: "fasting", n: 100 }),
  A("fast_1080", "Fasting Monk", "🧘", "1,080 hours of fasting logged", { t: "metric_total", metric: "fasting", n: 1080 }, "platinum"),
  A("csd_42", "Scholar", "📚", "42h of CSD in one week", { t: "metric_week_sum", metric: "csd", n: 42 }, "silver"),
  A("first_buy", "Treat Yourself", "🛍️", "Buy something from the shop", { t: "purchases", n: 1 }),
  A("saver_1000", "Dragon's Hoard", "💰", "Hold 1,000 AP at once", { t: "ap_balance", n: 1000 }, "gold"),
  A("chests_10", "Loot Goblin", "🎁", "Open 10 chests", { t: "chests_opened", n: 10 }, "silver"),
  A("crits_10", "Lucky Star", "🍀", "Land 10 critical hits", { t: "crits", n: 10 }),
  A("boss_1", "Boss Slayer", "⚔️", "Win your first sprint", { t: "sprints_won", n: 1 }, "silver"),
  A("goal_1", "Dream Achiever", "🎯", "Complete a life goal", { t: "goals_done", n: 1 }, "gold"),
  A("phoenix", "Phoenix", "🐣", "Get back up after fainting", { t: "revives", n: 1 }, "silver", { hidden: 1 }),
  // writing (the 📔 tracker counts journal words; keep in step with worker/schema/0003_notes.sql)
  A("journal_first", "Dear Diary", "📔", "Write your first journal entry", { t: "metric_days", metric: "journal", n: 1 }, "bronze", { sort: 60 }),
  A("journal_7", "Scribe", "✍️", "Journal 7 days in a row", { t: "metric_streak", metric: "journal", n: 7 }, "silver", { sort: 61 }),
  A("journal_30", "Chronicler", "📜", "Journal 30 days in a row", { t: "metric_streak", metric: "journal", n: 30 }, "gold", { sort: 62 }),
  A("journal_words", "Wordsmith", "🖋️", "Write 10,000 words in your journal", { t: "metric_total", metric: "journal", n: 10000 }, "gold", { sort: 63 }),
  A("notes_25", "Bookworm", "🗒️", "Keep 25 notes in your notebook", { t: "notes", n: 25 }, "bronze", { sort: 64 }),
];

export const SEED_GOALS: Row[] = [
  { title: "Reach 55 kg", emoji: "⚖️", area: "body", description: "Back to the healthy range for good.", mode: "metric", metric_key: "weight", target_value: 55, ap: 500, xp: 500, sort: 1 },
];

export function seedSettings(): Row {
  return { ...DEFAULT_SETTINGS };
}

// ---------------------------------------------------------------------------
// Templates for new characters
// ---------------------------------------------------------------------------
export interface TemplateContent {
  metrics: Row[];
  quests: Row[];
  shop: Row[];
  vouchers: Row[];
  achievements: Row[];
  goals: Row[];
  milestones?: Row[];
  settings?: Row;
}

const GAME_ITEMS = SEED_SHOP.filter((i) => i.category === "Game");
const usesMetric = (a: Row, keys: string[]) => {
  const r = a.rule as { metric?: string };
  return !r.metric || keys.includes(r.metric);
};

const STARTER_METRICS: Row[] = [
  { key: "weight", name: "Weight", emoji: "⚖️", unit: "kg", mode: "set", direction: "down", target: null, decimals: 1, builtin: 1, sort: 1 },
  { key: "calories", name: "Calories", emoji: "🍱", unit: "kcal", mode: "set", direction: "down", target: 2000, decimals: 0, builtin: 1, sort: 2 },
  { key: "water", name: "Water", emoji: "💧", unit: "glasses", mode: "add", direction: "up", target: 8, decimals: 0, quick: "1,2", sort: 3 },
  { key: "sleep", name: "Sleep", emoji: "😴", unit: "h", mode: "set", direction: "up", target: 7, decimals: 1, sort: 4 },
  { key: "focus", name: "Focus time", emoji: "🧠", unit: "h", mode: "add", direction: "up", target: 2, decimals: 2, quick: "0.5,1", sort: 5 },
  { key: "steps", name: "Steps", emoji: "👟", unit: "steps", mode: "set", direction: "up", target: 8000, decimals: 0, sort: 6 },
  JOURNAL_METRIC,
];

const STARTER: TemplateContent = {
  metrics: STARTER_METRICS,
  quests: [
    { type: "daily", title: "Drink 8 glasses of water", emoji: "💧", area: "body", difficulty: "easy", ap: 5, xp: 10, hp_penalty: 3, metric_key: "water", metric_op: ">=", sort: 1 },
    { type: "daily", title: "Sleep 7+ hours", emoji: "😴", area: "body", difficulty: "medium", ap: 10, xp: 20, hp_penalty: 5, metric_key: "sleep", metric_op: ">=", sort: 2 },
    { type: "daily", title: "Log what you ate", emoji: "🍱", area: "body", difficulty: "easy", ap: 5, xp: 10, hp_penalty: 3, metric_key: "calories", metric_op: "logged", sort: 3 },
    { type: "daily", title: "Move for 30 minutes", emoji: "💪", area: "body", difficulty: "medium", ap: 10, xp: 20, hp_penalty: 5, sort: 4 },
    { type: "daily", title: "Deep focus for 2 hours", emoji: "🧠", area: "mind", difficulty: "hard", ap: 20, xp: 35, hp_penalty: 8, metric_key: "focus", metric_op: ">=", days: "1111100", sort: 5 },
    { type: "daily", title: "Tidy up for 10 minutes", emoji: "🧹", area: "home", difficulty: "trivial", ap: 3, xp: 5, hp_penalty: 2, sort: 6 },
    { ...JOURNAL_QUEST, sort: 7 },
    { type: "weekly", title: "Workout", emoji: "🏃", area: "body", difficulty: "hard", ap: 20, xp: 35, hp_penalty: 8, weekly_target: 3, sort: 10 },
    { type: "weekly", title: "Call a friend or family", emoji: "📞", area: "family", difficulty: "easy", ap: 5, xp: 10, hp_penalty: 3, weekly_target: 1, sort: 11 },
    { type: "habit", title: "Read 20 pages", emoji: "📖", area: "mind", difficulty: "easy", ap: 5, xp: 10, hp_penalty: 0, polarity: 1, sort: 20 },
    { type: "habit", title: "Bonus workout", emoji: "🏋️", area: "body", difficulty: "medium", ap: 10, xp: 20, hp_penalty: 0, polarity: 1, sort: 21 },
    { type: "habit", title: "Junk food", emoji: "🍟", area: "body", difficulty: "easy", ap: 5, xp: 0, hp_penalty: 3, polarity: -1, sort: 22 },
    { type: "habit", title: "Doomscrolling (30+ min)", emoji: "📱", area: "mind", difficulty: "easy", ap: 5, xp: 0, hp_penalty: 3, polarity: -1, sort: 23 },
    { type: "todo", title: "Set your first life goal in Journey", emoji: "🎯", area: "life", difficulty: "easy", ap: 15, xp: 20, sort: 30 },
    { type: "todo", title: "Customise your pet in the Camp wardrobe", emoji: "🎀", area: "fun", difficulty: "trivial", ap: 10, xp: 10, sort: 31 },
  ],
  shop: [
    { name: "Bubble tea", emoji: "🧋", category: "Treats", base_price: 30, sort: 1 },
    { name: "Favourite snack", emoji: "🍫", category: "Treats", base_price: 20, sort: 2 },
    { name: "Takeaway dinner", emoji: "🍜", category: "Treats", base_price: 60, sort: 3 },
    { name: "Gaming / TV hour", emoji: "🎮", category: "Fun", base_price: 25, unit: "hour", sort: 4 },
    { name: "Movie night", emoji: "🎬", category: "Fun", base_price: 50, sort: 5 },
    { name: "Lazy sleep-in", emoji: "🛌", category: "Fun", base_price: 40, sort: 6 },
    { name: "New book or game", emoji: "📚", category: "Big rewards", base_price: 300, sort: 7 },
    { name: "Spa / massage", emoji: "💆", category: "Big rewards", base_price: 250, sort: 8 },
    { name: "Day trip", emoji: "🚌", category: "Big rewards", base_price: 600, unit: "pass", sort: 9 },
    { name: "Weekend getaway", emoji: "✈️", category: "Big rewards", base_price: 2000, unit: "pass", voucher_ok: 0, notes: "No vouchers: earn this one!", sort: 10 },
    ...GAME_ITEMS,
  ],
  vouchers: [
    { name: "Birthday Bash", emoji: "🥳", discount: 0.5, description: "50% off on your birthday", condition: "Only on your birthday", rule: { t: "birthday" }, sort: 1 },
    { name: "Payday Treat", emoji: "💸", discount: 0.2, description: "Once a month", limit_type: "per_month", limit_count: 1, condition: "Payday!", sort: 2 },
    { name: "Hustle Bonus", emoji: "💼", discount: 0.3, description: "Earned 600+ AP this month", limit_type: "per_month", limit_count: 1, rule: { t: "month_earned", min: 600 }, sort: 3 },
    { name: "Hydration Hero", emoji: "💧", discount: 0.25, description: "56+ glasses of water this week", rule: { t: "metric_week_sum", metric: "water", min: 56 }, sort: 4 },
  ],
  achievements: SEED_ACHIEVEMENTS.filter(
    (a) => usesMetric(a, STARTER_METRICS.map((m) => m.key as string)) && a.key !== "goal_weight" && a.key !== "bmi_healthy",
  ),
  goals: [],
  settings: { height_m: 1.7 },
};

const BLANK: TemplateContent = {
  metrics: [...SEED_METRICS.filter((m) => m.key === "weight" || m.key === "calories").map((m) => ({ ...m, target: m.key === "calories" ? 2000 : null })), JOURNAL_METRIC],
  quests: [],
  shop: GAME_ITEMS,
  vouchers: [],
  achievements: SEED_ACHIEVEMENTS.filter((a) => usesMetric(a, ["weight", "calories", "journal"]) && a.key !== "goal_weight" && a.key !== "bmi_healthy"),
  goals: [],
  settings: { height_m: 1.7 },
};

const ANSON: TemplateContent = {
  metrics: SEED_METRICS,
  quests: SEED_QUESTS,
  shop: SEED_SHOP,
  vouchers: SEED_VOUCHERS,
  achievements: SEED_ACHIEVEMENTS,
  goals: SEED_GOALS,
};

export const TEMPLATES: Record<string, { name: string; description: string; content: TemplateContent; ownerOnly?: boolean }> = {
  starter: { name: "Healthy-life starter", description: "Water, sleep, movement, focus and everyday rewards. Great for anyone.", content: STARTER },
  anson: { name: "Anson's original", description: "Your full setup: CSD, calorie court, waiver tickets and your 15 vouchers.", content: ANSON, ownerOnly: true },
  blank: { name: "Blank", description: "Just weight, calories and the game items. Build everything yourself.", content: BLANK },
};

export function templateContent(id: string | undefined): TemplateContent {
  return (TEMPLATES[id ?? ""] ?? TEMPLATES.starter).content;
}
