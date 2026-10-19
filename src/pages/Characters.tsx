// "Choose your save": your characters, plus the create-a-character wizard.
import { useEffect, useState } from "react";
import { EYES, SPECIES } from "../../shared/levels";
import { PET_COLORS } from "../../shared/petgrid";
import { api } from "../api";
import { useAccount, type CharacterInfo } from "../account";
import { useFx } from "../fx";
import { Pet } from "../sprites";
import { Empty, Field, Modal } from "../components/ui";

export function play(id: string) {
  void api(`characters/${id}/select`, { body: {} }).finally(() => {
    location.hash = "#/";
    location.reload();
  });
}

export default function Characters() {
  const { account, refresh } = useAccount();
  const fx = useFx();
  const [creating, setCreating] = useState(false);
  const [del, setDel] = useState<CharacterInfo | null>(null);
  const [importing, setImporting] = useState(false);
  const full = account.characters.length >= account.user.max_characters;
  useEffect(() => void refresh(), [refresh]); // levels/looks may have changed while playing
  return (
    <>
      <div className="page-head">
        <h1>🎮 Choose your save</h1>
        <span className="small ink2">
          {account.characters.length}/{account.user.max_characters} characters
        </span>
      </div>
      {account.legacy && (
        <div className="alert gold">
          <span className="big">📦</span>
          <div className="grow">
            <b>Your v1 save is waiting.</b>
            <div className="small">Bring everything you logged in v1 into a character (one time).</div>
          </div>
          <button
            className="btn sm primary"
            disabled={importing}
            onClick={async () => {
              setImporting(true);
              try {
                const r = await api<{ id: string }>("legacy/import", { body: {} });
                fx.toast("v1 save imported!", "📦");
                play(r.id);
              } catch (e) {
                fx.error((e as Error).message);
                setImporting(false);
              }
            }}
          >
            {importing ? "Importing…" : "Import"}
          </button>
        </div>
      )}
      <div className="cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
        {account.characters.map((ch) => {
          const s = ch.summary;
          const last = account.user.last_character === ch.id;
          return (
            <div key={ch.id} className={`panel char-card ${last ? "tinted" : ""}`} style={{ margin: 4 }}>
              <div className="char-pet">
                {s ? (
                  <Pet stage={s.stage} mood={s.fainted ? "fainted" : "happy"} color={s.color} species={s.species} eyes={s.eyes} hat={s.hat} face={s.face} scale={4} className="pet-sprite" />
                ) : (
                  <span style={{ fontSize: 40 }}>❔</span>
                )}
              </div>
              <div className="px-font" style={{ fontSize: 12 }}>
                {s?.name ?? ch.name}
              </div>
              {s && (
                <div className="small ink2">
                  {s.pet_name} · Lv {s.level} {s.title}
                </div>
              )}
              {s && (
                <div className="row wrap" style={{ justifyContent: "center" }}>
                  <span className="chip ap">🪙 {s.ap}</span>
                  <span className="chip warn">🔥 {s.streak}</span>
                  <span className="chip hp">❤️ {s.hp}</span>
                </div>
              )}
              <div className="row" style={{ justifyContent: "center" }}>
                <button className="btn primary" onClick={() => play(ch.id)}>
                  ▶ Play
                </button>
                <button className="btn xs" onClick={() => setDel(ch)} aria-label={`Delete ${ch.name}`}>
                  🗑
                </button>
              </div>
              {last && <span className="tiny muted">last played</span>}
            </div>
          );
        })}
        {!full && (
          <button className="panel char-card new" onClick={() => setCreating(true)} style={{ margin: 4 }}>
            <Pet stage={0} mood="content" scale={4} className="pet-sprite" />
            <span className="px-font" style={{ fontSize: 11 }}>
              New character
            </span>
            <span className="small muted">Hatch a new adventure</span>
          </button>
        )}
      </div>
      {!account.characters.length && !account.legacy && <Empty emoji="✨">Create your first character to start playing.</Empty>}
      {creating && (
        <CreateWizard
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            play(id);
          }}
        />
      )}
      {del && (
        <DeleteCharacter
          ch={del}
          onClose={() => setDel(null)}
          onDone={() => {
            setDel(null);
            void refresh();
          }}
        />
      )}
    </>
  );
}

type Step = 0 | 1 | 2;

function CreateWizard({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { account } = useAccount();
  const fx = useFx();
  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState(account.characters.length ? "" : account.user.display_name);
  const [pet, setPet] = useState("Mochi");
  const [species, setSpecies] = useState("cat");
  const [color, setColor] = useState("pink");
  const [eyes, setEyes] = useState("dot");
  const [tpl, setTpl] = useState<string>(account.templates[0]?.id ?? "starter");
  const [busy, setBusy] = useState(false);
  const look = { species, color, eyes };
  const create = async () => {
    setBusy(true);
    try {
      const copy = tpl.startsWith("copy:") ? tpl.slice(5) : null;
      const r = await api<{ id: string }>("characters", {
        body: { name, pet_name: pet, looks: look, template: copy ? undefined : tpl, copy_from: copy ?? undefined },
      });
      onCreated(r.id);
    } catch (e) {
      fx.error((e as Error).message);
      setBusy(false);
    }
  };
  const options = [
    ...account.templates.map((t) => ({ id: t.id, name: t.name, description: t.description })),
    ...account.characters.map((c) => ({ id: `copy:${c.id}`, name: `Copy ${c.summary?.name ?? c.name}'s setup`, description: "Same quests, trackers, shop and vouchers. Fresh progress." })),
  ];
  return (
    <Modal
      title={["🥚 Who's playing?", "🎨 Design your pet", "📜 Choose your starting quests"][step]}
      onClose={onClose}
      wide
      actions={
        <>
          {step > 0 && (
            <button className="btn" onClick={() => setStep((step - 1) as Step)}>
              ◀ Back
            </button>
          )}
          {step < 2 ? (
            <button className="btn primary" disabled={!name.trim() || !pet.trim()} onClick={() => setStep((step + 1) as Step)}>
              Next ▶
            </button>
          ) : (
            <button className="btn good" disabled={busy} onClick={create}>
              {busy ? "Hatching…" : "🐣 Hatch!"}
            </button>
          )}
        </>
      }
    >
      <div className="center" style={{ marginBottom: 8 }}>
        <Pet stage={2} mood="happy" {...look} scale={5} className="pet-sprite" />
        <div className="tiny muted">(It starts as an egg and evolves as you level up.)</div>
      </div>
      {step === 0 && (
        <>
          <Field label="Character name" help="Your hero's name (often just your own name)">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus />
          </Field>
          <Field label="Pet name">
            <input className="input" value={pet} onChange={(e) => setPet(e.target.value)} maxLength={40} />
          </Field>
        </>
      )}
      {step === 1 && (
        <>
          <div className="panel-title">
            <h2>Species</h2>
          </div>
          <div className="row wrap">
            {SPECIES.map((sp) => (
              <button key={sp.id} className={`panel tight trophy ${species === sp.id ? "tinted selected" : ""}`} onClick={() => setSpecies(sp.id)} style={{ margin: 4 }}>
                <Pet stage={2} mood="content" {...look} species={sp.id} scale={3} />
                <span className="small">{sp.name}</span>
              </button>
            ))}
          </div>
          <div className="panel-title" style={{ marginTop: 8 }}>
            <h2>Colour</h2>
          </div>
          <div className="row wrap">
            {Object.entries(PET_COLORS).map(([k, c]) => (
              <button key={k} className={`swatch-btn ${color === k ? "on" : ""}`} style={{ background: c.b }} onClick={() => setColor(k)} aria-label={c.name} title={c.name} />
            ))}
            <label className="row small" style={{ marginLeft: 6 }}>
              custom
              <input type="color" value={/^#/.test(color) ? color : "#7ec8a0"} onChange={(e) => setColor(e.target.value)} style={{ width: 44, height: 34, border: 0, background: "none" }} />
            </label>
          </div>
          <div className="panel-title" style={{ marginTop: 8 }}>
            <h2>Eyes</h2>
          </div>
          <div className="row wrap">
            {EYES.map((e) => (
              <button key={e.id} className={`btn sm ${eyes === e.id ? "pressed gold" : ""}`} onClick={() => setEyes(e.id)}>
                {e.name}
              </button>
            ))}
          </div>
        </>
      )}
      {step === 2 && (
        <div className="col">
          {options.map((o) => (
            <label key={o.id} className={`panel tight tpl ${tpl === o.id ? "tinted" : ""}`} style={{ margin: 3, cursor: "pointer" }}>
              <div className="row">
                <input type="radio" name="tpl" checked={tpl === o.id} onChange={() => setTpl(o.id)} />
                <div className="grow">
                  <b>{o.name}</b>
                  <div className="small ink2">{o.description}</div>
                </div>
              </div>
            </label>
          ))}
          <p className="tiny muted">You can edit, add or delete every quest, tracker, reward and voucher later.</p>
        </div>
      )}
    </Modal>
  );
}

function DeleteCharacter({ ch, onClose, onDone }: { ch: CharacterInfo; onClose: () => void; onDone: () => void }) {
  const fx = useFx();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const name = ch.name;
  return (
    <Modal
      title="🗑 Delete character"
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn danger"
            disabled={busy || typed.trim().toLowerCase() !== name.toLowerCase()}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`characters/${ch.id}`, { method: "DELETE", body: { confirm: typed } });
                fx.toast(`${name} was deleted`, "🗑");
                onDone();
              } catch (e) {
                fx.error((e as Error).message);
                setBusy(false);
              }
            }}
          >
            Delete forever
          </button>
        </>
      }
    >
      <p>
        This permanently deletes <b>{name}</b>, including all progress, history, pictures and save points. Download a backup first (in that character's Settings) if
        you might want it back.
      </p>
      <Field label={`Type ${name} to confirm`}>
        <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </Field>
    </Modal>
  );
}
