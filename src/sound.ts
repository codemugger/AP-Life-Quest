// Chiptune sound effects synthesised with WebAudio — no audio files needed.
let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

function ac() {
  if (!enabled) return null;
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "square", vol = 0.06) {
  const a = ac();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime + start);
  g.gain.setValueAtTime(vol, a.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + start);
  o.stop(a.currentTime + start + dur + 0.02);
}

const seq = (notes: [number, number][], step = 0.08, type: OscillatorType = "square", vol?: number) =>
  notes.forEach(([f, d], i) => tone(f, i * step, d, type, vol));

export const sfx = {
  coin: () => seq([[988, 0.07], [1319, 0.18]], 0.07),
  crit: () => seq([[784, 0.06], [1047, 0.06], [1319, 0.06], [1568, 0.25]], 0.05),
  xp: () => tone(660, 0, 0.08, "triangle", 0.05),
  levelUp: () => seq([[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.1], [784, 0.08], [1047, 0.35]], 0.1),
  hurt: () => seq([[300, 0.08], [200, 0.16]], 0.07, "sawtooth", 0.05),
  faint: () => seq([[440, 0.15], [392, 0.15], [330, 0.15], [262, 0.5]], 0.17, "triangle", 0.08),
  chest: () => seq([[392, 0.06], [523, 0.06], [659, 0.06], [784, 0.06], [1047, 0.3]], 0.06),
  achievement: () => seq([[784, 0.1], [988, 0.1], [1175, 0.1], [1568, 0.3]], 0.09, "triangle", 0.08),
  click: () => tone(1200, 0, 0.03, "square", 0.025),
  error: () => seq([[220, 0.1], [180, 0.2]], 0.1, "square", 0.04),
  spend: () => seq([[1319, 0.05], [988, 0.12]], 0.06),
};
