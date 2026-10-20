// Record a voice memo (or pick an audio file), listen back, then add it to the note.
import { useEffect, useRef, useState } from "react";
import { uploadMedia } from "../../api";
import { useFx } from "../../fx";
import { Modal } from "../ui";
import { AudioPlayer, clock } from "./AudioPlayer";

const MAX_SECONDS = 300;
const MAX_BYTES = 1_900_000;
const TYPES = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

export function VoiceRecorder({ onDone, onClose }: { onDone: (media: number, duration: number) => void; onClose: () => void }) {
  const fx = useFx();
  const [phase, setPhase] = useState<"idle" | "rec" | "done" | "saving">("idle");
  const [secs, setSecs] = useState(0);
  const [level, setLevel] = useState(0);
  const [clip, setClip] = useState<{ blob: Blob; url: string; duration: number } | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const started = useRef(0);
  const file = useRef<HTMLInputElement>(null);
  const stopAll = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(
    () => () => {
      stopAll();
      if (clip) URL.revokeObjectURL(clip.url);
    },
    [clip],
  );

  // timer + level meter while recording
  useEffect(() => {
    if (phase !== "rec" || !stream.current) return;
    let raf = 0;
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      ctx.createMediaStreamSource(stream.current).connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(peak / 128);
        const s = (Date.now() - started.current) / 1000;
        setSecs(s);
        if (s >= MAX_SECONDS) rec.current?.stop();
        raf = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      const t = setInterval(() => setSecs((Date.now() - started.current) / 1000), 250);
      return () => clearInterval(t);
    }
    return () => {
      cancelAnimationFrame(raf);
      void ctx?.close();
    };
  }, [phase]);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      fx.error("This browser can't record audio. Try picking an audio file instead.");
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      fx.error("Microphone access was blocked. Allow it in your browser settings and try again.");
      return;
    }
    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    const r = new MediaRecorder(stream.current, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 48_000 });
    const parts: Blob[] = [];
    r.ondataavailable = (e) => e.data.size && parts.push(e.data);
    r.onstop = () => {
      stopAll();
      const blob = new Blob(parts, { type: (r.mimeType || mimeType || "audio/webm").split(";")[0] });
      setClip({ blob, url: URL.createObjectURL(blob), duration: (Date.now() - started.current) / 1000 });
      setPhase("done");
    };
    rec.current = r;
    started.current = Date.now();
    setSecs(0);
    r.start(1000);
    setPhase("rec");
  };

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("audio/")) return fx.error("Please choose an audio file");
    if (f.size > MAX_BYTES) return fx.error("That clip is too long (max about 5 minutes / 1.9 MB)");
    const url = URL.createObjectURL(f);
    const a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => setClip({ blob: f, url, duration: Number.isFinite(a.duration) ? a.duration : 0 });
    a.onerror = () => setClip({ blob: f, url, duration: 0 });
    a.src = url;
    setPhase("done");
  };

  const save = async () => {
    if (!clip) return;
    if (clip.blob.size > MAX_BYTES) return fx.error("That clip is too long (max about 5 minutes)");
    setPhase("saving");
    try {
      const id = await uploadMedia(clip.blob, 0, 0);
      onDone(id, Math.round(clip.duration));
    } catch (e) {
      fx.error((e as Error).message);
      setPhase("done");
    }
  };

  const close = () => {
    if (rec.current?.state === "recording") {
      rec.current.onstop = null;
      rec.current.stop();
    }
    stopAll();
    onClose();
  };

  return (
    <Modal title="🎙️ Voice memo" onClose={close}>
      <div className="recorder">
        {phase === "rec" ? (
          <>
            <button className="rec-btn on" onClick={() => rec.current?.stop()} aria-label="Stop recording">
              ■
            </button>
            <div className="px-font rec-time">{clock(secs)}</div>
            <div className="bar hp rec-level" aria-hidden="true">
              <i style={{ width: `${Math.min(100, level * 160)}%` }} />
            </div>
            <p className="small muted">Recording… tap ■ to stop (max {MAX_SECONDS / 60} min)</p>
          </>
        ) : clip ? (
          <>
            <AudioPlayer src={clip.url} duration={clip.duration} />
            <div className="row wrap" style={{ justifyContent: "center", marginTop: 12 }}>
              <button className="btn sm" disabled={phase === "saving"} onClick={() => (URL.revokeObjectURL(clip.url), setClip(null), setPhase("idle"))}>
                ↺ Redo
              </button>
              <button className="btn good" disabled={phase === "saving"} onClick={save}>
                {phase === "saving" ? "Saving…" : "＋ Add to note"}
              </button>
            </div>
          </>
        ) : (
          <>
            <button className="rec-btn" onClick={start} aria-label="Start recording">
              ●
            </button>
            <p className="small ink2">Tap to record. Great for quick thoughts, meeting notes or a voice diary.</p>
            <button className="linkbtn" onClick={() => file.current?.click()}>
              or pick an audio file…
            </button>
            <input ref={file} type="file" accept="audio/*" className="hide" onChange={(e) => (pickFile(e.target.files?.[0]), (e.target.value = ""))} />
          </>
        )}
      </div>
    </Modal>
  );
}
