// Creates the key pair the server signs phone reminders with (Web Push "VAPID" keys).
//   npm run push-keys              → live site (Cloudflare secrets)
//   npm run push-keys -- --local   → local dev (.dev.vars)
// Run it once. Running it again makes new keys: every device then has to turn reminders on again.
import { webcrypto } from "node:crypto";
import { setSecret } from "./lib.mjs";

const local = process.argv.includes("--local");
const b64u = (buf) => Buffer.from(buf).toString("base64url");

const kp = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pub = b64u(await webcrypto.subtle.exportKey("raw", kp.publicKey));
const { d } = await webcrypto.subtle.exportKey("jwk", kp.privateKey);

console.log(`\n🔔 Phone reminder keys (${local ? "local dev" : "live site"})`);
const ok = (await setSecret("VAPID_PUBLIC_KEY", pub, local)) && (await setSecret("VAPID_PRIVATE_KEY", d, local));
if (ok) console.log(local ? "  Restart npm run dev to pick them up." : "  Done. Turn reminders on in Settings → Phone reminders (iPhone: from the Home Screen app).");
process.exit(ok ? 0 : 1);
