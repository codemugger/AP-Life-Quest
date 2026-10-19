// The castle gate: log in, first-time owner setup, and joining with an invite.
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api, ApiError } from "../api";
import type { Me } from "../account";
import { Pet } from "../sprites";
import { Field } from "../components/ui";

function Gate({ children, sad, title, sub }: { children: ReactNode; sad?: boolean; title: string; sub: ReactNode }) {
  return (
    <div className="login-wrap">
      <div className="panel login">
        <div style={{ display: "flex", justifyContent: "center", marginTop: 6 }}>
          <Pet stage={sad ? 1 : 0} mood={sad ? "sad" : "content"} color="pink" scale={5} className="pet-sprite" />
        </div>
        <h1>{title}</h1>
        <p className="small ink2" style={{ marginTop: 0 }}>
          {sub}
        </p>
        {children}
      </div>
    </div>
  );
}

function useSubmit(fn: () => Promise<void>) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { err, setErr, busy, submit };
}

const PasswordPair = ({ pw, setPw, pw2, setPw2 }: { pw: string; setPw: (v: string) => void; pw2: string; setPw2: (v: string) => void }) => (
  <>
    <Field label="Choose a password" help="At least 10 characters. A short phrase is easiest, e.g. mochi-loves-salad-55">
      <input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={10} />
    </Field>
    <Field label="Repeat password">
      <input className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
    </Field>
  </>
);

export function Login({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  const [code, setCode] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const { err, setErr, busy, submit } = useSubmit(async () => {
    try {
      await api("auth/login", { body: { username, password: pw, code: needCode ? code : undefined } });
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.data?.need_code) {
        setNeedCode(true);
        setErr(null);
        return;
      }
      setCode("");
      throw e;
    }
  });
  return (
    <Gate title="AP LIFE QUEST" sub="Welcome back, adventurer." sad={!!err}>
      <form onSubmit={submit} style={{ textAlign: "left" }}>
        <Field label="Username">
          <input className="input" name="username" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
        </Field>
        <Field label="Password">
          <input className="input" type="password" name="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
        </Field>
        {needCode && (
          <Field label="6-digit code from your authenticator">
            <input className="input" name="one-time-code" autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus required />
          </Field>
        )}
        {err && <div className="alert small">{err}</div>}
        <button className="btn primary block" disabled={busy}>
          {busy ? "Opening the gate…" : "▶ Press start"}
        </button>
        <p className="tiny muted center">Got an invite? Open the invite link you were sent.</p>
      </form>
    </Gate>
  );
}

/** First run of v2: claim the owner account with the setup password. */
export function Setup({ me, onDone }: { me: Me; onDone: () => void }) {
  const [setupPw, setSetupPw] = useState("");
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [display, setDisplay] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const { err, busy, submit } = useSubmit(async () => {
    if (pw !== pw2) throw new Error("Passwords don't match");
    await api("auth/setup", { body: { setup_password: setupPw, code, username, display_name: display, password: pw } });
    onDone();
  });
  if (!me.setup_ready)
    return (
      <Gate title="ALMOST THERE" sub="This castle has no owner yet.">
        <div className="alert gold small" style={{ textAlign: "left" }}>
          On your computer run <span className="kbd">npm run set-password</span> (or <span className="kbd">npm run set-password -- --local</span> for local dev), then reload this page.
        </div>
      </Gate>
    );
  return (
    <Gate title="CLAIM YOUR CASTLE" sub="One-time setup: create the owner account. Others can only join with your invites.">
      <form onSubmit={submit} style={{ textAlign: "left" }}>
        <Field label="Setup password" help="The password you set with npm run set-password (your v1 password).">
          <input className="input" type="password" autoComplete="current-password" value={setupPw} onChange={(e) => setSetupPw(e.target.value)} required />
        </Field>
        {me.setup_needs_code && (
          <Field label="6-digit code (your v1 2FA)">
            <input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required />
          </Field>
        )}
        <Field label="Your username" help="For logging in, e.g. anson">
          <input className="input" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </Field>
        <Field label="Display name">
          <input className="input" value={display} onChange={(e) => setDisplay(e.target.value)} required />
        </Field>
        <PasswordPair pw={pw} setPw={setPw} pw2={pw2} setPw2={setPw2} />
        {err && <div className="alert small">{err}</div>}
        <button className="btn primary block" disabled={busy}>
          {busy ? "Raising the flag…" : "👑 Become the owner"}
        </button>
      </form>
    </Gate>
  );
}

export function Join({ code, onDone }: { code: string; onDone: () => void }) {
  const [valid, setValid] = useState<boolean | null>(null);
  const [username, setUsername] = useState("");
  const [display, setDisplay] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  useEffect(() => {
    api<{ valid: boolean }>(`auth/invite/${encodeURIComponent(code)}`)
      .then((r) => setValid(r.valid))
      .catch(() => setValid(false));
  }, [code]);
  const { err, busy, submit } = useSubmit(async () => {
    if (pw !== pw2) throw new Error("Passwords don't match");
    await api("auth/join", { body: { code, username, display_name: display, password: pw } });
    location.hash = "#/characters";
    onDone();
  });
  if (valid === null) return <Gate title="CHECKING INVITE…" sub="One moment.">{null}</Gate>;
  if (!valid)
    return (
      <Gate title="INVITE NOT VALID" sub="This invite is expired, revoked or already used. Ask for a new one!" sad>
        <a className="btn" href="#/">
          Back to login
        </a>
      </Gate>
    );
  return (
    <Gate title="YOU'RE INVITED!" sub="Create your account. Your data is private: only you can see your characters.">
      <form onSubmit={submit} style={{ textAlign: "left" }}>
        <Field label="Display name">
          <input className="input" value={display} onChange={(e) => setDisplay(e.target.value)} required autoFocus />
        </Field>
        <Field label="Username" help="3–24 letters/numbers, for logging in">
          <input className="input" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </Field>
        <PasswordPair pw={pw} setPw={setPw} pw2={pw2} setPw2={setPw2} />
        <p className="tiny muted">
          If you forget your password, the person who invited you (the owner) can give you a temporary one. That also means they could sign in as you, so only
          join if you trust them.
        </p>
        {err && <div className="alert small">{err}</div>}
        <button className="btn primary block" disabled={busy}>
          {busy ? "Creating…" : "▶ Join the adventure"}
        </button>
      </form>
    </Gate>
  );
}
