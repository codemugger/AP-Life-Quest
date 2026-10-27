// Small fetch wrapper. Every write sends a custom header (CSRF guard on the server).
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data: any = null,
  ) {
    super(message);
  }
}

// ---- the character you're playing: game calls go to /api/c/<id>/... ----
let currentCharacter: string | null = null;
export const setCharacter = (id: string | null) => (currentCharacter = id);
export const getCharacter = () => currentCharacter;
/** Path of a game endpoint for the current character. */
export const g = (path: string) => `c/${currentCharacter}/${path}`;
export const mediaUrl = (id: number) => `/api/c/${currentCharacter}/media/${id}`;

/** Uploads a prepared picture; returns its media id. */
export async function uploadMedia(blob: Blob, width: number, height: number): Promise<number> {
  const res = await fetch(`/api/${g("media")}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": blob.type, "x-requested-with": "aplq", "x-width": String(width), "x-height": String(height) },
    body: blob,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? "Upload failed");
  return data.id as number;
}

// ---- last-known copies (who you are, your characters, each game state), kept on this device so the
// app draws instantly and still opens on a weak signal; fresh data replaces them a moment later ----
const STATE_KEY = "aplq-state:";

/** key: "me", "account" or a character id */
export function readCache<T>(key: string): T | null {
  try {
    const v = JSON.parse(localStorage.getItem(STATE_KEY + key) ?? "null");
    return v && v.app === __APP_VERSION__ ? (v.state as T) : null;
  } catch {
    return null;
  }
}

export function writeCache(key: string, state: unknown) {
  try {
    localStorage.setItem(STATE_KEY + key, JSON.stringify({ app: __APP_VERSION__, state }));
  } catch {
    /* full or blocked: fine, it's only a speed-up */
  }
}

/** Forget every cached game state on this device (on logout / when the session ends). */
export function clearCachedStates() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(STATE_KEY)) localStorage.removeItem(k);
  } catch {}
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined ? "POST" : "GET");
  const send = () =>
    fetch(`/api/${path}`, {
      method,
      credentials: "same-origin",
      headers: method === "GET" ? {} : { "content-type": "application/json", "x-requested-with": "aplq" },
      body: method === "GET" ? undefined : JSON.stringify(opts.body ?? {}),
    });
  let res: Response;
  try {
    res = await send();
    // Reads are safe to retry once (flaky mobile networks / cold starts).
    if (method === "GET" && res.status >= 500) res = await new Promise<Response>((ok) => setTimeout(() => ok(send()), 400));
  } catch (e) {
    if (method !== "GET") throw new ApiError(0, "Network error — check your connection");
    await new Promise((ok) => setTimeout(ok, 400));
    res = await send().catch(() => {
      throw new ApiError(0, "Network error — check your connection");
    });
  }
  // logged out (or the session ended): no game data stays behind on the device
  if (res.status === 401 || /^(auth\/logout|account\/logout-all)$/.test(path) || (path === "account" && method === "DELETE")) clearCachedStates();
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data);
  return data as T;
}

/** Triggers a browser download of a JSON endpoint. */
export async function download(path: string, filename: string) {
  const res = await fetch(`/api/${path}`, { credentials: "same-origin" });
  if (!res.ok) throw new ApiError(res.status, "Download failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
