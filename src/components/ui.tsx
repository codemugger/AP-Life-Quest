// Reusable pixel UI pieces.
import { useEffect, type ReactNode } from "react";
import { WEEKDAY_SHORT } from "../../shared/dates";
import { EMOJI_SUGGEST } from "../util";

export function Panel({
  title,
  right,
  children,
  className = "",
  id,
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={`panel ${className}`} id={id}>
      {(title || right) && (
        <div className="panel-title">
          {title ? <h2>{title}</h2> : <span />}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Bar({
  value,
  max,
  kind = "",
  thin,
  seg = true,
  label,
}: {
  value: number;
  max: number;
  kind?: string;
  thin?: boolean;
  seg?: boolean;
  label?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (100 * value) / max)) : 0;
  return (
    <div
      className={`bar ${kind} ${thin ? "thin" : ""} ${seg ? "seg" : ""} ${kind === "hp" && pct < 30 ? "low" : ""}`}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
  actions,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  actions?: ReactNode;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`panel modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true">
        <div className="modal-title">
          <span>{title}</span>
          <button className="btn xs" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: ReactNode; badge?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={value === t.id ? "on" : ""} onClick={() => onChange(t.id)}>
          {t.label}
          {!!t.badge && <span className="badge-dot">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

export function Seg<T extends string>({ options, value, onChange }: { options: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="seg-ctl">
      {options.map((o) => (
        <button key={o.id} className={o.id === value ? "on" : ""} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ emoji, children }: { emoji: string; children: ReactNode }) {
  return (
    <div className="empty">
      <div className="e">{emoji}</div>
      {children}
    </div>
  );
}

export function Field({ label, help, children }: { label: ReactNode; help?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {help && <span className="help">{help}</span>}
    </label>
  );
}

export function EmojiInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <input className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={{ fontSize: 22, width: 90 }} />
      <div className="emoji-row">
        {EMOJI_SUGGEST.map((e) => (
          <button type="button" key={e} onClick={() => onChange(e)} aria-label={`Use ${e}`}>
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DaysInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const v = (value || "1111111").padEnd(7, "1");
  return (
    <div className="days-picker">
      {WEEKDAY_SHORT.map((d, i) => (
        <button
          type="button"
          key={d}
          className={v[i] === "1" ? "on" : ""}
          onClick={() => onChange(v.slice(0, i) + (v[i] === "1" ? "0" : "1") + v.slice(i + 1))}
        >
          {d}
        </button>
      ))}
    </div>
  );
}

export function RewardChips({ ap, xp, hp, bad }: { ap?: number; xp?: number; hp?: number; bad?: boolean }) {
  return (
    <>
      {!!ap && <span className={`chip ${bad ? "bad" : "ap"}`}>{bad ? "−" : "+"}{ap} AP</span>}
      {!!xp && <span className="chip xp">+{xp} XP</span>}
      {!!hp && <span className="chip hp">−{hp} HP</span>}
    </>
  );
}
