// Web Push (RFC 8030) signed with VAPID (RFC 8292) and encrypted with aes128gcm (RFC 8291).
// Only WebCrypto, so it runs in the Worker with no libraries. Push services only ever see
// ciphertext: the phone decrypts the message with keys it gave us when it subscribed.

const enc = new TextEncoder();
const utf8 = (text: string) => Uint8Array.from(enc.encode(text));

export function b64u(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function unb64u(s: string): Uint8Array<ArrayBuffer> {
  const t = s.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "===".slice((t.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

async function hmac(key: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

/** HKDF-SHA256 with one output block (≤ 32 bytes), which is all RFC 8291 needs. */
async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, length: number) {
  const prk = await hmac(salt, ikm);
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, length);
}

export interface Subscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface LocalKey {
  publicKey: Uint8Array<ArrayBuffer>;
  privateKey: CryptoKey;
}

async function newLocalKey(): Promise<LocalKey> {
  const kp = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  return { privateKey: kp.privateKey, publicKey: new Uint8Array((await crypto.subtle.exportKey("raw", kp.publicKey)) as ArrayBuffer) };
}

/** Encrypts one message for one subscription (a single aes128gcm record). `opts` is for tests. */
export async function encryptPayload(payload: Uint8Array<ArrayBuffer>, sub: Pick<Subscription, "p256dh" | "auth">, opts: { salt?: Uint8Array<ArrayBuffer>; local?: LocalKey } = {}) {
  const uaPublic = unb64u(sub.p256dh);
  const auth = unb64u(sub.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4 || auth.length < 16) throw new Error("Bad subscription keys");
  const local = opts.local ?? (await newLocalKey());
  const ua = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  // (Cloudflare's typings call the "public" member $public; the runtime wants "public")
  const ecdh = { name: "ECDH", public: ua } as unknown as Parameters<SubtleCrypto["deriveBits"]>[0];
  const secret = new Uint8Array(await crypto.subtle.deriveBits(ecdh, local.privateKey, 256));
  const ikm = await hkdf(auth, secret, concat(utf8("WebPush: info\0"), uaPublic, local.publicKey), 32);
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, utf8("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, utf8("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // 0x02 marks the last (only) record; no padding
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(payload, new Uint8Array([2]))));
  const header = new Uint8Array(21 + local.publicKey.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096); // record size
  header[20] = local.publicKey.length;
  header.set(local.publicKey, 21);
  return concat(header, sealed);
}

export interface Vapid {
  /** uncompressed P-256 public key, base64url (what the browser gets as applicationServerKey) */
  publicKey: string;
  /** the private scalar ("d"), base64url */
  privateKey: string;
  /** contact for push services: an https: URL or mailto: */
  subject: string;
}

const signers = new Map<string, Promise<CryptoKey>>();

function signer(v: Vapid) {
  let k = signers.get(v.privateKey);
  if (!k) {
    const pub = unb64u(v.publicKey);
    k = crypto.subtle.importKey(
      "jwk",
      { kty: "EC", crv: "P-256", x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), d: v.privateKey, ext: true },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
    signers.set(v.privateKey, k);
  }
  return k;
}

/** The Authorization header: a short-lived ES256 JWT for the push service's origin. */
export async function vapidHeader(endpoint: string, v: Vapid, now = Date.now()) {
  const head = b64u(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(utf8(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: v.subject })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, await signer(v), utf8(`${head}.${claims}`));
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${v.publicKey}`;
}

/** Push services we deliver to (Apple, Google, Microsoft, Mozilla); nothing else gets our requests. */
const PUSH_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /\.notify\.windows\.com$/, /^updates\.push\.services\.mozilla\.com$/];

export function pushEndpointOk(endpoint: string) {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && PUSH_HOSTS.some((r) => r.test(u.hostname)) && endpoint.length <= 1000;
  } catch {
    return false;
  }
}

export type SendResult = "ok" | "gone" | "error";

export async function sendPush(sub: Subscription, message: unknown, v: Vapid, opts: { ttl?: number; urgency?: "normal" | "high"; topic?: string } = {}) {
  try {
    const body = await encryptPayload(utf8(JSON.stringify(message)), sub);
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        TTL: String(opts.ttl ?? 6 * 3600),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        Urgency: opts.urgency ?? "normal",
        ...(opts.topic ? { Topic: opts.topic } : {}),
        Authorization: await vapidHeader(sub.endpoint, v),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    await res.body?.cancel();
    const result: SendResult = res.ok ? "ok" : res.status === 404 || res.status === 410 ? "gone" : "error";
    return { result, status: res.status };
  } catch (e) {
    console.error("push failed", e);
    return { result: "error" as SendResult, status: 0 };
  }
}
