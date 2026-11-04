// Settings → Phone reminders: real notifications (Web Push) for this character: a morning brief,
// an evening check on promises and deadlines, and note reminders.
import { useEffect, useState } from "react";
import { prettyDate } from "../../shared/dates";
import { api, g } from "../api";
import { useGame } from "../store";
import { HelpLink, Panel } from "./ui";

interface Device {
  id: number;
  label: string | null;
  created_at: string;
  last_ok: string | null;
  endpoint: string;
}

interface Info {
  ready: boolean;
  key: string | null;
  devices: Device[];
}

const fromB64u = (s: string) => {
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(t + "===".slice((t.length + 3) % 4)), (c) => c.charCodeAt(0));
};
const toB64u = (b: ArrayBuffer | null) => (b ? btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : "");

function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : "Device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return browser ? `${os} · ${browser}` : os;
}

const supported = () => typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const installed = () => matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

async function registration() {
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  return reg;
}

export function PhoneReminders() {
  const { state, act, busy } = useGame();
  const s = state.settings;
  const [info, setInfo] = useState<Info | null>(null);
  const [here, setHere] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const load = () =>
    api<Info>(g("push"))
      .then(setInfo)
      .catch(() => setInfo(null));
  useEffect(() => {
    void load();
    if (supported())
      navigator.serviceWorker
        .getRegistration()
        .then((r) => r?.pushManager.getSubscription())
        .then((sub) => setHere(sub?.endpoint ?? null))
        .catch(() => {});
  }, []);
  const set = (patch: Record<string, unknown>) => act("settings", patch, "PUT").catch(() => {});
  const mine = info?.devices.find((d) => d.endpoint === here);

  const turnOn = async () => {
    if (!info?.key) return;
    setErr(null);
    setWorking(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted")
        throw new Error(perm === "denied" ? "Notifications are blocked for this app. Allow them in Settings → Notifications on your phone (or the 🔒 in the address bar), then try again." : "Notifications weren't allowed.");
      const reg = await registration();
      let sub = await reg.pushManager.getSubscription();
      // a subscription made with an older server key has to be replaced
      if (sub && toB64u(sub.options.applicationServerKey) !== info.key) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(info.key) });
      await act("push/devices", { ...sub.toJSON(), label: deviceLabel() });
      setHere(sub.endpoint);
      await load();
    } catch (e) {
      setErr((e as Error).message || "Couldn't turn reminders on");
    } finally {
      setWorking(false);
    }
  };

  const turnOff = async (d: Device) => {
    setErr(null);
    try {
      if (d.endpoint === here) {
        const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
        await sub?.unsubscribe();
        setHere(null);
      }
      await act(`push/devices/${d.id}`, {}, "DELETE");
      await load();
    } catch {}
  };

  const time = (k: "push_morning" | "push_evening", label: string, help: string, fallback: string) => (
    <div className="li">
      <label className="check grow">
        <input type="checkbox" checked={!!s[k]} onChange={(e) => set({ [k]: e.target.checked ? fallback : "" })} />
        <span>
          {label}
          <span className="tiny muted"> · {help}</span>
        </span>
      </label>
      {!!s[k] && <input className="input day-pick" type="time" value={s[k]} onChange={(e) => e.target.value && set({ [k]: e.target.value })} aria-label={`${label} time`} />}
    </div>
  );

  return (
    <Panel
      title={
        <>
          🔔 Phone reminders <HelpLink to="reminders" />
        </>
      }
      className="span2"
    >
      <p className="small ink2" style={{ marginTop: 0 }}>
        Real notifications, even when the app is closed. They're for this character ({s.player_name}) and go to every device you turn them on for.
      </p>
      {info && !info.ready ? (
        <div className="alert info">Phone reminders aren't set up on the server yet. (Owner: run <code>npm run push-keys</code>, see the README.)</div>
      ) : !supported() ? (
        <div className="alert info">
          {isIos() && !installed()
            ? "On iPhone, add the app to your Home Screen first (Share → Add to Home Screen), open it from there, and come back here."
            : "This browser can't show notifications."}
        </div>
      ) : (
        <div className="row wrap" style={{ marginBottom: 10 }}>
          {mine ? (
            <span className="chip good">✓ On for this device</span>
          ) : (
            <button className="btn primary" disabled={working || busy || !info} onClick={turnOn}>
              🔔 Turn on for this device
            </button>
          )}
          {!!info?.devices.length && (
            <button className="btn sm" disabled={busy} onClick={() => act("push/test").catch(() => {})}>
              Send a test
            </button>
          )}
        </div>
      )}
      {err && <div className="alert">{err}</div>}
      <div className="list">
        {time("push_morning", "☀️ Morning brief", "what's due, what's late, pick your Big 3", "08:00")}
        {time("push_evening", "🌙 Evening check", "promises and deadlines still open (only if there are any)", "20:00")}
        <div className="li">
          <label className="check grow">
            <input type="checkbox" checked={s.push_notes} onChange={(e) => set({ push_notes: e.target.checked })} />
            <span>
              ⏰ Note reminders <span className="tiny muted"> · at the time you set on a note</span>
            </span>
          </label>
        </div>
        <div className="li">
          <label className="check grow">
            <input type="checkbox" checked={s.push_details} onChange={(e) => set({ push_details: e.target.checked })} />
            <span>
              👀 Show to-do and note names <span className="tiny muted"> · off = just counts on the lock screen</span>
            </span>
          </label>
        </div>
      </div>
      {!!info?.devices.length && (
        <>
          <h3 className="board-label">Devices</h3>
          <div className="list">
            {info.devices.map((d) => (
              <div className="li" key={d.id}>
                <span className="grow">
                  {d.label ?? "Device"} {d.endpoint === here && <span className="chip">this one</span>}
                  <div className="tiny muted">
                    added {prettyDate(d.created_at.slice(0, 10))}
                    {d.last_ok ? ` · last delivered ${prettyDate(d.last_ok.slice(0, 10))}` : ""}
                  </div>
                </span>
                <button className="btn xs danger" disabled={busy} onClick={() => turnOff(d)} aria-label={`Turn off reminders for ${d.label ?? "device"}`}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}
