// Small fetch wrapper. Every write sends a custom header (CSRF guard on the server).
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
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
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`);
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
