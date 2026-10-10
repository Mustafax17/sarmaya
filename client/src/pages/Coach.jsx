import { useEffect, useRef, useState } from "react";
import { Send, ShieldCheck, Sparkles, MessageSquareHeart, Power, Trash2, Calculator, X } from "lucide-react";
import { api, ApiError } from "../lib/api.js";
import { Card, Btn, TextInput, Loading, ErrorNote, Chip, EmptyState } from "../components/ui.jsx";
import { PageHeader } from "../components/PageHeader.jsx";

const GREETING = { who: "coach", text: "Hi — I only talk about your real numbers, and I'd rather say “I can't tell yet” than guess. I'll remember our conversation, so you can pick up where we left off. Ask me anything, or tap a suggestion." };

const SUGGESTIONS = [
  "What's my biggest weakness?",
  "How can I save more?",
  "How am I doing this month?",
  "Can I afford a big purchase?",
];

export default function Coach({ t, user, onUser, onSettings }) {
  const [facts, setFacts] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState([GREETING]);
  const [mathDrawer, setMathDrawer] = useState(null); // computation breakdown to show
  const endRef = useRef(null);

  // Close the "show the math" drawer on Escape.
  useEffect(() => {
    if (!mathDrawer) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setMathDrawer(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mathDrawer]);

  const load = () => {
    setState("loading");
    // Load computed FACTS and the remembered conversation together.
    Promise.all([api.coachFacts(), api.coachHistory().catch(() => ({ history: [] }))])
      .then(([f, h]) => {
        setFacts(f.facts);
        const past = (h.history || []).map((m) => ({ who: m.role === "user" ? "you" : "coach", text: m.content }));
        setThread(past.length ? [GREETING, ...past] : [GREETING]);
        setState("ready");
        setTimeout(() => endRef.current?.scrollIntoView({ behavior: "auto" }), 30);
      })
      .catch(() => setState("error"));
  };
  useEffect(load, []);

  const clearChat = async () => {
    try { await api.clearCoachHistory(); } catch { /* clear locally regardless */ }
    setThread([GREETING]);
  };

  const ask = async (textRaw) => {
    const text = textRaw.trim();
    if (!text || busy) return;
    setThread((th) => [...th, { who: "you", text }]);
    setInput("");
    setBusy(true);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 20);
    try {
      const d = await api.coachMessage(text);
      setThread((th) => [...th, { who: "coach", text: d.reply, source: d.source, computation: d.computation }]);
    } catch (e) {
      const msg = e instanceof ApiError && e.code === "coach_off"
        ? "The coach is turned off. Turn it back on to chat."
        : "Couldn't reach the coach just now. Your data is safe — try again in a moment.";
      setThread((th) => [...th, { who: "coach", text: msg, source: "error" }]);
    } finally {
      setBusy(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 20);
    }
  };

  const setOptOut = async (off) => {
    try {
      const d = await api.updateUser({ coachOptOut: off });
      onUser(d.user);
    } catch { /* surfaced via the next message attempt */ }
  };

  if (state === "loading") return <Loading t={t} label="Loading your coach…" />;
  if (state === "error") return <ErrorNote t={t} message="Couldn't load the coach." onRetry={load} />;

  // Opted out: coach is fully off, rest of the app works normally.
  if (user.coachOptOut) {
    return (
      <div className="sm-fade">
        <PageHeader t={t} title="Coach" sub="Turned off — no data is sent anywhere for coaching." />
        <Card t={t}>
          <EmptyState
            t={t}
            icon={<Power size={20} />}
            title="The coach is off"
            hint="Your first name and computed figures aren't being sent anywhere. Everything else in Sarmaya works exactly the same."
            action={<Btn t={t} onClick={() => setOptOut(false)}><Power size={15} /> Turn the coach on</Btn>}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="sm-fade">
      <PageHeader
        t={t}
        title="Coach"
        sub="Grounded advice — it cites your real numbers, or admits when it doesn't have enough yet. It remembers your conversation."
        action={
          <div style={{ display: "flex", gap: 8 }}>
            {thread.length > 1 ? <Btn t={t} kind="ghost" onClick={clearChat} style={{ padding: "8px 12px" }}><Trash2 size={15} /> Clear chat</Btn> : null}
            <Btn t={t} kind="ghost" onClick={() => setOptOut(true)} style={{ padding: "8px 12px" }}><Power size={15} /> Turn off</Btn>
          </div>
        }
      />

      {/* Privacy disclosure — plain and honest */}
      <Card t={t} accent={t.accent} style={{ marginBottom: 14, display: "flex", gap: 12, alignItems: "flex-start" }}>
        <ShieldCheck size={20} color={t.accent} style={{ marginTop: 2, flexShrink: 0 }} />
        <div style={{ fontSize: 13.5, color: t.sub, lineHeight: 1.55 }}>
          When the coach is on, your <strong style={{ color: t.text }}>first name and computed figures</strong> (like totals and percentages) are sent to a third-party AI to phrase replies. Your <strong style={{ color: t.text }}>email and account details never are</strong>, and your transaction history is never sent as raw rows. Separately, if you <strong style={{ color: t.text }}>scan a receipt</strong>, that image is sent to the same AI to be read — it's discarded straight after, never stored. This switch controls both. Turn it off anytime — the rest of the app keeps working.
        </div>
      </Card>

      {/* What the coach can currently see (honest, from FACTS) */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <Chip t={t}><MessageSquareHeart size={13} /> {facts.txCount} logged · {facts.monthsOfData} month{facts.monthsOfData === 1 ? "" : "s"}</Chip>
        <Chip t={t} tint={facts.patterns ? t.pos : undefined} color={facts.patterns ? t.pos : t.sub}>
          {facts.patterns ? `Patterns unlocked (${facts.patterns.sampleSize} tagged)` : "Patterns locked"}
        </Chip>
        {facts.incomeType === "irregular" ? <Chip t={t}>Irregular income · floor {facts.incomeFloor || "unknown"}</Chip> : null}
      </div>

      <Card t={t} style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 380 }}>
        <div className="sm-scroll" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, maxHeight: 420, overflowY: "auto", paddingRight: 4 }}>
          {thread.map((m, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.who === "you" ? "flex-end" : "flex-start", gap: 3 }}>
              <div style={{ maxWidth: "82%", padding: "10px 14px", borderRadius: 14, fontSize: 14, lineHeight: 1.55,
                background: m.who === "you" ? t.accent : t.surface2,
                color: m.who === "you" ? t.accentOn : t.text,
                border: m.who === "you" ? "none" : `1px solid ${t.border}` }}>
                {m.text}
              </div>
              {m.who === "coach" && m.source && m.source !== "error" ? (
                <span style={{ fontSize: 10.5, color: t.faint, paddingLeft: 4 }}>
                  {m.source === "llm" ? "from your data · AI-phrased" : "from your data"}
                </span>
              ) : null}
              {m.who === "coach" && m.computation ? (
                <button onClick={() => setMathDrawer(m.computation)} className="sm-hover"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 2, marginLeft: 4, padding: "5px 11px", borderRadius: 999, border: `1px solid ${t.border}`, background: "transparent", color: t.accentSoft, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  <Calculator size={13} /> Show the math
                </button>
              ) : null}
            </div>
          ))}
          {busy ? <div style={{ alignSelf: "flex-start", color: t.faint, fontSize: 13, padding: "4px 8px" }}>Thinking…</div> : null}
          <div ref={endRef} />
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => ask(s)} disabled={busy} className="sm-hover"
              style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12.5, cursor: busy ? "default" : "pointer", border: `1px solid ${t.border}`, background: "transparent", color: t.sub, opacity: busy ? 0.6 : 1 }}>
              {s}
            </button>
          ))}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); ask(input); }} style={{ display: "flex", gap: 8 }}>
          <TextInput t={t} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your spending…" aria-label="Ask the coach" disabled={busy} />
          <Btn t={t} type="submit" aria-label="Send" disabled={busy}><Send size={16} /></Btn>
        </form>
      </Card>

      {/* "Show the math" — the exact server-side working behind a calculated answer. */}
      {mathDrawer ? (
        <>
          <div onClick={() => setMathDrawer(null)} aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 60, background: t.scrim }} />
          <div role="dialog" aria-modal="true" aria-label="Calculation details" className="sm-fade"
            style={{ position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 61, width: "min(400px, 92vw)", background: t.surface, borderLeft: `1px solid ${t.border}`, boxShadow: t.shadowLg, padding: "22px 22px 28px", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, background: t.chip, color: t.accentSoft, display: "grid", placeItems: "center" }}><Calculator size={17} /></span>
              <strong style={{ color: t.text, fontSize: 15 }}>How this was calculated</strong>
              <button onClick={() => setMathDrawer(null)} aria-label="Close" className="sm-hover" style={{ marginLeft: "auto", background: "transparent", border: "none", color: t.sub, cursor: "pointer", display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: 8 }}><X size={18} /></button>
            </div>

            <div style={{ fontSize: 13, color: t.sub }}>{mathDrawer.title}</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: t.text, letterSpacing: "-0.02em", margin: "2px 0 18px" }}>{mathDrawer.result}</div>

            {mathDrawer.steps?.length ? (
              <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: t.faint, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700, marginBottom: 8 }}>Inputs</div>
                {mathDrawer.steps.map((s) => (
                  <div key={s.label} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13.5, padding: "6px 0", borderBottom: `1px solid ${t.border}` }}>
                    <span style={{ color: t.sub }}>{s.label}</span>
                    <span style={{ color: t.text, fontWeight: 600, textAlign: "right" }}>{s.value}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {mathDrawer.formula ? (
              <div>
                <div style={{ fontSize: 11, color: t.faint, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700, marginBottom: 8 }}>The working</div>
                <div style={{ fontSize: 13.5, color: t.text, background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 10, padding: "12px 14px", lineHeight: 1.6, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", wordBreak: "break-word" }}>{mathDrawer.formula}</div>
              </div>
            ) : null}

            <p style={{ fontSize: 12, color: t.faint, marginTop: 16, lineHeight: 1.5 }}>Calculated exactly on the server from your figures — the coach relays it, it never does the arithmetic itself.</p>
          </div>
        </>
      ) : null}
    </div>
  );
}
