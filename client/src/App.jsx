import { useCallback, useEffect, useMemo, useState } from "react";
import { themes, glitterColors } from "./theme.js";
import { api, ApiError } from "./lib/api.js";
import { usePersistentState } from "./hooks/usePersistentState.js";
import { useIsWide } from "./hooks/useIsWide.js";
import { setGlitterColors } from "./lib/glitter.js";
import { debtsNeedingAttention } from "./lib/debt.js";
import GlobalStyle from "./components/GlobalStyle.jsx";
import GlitterCanvas from "./components/GlitterCanvas.jsx";
import Sidebar from "./components/Sidebar.jsx";
import TopBar from "./components/TopBar.jsx";
import { Loading, ErrorNote } from "./components/ui.jsx";

import Landing from "./pages/Landing.jsx";
import Auth from "./pages/Auth.jsx";
import Onboarding from "./pages/Onboarding.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Transactions from "./pages/Transactions.jsx";
import Goals from "./pages/Goals.jsx";
import Debt from "./pages/Debt.jsx";
import Patterns from "./pages/Patterns.jsx";
import Analytics from "./pages/Analytics.jsx";
import Coach from "./pages/Coach.jsx";
import Challenges from "./pages/Challenges.jsx";
import Reviews from "./pages/Reviews.jsx";
import Admin from "./pages/Admin.jsx";
import Settings from "./pages/Settings.jsx";

export default function App() {
  const [themeName, setThemeName] = usePersistentState("sarmaya.theme", "dark");
  const t = themes[themeName] || themes.dark;

  const [status, setStatus] = useState("loading"); // loading | anon | authed
  const [user, setUser] = useState(null);
  const [anonView, setAnonView] = useState("landing"); // landing | auth
  const [page, setPage] = usePersistentState("sarmaya.page", "dashboard");
  const [query, setQuery] = useState("");
  const [stealth, setStealth] = usePersistentState("sarmaya.stealth", false); // privacy mode

  const wide = useIsWide();
  const [drawer, setDrawer] = useState(false);
  useEffect(() => { if (wide) setDrawer(false); }, [wide]);

  // Reflect theme for native controls (date pickers, scrollbars).
  useEffect(() => {
    document.documentElement.style.colorScheme = themeName === "dark" ? "dark" : "light";
  }, [themeName]);

  // Keep the shared glitter particles on the active theme's crema stops.
  useEffect(() => { setGlitterColors(glitterColors(t)); }, [t]);

  // --- Session bootstrap: the httpOnly cookie is the source of truth. ---
  useEffect(() => {
    let alive = true;
    api.me()
      .then((d) => { if (alive) { setUser(d.user); setStatus("authed"); } })
      .catch((e) => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 401) setStatus("anon");
        else setStatus("anon"); // network/other: treat as signed-out, Landing still renders
      });
    return () => { alive = false; };
  }, []);

  // --- App data (loaded once we're in the app proper) ---
  const [data, setData] = useState({ transactions: [], goals: [], debts: [], obligations: [], estimates: [], challenges: [] });
  const [dataState, setDataState] = useState("idle"); // idle | loading | ready | error

  const loadData = useCallback(async () => {
    setDataState("loading");
    try {
      const [tx, g, d, o, e, c] = await Promise.all([
        api.get("/transactions"), api.get("/goals"), api.get("/debts"), api.get("/obligations"), api.get("/estimates"), api.get("/challenges"),
      ]);
      setData({ transactions: tx.transactions, goals: g.goals, debts: d.debts, obligations: o.obligations, estimates: e.estimates, challenges: c.challenges });
      setDataState("ready");
    } catch {
      setDataState("error");
    }
  }, []);

  const inApp = status === "authed" && user?.onboarded;
  useEffect(() => { if (inApp) loadData(); }, [inApp, loadData]);

  // --- Mutation helpers (optimistic where it helps; rollback on failure) ---
  const patchSlice = (key, fn) => setData((d) => ({ ...d, [key]: fn(d[key]) }));

  const addTransaction = useCallback(async (payload) => {
    const { transaction } = await api.post("/transactions", payload);
    patchSlice("transactions", (list) => [transaction, ...list]);
    return transaction;
  }, []);

  const deleteTransaction = useCallback(async (tx) => {
    patchSlice("transactions", (list) => list.filter((x) => x.id !== tx.id)); // optimistic
    try {
      await api.del(`/transactions/${tx.id}`);
    } catch (e) {
      patchSlice("transactions", (list) => [tx, ...list].sort((a, b) => b.date.localeCompare(a.date))); // rollback
      throw e;
    }
  }, []);

  const restoreTransaction = useCallback(async (tx) => {
    // Undo: re-create the deleted row (new id) and reinsert.
    const { transaction } = await api.post("/transactions", {
      name: tx.name, cat: tx.cat, amount: tx.amount, type: tx.type, date: tx.date,
      kind: tx.kind, trigger: tx.trigger, worthIt: tx.worthIt,
    });
    patchSlice("transactions", (list) => [transaction, ...list].sort((a, b) => b.date.localeCompare(a.date)));
  }, []);

  // Optional one-tap trigger / worth-it tagging AFTER a save (never blocking it).
  const tagTransaction = useCallback(async (id, patch) => {
    const { transaction } = await api.patch(`/transactions/${id}`, patch);
    patchSlice("transactions", (list) => list.map((t) => (t.id === id ? transaction : t)));
    return transaction;
  }, []);

  const obligationOps = useMemo(() => ({
    add: async (p) => { const { obligation } = await api.post("/obligations", p); patchSlice("obligations", (l) => [...l, obligation]); return obligation; },
    update: async (id, p) => { const { obligation } = await api.patch(`/obligations/${id}`, p); patchSlice("obligations", (l) => l.map((o) => (o.id === id ? obligation : o))); return obligation; },
    remove: async (id) => { await api.del(`/obligations/${id}`); patchSlice("obligations", (l) => l.filter((o) => o.id !== id)); },
  }), []);

  const goalOps = useMemo(() => ({
    add: async (p) => { const { goal } = await api.post("/goals", p); patchSlice("goals", (l) => [...l, goal]); return goal; },
    update: async (id, p) => { const { goal } = await api.patch(`/goals/${id}`, p); patchSlice("goals", (l) => l.map((g) => (g.id === id ? goal : g))); return goal; },
    remove: async (id) => { await api.del(`/goals/${id}`); patchSlice("goals", (l) => l.filter((g) => g.id !== id)); },
  }), []);

  const debtOps = useMemo(() => ({
    add: async (p) => { const { debt } = await api.post("/debts", p); patchSlice("debts", (l) => [...l, debt]); return debt; },
    update: async (id, p) => { const { debt } = await api.patch(`/debts/${id}`, p); patchSlice("debts", (l) => l.map((x) => (x.id === id ? debt : x))); return debt; },
    remove: async (id) => { await api.del(`/debts/${id}`); patchSlice("debts", (l) => l.filter((x) => x.id !== id)); },
  }), []);

  const challengeOps = useMemo(() => ({
    join: async (key) => { const { challenge } = await api.post("/challenges", { key }); patchSlice("challenges", (l) => [...l.filter((c) => c.key !== key), challenge]); return challenge; },
    update: async (id, p) => { const { challenge } = await api.patch(`/challenges/${id}`, p); patchSlice("challenges", (l) => l.map((c) => (c.id === id ? challenge : c))); return challenge; },
    leave: async (id) => { await api.del(`/challenges/${id}`); patchSlice("challenges", (l) => l.filter((c) => c.id !== id)); },
  }), []);

  // Live nav badges — derived on render from real debt data, never stored.
  const navBadges = useMemo(() => ({ debt: debtsNeedingAttention(data.debts) }), [data.debts]);

  const goToTransactions = useCallback(() => setPage("transactions"), [setPage]);

  const navigate = useCallback((p) => { setPage(p); setDrawer(false); }, [setPage]);

  const logout = useCallback(async () => {
    try { await api.logout(); } catch { /* clear locally regardless */ }
    setUser(null);
    setStatus("anon");
    setAnonView("landing");
    setData({ transactions: [], goals: [], debts: [], obligations: [], estimates: [], challenges: [] });
    setDataState("idle");
    setPage("dashboard");
  }, [setPage]);

  const toggleTheme = () => setThemeName((n) => (n === "dark" ? "light" : "dark"));

  // Root CSS vars drive the atmosphere / focus / hover styling in GlobalStyle.
  const rootVars = {
    "--accent": t.accent,
    "--blob-a": t.blobA, "--blob-b": t.blobB, "--blob-c": t.blobC,
    "--grain-opacity": String(t.grain),
    "--scroll-thumb": t.border,
    "--placeholder": t.faint,
    "--glow": t.glow,
    "--ring": t.ring,
    "--gold-glow": t.goldGlow,
    "--shadow-lg": t.shadowLg,
    "--row-hover": t.chip,
    "--shimmer": t.glass,
    "--grad-text": `linear-gradient(120deg, ${t.text} 30%, ${t.accent} 100%)`,
  };

  const shell = (children) => (
    <div className="sm-root" data-stealth={stealth ? "1" : undefined} style={{ background: t.bg, color: t.text, ...rootVars }}>
      <GlobalStyle />
      <div className="sm-fog" aria-hidden="true" />
      <div className="sm-grain" aria-hidden="true" />
      {children}
      <GlitterCanvas />
    </div>
  );

  // --- Routing ---
  if (status === "loading") return shell(<div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}><Loading t={t} label="Loading Sarmaya…" /></div>);

  if (status === "anon") {
    return shell(
      anonView === "landing"
        ? <Landing t={t} themeName={themeName} onToggleTheme={toggleTheme} onStart={() => setAnonView("auth")} />
        : <Auth t={t} onBack={() => setAnonView("landing")} onAuthed={(u) => { setUser(u); setStatus("authed"); }} />,
    );
  }

  // authed but not onboarded
  if (!user.onboarded) {
    return shell(<Onboarding t={t} user={user} onUser={setUser} onComplete={(u) => { setUser(u); }} />);
  }

  const pages = {
    dashboard: <Dashboard t={t} user={user} data={data} state={dataState} onRetry={loadData} onAddFirst={goToTransactions} />,
    transactions: <Transactions t={t} user={user} data={data} state={dataState} onRetry={loadData} query={query} setQuery={setQuery} addTransaction={addTransaction} deleteTransaction={deleteTransaction} restoreTransaction={restoreTransaction} tagTransaction={tagTransaction} />,
    goals: <Goals t={t} user={user} data={data} state={dataState} onRetry={loadData} ops={goalOps} />,
    debt: <Debt t={t} user={user} data={data} state={dataState} onRetry={loadData} ops={debtOps} />,
    patterns: <Patterns t={t} user={user} data={data} state={dataState} onRetry={loadData} onAddFirst={goToTransactions} />,
    analytics: <Analytics t={t} user={user} data={data} state={dataState} onRetry={loadData} />,
    coach: <Coach t={t} user={user} onUser={setUser} data={data} state={dataState} onRetry={loadData} onSettings={() => navigate("settings")} />,
    challenges: <Challenges t={t} user={user} data={data} state={dataState} onRetry={loadData} ops={challengeOps} />,
    reviews: <Reviews t={t} user={user} />,
    ...(user.isAdmin ? { admin: <Admin t={t} user={user} /> } : {}),
    settings: <Settings t={t} user={user} onUser={setUser} onLogout={logout} obligationOps={obligationOps} />,
  };

  return shell(
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar t={t} page={page} setPage={navigate} wide={wide} open={drawer} onClose={() => setDrawer(false)} badges={navBadges} isAdmin={user.isAdmin} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <TopBar
          t={t} wide={wide} onMenu={() => setDrawer(true)} user={user}
          onLogout={logout} onSettings={() => navigate("settings")}
          themeName={themeName} onToggleTheme={toggleTheme}
          query={query} setQuery={setQuery} onSearchFocus={goToTransactions}
          stealth={stealth} onToggleStealth={() => setStealth((s) => !s)}
        />
        <main className="sm-scroll" style={{ padding: 24, flex: 1, maxWidth: 1200, width: "100%", margin: "0 auto" }}>
          {dataState === "error" && page !== "settings"
            ? <ErrorNote t={t} message="Couldn't load your data." onRetry={loadData} />
            : (pages[page] || pages.dashboard)}
        </main>
      </div>
    </div>,
  );
}
