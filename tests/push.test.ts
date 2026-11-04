import { describe, expect, it } from "vitest";
import { isClockTime, zonedTime } from "../shared/dates";
import { b64u, encryptPayload, pushEndpointOk, unb64u, vapidHeader } from "../worker/webpush";

// RFC 8291, section 5 and appendix A
const RFC = {
  plaintext: "V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  body:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

describe("phone reminders: Web Push", () => {
  it("encrypts exactly like the RFC 8291 example", async () => {
    const pub = unb64u(RFC.asPublic);
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      { kty: "EC", crv: "P-256", x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33)), d: RFC.asPrivate, ext: true },
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"],
    );
    const out = await encryptPayload(unb64u(RFC.plaintext), { p256dh: RFC.uaPublic, auth: RFC.auth }, { salt: unb64u(RFC.salt), local: { publicKey: pub, privateKey } });
    expect(b64u(out)).toBe(RFC.body);
  });

  it("each real message gets fresh keys (never the same bytes twice)", async () => {
    const msg = new TextEncoder().encode("hi");
    const a = await encryptPayload(Uint8Array.from(msg), { p256dh: RFC.uaPublic, auth: RFC.auth });
    const b = await encryptPayload(Uint8Array.from(msg), { p256dh: RFC.uaPublic, auth: RFC.auth });
    expect(b64u(a)).not.toBe(b64u(b));
    expect(a.length).toBe(86 + 2 + 1 + 16); // header + text + delimiter + tag
  });

  it("signs a VAPID token the push service can verify", async () => {
    const kp = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const publicKey = b64u((await crypto.subtle.exportKey("raw", kp.publicKey)) as ArrayBuffer);
    const { d } = await crypto.subtle.exportKey("jwk", kp.privateKey);
    const now = Date.UTC(2026, 10, 5, 0, 0);
    const h = await vapidHeader("https://web.push.apple.com/abc123", { publicKey, privateKey: d!, subject: "https://example.org" }, now);
    const m = h.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/)!;
    expect(m[4]).toBe(publicKey);
    const claims = JSON.parse(new TextDecoder().decode(unb64u(m[2])));
    expect(claims).toEqual({ aud: "https://web.push.apple.com", exp: now / 1000 + 12 * 3600, sub: "https://example.org" });
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, kp.publicKey, unb64u(m[3]), new TextEncoder().encode(`${m[1]}.${m[2]}`));
    expect(ok).toBe(true);
  });

  it("only talks to real push services", () => {
    expect(pushEndpointOk("https://web.push.apple.com/QGuW-abc")).toBe(true);
    expect(pushEndpointOk("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(pushEndpointOk("https://wns2-sg2p.notify.windows.com/w/?token=abc")).toBe(true);
    expect(pushEndpointOk("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(pushEndpointOk("http://web.push.apple.com/abc")).toBe(false);
    expect(pushEndpointOk("https://evil.example/push.apple.com")).toBe(false);
    expect(pushEndpointOk("https://push.apple.com.evil.example/x")).toBe(false);
    expect(pushEndpointOk("https://169.254.169.254/latest")).toBe(false);
  });

  it("turns 08:00 in your timezone into the right moment", () => {
    expect(new Date(zonedTime("2026-11-05", "08:00", "Asia/Singapore")).toISOString()).toBe("2026-11-05T00:00:00.000Z");
    expect(new Date(zonedTime("2026-07-01", "08:00", "Europe/London")).toISOString()).toBe("2026-07-01T07:00:00.000Z");
    expect(new Date(zonedTime("2026-12-01", "08:00", "Europe/London")).toISOString()).toBe("2026-12-01T08:00:00.000Z");
    expect(new Date(zonedTime("2026-03-08", "20:30", "America/New_York")).toISOString()).toBe("2026-03-09T00:30:00.000Z");
    expect(isClockTime("08:00")).toBe(true);
    expect(isClockTime("24:00")).toBe(false);
    expect(isClockTime("8:00")).toBe(false);
  });
});
