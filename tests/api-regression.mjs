// End-to-end API checks against a FRESH local dev server (v2: accounts + characters).
//   1. rm -rf .wrangler/state && npm run db:migrate:local && npm run dev
//   2. in another terminal: npm run test:api
// Uses the local setup password from AP_DEV_PASSWORD (default: mochi-dev-password).
import { execSync } from "node:child_process";

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
    get: (p) => call("GET", p),
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

// ================= save points inside a character =================
const snap = (await post("/snapshots", { label: "regress" })).data.id;
const before = await state();
await post("/ledger/adjust", { ap: 999, description: "after snapshot" });
ok((await post(`/snapshots/${snap}/restore`)).status === 200 && (await state()).player.ap === before.player.ap, "save point restores the character");

// ================= copy, limits, delete =================
const c2 = await owner.post("/characters", { name: "Anson Test", copy_from: A });
ok(c2.status === 200, "copy setup from another character");
const s2 = (await owner.get(`/c/${c2.data.id}/state`)).data;
ok(s2.player.ap === 0 && s2.quests.length === (await state()).quests.length, "copy has the same quests but fresh progress");
ok((await owner.del(`/characters/${c2.data.id}`, { confirm: "nope" })).status === 400, "delete needs the name typed");
ok((await owner.del(`/characters/${c2.data.id}`, { confirm: "anson test" })).status === 200, "delete works with the name");
ok((await owner.get(`/c/${c2.data.id}/state`)).status === 404, "deleted character is gone");
await member.post("/characters", { name: "F2", template: "blank" });
await member.post("/characters", { name: "F3", template: "blank" });
ok((await member.post("/characters", { name: "F4", template: "blank" })).status === 400, "members are limited to 3 characters");

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
ok((await owner.post("/account/totp/enable", { secret: t.secret, code: "000000" })).status === 400, "2FA needs a correct code to turn on");

// ================= v1 import =================
const sql = (q) => execSync(`npx wrangler d1 execute ap-life-quest-db --local --command "${q}"`, { stdio: "pipe" });
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
