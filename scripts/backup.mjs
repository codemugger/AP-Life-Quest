// Downloads a full SQL dump of the live database into ./backups (git-ignored).
//   npm run backup            → live database
//   npm run backup -- --local → local dev database
import { mkdirSync } from "node:fs";
import { DB_NAME, wrangler } from "./lib.mjs";

const local = process.argv.includes("--local");
mkdirSync("backups", { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
const out = `backups/${local ? "local" : "live"}-${stamp}.sql`;
const r = wrangler(["d1", "export", DB_NAME, local ? "--local" : "--remote", "--output", out], { inherit: true });
if (r.status === 0) console.log(`\n💾 Saved ${out}\n   Restore into a fresh DB with: npx wrangler d1 execute ${DB_NAME} --remote --file ${out}`);
process.exit(r.status);
