// End-to-end API checks against a FRESH local dev server (v2: accounts + characters).
//   1. rm -rf .wrangler/state && npm run db:migrate:local && npm run dev
//   2. in another terminal: npm run test:api
// Or keep your own local data and use a scratch database instead (set APLQ_STATE for both):
//   wrangler d1 migrations apply ap-life-quest-db --local --persist-to .wrangler/e2e-state
//   APLQ_STATE=.wrangler/e2e-state npm run dev   ·   APLQ_STATE=.wrangler/e2e-state npm run test:api
// Uses the local setup password from AP_DEV_PASSWORD (default: mochi-dev-password).
import { execSync } from "node:child_process";
import { createHmac } from "node:crypto";

/** Real 6-digit TOTP code for a base32 secret (to test 2FA end to end). */
function totp(secret, step = Math.floor(Date.now() / 30000)) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secret) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(step / 2 ** 32), 0);
  msg.writeUInt32BE(step >>> 0, 4);
  const h = createHmac("sha1", key).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  return String((((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1_000_000).padStart(6, "0");
}

const PASSWORD = process.env.AP_DEV_PASSWORD ?? "mochi-dev-password";
const BASE = process.env.AP_URL ?? "http://localhost:5173";
const B = `${BASE}/api`;
let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};

/** A cookie jar per user. */
function client() {
  let cookie = "";
  async function call(method, path, body, { raw, headers = {} } = {}, tries = 3) {
    let r;
    try {
      r = await fetch(B + path, {
        method,
        headers: { "x-requested-with": "aplq", ...(raw ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}), ...headers },
        body: method === "GET" ? undefined : raw ?? JSON.stringify(body ?? {}),
      });
    } catch (e) {
      if (tries > 1) return call(method, path, body, { raw, headers }, tries - 1); // stale keep-alive socket
      throw e;
    }
    // the suite makes more changes a minute than the per-character limit allows: wait it out
    if (r.status === 429 && tries > -20) {
      await r.arrayBuffer();
      await new Promise((ok) => setTimeout(ok, 5000));
      return call(method, path, body, { raw, headers }, Math.min(tries, 1) - 1);
    }
    const sc = r.headers.get("set-cookie");
    if (sc && sc.includes("aplq_session=")) cookie = sc.includes("Max-Age=0") ? "" : sc.split(";")[0];
    const type = r.headers.get("content-type") ?? "";
    const data = type.includes("json") ? await r.json().catch(() => null) : new Uint8Array(await r.arrayBuffer());
    return { status: r.status, data, type };
  }
  return {
    post: (p, b, o) => call("POST", p, b, o),
    put: (p, b) => call("PUT", p, b),
    del: (p, b) => call("DELETE", p, b),
    get: (p, o) => call("GET", p, undefined, o),
  };
}

const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

const owner = client();
const member = client();

// ================= accounts =================
ok((await owner.post("/account/logout-all")).status === 401, "account routes need a session");
let me = (await owner.get("/auth/me")).data;
ok(me.needs_setup === true, "fresh install asks for owner setup");
ok((await owner.post("/auth/setup", { setup_password: "wrong", username: "anson", display_name: "Anson", password: "a-long-password-1" })).status === 401, "setup rejects a wrong setup password");
const setup = await owner.post("/auth/setup", { setup_password: PASSWORD, username: "anson", display_name: "Anson", password: "owner-password-123" });
ok(setup.status === 200, "owner claims the castle");
ok((await member.post("/auth/setup", { setup_password: PASSWORD, username: "evil", display_name: "x", password: "another-password-1" })).status === 409, "setup works only once");
me = (await owner.get("/auth/me")).data;
ok(me.authed && me.user.role === "owner", "owner is logged in");
ok((await member.post("/auth/login", { username: "anson", password: "nope" })).status === 401, "wrong password rejected");

// owner character
const c1 = await owner.post("/characters", { name: "Anson", pet_name: "Mochi", template: "anson", looks: { species: "bunny", color: "#7ec8a0", eyes: "big" } });
ok(c1.status === 200 && c1.data.id, "owner creates a character from 'Anson's original'");
const A = c1.data.id;
let acct = (await owner.get("/account")).data;
ok(acct.characters.length === 1 && acct.characters[0].summary?.species === "bunny", "account lists the character with its look");
ok(acct.templates.some((t) => t.id === "anson"), "owner sees the owner-only template");

// ================= invites & isolation =================
const inv = await owner.post("/admin/invites", { note: "test friend", days: 7 });
ok(inv.status === 200 && /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(inv.data.code), "owner creates an invite code");
ok((await member.get(`/auth/invite/${inv.data.code}`)).data.valid === true, "invite code is valid");
const join = await member.post("/auth/join", { code: inv.data.code, username: "friend", display_name: "Friend", password: "friend-password-1" });
ok(join.status === 200, "friend joins with the invite");
ok((await client().post("/auth/join", { code: inv.data.code, username: "friend2", display_name: "F2", password: "friend-password-2" })).status === 400, "an invite works only once");
ok((await member.post("/characters", { name: "Friend", template: "anson" })).status === 400, "members can't use the owner-only template");
const m1 = await member.post("/characters", { name: "Friend", pet_name: "Pip", template: "starter" });
ok(m1.status === 200, "friend creates a character (starter)");
const M = m1.data.id;
ok((await member.get(`/c/${A}/state`)).status === 404, "friend can't read the owner's character");
ok((await owner.get(`/c/${M}/state`)).status === 404, "owner can't read the friend's character either");
ok((await member.get("/admin/overview")).status === 403, "friend can't open admin");
const ms = (await member.get(`/c/${M}/state`)).data;
ok(ms.quests.some((q) => q.title.includes("water")) && !ms.shop.some((i) => i.name.includes("Calorie Waiver")), "starter template has generic content");

// ================= game regression (inside the owner's character) =================
const g = (p) => `/c/${A}${p}`;
const post = (p, b) => owner.post(g(p), b);
const state = async () => (await owner.get(g("/state"))).data;
const quest = (s, t) => s.quests.find((q) => q.title.startsWith(t));
const item = (s, n) => s.shop.find((i) => i.name.startsWith(n));
await post("/process");
let s = await state();
ok(!!s.player && s.settings.pet_species === "bunny", "character state loads with its look");

const move = quest(s, "Move for 30");
const [x1, x2] = await Promise.all([post(`/quests/${move.id}/complete`), post(`/quests/${move.id}/complete`)]);
ok([x1.status, x2.status].sort().join() === "200,409", `parallel daily ticks → one 200 + one 409 (${x1.status},${x2.status})`);

await post(`/quests/${move.id}/undo`, {});
s = await state();
await post("/ledger/adjust", { xp: 85 - s.player.xp, description: "test: near level 2" });
s = await state();
const chestsBefore = s.chests.length;
await post(`/quests/${move.id}/complete`);
await post(`/quests/${move.id}/undo`, {});
await post(`/quests/${move.id}/complete`);
s = await state();
ok(s.player.level === 2 && s.chests.length === chestsBefore + 1, `level-up chest only once (${chestsBefore} → ${s.chests.length})`);

const ch = s.chests[0];
const [o1, o2] = await Promise.all([post(`/chests/${ch.id}/open`), post(`/chests/${ch.id}/open`)]);
ok([o1.status, o2.status].sort().join() === "200,409", `parallel chest opens → one 200 + one 409 (${o1.status},${o2.status})`);

await post("/ledger/adjust", { ap: 600, description: "test money" });
s = await state();
const massage = item(s, "Massage");
await post("/shop/buy", { item_id: massage.id, use_now: true });
s = await state();
let spend = s.ledger.find((l) => l.kind === "spend" && !l.voided && l.description.includes("Massage"));
ok((await post(`/ledger/${spend.id}/void`)).status === 200 && ((await state()).inventory[massage.id] ?? 0) === 0, "refunding a used-right-away purchase keeps the bag at 0");

await post("/ledger/adjust", { hp: -98, description: "test: nearly dead" });
s = await state();
const tea = quest(s, "Sugary drink");
await post(`/quests/${tea.id}/complete`);
ok((await state()).player.fainted === 1, "bad habit at low HP faints");
await post(`/quests/${tea.id}/undo`, { date: s.today });
s = await state();
ok(s.player.fainted === 0 && s.player.hp > 0, "undoing it un-faints");

// rewind two days via export → import, then close them from "two devices" at once
const exp = (await owner.get(g("/export"))).data;
const closed = s.closed;
const back = new Date(Date.parse(closed + "T00:00:00Z") - 2 * 86400000).toISOString().slice(0, 10);
exp.tables.player[0].last_processed = back;
exp.tables.day_closures = [];
ok((await post("/import", exp)).status === 200, "backup import works");
const [p1, p2] = await Promise.all([post("/process"), post("/process")]);
const reports = [...p1.data.fx, ...p2.data.fx].filter((f) => f.t === "report").map((f) => f.date);
ok(reports.length === 2 && new Set(reports).size === 2, `each closed day scored once (${reports.join(", ")})`);

await post("/metrics/calories/log", { value: 3500 });
s = await state();
ok(s.obligations.length === 1, "3500 kcal opens a calorie-court case");
await post("/shop/buy", { item_id: item(s, "3000").id, use_now: true });
ok((await state()).obligations.length === 0, "buying + using the ticket settles it");

// ================= to-do priorities (Eisenhower) =================
s = await state();
const dayOf = (n) => new Date(Date.parse(s.closed + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const todo = async (title, priority, due, extra = {}) =>
  (await post("/data/quests", { type: "todo", title, emoji: "📌", priority, due_date: due, created_at: dayOf(-3), ap: 15, xp: 20, ...extra })).data.data.id;
await todo("Urgent report", "do", dayOf(-1), { hp_penalty: 10 });
await todo("Reply to email", "delegate", dayOf(-1), { hp_penalty: 3 });
await todo("Book dentist", "schedule", dayOf(0), { hp_penalty: 6 });
await todo("Unsorted chore", null, dayOf(-1), { hp_penalty: 5 });
await todo("Someday idea", "later", dayOf(-1), { hp_penalty: 0 });
ok((await post("/data/quests", { type: "todo", title: "x", priority: "panic" })).status === 400, "unknown priority rejected");
// a daily on a schedule: every 2 days from yesterday → due on dayOf(-1), off on dayOf(0)
await post("/data/quests", { type: "daily", title: "Every-other-day stretch", emoji: "🧘", hp_penalty: 7, created_at: dayOf(-3), repeat_rule: { t: "days", n: 2, from: dayOf(-1) } });
ok((await post("/data/quests", { type: "daily", title: "x", repeat_rule: { t: "weeks", n: 2, days: "0000000", from: dayOf(0) } })).status === 400, "a schedule with no weekdays is rejected");
const exp3 = (await owner.get(g("/export"))).data;
exp3.tables.player[0].last_processed = dayOf(-2);
exp3.tables.day_closures = exp3.tables.day_closures.filter((r) => r.date <= dayOf(-2));
await post("/import", exp3);
const proc = [];
for (let i = 0; i < 5; i++) {
  const r = await post("/process");
  proc.push(...r.data.fx);
  if (!r.data.remaining) break;
}
s = await state();
const dl = s.ledger.filter((l) => l.source === "deadline" && !l.voided);
const missedDay1 = dl.find((l) => l.date === dayOf(-1) && l.description.startsWith("Missed deadlines"));
ok(!!missedDay1 && missedDay1.description.includes("Urgent report") && missedDay1.description.includes("Reply to email") && !missedDay1.description.includes("Unsorted") && !missedDay1.description.includes("Someday"), "missed deadlines hit only prioritised to-dos (not unsorted/someday)");
ok(missedDay1 && missedDay1.ap === -15, `🔥 Do-now also forfeits its AP (${missedDay1?.ap})`);
const drain = dl.find((l) => l.date === dayOf(0) && l.description.startsWith("Still overdue"));
ok(!!drain && drain.description.includes("Urgent report") && !drain.description.includes("Reply to email"), "🔥 keeps draining HP the next day; ⚡ quick tasks don't");
ok(dl.some((l) => l.date === dayOf(0) && l.description.includes("Book dentist")), "📅 scheduled to-do is penalised on its own deadline day");
ok(proc.some((f) => f.t === "report" && f.late?.some((x) => x.includes("Urgent report"))), "the overnight report lists late to-dos");
const urgent = s.quests.find((q) => q.title === "Urgent report");
await post(`/quests/${urgent.id}/complete`, {});
s = await state();
ok(s.ledger.some((l) => l.description.includes("Urgent report — late, half pay")), "finishing late pays half");
const early = await todo("Plan next sprint", "schedule", dayOf(5));
await post(`/quests/${early}/complete`, {});
s = await state();
ok(s.ledger.some((l) => l.description.includes("Plan next sprint — early bird!")), "📅 finished early gets the early-bird bonus");
const now2 = (await post("/data/quests", { type: "todo", title: "Do it now", priority: "do" })).data.data.id;
ok((await state()).quests.find((q) => q.id === now2).due_date === s.today, "🔥 Do-now without a date is due today");
const missedDaily = (date) => s.ledger.some((l) => l.source === "day" && l.date === date && l.description.includes("Every-other-day stretch"));
ok(missedDaily(dayOf(-1)) && !missedDaily(dayOf(0)), "a scheduled daily only counts on its own days");

// repeating to-dos: finishing one lines up the next; undoing takes it back
const monthly = (await post("/data/quests", { type: "todo", title: "Pay parents", emoji: "💸", priority: "do", hp_penalty: 10, repeat_rule: { t: "monthday", n: 1, day: 26, from: s.today } })).data.data.id;
s = await state();
const firstDue = s.quests.find((q) => q.id === monthly).due_date;
ok(firstDue >= s.today && firstDue.endsWith("-26"), `a repeating to-do is due on its next date (${firstDue})`);
const doneM = await post(`/quests/${monthly}/complete`, {});
s = await state();
const nextM = s.quests.find((q) => q.repeat_of === monthly);
ok(!!nextM && nextM.due_date > firstDue && nextM.priority === "do" && nextM.hp_penalty === 10 && doneM.data.fx.some((f) => f.t === "toast" && f.msg.includes("Next one")), `finishing it creates the next one (${nextM?.due_date})`);
await post(`/quests/${monthly}/undo`, {});
s = await state();
ok(!s.quests.some((q) => q.repeat_of === monthly), "undoing it removes the next one again");

// more picture space for the owner; deleting finished battles
ok((await owner.get(g("/media"))).data.limit === 500 * 1024 * 1024, "the owner gets 500 MB for pictures and voice memos");
const sprintId = (await post("/data/sprints", { title: "Old raid", boss: "Slime", start_date: dayOf(-20), end_date: dayOf(-10) })).data.data.id;
ok((await owner.del(g(`/data/sprints/${sprintId}`))).status === 200 && !(await state()).sprints.some((x) => x.id === sprintId), "a sprint can be removed from the battle history");

// ================= looks =================
const put = (b) => owner.put(g("/settings"), b);
ok((await put({ pet_species: "dino", pet_eyes: "sparkle", pet_color: "#123456" })).status === 200, "species/eyes/custom colour save");
ok((await put({ pet_species: "dragon" })).status === 400, "unknown species rejected");
ok((await put({ pet_color: "red" })).status === 400, "bad colour rejected");
ok((await put({ hat: "beanie", face: "glasses", scene: "beach" })).status === 200, "free hat/face/scene work");
ok((await put({ hat: "crown" })).status === 400, "level-locked hat rejected");
ok((await put({ scene: "space" })).status === 400, "level-locked scene rejected");

// ================= pictures =================
const up = await owner.post(g("/media"), null, { raw: PNG, headers: { "content-type": "image/png", "x-width": "1", "x-height": "1" } });
ok(up.status === 200 && up.data.id > 0, "picture upload works");
const pic = await owner.get(g(`/media/${up.data.id}`));
ok(pic.status === 200 && pic.type === "image/png" && pic.data.length === PNG.length, "picture downloads byte-for-byte");
ok((await member.get(`/c/${A}/media/${up.data.id}`)).status === 404, "friend can't fetch the owner's pictures");
ok((await owner.post(g("/media"), null, { raw: new TextEncoder().encode("<html><script>alert(1)</script></html>".padEnd(40)), headers: { "content-type": "image/png" } })).status === 400, "fake 'picture' (HTML) rejected");
ok((await owner.post(g("/media"), null, { raw: new TextEncoder().encode("<svg onload=alert(1)></svg>".padEnd(40)), headers: { "content-type": "image/svg+xml" } })).status === 400, "SVG rejected");
const qn = await post("/data/quests", { type: "daily", title: "Yoga video", emoji: "🧘", images: [up.data.id], link: "https://www.youtube.com/watch?v=abc", notes: "**Gentle** flow\n- breathe\n- stretch" });
ok(qn.status === 200, "quest with picture, link and formatted notes saves");
ok((await post("/data/quests", { type: "daily", title: "x", link: "javascript:alert(1)" })).status === 400, "javascript: links rejected");
ok((await post("/data/quests", { type: "daily", title: "x", images: ["1;DROP"] })).status === 400, "bad picture lists rejected");
ok((await post("/data/events", { title: "Xi'an trip", date: "2027-01-01", images: [up.data.id], notes: "Terracotta warriors!" })).status === 200, "event with photos saves");
const stats = (await owner.get(g("/media"))).data;
ok(stats.count === 1 && stats.unused === 0, "picture stats know it's in use");
ok((await owner.get(g(`/media/${up.data.id}`)).then(() => owner.post(g("/media"), null, { raw: PNG, headers: { "content-type": "image/png" } }))).status === 200, "second upload ok");
const cached = await fetch(`${B}/c/${A}/media/${up.data.id}`, { headers: { "if-none-match": `"m${up.data.id}"`, cookie: "" } });
ok(cached.status === 401, "cached pictures still need a login");
const spoof = await member.post(`/c/${M}/media`, null, { raw: PNG, headers: { "content-type": "image/png", "x-aplq-owner": "1" } });
ok(spoof.status === 200 && (await member.get(`/c/${M}/media`)).data.limit === 50 * 1024 * 1024, "members can't spoof the owner's storage limit");

// ================= save points inside a character =================
const snap = (await post("/snapshots", { label: "regress" })).data.id;
const before = await state();
await post("/ledger/adjust", { ap: 999, description: "after snapshot" });
ok((await post(`/snapshots/${snap}/restore`)).status === 200 && (await state()).player.ap === before.player.ap, "save point restores the character");

// ================= notebook =================
const words = (n) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: Array.from({ length: n }, (_, i) => `word${i}`).join(" ") }] }] });
const nbs = (await owner.get(g("/notes"))).data;
ok(nbs.notebooks.length === 2 && nbs.notebooks.some((b) => b.kind === "journal"), "every character starts with a Notes and a Journal binder");
const notesBook = nbs.notebooks.find((b) => b.kind === "notes");
const journalBook = nbs.notebooks.find((b) => b.kind === "journal");
const richDoc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "CET 20 Oct" }] },
    { type: "paragraph", content: [{ type: "text", text: "Gym 7pm", marks: [{ type: "bold" }, { type: "link", attrs: { href: "javascript:alert(1)" } }] }] },
    { type: "image", attrs: { media: up.data.id, size: "m", onerror: "alert(1)" } },
    { type: "script", content: [{ type: "text", text: "alert(1)" }] },
  ],
};
const n1 = await post("/notes", { notebook_id: notesBook.id, title: "CET", doc: richDoc, color: "mint", paper: "grid", font: "hand" });
ok(n1.status === 200 && n1.data.data.id > 0, "note with formatting and a picture saves");
const N = n1.data.data;
ok(!N.doc.includes("javascript") && !N.doc.includes("script") && !N.doc.includes("onerror") && N.doc.includes('"bold"'), "note content is sanitised (no scripts, handlers or javascript: links)");
ok(N.cover === up.data.id && N.font === "hand" && N.paper === "grid", "cover picture, font and paper are kept");
ok((await post("/notes", { title: "x", color: "hotpink" })).status === 400, "unknown note colour rejected");
const e1 = await owner.put(g(`/notes/${N.id}`), { title: "CET v2", rev: N.rev });
ok(e1.status === 200 && e1.data.data.rev === N.rev + 1, "editing bumps the note's revision");
ok((await owner.put(g(`/notes/${N.id}`), { title: "stale", rev: N.rev })).status === 409, "a stale edit from another device is caught (409)");
const lab = (await post("/note-labels", { name: "Work" })).data.data;
ok((await post("/note-labels", { name: "work" })).status === 400, "duplicate labels rejected (any case)");
s = await state();
await owner.put(g(`/notes/${N.id}`), { labels: [lab.id, 99999], pinned: 1, pin_today: 1, goal_id: s.goals[0].id });
s = await state();
ok(s.notes.some((n) => n.id === N.id && n.pin_today && n.preview && n.goal_id === s.goals[0].id), "Camp pins and goal links reach the game state");
let card = (await owner.get(g("/notes"))).data.notes.find((n) => n.id === N.id);
ok(JSON.parse(card.labels).join() === String(lab.id) && card.pinned === 1, "labels keep only real ids; pin saved");
ok((await owner.get(g("/notes/search?q=gym"))).data.some((h) => h.id === N.id), "search finds words inside notes");
ok((await owner.put(g(`/notes/${N.id}`), { goal_id: 987654 })).status === 400, "linking to a goal that doesn't exist is rejected");

// journal → quest, trophy, undo
const jq = s.quests.find((q) => q.metric_key === "journal");
ok(!!jq && s.metrics.some((m) => m.key === "journal"), "the journal tracker and quest exist");
const j1 = await post("/notes", { notebook_id: journalBook.id, doc: words(10) });
ok(j1.status === 200 && j1.data.data.journal_date === s.today, "journal entry is dated today");
s = await state();
const jv = () => s.values.find((v) => v.metric_key === "journal" && v.date === s.today)?.value ?? null;
const jdone = () => s.log.some((l) => l.quest_id === jq.id && l.date === s.today);
ok(jv() === 10 && !jdone(), "10 words are logged; the quest isn't done yet (needs 30)");
await owner.put(g(`/notes/${j1.data.data.id}`), { doc: words(20) });
s = await state();
ok(jv() === 20 && !jdone(), "autosaves update the word count quietly");
const j2 = await owner.put(g(`/notes/${j1.data.data.id}`), { doc: words(35) });
s = await state();
ok(j2.data.fx.some((f) => f.t === "xp") && jdone(), "crossing 30 words ticks the journal quest (+XP)");
ok(!!s.achievements.find((a) => a.key === "journal_first")?.unlocked_at, "“Dear Diary” trophy unlocks");
await post(`/notes/${j1.data.data.id}/trash`);
s = await state();
ok(jv() === null && !jdone(), "trashing the entry takes its words and the quest back");
await post(`/notes/${j1.data.data.id}/restore`);
s = await state();
ok(jv() === 35 && jdone(), "restoring it brings them back");
ok((await post("/notes", { notebook_id: journalBook.id, journal_date: "2099-01-01", doc: words(5) })).status === 400, "can't journal for a future day");

// reminders, binders, save points, backups
await owner.put(g(`/notes/${N.id}`), { remind_at: new Date(Date.now() - 60_000).toISOString(), remind_repeat: "daily" });
const rd = await post(`/notes/${N.id}/remind-done`);
ok(Date.parse(rd.data.data.remind_at) > Date.now(), "a repeating reminder moves to its next time when done");
const work = (await post("/notebooks", { name: "Work", emoji: "💼", color: "sky" })).data.data;
const n2 = (await post("/notes", { notebook_id: work.id, title: "minutes", doc: words(3) })).data.data;
ok((await owner.del(g(`/notebooks/${work.id}`))).status === 200 && (await owner.get(g(`/notes/${n2.id}`))).data.notebook_id === notesBook.id, "deleting a notebook moves its notes (nothing lost)");
const snap2 = (await post("/snapshots", { label: "notes" })).data.id;
const n3 = (await post("/notes", { title: "after the save point", doc: words(4) })).data.data;
await post(`/snapshots/${snap2}/restore`);
ok((await owner.get(g(`/notes/${n3.id}`))).status === 200, "loading a save point keeps today's notes by default");
await post(`/snapshots/${snap2}/restore`, { notes: true });
ok((await owner.get(g(`/notes/${n3.id}`))).status === 404, "…or rolls the notebook back too when asked");
const exp2 = (await owner.get(g("/export"))).data;
ok(exp2.tables.notes?.length > 0 && !("text" in exp2.tables.notes[0]), "backups include notes (without rebuildable columns)");
const target = exp2.tables.notes[0];
target.doc = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "evil", marks: [{ type: "link", attrs: { href: "javascript:x" } }] }] }] });
ok((await post("/import", exp2)).status === 200, "a backup with notes imports");
const back2 = (await owner.get(g(`/notes/${target.id}`))).data;
ok(!back2.doc.includes("javascript") && back2.words === 1 && !!back2.preview, "imported notes are sanitised and rebuilt");

// voice memos
const M4A = new Uint8Array(64);
M4A.set([0, 0, 0, 0x18], 0);
M4A.set(new TextEncoder().encode("ftypM4A "), 4);
const au = await owner.post(g("/media"), null, { raw: M4A, headers: { "content-type": "audio/x-m4a" } });
ok(au.status === 200 && au.data.id > 0, "voice memo upload works (m4a)");
const part = await owner.get(g(`/media/${au.data.id}`), { headers: { range: "bytes=4-11" } });
ok(part.status === 206 && part.data.length === 8 && part.type === "audio/mp4", "voice memos stream in ranges (iPhone players need this)");
ok((await owner.post(g("/media"), null, { raw: new TextEncoder().encode("<html>".padEnd(40)), headers: { "content-type": "audio/webm" } })).status === 400, "fake audio rejected");

// ================= copy, limits, delete =================
const c2 = await owner.post("/characters", { name: "Anson Test", copy_from: A });
ok(c2.status === 200, "copy setup from another character");
const s2 = (await owner.get(`/c/${c2.data.id}/state`)).data;
ok(s2.player.ap === 0 && s2.quests.length === (await state()).quests.length, "copy has the same quests but fresh progress");
ok((await owner.del(`/characters/${c2.data.id}`, { confirm: "nope" })).status === 400, "delete needs the name typed");
ok((await owner.del(`/characters/${c2.data.id}`, { confirm: "anson test" })).status === 200, "delete works with the name");
ok((await owner.get(`/c/${c2.data.id}/state`)).status === 404, "deleted character is gone");
await Promise.all(["F2", "F3", "F4", "F5", "F6"].map((n) => member.post("/characters", { name: n, template: "blank" })));
ok((await member.get("/account")).data.characters.length === 3, "parallel creation can't exceed the 3-character limit");

// ================= admin powers =================
const ov = (await owner.get("/admin/overview")).data;
const friend = ov.users.find((u) => u.username === "friend");
await owner.put(`/admin/users/${friend.id}`, { disabled: true });
ok((await member.get("/account")).status === 401, "disabled user is locked out immediately");
await owner.put(`/admin/users/${friend.id}`, { disabled: false });
const reset = await owner.post(`/admin/users/${friend.id}/reset-password`);
const again = client();
ok((await again.post("/auth/login", { username: "friend", password: reset.data.temp })).status === 200, "temporary password works");

// ================= 2FA =================
const t = (await owner.post("/account/totp/start")).data;
ok(/^[A-Z2-7]{32}$/.test(t.secret) && t.uri.startsWith("otpauth://"), "2FA setup key issued");
ok((await owner.post("/account/totp/enable", { secret: t.secret, code: totp(t.secret) })).status === 401, "turning on 2FA needs your password");
ok((await owner.post("/account/totp/enable", { secret: t.secret, code: "000000", password: "owner-password-123" })).status === 400, "…and a correct code");
const now = Math.floor(Date.now() / 30000);
ok((await owner.post("/account/totp/enable", { secret: t.secret, code: totp(t.secret, now - 1), password: "owner-password-123" })).status === 200, "2FA turns on");
const dev = client(); // a brand-new device
ok((await dev.post("/auth/login", { username: "anson", password: "owner-password-123" })).data?.need_code === true, "login now asks for the code");
const code = totp(t.secret, now);
ok((await dev.post("/auth/login", { username: "anson", password: "owner-password-123", code })).status === 200, "login with the code works");
ok((await client().post("/auth/login", { username: "anson", password: "owner-password-123", code })).status === 401, "the same code can't be used twice");
ok((await owner.post("/account/totp/disable", { password: "owner-password-123" })).status === 200, "2FA turns off with the password");

// ================= security regressions =================
// (1) a member can't get the owner-only template via a doctored backup + factory reset
const mexp = (await again.get(`/c/${M}/export`)).data;
mexp.tables.settings = mexp.tables.settings.filter((r) => r.key !== "template").concat([{ key: "template", value: JSON.stringify("anson") }]);
mexp.tables.quests.push({ id: 9999, type: "daily", title: "evil link", emoji: "x", link: "javascript:alert(1)", images: "[1,\"x\"]", days: "1111111" });
ok((await again.post(`/c/${M}/import`, mexp)).status === 200, "member imports a doctored backup");
let mstate = (await again.get(`/c/${M}/state`)).data;
const evil = mstate.quests.find((q) => q.title === "evil link");
ok(mstate.settings.template === "starter" && evil && evil.link === null && evil.images === null, "import keeps the template and strips bad links/pictures");
const kept = (await again.post(`/c/${M}/notes`, { title: "my diary", doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }] } })).data.data;
await again.post(`/c/${M}/reset/factory`, { confirm: "RESET EVERYTHING" });
mstate = (await again.get(`/c/${M}/state`)).data;
ok(!mstate.shop.some((i) => i.name.includes("Calorie Waiver")) && mstate.settings.template === "starter", "factory reset can't produce the owner's template");
const mnotes = (await again.get(`/c/${M}/notes`)).data;
ok(mnotes.notes.some((n) => n.id === kept.id) && mnotes.notebooks.length === 2, "factory reset keeps the notebook (no duplicate binders)");
await again.post(`/c/${M}/reset/factory`, { confirm: "RESET EVERYTHING", notes: true });
ok((await again.get(`/c/${M}/notes`)).data.notes.length === 0, "…unless you ask to delete it too");
// (2) save-point cap
let last = 0;
for (let i = 0; i < 13; i++) last = (await again.post(`/c/${M}/snapshots`, { label: `s${i}` })).status;
ok(last === 400, "manual save points are capped at 12");

// ================= v1 import =================
const persist = process.env.APLQ_STATE ? ` --persist-to "${process.env.APLQ_STATE}"` : "";
const sql = (q) => execSync(`npx wrangler d1 execute ap-life-quest-db --local${persist} --command "${q}"`, { stdio: "pipe" });
sql(
  "INSERT INTO settings (key, value) VALUES ('current_season','1'),('player_name','\\\"Legacy Anson\\\"'),('seeded_at','\\\"x\\\"'); INSERT INTO seasons (id, name, started_at) VALUES (1,'Season 1','2026-10-01'); INSERT INTO player (id, hp) VALUES (1, 77); INSERT INTO ledger (date, kind, ap, xp, source, description, season_id) VALUES ('2026-10-02','earn',123,50,'quest','v1 quest',1);",
);
acct = (await owner.get("/account")).data;
ok(acct.legacy === true, "v1 save is detected");
const li = await owner.post("/legacy/import");
ok(li.status === 200, "v1 save imports into a character");
const ls = (await owner.get(`/c/${li.data.id}/state`)).data;
ok(ls.player.ap === 123 && ls.player.hp === 77 && ls.settings.player_name === "Legacy Anson", `imported progress is intact (AP ${ls.player.ap}, HP ${ls.player.hp})`);
ok((await owner.get("/account")).data.legacy === false, "v1 import is one-time");

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
