// Shop, Bag (inventory), Vouchers, Calorie Court and purchase history.
import { useMemo, useState } from "react";
import { prettyDate } from "../../shared/dates";
import { priceOf, unitPrice, voucherApplies } from "../../shared/pricing";
import type { ShopItem, Voucher } from "../../shared/types";
import { useGame } from "../store";
import { Coin } from "../sprites";
import { Editor } from "../components/Editor";
import { IconOrEmoji } from "../components/Media";
import { Rich } from "../components/Rich";
import { Empty, Field, HelpLink, Modal, Panel, Tabs } from "../components/ui";
import { fmt, fmtAP, inventoryOf, relDay } from "../util";

type Tab = "shop" | "bag" | "vouchers" | "court" | "history";

export default function Shop({ sub }: { sub?: string }) {
  const { state } = useGame();
  const [tab, setTab] = useState<Tab>((["shop", "bag", "vouchers", "court", "history"].includes(sub ?? "") ? sub : "shop") as Tab);
  const [buy, setBuy] = useState<ShopItem | null>(null);
  const [edit, setEdit] = useState<{ entity: string; row: Record<string, unknown> } | null>(null);
  const bagCount = state.shop.filter((i) => inventoryOf(state, i.id) > 0).length;

  return (
    <>
      <div className="page-head">
        <h1>🛒 AP Shop <HelpLink to="shop" /></h1>
        <span className="coin-count" style={{ fontSize: 14 }}>
          <Coin scale={3} /> {fmtAP(state.player.ap)} AP
        </span>
      </div>
      <Tabs<Tab>
        value={tab}
        onChange={(t) => {
          setTab(t);
          history.replaceState(null, "", `#/shop/${t}`);
        }}
        tabs={[
          { id: "shop", label: "Shop" },
          { id: "bag", label: "Bag", badge: bagCount },
          { id: "vouchers", label: "Vouchers" },
          { id: "court", label: "⚖️ Court", badge: state.obligations.length },
          { id: "history", label: "History" },
        ]}
      />
      {tab === "shop" && <ShopTab onBuy={setBuy} onEdit={(row) => setEdit({ entity: "shop_items", row })} />}
      {tab === "bag" && <BagTab />}
      {tab === "vouchers" && <VoucherTab onEdit={(row) => setEdit({ entity: "vouchers", row })} />}
      {tab === "court" && <CourtTab />}
      {tab === "history" && <HistoryTab />}
      {buy && <BuyModal item={buy} onClose={() => setBuy(null)} />}
      {edit && <Editor entity={edit.entity} row={edit.row} onClose={() => setEdit(null)} />}
    </>
  );
}

function ShopTab({ onBuy, onEdit }: { onBuy: (i: ShopItem) => void; onEdit: (r: Record<string, unknown>) => void }) {
  const { state } = useGame();
  const items = state.shop.filter((i) => i.active);
  const cats = [...new Set(items.map((i) => i.category))];
  return (
    <>
      {cats.map((cat) => (
        <Panel key={cat} title={cat}>
          <div className="cards">
            {items
              .filter((i) => i.category === cat)
              .map((i) => {
                const price = unitPrice(i);
                const locked = i.min_level > state.player.level;
                const owned = inventoryOf(state, i.id);
                return (
                  <div key={i.id} className="panel tight item-card" style={{ margin: 4 }}>
                    <div className="big-emoji">
                      <IconOrEmoji images={i.images} emoji={i.emoji} size={56} />
                    </div>
                    <div className="name">{i.name}</div>
                    <div className="price">
                      <Coin scale={2} /> {fmt(price)}
                    </div>
                    <div className="row wrap" style={{ justifyContent: "center" }}>
                      {i.tax !== 1 && <span className="chip warn">{fmt(i.base_price)} ×{i.tax} tax</span>}
                      {!i.voucher_ok && <span className="chip bad">no vouchers</span>}
                      {i.trigger_metric && <span className="chip">auto-required</span>}
                      {owned > 0 && <span className="chip good">own {owned}</span>}
                    </div>
                    <div className="row" style={{ justifyContent: "center" }}>
                      <button className="btn sm primary" disabled={locked} onClick={() => onBuy(i)}>
                        {locked ? `🔒 Lv ${i.min_level}` : "Buy"}
                      </button>
                      <button className="btn xs" onClick={() => onEdit(i as unknown as Record<string, unknown>)} aria-label={`Edit ${i.name}`}>
                        ✎
                      </button>
                    </div>
                    <Rich text={i.notes} className="tiny muted" />
                  </div>
                );
              })}
          </div>
        </Panel>
      ))}
      <div className="row" style={{ justifyContent: "center" }}>
        <button className="btn primary" onClick={() => onEdit({})}>
          ＋ New shop item
        </button>
      </div>
    </>
  );
}

function voucherStatus(v: Voucher, item: ShopItem) {
  if (!v.active) return "inactive";
  if (!voucherApplies(v, item)) return null;
  const limited = v.limit_type !== "infinite" && v.used >= v.limit_count;
  if (limited) return "used up for this period";
  if (!v.rule_ok) return v.rule_text;
  return "ok";
}

function BuyModal({ item, onClose, onBought }: { item: ShopItem; onClose: () => void; onBought?: () => void }) {
  const { state, act, busy } = useGame();
  const [qty, setQty] = useState("1");
  const [vid, setVid] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [useNow, setUseNow] = useState(!item.effect);
  const [confirmHonour, setConfirmHonour] = useState(false);
  const usable = useMemo(
    () =>
      state.vouchers
        .map((v) => ({ v, status: voucherStatus(v, item) }))
        .filter((x) => x.status !== null && x.status !== "inactive"),
    [state.vouchers, item],
  );
  const voucher = state.vouchers.find((v) => v.id === vid) ?? null;
  const q = Math.max(0.25, Number(qty) || 1);
  const price = priceOf(item, q, voucher);
  const afford = price.total <= state.player.ap;
  const needsHonour = !!voucher?.condition && !voucher.rule;
  const doBuy = async () => {
    try {
      await act("shop/buy", { item_id: item.id, qty: q, voucher_id: vid, note: note || null, use_now: useNow });
      onBought?.();
      onClose();
    } catch {}
  };
  return (
    <Modal
      title={`${item.emoji} ${item.name}`}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy || !afford || (needsHonour && !confirmHonour)} onClick={doBuy}>
            {afford ? `Buy for ${fmt(price.total)} AP` : "Not enough AP"}
          </button>
        </>
      }
    >
      {item.notes && <p className="small ink2">{item.notes}</p>}
      <Field label={`Quantity (${item.unit})`}>
        <input className="input" type="number" inputMode="decimal" step={item.unit === "hour" ? "0.5" : "1"} value={qty} onChange={(e) => setQty(e.target.value)} />
      </Field>
      {item.voucher_ok ? (
        <Field label="Voucher">
          <select className="input" value={vid ?? ""} onChange={(e) => (setVid(e.target.value ? Number(e.target.value) : null), setConfirmHonour(false))}>
            <option value="">— none —</option>
            {usable.map(({ v, status }) => (
              <option key={v.id} value={v.id} disabled={status !== "ok"}>
                {v.emoji} {v.name} (−{Math.round(v.discount * 100)}%){status !== "ok" ? ` · 🔒 ${status}` : ""}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <div className="alert gold small">🚫 No vouchers allowed on this item.</div>
      )}
      {voucher?.condition && (
        <label className="check small">
          {needsHonour && <input type="checkbox" checked={confirmHonour} onChange={(e) => setConfirmHonour(e.target.checked)} />}
          <span>
            <b>Condition:</b> {voucher.condition} {needsHonour ? "(I honestly meet this)" : ""}
          </span>
        </label>
      )}
      <div className="inset">
        <div className="row between small">
          <span>
            {fmt(item.base_price)} {item.tax !== 1 ? `× ${item.tax} tax ` : ""}× {fmt(q, q % 1 ? 2 : 0)}
          </span>
          <span className="num">{fmt(price.subtotal)}</span>
        </div>
        {price.pct > 0 && (
          <div className="row between small pos">
            <span>
              {voucher?.name} −{Math.round(price.pct * 100)}%
            </span>
            <span className="num">−{fmt(price.discount)}</span>
          </div>
        )}
        <div className="row between" style={{ marginTop: 4 }}>
          <b>Total</b>
          <b className="num">{fmt(price.total)} AP</b>
        </div>
        <div className="row between tiny muted">
          <span>Balance after</span>
          <span className="num">{fmtAP(state.player.ap - price.total)} AP</span>
        </div>
      </div>
      <Field label="Note (optional)">
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Buffet at Marina Bay" />
      </Field>
      {item.effect !== "streak_freeze" && (
        <label className="check">
          <input type="checkbox" checked={useNow} onChange={(e) => setUseNow(e.target.checked)} />
          Use it right away
        </label>
      )}
    </Modal>
  );
}

function BagTab() {
  const { state, act, busy } = useGame();
  const [use, setUse] = useState<ShopItem | null>(null);
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const owned = state.shop.filter((i) => inventoryOf(state, i.id) > 0);
  return (
    <Panel title="🎒 Your bag">
      {owned.length ? (
        <div className="list">
          {owned.map((i) => (
            <div className="li" key={i.id}>
              <IconOrEmoji images={i.images} emoji={i.emoji} size={34} />
              <div className="grow">
                <b>{i.name}</b>
                <div className="small ink2">
                  {fmt(inventoryOf(state, i.id), 2).replace(/\.00$/, "")} {i.unit}(s) left
                </div>
              </div>
              {i.effect === "streak_freeze" ? (
                <span className="chip">auto-protects</span>
              ) : (
                <button className="btn sm good" onClick={() => (setUse(i), setQty("1"), setNote(""))}>
                  Use
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Empty emoji="🎒">Your bag is empty. Earn AP, then treat yourself!</Empty>
      )}
      {use && (
        <Modal
          title={`Use ${use.emoji} ${use.name}`}
          onClose={() => setUse(null)}
          actions={
            <>
              <button className="btn" onClick={() => setUse(null)}>
                Cancel
              </button>
              <button
                className="btn good"
                disabled={busy}
                onClick={() =>
                  act(`items/${use.id}/use`, { qty: Number(qty) || 1, note: note || null })
                    .then(() => setUse(null))
                    .catch(() => {})
                }
              >
                Use
              </button>
            </>
          }
        >
          <Field label={`How many (${use.unit})`}>
            <input className="input" type="number" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="Note">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was it for?" />
          </Field>
        </Modal>
      )}
    </Panel>
  );
}

function VoucherTab({ onEdit }: { onEdit: (r: Record<string, unknown>) => void }) {
  const { state } = useGame();
  return (
    <>
      <div className="cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))" }}>
        {state.vouchers.map((v) => {
          const limited = v.limit_type !== "infinite";
          const left = limited ? Math.max(0, v.limit_count - v.used) : null;
          return (
            <div key={v.id} className="panel tight voucher" style={{ opacity: v.active ? 1 : 0.5 }}>
              <div className="row between">
                <IconOrEmoji images={v.images} emoji={v.emoji} size={32} />
                <span className="pct">−{Math.round(v.discount * 100)}%</span>
              </div>
              <b>{v.name}</b>
              {v.description && <div className="small ink2">{v.description}</div>}
              {v.condition && <div className="small">📜 {v.condition}</div>}
              <div className="row wrap" style={{ marginTop: 6 }}>
                {v.rule ? (
                  <span className={`chip ${v.rule_ok ? "good" : "bad"}`}>{v.rule_ok ? "✓ unlocked" : "🔒"} {v.rule_text}</span>
                ) : (
                  <span className="chip">honour system</span>
                )}
                {limited && (
                  <span className="chip">
                    {left} left {v.limit_type === "once" ? "this season" : v.limit_type === "per_week" ? "this week" : "this month"}
                  </span>
                )}
                <button className="linkbtn" onClick={() => onEdit(v as unknown as Record<string, unknown>)}>
                  edit
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="row" style={{ justifyContent: "center" }}>
        <button className="btn primary" onClick={() => onEdit({})}>
          ＋ New voucher
        </button>
      </div>
    </>
  );
}

function CourtTab() {
  const { state, act, busy } = useGame();
  const [vids, setVids] = useState<Record<number, number | null>>({});
  return (
    <Panel title="⚖️ Calorie Court">
      <p className="small ink2" style={{ marginTop: 0 }}>
        When a day's calories land in a waiver band, the matching ticket is required. Settle before the day closes to use a voucher or a ticket from your bag;
        otherwise it's auto-billed at full price (and can push you into debt).
      </p>
      {!state.obligations.length && <Empty emoji="🕊️">No open cases. The court is pleased.</Empty>}
      {state.obligations.map((o) => {
        const item = state.shop.find((i) => i.id === o.item_id);
        if (!item) return null;
        const have = inventoryOf(state, item.id);
        const vid = vids[o.id] ?? null;
        const voucher = state.vouchers.find((v) => v.id === vid) ?? null;
        const price = priceOf(item, 1, voucher);
        const options = state.vouchers.map((v) => ({ v, st: voucherStatus(v, item) })).filter((x) => x.st === "ok");
        return (
          <div className="inset" key={o.id} style={{ marginBottom: 12 }}>
            <div className="row">
              <span style={{ fontSize: 30 }}>{item.emoji}</span>
              <div className="grow">
                <b>{item.name}</b>
                <div className="small ink2">
                  {fmt(o.value)} kcal on {prettyDate(o.date)} ({relDay(o.date, state.today)})
                </div>
              </div>
            </div>
            <div className="row wrap" style={{ marginTop: 8 }}>
              {have > 0 && (
                <button className="btn sm good" disabled={busy} onClick={() => act(`obligations/${o.id}/resolve`, { method: "use" }).catch(() => {})}>
                  Use ticket from bag ({have})
                </button>
              )}
              {item.voucher_ok ? (
                <select className="input" style={{ width: "auto", flex: 1, minWidth: 160 }} value={vid ?? ""} onChange={(e) => setVids({ ...vids, [o.id]: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">No voucher</option>
                  {options.map(({ v }) => (
                    <option key={v.id} value={v.id}>
                      {v.emoji} {v.name} −{Math.round(v.discount * 100)}%
                    </option>
                  ))}
                </select>
              ) : null}
              <button className="btn sm primary" disabled={busy} onClick={() => act(`obligations/${o.id}/resolve`, { method: "buy", voucher_id: vid }).catch(() => {})}>
                Pay {fmt(price.total)} AP
              </button>
            </div>
            <button
              className="linkbtn"
              style={{ marginTop: 6 }}
              onClick={() => confirm("Grant an exception and dismiss this case without paying? (Honour system: use only for genuine exceptions.)") && act(`obligations/${o.id}/resolve`, { method: "waive" }).catch(() => {})}
            >
              Grant exception
            </button>
          </div>
        );
      })}
    </Panel>
  );
}

function HistoryTab() {
  const { state } = useGame();
  return (
    <Panel title="🧾 Purchases this season">
      {state.purchases.length ? (
        <div className="list">
          {state.purchases.map((p) => (
            <div className="li" key={p.id}>
              <div className="grow">
                <b>{p.item_name}</b> {p.qty !== 1 && `×${p.qty}`}
                <div className="small ink2">
                  {prettyDate(p.date)}
                  {p.voucher_name ? ` · ${p.voucher_name}` : ""}
                  {p.note ? ` · ${p.note}` : ""}
                </div>
              </div>
              <span className="num">{p.total ? `${fmt(p.total)} AP` : "free"}</span>
            </div>
          ))}
        </div>
      ) : (
        <Empty emoji="🧾">No purchases yet this season.</Empty>
      )}
    </Panel>
  );
}
