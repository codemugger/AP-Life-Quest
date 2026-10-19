// App shell: auth gate, hash routing, side nav (laptop) / tab bar (phone).
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { FxProvider } from "./fx";
import { GameProvider, useGame } from "./store";
import { Pet } from "./sprites";
import { Hud } from "./components/Hud";
import Camp from "./pages/Camp";
import Login from "./pages/Login";
import Quests from "./pages/Quests";

const Body = lazy(() => import("./pages/Body"));
const Shop = lazy(() => import("./pages/Shop"));
const Journey = lazy(() => import("./pages/Journey"));
const Trophies = lazy(() => import("./pages/Trophies"));
const Log = lazy(() => import("./pages/Log"));
const SettingsPage = lazy(() => import("./pages/Settings"));

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

const NAV = [
  { id: "camp", label: "Camp", ico: "🏕️" },
  { id: "quests", label: "Quests", ico: "⚔️" },
  { id: "body", label: "Body", ico: "💗" },
  { id: "shop", label: "Shop", ico: "🛒" },
  { id: "journey", label: "Journey", ico: "🗺️" },
  { id: "trophies", label: "Trophies", ico: "🏆" },
  { id: "log", label: "Log", ico: "📜" },
  { id: "settings", label: "Settings", ico: "⚙️" },
];
const MORE = ["journey", "trophies", "log", "settings", "more"];

function Shell() {
  const { state } = useGame();
  const { page, sub } = useRoute();
  const theme = state.settings.theme;
  useEffect(() => {
    if (theme === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);

  const badges: Record<string, number> = {
    camp: state.chests.length,
    shop: state.obligations.length,
  };
  const go = (id: string) => (location.hash = id === "camp" ? "#/" : `#/${id}`);
  let content;
  switch (page) {
    case "quests":
      content = <Quests />;
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
  return (
    <div className="app">
      <nav className="sidenav" aria-label="Main">
        <div className="brand">
          AP LIFE
          <br />
          QUEST
        </div>
        {NAV.map((n) => (
          <button key={n.id} className={page === n.id || (n.id === "camp" && !NAV.some((x) => x.id === page) && page !== "more") ? "on" : ""} onClick={() => go(n.id)}>
            <span>{n.ico}</span> {n.label}
            {!!badges[n.id] && <span className="badge-dot">{badges[n.id]}</span>}
          </button>
        ))}
        <div className="foot">
          {state.season.name}
          <br />v{__APP_VERSION__}
        </div>
      </nav>
      <Hud />
      <main className="main">
        <Suspense fallback={<div className="empty">Loading…</div>}>{content}</Suspense>
      </main>
      <nav className="tabbar" aria-label="Main">
        {[NAV[0], NAV[1], NAV[2], NAV[3], { id: "more", label: "More", ico: "☰" }].map((n) => {
          const on = n.id === "more" ? MORE.includes(page) : page === n.id || (n.id === "camp" && !NAV.some((x) => x.id === page) && page !== "more");
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
  return (
    <>
      <div className="page-head">
        <h1>☰ More</h1>
      </div>
      <div className="cards">
        {NAV.slice(4).map((n) => (
          <a key={n.id} href={`#/${n.id}`} className="panel trophy" style={{ textDecoration: "none", color: "inherit", margin: 4 }}>
            <span className="t-emoji">{n.ico}</span>
            <span className="t-name">{n.label}</span>
          </a>
        ))}
      </div>
    </>
  );
}

export default function App() {
  const [auth, setAuth] = useState<"checking" | "out" | "in">("checking");
  const [meta, setMeta] = useState({ configured: true, totp: false });
  useEffect(() => {
    api<{ authed: boolean; configured: boolean; totp: boolean }>("auth/me")
      .then((r) => {
        setMeta(r);
        setAuth(r.authed ? "in" : "out");
      })
      .catch(() => setAuth("out"));
  }, []);
  const out = useCallback(() => setAuth("out"), []);
  return (
    <FxProvider>
      {auth === "checking" ? (
        <Splash text="Waking up…" />
      ) : auth === "out" ? (
        <Login configured={meta.configured} totp={meta.totp} onDone={() => setAuth("in")} />
      ) : (
        <GameProvider onLoggedOut={out}>{(loading) => (loading ? <Splash /> : <Shell />)}</GameProvider>
      )}
    </FxProvider>
  );
}
