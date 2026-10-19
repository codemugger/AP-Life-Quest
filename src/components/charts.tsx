// Lightweight SVG charts: thin marks, hairline grid, one y-axis, crosshair + tooltip on hover/touch.
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { prettyDate } from "../../shared/dates";
import { fmt } from "../util";

export interface Pt {
  date: string;
  value: number;
}
export interface Ref {
  value: number;
  label: string;
  color: string;
}
export interface Band {
  from: number;
  to: number;
  color: string;
  label: string;
}

const H = 210;
const PAD = { l: 40, r: 12, t: 14, b: 24 };

/** Track the rendered width so text stays at its real pixel size on phones. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, W: w };
}

function niceTicks(min: number, max: number, count = 4) {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { lo, hi, ticks };
}

const compact = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}K` : fmt(v, Math.abs(v) < 10 && v % 1 ? 1 : 0));
const dayIndex = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

function useHover(n: number, xOf: (i: number) => number, W: number) {
  const ref = useRef<SVGSVGElement>(null);
  const [i, setI] = useState<number | null>(null);
  const onMove = (e: React.PointerEvent) => {
    const svg = ref.current;
    if (!svg || !n) return;
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    let bd = Infinity;
    for (let k = 0; k < n; k++) {
      const d = Math.abs(xOf(k) - x);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    setI(best);
  };
  return { ref, i, onMove, onLeave: () => setI(null) };
}

function Frame({ W, ticks, y, xLabels, children }: { W: number; ticks: number[]; y: (v: number) => number; xLabels: { x: number; t: string }[]; children: ReactNode }) {
  return (
    <>
      {ticks.map((t) => (
        <g key={t}>
          <line className="gridline" x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
          <text className="tick" x={PAD.l - 6} y={y(t) + 4} textAnchor="end">
            {compact(t)}
          </text>
        </g>
      ))}
      {xLabels.map((l, k) => (
        <text key={k} className="tick" x={l.x} y={H - 6} textAnchor="middle">
          {l.t}
        </text>
      ))}
      {children}
    </>
  );
}

const shortDate = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-SG", { day: "numeric", month: "short", timeZone: "UTC" });

function xLabelsFor(dates: string[], xOf: (i: number) => number) {
  if (!dates.length) return [];
  const idx = dates.length <= 2 ? dates.map((_, i) => i) : [0, Math.floor((dates.length - 1) / 2), dates.length - 1];
  return [...new Set(idx)].map((i) => ({ x: xOf(i), t: shortDate(dates[i]) }));
}

/** Line chart over time (gaps between dates are respected). */
export function LineChart({
  data,
  color,
  unit,
  decimals = 1,
  refs = [],
  band,
  extra,
  label,
}: {
  data: Pt[];
  color: string;
  unit: string;
  decimals?: number;
  refs?: Ref[];
  band?: Band;
  extra?: { data: Pt[]; color: string; label: string };
  label: string;
}) {
  const { ref: box, W } = useWidth();
  const geo = useMemo(() => {
    const vals = [...data.map((d) => d.value), ...refs.map((r) => r.value), ...(extra?.data.map((d) => d.value) ?? [])];
    const { lo, hi, ticks } = niceTicks(Math.min(...vals), Math.max(...vals));
    const first = data[0]?.date ?? "";
    const span = Math.max(1, dayIndex(first, data[data.length - 1]?.date ?? first));
    const x = (d: string) => PAD.l + ((W - PAD.l - PAD.r) * dayIndex(first, d)) / span;
    const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - (v - lo) / (hi - lo || 1));
    return { lo, hi, ticks, x, y };
  }, [data, refs, extra, W]);
  const hover = useHover(data.length, (i) => geo.x(data[i].date), W);
  if (!data.length) return null;
  const path = data.map((d, i) => `${i ? "L" : "M"}${geo.x(d.date).toFixed(1)},${geo.y(d.value).toFixed(1)}`).join("");
  const xpath = extra?.data.map((d, i) => `${i ? "L" : "M"}${geo.x(d.date).toFixed(1)},${geo.y(d.value).toFixed(1)}`).join("");
  const last = data[data.length - 1];
  const hi = hover.i !== null ? data[hover.i] : null;
  return (
    <div className="chart" ref={box}>
      <svg ref={hover.ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerMove={hover.onMove} onPointerDown={hover.onMove} onPointerLeave={hover.onLeave} style={{ touchAction: "pan-y" }}>
        <Frame W={W} ticks={geo.ticks} y={geo.y} xLabels={xLabelsFor(data.map((d) => d.date), (i) => geo.x(data[i].date))}>
          {band && (
            <rect
              x={PAD.l}
              width={W - PAD.l - PAD.r}
              y={geo.y(Math.min(geo.hi, band.to))}
              height={Math.max(0, geo.y(Math.max(geo.lo, band.from)) - geo.y(Math.min(geo.hi, band.to)))}
              fill={band.color}
              opacity={0.14}
            />
          )}
          {refs.map((r) => (
            <g key={r.label}>
              <line className="ref" x1={PAD.l} x2={W - PAD.r} y1={geo.y(r.value)} y2={geo.y(r.value)} stroke={r.color} />
              <text className="reflabel" x={W - PAD.r} y={geo.y(r.value) - 5} textAnchor="end">
                {r.label}
              </text>
            </g>
          ))}
          {xpath && <path d={xpath} fill="none" stroke={extra!.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {data.length < 40 && data.map((d) => <circle key={d.date} cx={geo.x(d.date)} cy={geo.y(d.value)} r={2.5} fill={color} />)}
          <circle cx={geo.x(last.date)} cy={geo.y(last.value)} r={5} fill={color} stroke="var(--panel)" strokeWidth={2} />
          <text className="reflabel" x={geo.x(last.date) - 8} y={geo.y(last.value) - 10} textAnchor="end" style={{ fontWeight: 700, fill: "var(--ink)" }}>
            {fmt(last.value, decimals)} {unit}
          </text>
          {hi && (
            <g>
              <line x1={geo.x(hi.date)} x2={geo.x(hi.date)} y1={PAD.t} y2={H - PAD.b} stroke="var(--ink-2)" strokeWidth={1} />
              <circle cx={geo.x(hi.date)} cy={geo.y(hi.value)} r={5} fill={color} stroke="var(--panel)" strokeWidth={2} />
            </g>
          )}
        </Frame>
      </svg>
      {hi && (
        <div className="chart-tip" style={{ left: `${(geo.x(hi.date) / W) * 100}%`, top: `${(geo.y(hi.value) / H) * 100}%` }}>
          <b>{fmt(hi.value, decimals)} {unit}</b>
          {extra && (() => {
            const e = extra.data.find((p) => p.date === hi.date);
            return e ? <span className="muted"> · {extra.label} {fmt(e.value, decimals)}</span> : null;
          })()}
          <div className="muted tiny">{prettyDate(hi.date)}</div>
        </div>
      )}
    </div>
  );
}

/** Daily bars (one per calendar day in range) with optional target line and trend line. */
export function BarChart({
  data,
  days,
  end,
  unit,
  target,
  colorOf,
  trend,
  label,
}: {
  data: Pt[];
  days: number;
  end: string;
  unit: string;
  target?: number | null;
  colorOf: (v: number) => string;
  trend?: { data: Pt[]; color: string; label: string };
  label: string;
}) {
  const dates = useMemo(() => {
    const out: string[] = [];
    const e = Date.parse(end + "T00:00:00Z");
    for (let k = days - 1; k >= 0; k--) out.push(new Date(e - k * 86_400_000).toISOString().slice(0, 10));
    return out;
  }, [days, end]);
  const byDate = useMemo(() => new Map(data.map((d) => [d.date, d.value])), [data]);
  const { ref: box, W } = useWidth();
  const geo = useMemo(() => {
    const vals = [0, ...dates.map((d) => byDate.get(d) ?? 0), ...(target ? [target] : []), ...(trend?.data.map((d) => d.value) ?? [])];
    const { lo, hi, ticks } = niceTicks(0, Math.max(...vals));
    const slot = (W - PAD.l - PAD.r) / dates.length;
    const bw = Math.min(24, Math.max(3, slot - 2));
    const x = (i: number) => PAD.l + slot * i + slot / 2;
    const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - (v - lo) / (hi - lo || 1));
    return { ticks, x, y, bw };
  }, [dates, byDate, target, trend, W]);
  const hover = useHover(dates.length, geo.x, W);
  const tPath = trend?.data
    .filter((p) => dates.includes(p.date))
    .map((p, i) => `${i ? "L" : "M"}${geo.x(dates.indexOf(p.date)).toFixed(1)},${geo.y(p.value).toFixed(1)}`)
    .join("");
  const hd = hover.i !== null ? dates[hover.i] : null;
  const hv = hd ? byDate.get(hd) : undefined;
  const base = geo.y(0);
  return (
    <div className="chart" ref={box}>
      <svg ref={hover.ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerMove={hover.onMove} onPointerDown={hover.onMove} onPointerLeave={hover.onLeave} style={{ touchAction: "pan-y" }}>
        <Frame W={W} ticks={geo.ticks} y={geo.y} xLabels={xLabelsFor(dates, geo.x)}>
          {hd && <rect x={geo.x(hover.i!) - geo.bw / 2 - 3} width={geo.bw + 6} y={PAD.t} height={H - PAD.t - PAD.b} fill="var(--grid)" opacity={0.6} />}
          {dates.map((d, i) => {
            const v = byDate.get(d);
            if (v === undefined || v <= 0) return null;
            const top = geo.y(v);
            const h = base - top;
            const r = Math.min(4, h, geo.bw / 2);
            const x0 = geo.x(i) - geo.bw / 2;
            return (
              <path
                key={d}
                d={`M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + geo.bw - r} Q${x0 + geo.bw},${top} ${x0 + geo.bw},${top + r} V${base} Z`}
                fill={colorOf(v)}
              />
            );
          })}
          {target ? (
            <g>
              <line className="ref" x1={PAD.l} x2={W - PAD.r} y1={geo.y(target)} y2={geo.y(target)} stroke="var(--ink-2)" />
              <text className="reflabel" x={W - PAD.r} y={geo.y(target) - 5} textAnchor="end">
                budget {fmt(target)}
              </text>
            </g>
          ) : null}
          {tPath && <path d={tPath} fill="none" stroke={trend!.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        </Frame>
      </svg>
      {hd && (
        <div className="chart-tip" style={{ left: `${(geo.x(hover.i!) / W) * 100}%`, top: `${(geo.y(hv ?? 0) / H) * 100}%` }}>
          <b>{hv !== undefined ? `${fmt(hv)} ${unit}` : "not logged"}</b>
          {hv !== undefined && target ? <span className="muted"> · {hv <= target ? "within budget" : `${fmt(hv - target)} over`}</span> : null}
          {trend && (() => {
            const t = trend.data.find((p) => p.date === hd);
            return t ? <div className="muted tiny">{trend.label} {fmt(t.value)}</div> : null;
          })()}
          <div className="muted tiny">{prettyDate(hd)}</div>
        </div>
      )}
    </div>
  );
}

/** Tiny sparkline for tracker rows (no axes). */
export function Spark({ data, color = "var(--violet)" }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const w = 80;
  const h = 24;
  const p = data.map((v, i) => `${i ? "L" : "M"}${((w - 4) * i) / (data.length - 1) + 2},${h - 3 - ((h - 6) * (v - min)) / (max - min || 1)}`).join("");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={p} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
