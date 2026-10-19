// Sets the SETUP password, used once to claim the owner account ("Claim your castle").
//   npm run set-password          → live site (Cloudflare secret)
//   npm run set-password -- --local → local dev (.dev.vars)
// Day-to-day passwords are per user and changed in the app (Account page).
import { ask, hashPassword, setSecret } from "./lib.mjs";

const local = process.argv.includes("--local");
console.log(`\n🔐 Set the AP Life Quest SETUP password (${local ? "local dev" : "live site"})`);
console.log("   You'll type it once on the website to claim the owner account.");
console.log("   Tip: a long passphrase is best, e.g. 'mochi-eats-55kg-salad'. iPhone can save it in Passwords.\n");

const pw = await ask("New password: ", true);
if (pw.length < 10) {
  console.error("✘ Use at least 10 characters.");
  process.exit(1);
}
const again = await ask("Repeat it:    ", true);
if (pw !== again) {
  console.error("✘ Passwords didn't match.");
  process.exit(1);
}
const ok = await setSecret("ADMIN_PASSWORD_HASH", hashPassword(pw), local);
if (ok) console.log("  Next: open the site → 'Claim your castle'. (Already claimed? Use the Account page, or npm run reset-owner.)");
process.exit(ok ? 0 : 1);
