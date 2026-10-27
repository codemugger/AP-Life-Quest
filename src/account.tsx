// Account-level state: who you are, your characters, templates.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, readCache, writeCache } from "./api";

export interface PublicUser {
  id: number;
  username: string;
  display_name: string;
  role: "owner" | "member";
  totp: boolean;
  max_characters: number;
  last_character: string | null;
}

export interface CharacterSummary {
  name: string;
  pet_name: string;
  level: number;
  title: string;
  stage: number;
  species: string;
  color: string;
  eyes: string;
  hat: string | null;
  face: string | null;
  ap: number;
  hp: number;
  streak: number;
  fainted: number;
}

export interface CharacterInfo {
  id: string;
  name: string;
  template: string | null;
  created_at: string;
  last_played: string | null;
  summary: CharacterSummary | null;
}

export interface AccountData {
  user: PublicUser;
  characters: CharacterInfo[];
  templates: { id: string; name: string; description: string }[];
  legacy: boolean;
}

export interface Me {
  authed: boolean;
  user: PublicUser | null;
  needs_setup: boolean;
  setup_ready: boolean;
  setup_needs_code: boolean;
}

interface AccountCtx {
  account: AccountData;
  refresh: () => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AccountCtx | null>(null);
export const useAccount = () => useContext(Ctx)!;

export function AccountProvider({ children, onLoggedOut, loading }: { children: ReactNode; onLoggedOut: () => void; loading: ReactNode }) {
  // last-known copy first (instant, and works on a weak signal), then the fresh one
  const [account, setAccount] = useState<AccountData | null>(() => readCache<AccountData>("account"));
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const a = await api<AccountData>("account");
      setAccount(a);
      writeCache("account", a);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onLoggedOut();
      else setError((e as Error).message);
    }
  }, [onLoggedOut]);
  useEffect(() => void refresh(), [refresh]);
  const logout = useCallback(() => {
    void api("auth/logout", { body: {} }).finally(() => onLoggedOut());
  }, [onLoggedOut]);
  if (!account)
    return error ? (
      <div className="login-wrap">
        <div className="panel login">
          <div style={{ fontSize: 40 }}>📡</div>
          <h1>Connection lost</h1>
          <p className="muted">{error}</p>
          <button className="btn primary" onClick={() => void refresh()}>
            Try again
          </button>
        </div>
      </div>
    ) : (
      <>{loading}</>
    );
  return <Ctx.Provider value={{ account, refresh, logout }}>{children}</Ctx.Provider>;
}
