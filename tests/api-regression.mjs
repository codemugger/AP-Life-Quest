// API regression checks against the LOCAL dev server (it factory-resets the local game!).
//   1. npm run dev   2. in another terminal: npm run test:api
// Uses the local password from AP_DEV_PASSWORD (default: mochi-dev-password).
const PASSWORD = process.env.AP_DEV_PASSWORD ?? "mochi-dev-password";
import { execSync } from "node:child_process";
const B = "http://localhost:5173/api";
const PROJECT = process.cwd();
let cookie = "";
let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};
async function call(method, path, body, withCookie = true, tries = 3) {
  let r;
  try {
    r = await fetch(B + path, {
    method,
    headers: { "content-type": "application/json", "x-requested-with": "aplq", ...(withCookie && cookie ? { cookie } : {}) },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    });
  } catch (e) {
    // stale keep-alive socket after a long blocking step — just retry
    if (tries > 1) return call(method, path, body, withCookie, tries - 1);
    throw e;
  }
  const sc = r.headers.get("set-cookie");
  if (sc && sc.includes("aplq_session=") && !sc.includes("Max-Age=0")) cookie = sc.split(";")[0];
  let data = null;
  const text = await r.text();
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}
const post = (p, b) => call("POST", p, b);
const get = (p) => call("GET", p);
const sql = (q) => execSync(`npx wrangler d1 execute ap-life-quest-db --local --command "${q}"`, { cwd: PROJECT, stdio: "pipe" });
const state = async () => (await get("/state")).data;
const quest = (s, title) => s.quests.find((q) => q.title.startsWith(title));
const item = (s, name) => s.shop.find((i) => i.name.startsWith(name));

// --- auth
ok((await call("POST", "/auth/logout-all", {}, false)).status === 401, "logout-all needs a session");
ok((await post("/auth/login", { password: PASSWORD })).status === 200, "login works");
await post("/reset/factory", { confirm: "RESET EVERYTHING" });
await post("/process");
let s = await state();
ok(!!s.player, "state loads on a fresh database");

// --- double tap on a daily: exactly one completion
const move = quest(s, "Move for 30");
const [a, b] = await Promise.all([post(`/quests/${move.id}/complete`), post(`/quests/${move.id}/complete`)]);
ok([a.status, b.status].sort().join() === "200,409", `parallel daily ticks → one 200 + one 409 (got ${a.status},${b.status})`);
s = await state();
ok(s.log.filter((l) => l.quest_id === move.id).length === 1, "only one quest_log row");

// --- level-up rewards can't be farmed by undo/redo
await post(`/quests/${move.id}/undo`, {});
s = await state();
// put total XP at 85 so the quest itself (20 XP) is what crosses into level 2
await post("/ledger/adjust", { xp: 85 - s.player.xp, description: "test: near level 2" });
s = await state();
ok(s.player.level === 1 && s.player.xp === 85, `set up at 85 XP (got Lv${s.player.level}, ${s.player.xp} XP)`);
const chestsBefore = s.chests.length;
await post(`/quests/${move.id}/complete`); // crosses into Lv2
await post(`/quests/${move.id}/undo`, {});
await post(`/quests/${move.id}/complete`); // crosses again
s = await state();
ok(s.player.level === 2 && s.chests.length === chestsBefore + 1, `level-up chest only once (chests ${chestsBefore} → ${s.chests.length})`);

// --- chest can't be opened twice
const ch = s.chests[0];
const [c1, c2] = await Promise.all([post(`/chests/${ch.id}/open`), post(`/chests/${ch.id}/open`)]);
ok([c1.status, c2.status].sort().join() === "200,409", `parallel chest opens → one 200 + one 409 (got ${c1.status},${c2.status})`);

// --- refunds keep inventory sane
await post("/ledger/adjust", { ap: 500, description: "test money" });
s = await state();
const massage = item(s, "Massage");
await post("/shop/buy", { item_id: massage.id, use_now: true });
s = await state();
let spend = s.ledger.find((l) => l.kind === "spend" && !l.voided && l.description.includes("Massage"));
ok((await post(`/ledger/${spend.id}/void`)).status === 200, "voiding a used-right-away purchase works");
s = await state();
ok((s.inventory[massage.id] ?? 0) === 0, `inventory back to 0 (got ${s.inventory[massage.id] ?? 0})`);
await post("/shop/buy", { item_id: massage.id });
await post(`/items/${massage.id}/use`, { qty: 1 });
s = await state();
spend = s.ledger.find((l) => l.kind === "spend" && !l.voided && l.description.includes("Massage"));
const refused = await post(`/ledger/${spend.id}/void`);
ok(refused.status === 400, "refund refused once the item was used from the bag");

// --- faint can be undone
await post("/ledger/adjust", { hp: -98, description: "test: nearly dead" });
s = await state();
const tea = quest(s, "Sugary drink");
await post(`/quests/${tea.id}/complete`); // -3 HP → 0 → faint
s = await state();
ok(s.player.fainted === 1, "bad habit at low HP faints");
await post(`/quests/${tea.id}/undo`, { date: s.today });
s = await state();
ok(s.player.fainted === 0 && s.player.hp > 0, `undoing the habit un-faints (fainted=${s.player.fainted}, hp=${s.player.hp})`);

// --- two devices closing the same days → scored once
sql("UPDATE player SET last_processed = date(last_processed, '-2 day'); DELETE FROM day_closures;");
const [p1, p2] = await Promise.all([post("/process"), post("/process")]);
ok(p1.status === 200 && p2.status === 200, "parallel process calls both succeed");
const reports = [...p1.data.fx, ...p2.data.fx].filter((f) => f.t === "report").map((f) => f.date);
ok(reports.length === new Set(reports).size && reports.length === 2, `each day reported once (${reports.join(", ")})`);

// --- negative remaining never loops
await call("PUT", "/settings", { grace_hours: 48 });
const pr = await post("/process");
ok(pr.data.remaining === 0, `remaining clamps to 0 (got ${pr.data.remaining})`);
await call("PUT", "/settings", { grace_hours: 12 });
ok((await call("PUT", "/settings", { crit_chance: 5 })).status === 400, "out-of-range setting rejected");

// --- validation
ok((await post("/data/vouchers", { name: "x", discount: 0.1, rule: { t: "all" } })).status === 400, "malformed voucher rule rejected");
ok((await post("/data/constructor", {})).status === 404, "/data/constructor is 404 not 500");

// --- using a waiver ticket from the shop settles the court case
await post("/metrics/calories/log", { value: 3500 });
s = await state();
ok(s.obligations.length === 1, "3500 kcal opens a court case");
const waiver = item(s, "3000");
await post("/shop/buy", { item_id: waiver.id, use_now: true });
s = await state();
ok(s.obligations.length === 0, "buying + using the ticket in the Shop settles it");
await post("/metrics/calories/log", { value: 1700 });

// --- goal reward once
const g = (await post("/data/goals", { title: "Test goal", mode: "milestones" })).data.data.id;
const m = (await post("/data/milestones", { goal_id: g, title: "step" })).data.data.id;
await post(`/milestones/${m}/toggle`);
await post(`/goals/${g}/status`, { status: "done" });
await post(`/goals/${g}/status`, { status: "active" });
await post(`/goals/${g}/status`, { status: "done" });
s = await state();
ok(s.chests.filter((c) => c.source === "Goal: Test goal").length === 1, "goal chest exists exactly once after reopen + re-claim");

// --- save points: SQL-built, downloadable, restorable
const before = await state();
const snap = (await post("/snapshots", { label: "regress" })).data.id;
const list = (await get("/snapshots")).data;
ok(list.find((x) => x.id === snap)?.size > 1000, "snapshot has size");
const dl = await get(`/snapshots/${snap}/download`);
ok(typeof dl.data === "object" && dl.data.tables?.ledger?.length === before.ledger.length, "snapshot download is valid JSON with all ledger rows");
const ex = await get("/export");
ok(ex.data.tables?.settings?.length > 10, "export is valid JSON");
await post("/ledger/adjust", { ap: 12345, description: "after snapshot" });
await post(`/snapshots/${snap}/restore`);
s = await state();
ok(s.player.ap === before.player.ap && s.ledger.length === before.ledger.length, `restore brings AP back (${s.player.ap} vs ${before.player.ap})`);
ok((await post("/import", ex.data)).status === 200, "import of exported file works");

// --- New Game+ on the same day keeps today's ticks
s = await state();
const weigh = quest(s, "Morning weigh");
await post("/metrics/weight/log", { value: 66 });
await post("/reset/season", { confirm: "NEW GAME", name: "S2" });
s = await state();
ok(s.season.name === "S2" && s.player.ap === 0 && s.player.level === 1, "new season starts fresh");
ok(s.log.some((l) => l.quest_id === weigh.id && l.date === s.today), "today's weigh-in still shows as done");
ok((await post(`/quests/${weigh.id}/undo`, { date: s.today })).status === 200, "and can still be undone");

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
