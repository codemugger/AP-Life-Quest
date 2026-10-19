// The castle gate.
import { useState } from "react";
import { api } from "../api";
import { Pet } from "../sprites";
import { Field } from "../components/ui";

export default function Login({ configured, totp, onDone }: { configured: boolean; totp: boolean; onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api("auth/login", { body: { password: pw, code } });
      onDone();
    } catch (e2) {
      setErr((e2 as Error).message);
      setPw("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login-wrap">
      <form className="panel login" onSubmit={submit}>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 6 }}>
          <Pet stage={err ? 1 : 0} mood={err ? "sad" : "content"} color="pink" scale={5} className="pet-sprite" />
        </div>
        <h1>AP LIFE QUEST</h1>
        <p className="small ink2" style={{ marginTop: 0 }}>
          Private save file. Adventurer only.
        </p>
        {!configured ? (
          <div className="alert gold small" style={{ textAlign: "left" }}>
            No password set yet. On your computer run <span className="kbd">npm run set-password</span> (or <span className="kbd">-- --local</span> for dev).
          </div>
        ) : (
          <>
            <div style={{ textAlign: "left" }}>
              <Field label="Password">
                <input
                  className="input"
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  autoFocus
                  required
                />
              </Field>
              {totp && (
                <Field label="6-digit code">
                  <input
                    className="input"
                    name="one-time-code"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    required
                  />
                </Field>
              )}
            </div>
            {err && <div className="alert small">{err}</div>}
            <button className="btn primary block" disabled={busy}>
              {busy ? "Opening the gate…" : "▶ Press start"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
