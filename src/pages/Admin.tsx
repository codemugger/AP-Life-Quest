// Owner-only: invite people, see who's playing, disable accounts, reset passwords.
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useFx } from "../fx";
import { Empty, Field, Modal, Panel } from "../components/ui";

interface AdminUser {
  id: number;
  username: string;
  display_name: string;
  role: string;
  disabled: number;
  max_characters: number;
  created_at: string;
  last_login: string | null;
  characters: number;
  totp: number;
}
interface Invite {
  code_hash: string;
  code_hint: string;
  note: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_by_name: string | null;
  revoked: number;
}

const when = (s: string | null) => (s ? new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z").toLocaleDateString("en-SG", { day: "numeric", month: "short" }) : "never");

export default function Admin() {
  const fx = useFx();
  const [data, setData] = useState<{ users: AdminUser[]; invites: Invite[] } | null>(null);
  const [note, setNote] = useState("");
  const [days, setDays] = useState("14");
  const [fresh, setFresh] = useState<{ code: string; expires_at: string } | null>(null);
  const [temp, setTemp] = useState<{ user: string; temp: string } | null>(null);
  const load = useCallback(() => api("admin/overview").then(setData).catch((e) => fx.error(e.message)), [fx]);
  useEffect(() => void load(), [load]);
  const link = (code: string) => `${location.origin}/#/join/${code}`;
  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => fx.toast("Copied!", "📋"));
  return (
    <>
      <div className="page-head">
        <h1>👑 Admin</h1>
        <span className="small ink2">Only you can see this page</span>
      </div>
      <div className="grid2">
        <Panel title="✉️ Invite someone">
          <Field label="Who is it for? (just a note for you)">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Mum, gym buddy" />
          </Field>
          <Field label="Valid for (days)">
            <input className="input" type="number" min={1} max={60} value={days} onChange={(e) => setDays(e.target.value)} />
          </Field>
          <button
            className="btn primary"
            onClick={() =>
              api<{ code: string; expires_at: string }>("admin/invites", { body: { note, days: Number(days) } })
                .then((r) => {
                  setFresh(r);
                  setNote("");
                  void load();
                })
                .catch((e) => fx.error(e.message))
            }
          >
            Create invite
          </button>
          <p className="tiny muted">Each invite works once. They'll get their own private account and characters; you can't see their data.</p>
        </Panel>

        <Panel title="📨 Invites">
          {!data?.invites.length ? (
            <Empty emoji="📭">No invites yet.</Empty>
          ) : (
            <div className="list">
              {data.invites.map((i) => {
                const expired = !i.used_at && new Date(i.expires_at) < new Date();
                const status = i.used_at ? `used by @${i.used_by_name ?? "?"}` : i.revoked ? "revoked" : expired ? "expired" : `open until ${when(i.expires_at)}`;
                return (
                  <div className="li" key={i.code_hash}>
                    <div className="grow">
                      <b>…{i.code_hint}</b> {i.note && <span className="small ink2">· {i.note}</span>}
                      <div className="tiny muted">{status}</div>
                    </div>
                    {!i.used_at && !i.revoked && !expired && (
                      <button className="btn xs" onClick={() => api(`admin/invites/${i.code_hash}`, { method: "DELETE" }).then(load)}>
                        Revoke
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="🧑‍🤝‍🧑 Players" className="span2">
          <div className="list">
            {data?.users.map((u) => (
              <div className="li" key={u.id}>
                <div className="grow">
                  <b>{u.display_name}</b> <span className="small muted">@{u.username}</span> {u.role === "owner" && <span className="chip ap">👑 owner</span>}
                  {u.disabled ? <span className="chip bad">disabled</span> : null}
                  {u.totp ? <span className="chip good">2FA</span> : null}
                  <div className="tiny muted">
                    {u.characters} character(s) · max {u.max_characters} · joined {when(u.created_at)} · last login {when(u.last_login)}
                  </div>
                </div>
                {u.role !== "owner" && (
                  <div className="row wrap" style={{ justifyContent: "flex-end" }}>
                    <select
                      className="input"
                      style={{ width: 80, minHeight: 32, padding: "2px 6px" }}
                      value={u.max_characters}
                      onChange={(e) => api(`admin/users/${u.id}`, { method: "PUT", body: { max_characters: Number(e.target.value) } }).then(load)}
                      aria-label="Max characters"
                    >
                      {[1, 2, 3, 5, 10].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <button className="btn xs" onClick={() => api(`admin/users/${u.id}`, { method: "PUT", body: { disabled: !u.disabled } }).then(load)}>
                      {u.disabled ? "Enable" : "Disable"}
                    </button>
                    <button
                      className="btn xs"
                      onClick={() =>
                        confirm(`Reset ${u.display_name}'s password? Their 2FA is removed and they're logged out.`) &&
                        api<{ temp: string }>(`admin/users/${u.id}/reset-password`, { body: {} }).then((r) => setTemp({ user: u.display_name, temp: r.temp }))
                      }
                    >
                      Reset password
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {fresh && (
        <Modal title="✉️ Invite ready" onClose={() => setFresh(null)}>
          <p className="small">Send this link (or the code). It works once and is only shown now.</p>
          <div className="inset">
            <div className="px-font" style={{ fontSize: 13, textAlign: "center", margin: "6px 0" }}>
              {fresh.code}
            </div>
            <div className="tiny" style={{ wordBreak: "break-all" }}>
              {link(fresh.code)}
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={() => copy(fresh.code)}>
              Copy code
            </button>
            <button className="btn primary" onClick={() => copy(link(fresh.code))}>
              Copy link
            </button>
          </div>
        </Modal>
      )}
      {temp && (
        <Modal title="🔑 Temporary password" onClose={() => setTemp(null)}>
          <p className="small">
            Give this to {temp.user}. They should change it in Account after logging in.
          </p>
          <div className="inset px-font center" style={{ fontSize: 12 }}>
            {temp.temp}
          </div>
          <div className="modal-actions">
            <button className="btn primary" onClick={() => copy(temp.temp)}>
              Copy
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
