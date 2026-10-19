// One-time Cloudflare setup:  npm run setup
// 1. log in to Cloudflare  2. create the D1 database  3. build + migrate + deploy
// 4. set your password  5. (optional) 2FA
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { ask, DB_NAME, npm, wrangler } from "./lib.mjs";

const step = (n, s) => console.log(`\n\x1b[35m[${n}/5]\x1b[0m ${s}`);

// A previous local build leaves a redirect to dist/…/wrangler.json (with the old database id). Start clean.
rmSync(".wrangler/deploy", { recursive: true, force: true });
rmSync("dist", { recursive: true, force: true });

step(1, "Checking your Cloudflare login…");
const who = wrangler(["whoami"]);
if (!/associated with the email|You are logged in/i.test(who.stdout)) {
  console.log("   A browser window will open — log in / sign up (free) and click Allow.");
  if (wrangler(["login"], { inherit: true }).status !== 0) process.exit(1);
}

step(2, "Creating the database (skipped if it already exists)…");
let cfg = readFileSync("wrangler.jsonc", "utf8");
if (cfg.includes("00000000-0000-0000-0000-000000000000")) {
  const r = wrangler(["d1", "create", DB_NAME]);
  let id = r.stdout.match(/"database_id":\s*"([0-9a-f-]{36})"/)?.[1] ?? r.stdout.match(/database_id\s*=\s*"([0-9a-f-]{36})"/)?.[1];
  if (!id) {
    // Already exists? Look it up.
    const list = wrangler(["d1", "list", "--json"]);
    try {
      id = JSON.parse(list.stdout.slice(list.stdout.indexOf("["))).find((d) => d.name === DB_NAME)?.uuid;
    } catch {}
  }
  if (!id) {
    console.error(r.stdout);
    process.exit(1);
  }
  cfg = cfg.replace("00000000-0000-0000-0000-000000000000", id);
  writeFileSync("wrangler.jsonc", cfg);
  console.log(`   ✔ Database ${DB_NAME} → ${id} (saved in wrangler.jsonc)`);
} else console.log("   ✔ Database already configured.");

step(3, "Checking, building, migrating and deploying (answer y if asked to apply migrations)…");
if (npm(["run", "deploy"]) !== 0) process.exit(1);

step(4, "Setting your password…");
if (npm(["run", "set-password"]) !== 0) process.exit(1);

step(5, "Two-factor codes (recommended)");
const yes = (await ask("Turn on 2FA login codes now? (y/N) ")).trim().toLowerCase().startsWith("y");
if (yes) npm(["run", "setup-2fa"]);

console.log(`
🎉 All done! Open the URL printed by the deploy step above (https://ap-life-quest.<your-subdomain>.workers.dev).
   1. "Claim your castle" with the setup password you just chose → create your owner account.
   2. Create your first character (or import your v1 save).
   3. On iPhone: Safari → Share → "Add to Home Screen" for the full-screen app.
`);
