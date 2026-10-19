// BMI (Singapore HPB / Asian cut-offs) and moving averages.

export function bmi(weightKg: number, heightM: number): number {
  return heightM > 0 ? weightKg / (heightM * heightM) : 0;
}

export type Tone = "good" | "warn" | "bad";

export function bmiBand(b: number): { label: string; emoji: string; tone: Tone } {
  if (b < 18.5) return { label: "Underweight", emoji: "😑", tone: "warn" };
  if (b < 23) return { label: "Healthy", emoji: "😉", tone: "good" };
  if (b < 27.5) return { label: "Overweight · moderate risk", emoji: "🙁", tone: "warn" };
  return { label: "Obese · high risk", emoji: "😨", tone: "bad" };
}

/** Weight range (kg) that is "Healthy" for a height. */
export function healthyRange(heightM: number): [number, number] {
  return [18.5 * heightM * heightM, 22.9 * heightM * heightM];
}

/** Exponential moving average with alpha = 2 / (period + 1) (same as the old 30EMA sheet). */
export function ema(values: number[], period: number): number[] {
  const alpha = 2 / (period + 1);
  const out: number[] = [];
  let prev: number | undefined;
  for (const v of values) {
    prev = prev === undefined ? v : alpha * v + (1 - alpha) * prev;
    out.push(prev);
  }
  return out;
}

/** Simple moving average over the last `period` values. */
export function sma(values: number[], period: number): number[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - period + 1), i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}
