// Adventure log: every AP/XP/HP change this season, with undo (void) and manual adjustments.
import { useState } from "react";
import { prettyDate } from "../../shared/dates";
import { useGame } from "../store";
import { Field, Modal, Panel, Seg } from "../components/ui";
import { fmt } from "../util";

type Filter = "all" | "earn" | "spend" | "penalty";

export default function Log() {
  const { state, act } = useGame();
  const [filter, setFilter] = useState<Filter>("all");
  const [adj, setAdj] = useState(false);
  const rows = state.ledger.filter((l) =>
    filter === "all"
      ? true
      : filter === "earn"
        ? l.ap > 0 || l.xp > 0
        : filter === "spend"
          ? l.kind === "spend" || (l.source === "shop" && l.ap < 0)
          : l.kind === "penalty" || l.kind === "faint" || l.hp < 0,
  );
  let lastDate = "";
  return (
    <>
      <div className="page-head">
        <h1>📜 Adventure log</h1>
        <button className="btn primary" onClick={() => setAdj(true)}>
          ± Adjust
        </button>
      </div>
      <Panel>
        <div className="row between wrap" style={{ marginBottom: 8 }}>
          <Seg<Filter>
            options={[
              { id: "all", label: "All" },
              { id: "earn", label: "Earned" },
              { id: "spend", label: "Spent" },
              { id: "penalty", label: "Ouch" },
            ]}
            value={filter}
            onChange={setFilter}
          />
          <span className="small muted">latest {state.ledger.length} entries</span>
        </div>
        <div className="list">
          {rows.map((l) => {
            const head = l.date !== lastDate;
            lastDate = l.date;
            return (
              <div key={l.id}>
                {head && (
                  <div className="px-font tiny muted" style={{ padding: "12px 0 4px" }}>
                    {prettyDate(l.date)}
                  </div>
                )}
                <div className={`li ${l.voided ? "voided" : ""}`}>
                  <div className="grow">
                    <div>{l.description}</div>
                    <div className="tiny muted">
                      {l.kind}
                      {l.crit ? " · critical" : ""}
                    </div>
                  </div>
                  <div className="num small" style={{ textAlign: "right", minWidth: 70 }}>
                    {l.ap !== 0 && <div className={l.ap > 0 ? "pos" : "neg"}>{l.ap > 0 ? "+" : ""}{fmt(l.ap)} AP</div>}
                    {l.xp !== 0 && <div style={{ color: "var(--violet)" }}>{l.xp > 0 ? "+" : ""}{fmt(l.xp)} XP</div>}
                    {l.hp !== 0 && <div className={l.hp > 0 ? "pos" : "neg"}>{l.hp > 0 ? "+" : ""}{l.hp} HP</div>}
                  </div>
                  {!l.voided && (
                    <button
                      className="btn xs"
                      aria-label="Void entry"
                      title="Void (undo) this entry"
                      onClick={() => confirm(`Void “${l.description}”? Its AP/XP/HP will be reversed.`) && act(`ledger/${l.id}/void`).catch(() => {})}
                    >
                      ↩
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
      {adj && <Adjust onClose={() => setAdj(false)} />}
    </>
  );
}

function Adjust({ onClose }: { onClose: () => void }) {
  const { act } = useGame();
  const [ap, setAp] = useState("");
  const [xp, setXp] = useState("");
  const [hp, setHp] = useState("");
  const [desc, setDesc] = useState("");
  return (
    <Modal
      title="± Manual adjustment"
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn good"
            onClick={() =>
              act("ledger/adjust", { ap: Number(ap) || 0, xp: Number(xp) || 0, hp: Number(hp) || 0, description: desc })
                .then(onClose)
                .catch(() => {})
            }
          >
            Apply
          </button>
        </>
      }
    >
      <p className="small ink2">For one-off rewards (a coaching gig, a rebate, a big win) or corrections. Use negative numbers to deduct.</p>
      <Field label="Reason">
        <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. G-Scheme rebate: coaching at CFS" />
      </Field>
      <div className="row">
        <Field label="AP">
          <input className="input" type="number" inputMode="numeric" value={ap} onChange={(e) => setAp(e.target.value)} />
        </Field>
        <Field label="XP">
          <input className="input" type="number" inputMode="numeric" value={xp} onChange={(e) => setXp(e.target.value)} />
        </Field>
        <Field label="HP">
          <input className="input" type="number" inputMode="numeric" value={hp} onChange={(e) => setHp(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
