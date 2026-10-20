// App shell: auth gate → account (choose your save) → game, with hash routing and
// a side nav (laptop) / tab bar (phone).
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api, setCharacter } from "./api";
import { AccountProvider, useAccount, type Me } from "./account";
import { FxProvider, useFx } from "./fx";
import { reminderDue } from "./notes";
import { GameProvider, useGame } from "./store";
import { Pet } from "./sprites";
import { Hud } from "./components/Hud";
import Camp from "./pages/Camp";
import { Join, Login, Setup } from "./pages/Login";
import Quests from "./pages/Quests";

const Body = lazy(() => import("./pages/Body"));
const Notes = lazy(() => import("./pages/Notes"));
const Shop = lazy(() => import("./pages/Shop"));
const Journey = lazy(() => import("./pages/Journey"));
const Trophies = lazy(() => import("./pages/Trophies"));
const Log = lazy(() => import("./pages/Log"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const Characters = lazy(() => import("./pages/Characters"));
const AccountPage = lazy(() => import("./pages/Account"));
const Admin = lazy(() => import("./pages/Admin"));

function useRoute() {
  const parse = () => {
    const parts = location.hash.replace(/^#\/?/, "").split("/");
    return { page: parts[0] || "camp", sub: parts[1] };
  };
  const [r, setR] = useState(parse);
  useEffect(() => {
    const on = () => {
      setR(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return r;
}

function Splash({ text = "Loading your save…" }: { text?: string }) {
  return (
    <div className="login-wrap">
      <div className="center">
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Pet stage={0} mood="sleep" color="pink" scale={5} className="pet-sprite" />
        </div>
        <p className="px-font tiny muted">{text}</p>
      </div>
    </div>
  );
}

const GAME_NAV = [
  { id: "camp", label: "Camp", ico: "🏕️" },
  { id: "quests", label: "Quests", ico: "⚔️" },
  { id: "notes", label: "Notes", ico: "📒" },
  { id: "body", label: "Body", ico: "💗" },
  { id: "shop", label: "Shop", ico: "🛒" },
  { id: "journey", label: "Journey", ico: "🗺️" },
  { id: "trophies", label: "Trophies", ico: "🏆" },
  { id: "log", label: "Log", ico: "📜" },
  { id: "settings", label: "Settings", ico: "⚙️" },
];
/** How many of GAME_NAV fit in the phone tab bar (the rest live under ☰ More). */
const TABBAR = 5;
const ACCOUNT_PAGES = ["characters", "account", "admin"];
const MORE = ["journey", "trophies", "log", "settings", "more", ...ACCOUNT_PAGES];

function accountNav(owner: boolean) {
  return [
    { id: "characters", label: "Characters", ico: "🎮" },
    { id: "account", label: "Account", ico: "👤" },
    ...(owner ? [{ id: "admin", label: "Admin", ico: "👑" }] : []),
  ];
}

const go = (id: string) => (location.hash = id === "camp" ? "#/" : `#/${id}`);

/** Account-level pages (no character loaded). */
function AccountShell({ page }: { page: string }) {
  const { account } = useAccount();
  const hasChar = account.characters.some((c) => c.id === account.user.last_character);
  return (
    <div className="app">
      <header className="hud">
        <div className="hud-inner">
          <span className="px-font" style={{ fontSize: 12 }}>
            AP LIFE QUEST
          </span>
          <span className="grow" />
          <nav className="row" aria-label="Account">
            {hasChar && (
              <button className="btn xs" onClick={() => go("camp")}>
                ◀ Back to game
              </button>
            )}
            {accountNav(account.user.role === "owner").map((n) => (
              <button key={n.id} className={`btn xs ${page === n.id ? "gold" : ""}`} onClick={() => go(n.id)} aria-current={page === n.id ? "page" : undefined}>
                {n.ico} <span className="hide-sm">{n.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="main solo">
        <Suspense fallback={<div className="empty">Loading…</div>}>
          {page === "account" ? <AccountPage /> : page === "admin" && account.user.role === "owner" ? <Admin /> : <Characters />}
        </Suspense>
      </main>
    </div>
  );
}

/** Ticks every 30 s and announces note reminders as they come due (in-app nudges). Returns "now". */
function useReminders() {
  const { state } = useGame();
  const fx = useFx();
  const [now, setNow] = useState(() => Date.now());
  const told = useRef(new Set<string>());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const fresh = state.notes.filter((n) => reminderDue(n.remind_at, now) && !told.current.has(`${n.id}@${n.remind_at}`));
    fresh.forEach((n) => told.current.add(`${n.id}@${n.remind_at}`));
    for (const n of fresh.slice(0, 3)) fx.toast(`Reminder: ${n.title || "a note"}`, "⏰");
  }, [state.notes, now, fx]);
  return now;
}

function GameShell() {
  const { state } = useGame();
  const { account } = useAccount();
  const { page, sub } = useRoute();
  const theme = state.settings.theme;
  useEffect(() => {
    if (theme === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);

  const now = useReminders();
  const badges: Record<string, number> = {
    camp: state.chests.length,
    shop: state.obligations.length,
    notes: state.notes.filter((n) => reminderDue(n.remind_at, now)).length,
  };
  const extra = accountNav(account.user.role === "owner");
  let content: ReactNode;
  switch (page) {
    case "quests":
      content = <Quests />;
      break;
    case "notes":
      content = <Notes sub={sub} />;
      break;
    case "body":
      content = <Body />;
      break;
    case "shop":
      content = <Shop sub={sub} key={sub} />;
      break;
    case "journey":
      content = <Journey sub={sub} key={sub} />;
      break;
    case "trophies":
      content = <Trophies />;
      break;
    case "log":
      content = <Log />;
      break;
    case "settings":
      content = <SettingsPage />;
      break;
    case "more":
      content = <More />;
      break;
    default:
      content = <Camp />;
  }
  const isOn = (id: string) => page === id || (id === "camp" && !GAME_NAV.some((x) => x.id === page) && page !== "more");
  return (
    <div className="app">
      <nav className="sidenav" aria-label="Main">
        <div className="brand">
          AP LIFE
          <br />
          QUEST
        </div>
        {GAME_NAV.map((n) => (
          <button key={n.id} className={isOn(n.id) ? "on" : ""} onClick={() => go(n.id)}>
            <span>{n.ico}</span> {n.label}
            {!!badges[n.id] && <span className="badge-dot">{badges[n.id]}</span>}
          </button>
        ))}
        <div className="nav-sep" />
        {extra.map((n) => (
          <button key={n.id} onClick={() => go(n.id)}>
            <span>{n.ico}</span> {n.label}
          </button>
        ))}
        <div className="foot">
          {state.settings.player_name} · {state.season.name}
          <br />v{__APP_VERSION__}
        </div>
      </nav>
      <Hud />
      <main className="main">
        <Suspense fallback={<div className="empty">Loading…</div>}>{content}</Suspense>
      </main>
      <nav className="tabbar" aria-label="Main">
        {[...GAME_NAV.slice(0, TABBAR), { id: "more", label: "More", ico: "☰" }].map((n) => {
          const on = n.id === "more" ? MORE.includes(page) : isOn(n.id);
          return (
            <button key={n.id} className={on ? "on" : ""} onClick={() => go(n.id)} aria-current={on ? "page" : undefined}>
              <span className="ico">{n.ico}</span>
              {n.label}
              {!!badges[n.id] && <span className="badge-dot">{badges[n.id]}</span>}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function More() {
  const { account } = useAccount();
  return (
    <>
      <div className="page-head">
        <h1>☰ More</h1>
      </div>
      <div className="cards">
        {[...GAME_NAV.slice(TABBAR), ...accountNav(account.user.role === "owner")].map((n) => (
          <a key={n.id} href={`#/${n.id}`} className="panel trophy" style={{ textDecoration: "none", color: "inherit", margin: 4 }}>
            <span className="t-emoji">{n.ico}</span>
            <span className="t-name">{n.label}</span>
          </a>
        ))}
      </div>
    </>
  );
}

/** Logged in: pick the character to play (or show account pages). */
function Authed({ onLoggedOut }: { onLoggedOut: () => void }) {
  const { account } = useAccount();
  const { page } = useRoute();
  const cid = account.characters.some((c) => c.id === account.user.last_character) ? account.user.last_character : null;
  if (ACCOUNT_PAGES.includes(page) || !cid) return <AccountShell page={cid ? page : ACCOUNT_PAGES.includes(page) ? page : "characters"} />;
  setCharacter(cid);
  return (
    <GameProvider key={cid} onLoggedOut={onLoggedOut}>
      {(loading) => (loading ? <Splash /> : <GameShell />)}
    </GameProvider>
  );
}

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [offline, setOffline] = useState(false);
  const route = useRoute();
  const loadMe = useCallback(() => {
    api<Me>("auth/me")
      .then((r) => {
        setMe(r);
        setOffline(false);
      })
      .catch(() => setOffline(true));
  }, []);
  useEffect(() => loadMe(), [loadMe]);
  const out = useCallback(() => setMe((m) => (m ? { ...m, authed: false, user: null } : m)), []);
  let body: ReactNode;
  if (offline)
    body = (
      <div className="login-wrap">
        <div className="panel login">
          <div style={{ fontSize: 40 }}>📡</div>
          <h1>Can't reach the castle</h1>
          <button className="btn primary" onClick={loadMe}>
            Try again
          </button>
        </div>
      </div>
    );
  else if (!me) body = <Splash text="Waking up…" />;
  else if (!me.authed) {
    if (route.page === "join" && route.sub) body = <Join code={route.sub} onDone={loadMe} />;
    else if (me.needs_setup) body = <Setup me={me} onDone={loadMe} />;
    else body = <Login onDone={loadMe} />;
  } else
    body = (
      <AccountProvider key={me.user?.id} onLoggedOut={out} loading={<Splash />}>
        <Authed onLoggedOut={out} />
      </AccountProvider>
    );
  return <FxProvider>{body}</FxProvider>;
}
