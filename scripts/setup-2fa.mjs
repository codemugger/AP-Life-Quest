// Turns on two-factor login codes (TOTP).  npm run setup-2fa [-- --local]   |   npm run setup-2fa -- --off
import { randomBytes } from "node:crypto";
import { base32, setSecret, wrangler } from "./lib.mjs";

const local = process.argv.includes("--local");

if (process.argv.includes("--off")) {
  const r = wrangler(["secret", "delete", "TOTP_SECRET"], { input: "y\n" });
  console.log(r.status === 0 ? "✔ 2FA turned off." : r.stdout);
  process.exit(r.status);
}

const secret = base32(randomBytes(20));
const uri = `otpauth://totp/AP%20Life%20Quest:admin?secret=${secret}&issuer=AP%20Life%20Quest&digits=6&period=30`;
console.log(`
📱 Add this to an authenticator BEFORE you log out:
   • iPhone: Settings → Passwords → (your AP Life Quest entry) → Set Up Verification Code → Enter Setup Key
   • or Google Authenticator / 1Password / Authy → "enter a setup key"

   Setup key:  ${secret}
   (otpauth link: ${uri})
`);
const ok = await setSecret("TOTP_SECRET", secret, local);
process.exit(ok ? 0 : 1);
