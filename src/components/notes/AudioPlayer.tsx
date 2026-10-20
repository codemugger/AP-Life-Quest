// A pixel-style player for voice memos.
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { mediaUrl } from "../../api";

export const clock = (s: number) => {
  const t = Math.max(0, Math.round(Number.isFinite(s) ? s : 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

export function AudioPlayer({ id, src, duration = 0, label }: { id?: number; src?: string; duration?: number; label?: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [len, setLen] = useState(duration);
  useEffect(() => () => ref.current?.pause(), []);
  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => setPlaying(false));
    else a.pause();
  };
  const seek = (e: PointerEvent<HTMLDivElement>) => {
    const a = ref.current;
    if (!a || !len) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * len;
  };
  return (
    <div className="audio-clip" contentEditable={false}>
      <button type="button" className="btn xs violet" onClick={toggle} aria-label={playing ? "Pause" : "Play voice memo"}>
        {playing ? "❚❚" : "▶"}
      </button>
      <span className="audio-ico" aria-hidden="true">
        🎙️
      </span>
      <div className="bar thin audio-bar" onPointerDown={seek} role="slider" aria-label="Position" aria-valuemin={0} aria-valuemax={Math.round(len)} aria-valuenow={Math.round(t)}>
        <i style={{ width: `${len ? Math.min(100, (100 * t) / len) : 0}%` }} />
      </div>
      <span className="tiny num">
        {clock(t)} / {clock(len)}
      </span>
      {label && <span className="tiny muted ellipsis">{label}</span>}
      <audio
        ref={ref}
        preload="metadata"
        src={src ?? (id ? mediaUrl(id) : undefined)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => (setPlaying(false), setT(0))}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && e.currentTarget.duration > 0 && setLen(e.currentTarget.duration)}
      />
    </div>
  );
}
