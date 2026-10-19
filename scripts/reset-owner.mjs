// Owner forgot their password (or lost their 2FA phone)? Set a new one straight in the database.
// Needs your Cloudflare login on this computer, so only you can do it.
//   npm run reset-owner            → live site
//   npm run reset-owner -- --local → local dev
import { ask, DB_NAME, hashPassword, wrangler } from "./lib.mjs";

const local = process.argv.includes("--local");
console.log(`\n👑 Reset the OWNER account password (${local ? "local dev" : "live site"}). 2FA is also turned off; set it up again in Account.\n`);
const pw = await ask("New owner password: ", true);
if (pw.length < 10) {
  console.error("✘ Use at least 10 characters.");
  process.exit(1);
}
if ((await ask("Repeat it:          ", true)) !== pw) {
  console.error("✘ Passwords didn't match.");
  process.exit(1);
}
const hash = hashPassword(pw); // only base64 + '$' characters: safe inside the SQL string
const sql = `UPDATE users SET password_hash = '${hash}', totp_secret = NULL, disabled = 0 WHERE role = 'owner'; DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE role = 'owner');`;
const r = wrangler(["d1", "execute", DB_NAME, local ? "--local" : "--remote", "--command", sql], { input: "y\n" });
if (r.status !== 0) {
  console.error(r.stdout);
  process.exit(1);
}
console.log("✔ Done. Log in with the new password (all your old sessions were signed out).");
