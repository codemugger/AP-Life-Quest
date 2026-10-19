// Sets the admin password.  npm run set-password          → live site (Cloudflare secret)
//                           npm run set-password -- --local → local dev (.dev.vars)
import { ask, hashPassword, setSecret } from "./lib.mjs";

const local = process.argv.includes("--local");
console.log(`\n🔐 Set the AP Life Quest password (${local ? "local dev" : "live site"})`);
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
if (ok && !local) console.log("  Existing sessions stay logged in. Use Settings → Security → 'Log out everywhere' if needed.");
process.exit(ok ? 0 : 1);
