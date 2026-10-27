// Game state store: loads/refreshes state, runs actions and hands their effects to the FX layer.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Fx, GameState } from "../shared/types";
import { api, ApiError, g, getCharacter, readCache, writeCache } from "./api";
import { useFx } from "./fx";
import { setSoundEnabled } from "./sound";

interface Store {
  state: GameState;
  refresh: () => Promise<void>;
  /** POST/PUT/DELETE an API path, play its effects, refresh. Returns the response's `data`. */
  act: (path: string, body?: unknown, method?: string) => Promise<any>;
  busy: boolean;
  /** Date quests/trackers are logged against (today, or yesterday while it's still open). */
  logDate: string;
  setLogDate: (d: string) => void;
}

const Ctx = createContext<Store | null>(null);

export function useGame() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useGame outside GameProvider");
  return s;
}

export function GameProvider({ children, onLoggedOut }: { children: (loading: boolean) => ReactNode; onLoggedOut: () => void }) {
  const fx = useFx();
  const cid = getCharacter();
  // Draw the last state seen on this device straight away; fresh data replaces it in a moment.
  const [state, setStateRaw] = useState<GameState | null>(() => (cid ? readCache<GameState>(cid) : null));
  const setState = useCallback(
    (s: GameState) => {
      setStateRaw(s);
      if (cid) writeCache(cid, s);
    },
    [cid],
  );
  const stateRef = useRef(state);
  stateRef.current = state;
  const [busy, setBusy] = useState(false);
  const [logDate, setLogDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const handleErr = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        onLoggedOut();
        return;
      }
      fx.error(e instanceof Error ? e.message : String(e));
    },
    [fx, onLoggedOut],
  );

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      // Close any finished days first (penalties, streaks, auto-billing), then load.
      const reports: Fx[] = [];
      try {
        for (let i = 0; i < 20; i++) {
          const r = await api<{ fx: Fx[]; remaining: number }>(g("process"), { body: {} });
          reports.push(...r.fx);
          if (!(r.remaining > 0)) break;
        }
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 0)) throw e; // logged out / offline: handled below
        // Never block the game because a day couldn't be closed; it retries on the next open.
        fx.error(`Couldn't close finished days yet (${e instanceof Error ? e.message : e}). Will retry.`);
      }
      const s = await api<GameState>(g("state"));
      setState(s);
      setSoundEnabled(s.settings.sound);
      setError(null);
      if (reports.length) fx.play(reports, s);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onLoggedOut();
      else {
        setError(e instanceof Error ? e.message : String(e));
        // with a saved view on screen, keep it and say so
        if (stateRef.current) fx.error("Can't reach the server right now: showing what you last saw. Pull down or reopen to retry.");
      }
    } finally {
      loadingRef.current = false;
    }
  }, [fx, onLoggedOut, setState]);

  useEffect(() => {
    void load();
    const onVis = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  // keep logDate valid as days roll over
  useEffect(() => {
    if (state && !state.editable.includes(logDate)) setLogDate(state.today);
  }, [state, logDate]);

  const refresh = useCallback(async () => {
    try {
      const s = await api<GameState>(g("state"));
      setState(s);
      setSoundEnabled(s.settings.sound);
    } catch (e) {
      handleErr(e);
    }
  }, [handleErr, setState]);

  const act = useCallback(
    async (path: string, body?: unknown, method?: string) => {
      setBusy(true);
      try {
        const r = await api<{ fx?: Fx[]; data?: unknown }>(g(path), { method: method ?? "POST", body: body ?? {} });
        const s = await api<GameState>(g("state"));
        setState(s);
        setSoundEnabled(s.settings.sound);
        if (r.fx?.length) fx.play(r.fx, s);
        return r.data;
      } catch (e) {
        handleErr(e);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [fx, handleErr, setState],
  );

  if (!state) {
    return (
      <Ctx.Provider value={null}>
        {error ? (
          <div className="login-wrap">
            <div className="panel login">
              <div style={{ fontSize: 40 }}>📡</div>
              <h1>Connection lost</h1>
              <p className="muted">{error}</p>
              <button className="btn primary" onClick={() => void load()}>
                Try again
              </button>
            </div>
          </div>
        ) : (
          children(true)
        )}
      </Ctx.Provider>
    );
  }
  return (
    <Ctx.Provider value={{ state, refresh, act, busy, logDate: logDate || state.today, setLogDate }}>{children(false)}</Ctx.Provider>
  );
}
