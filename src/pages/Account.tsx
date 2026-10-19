// Account: profile, password, two-factor codes, sessions, and (members) deleting the account.
import { useMemo, useState, type ReactElement } from "react";
import { encode } from "uqr";
import { api } from "../api";
import { useAccount } from "../account";
import { useFx } from "../fx";
import { Field, Modal, Panel } from "../components/ui";

/** QR code drawn as crisp pixel squares (no HTML injection, matches the game style). */
export function QrCode({ text, size = 200 }: { text: string; size?: number }) {
  const qr = useMemo(() => encode(text, { ecc: "M", border: 2 }), [text]);
  const n = qr.data.length;
  const rects: ReactElement[] = [];
  qr.data.forEach((row, y) =>
    row.forEach((on, x) => {
      if (on) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} />);
    }),
  );
  return (
    <svg viewBox={`0 0 ${n} ${n}`} width={size} height={size} className="px-art qr" role="img" aria-label="QR code">
      <rect width={n} height={n} fill="#ffffff" />
      <g fill="#1b1530">{rects}</g>
    </svg>
  );
}

export default function Account() {
  const { account, refresh, logout } = useAccount();
  const fx = useFx();
  const u = account.user;
  const [display, setDisplay] = useState(u.display_name);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [next2, setNext2] = useState("");
  const [totp, setTotp] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [offPw, setOffPw] = useState("");
  const [deleting, setDeleting] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      fx.toast(ok, "✅");
      await refresh();
    } catch (e) {
      fx.error((e as Error).message);
    }
  };
  return (
    <>
      <div className="page-head">
        <h1>👤 Account</h1>
        <span className="small ink2">
          @{u.username} · {u.role === "owner" ? "👑 owner" : "member"}
        </span>
      </div>
      <div className="grid2">
        <Panel title="🪪 Profile">
          <Field label="Display name">
            <input className="input" value={display} onChange={(e) => setDisplay(e.target.value)} maxLength={40} />
          </Field>
          <button className="btn good" onClick={() => run(() => api("account", { method: "PUT", body: { display_name: display } }), "Saved")}>
            Save
          </button>
          <p className="tiny muted">Each character has its own name, pet and looks: change those in the game (Camp wardrobe / Settings).</p>
        </Panel>

        <Panel title="🔑 Password">
          <Field label="Current password">
            <input className="input" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
          </Field>
          <Field label="New password" help="At least 10 characters">
            <input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label="Repeat new password">
            <input className="input" type="password" autoComplete="new-password" value={next2} onChange={(e) => setNext2(e.target.value)} />
          </Field>
          <button
            className="btn good"
            disabled={!cur || !next || next !== next2}
            onClick={() =>
              run(async () => {
                await api("account/password", { body: { current: cur, next } });
                setCur("");
                setNext("");
                setNext2("");
              }, "Password changed. Other devices were logged out.")
            }
          >
            Change password
          </button>
        </Panel>

        <Panel title="📱 Two-factor codes" className="span2">
          {u.totp ? (
            <>
              <p className="small">
                <span className="chip good">✓ on</span> Logging in needs a 6-digit code from your authenticator (iPhone Passwords, Google Authenticator…).
              </p>
              <div className="row wrap">
                <input className="input" style={{ maxWidth: 260 }} type="password" placeholder="Your password to turn it off" value={offPw} onChange={(e) => setOffPw(e.target.value)} />
                <button className="btn danger sm" disabled={!offPw} onClick={() => run(() => api("account/totp/disable", { body: { password: offPw } }).then(() => setOffPw("")), "2FA turned off")}>
                  Turn off
                </button>
              </div>
            </>
          ) : totp ? (
            <div className="grid2">
              <div className="center">
                <QrCode text={totp.uri} />
                <div className="tiny muted">Scan with your phone's camera or authenticator</div>
              </div>
              <div>
                <ol className="small" style={{ paddingLeft: 18 }}>
                  <li>
                    On iPhone tap{" "}
                    <a href={totp.uri} className="linkbtn">
                      add to Passwords
                    </a>{" "}
                    (or scan the QR from another device).
                  </li>
                  <li>
                    Or type the setup key: <span className="kbd">{totp.secret.replace(/(.{4})/g, "$1 ").trim()}</span>
                  </li>
                  <li>Enter the 6-digit code it shows:</li>
                </ol>
                <div className="row">
                  <input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} style={{ maxWidth: 140 }} />
                  <button
                    className="btn good"
                    disabled={code.length !== 6}
                    onClick={() =>
                      run(async () => {
                        await api("account/totp/enable", { body: { secret: totp.secret, code } });
                        setTotp(null);
                        setCode("");
                      }, "2FA is on! 🛡️")
                    }
                  >
                    Turn on
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <p className="small">Add a second lock: even if someone learns your password, they'd also need your phone.</p>
              <button className="btn violet" onClick={() => api<{ secret: string; uri: string }>("account/totp/start", { body: {} }).then(setTotp).catch((e) => fx.error(e.message))}>
                Set up 2FA
              </button>
            </>
          )}
        </Panel>

        <Panel title="🚪 Sessions">
          <div className="row wrap">
            <button className="btn" onClick={logout}>
              Log out
            </button>
            <button
              className="btn danger"
              onClick={() => confirm("Log out on every device (phone, laptop…)?") && api("account/logout-all", { body: {} }).finally(() => location.reload())}
            >
              Log out everywhere
            </button>
          </div>
          <p className="tiny muted">Lost your phone? Log out everywhere from another device, then change your password.</p>
        </Panel>

        {u.role !== "owner" && (
          <Panel title="🗑 Delete account">
            <p className="small ink2">Deletes your account and every character permanently.</p>
            <button className="btn danger" onClick={() => setDeleting(true)}>
              Delete my account
            </button>
          </Panel>
        )}
      </div>
      {deleting && <DeleteAccount onClose={() => setDeleting(false)} />}
    </>
  );
}

function DeleteAccount({ onClose }: { onClose: () => void }) {
  const fx = useFx();
  const [pw, setPw] = useState("");
  return (
    <Modal
      title="🗑 Delete account"
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn danger"
            disabled={!pw}
            onClick={() =>
              api("account", { method: "DELETE", body: { password: pw } })
                .then(() => location.replace("/"))
                .catch((e) => fx.error(e.message))
            }
          >
            Delete everything
          </button>
        </>
      }
    >
      <p>This can't be undone. Download backups of your characters first if you want to keep anything.</p>
      <Field label="Your password">
        <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
      </Field>
    </Modal>
  );
}
