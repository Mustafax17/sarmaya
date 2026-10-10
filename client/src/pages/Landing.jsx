import { useState } from "react";
import { ChevronRight, ChevronDown, Moon, Sun, Wallet, ArrowRight } from "lucide-react";
import { ACCENT } from "../theme.js";
import { Btn, IconBtn } from "../components/ui.jsx";

// Numbered, un-boxed feature rows — separated by hairlines, not cards.
const FEATURES = [
  // The ONE place the honest-data idea is explained — deliberately not repeated elsewhere.
  { title: "Numbers you can trust", body: "Every chart and total is computed from your own transactions, and anything you simply told us is labelled as such — so what you see reflects what actually happened." },
  { title: "A coach that gets specific", body: "Advice on spending, saving, debt and investing, sized to the money you actually have — with the exact figures (percentages, interest, months-to-goal) worked out for you." },
  { title: "Goals and debt, in plain terms", body: "Track what you're saving toward and paying off, with progress from your real activity — informal debt measured in time between people, not just interest." },
  { title: "Yours, and only yours", body: "Bcrypt-hashed passwords, httpOnly sessions, a strict content-security policy, and every query scoped to your account. No one else can read your rows." },
];

const STEPS = [
  { title: "Tell us the basics", body: "Your currency, income if you choose to share it, and what you're working toward. Skip anything you'd rather not." },
  { title: "Log in plain language", body: "“Spent 1850 on foodpanda.” Sarmaya parses the amount and category; you confirm anything uncertain." },
  { title: "See it come together", body: "Your dashboard, patterns and analytics fill in from what you log — and the coach tells you what changed month to month." },
];

const PILLARS = [
  { word: "Track it all.", line: "Spending, income, goals and debt — logged in plain language." },
  { word: "Ask anything.", line: "A coach that reasons from your real numbers and does the math." },
  { word: "Stay private.", line: "Hashed passwords, scoped data, and a coach you can switch off." },
];

const FAQS = [
  { q: "What can the coach actually do?", a: "It answers questions about your spending, saving, debt and investing, sized to the money you have — and runs exact calculations (percentages, interest, “how long to reach my goal”) on the server, so the figures are right." },
  { q: "Which currencies are supported?", a: "PKR, USD, EUR, GBP, INR, AED, SAR, CAD, AUD and JPY, each formatted correctly for its locale. The list is straightforward to extend." },
  { q: "Is my data private?", a: "Your session is an httpOnly cookie, passwords are bcrypt-hashed, responses carry a strict CSP, and every query is scoped to your account. Changing your password signs out every other device." },
  { q: "What does the coach actually see?", a: "Only your first name and computed figures — never your raw transactions, email or account details. It's fully optional and can be turned off, with the rest of the app unaffected." },
];

const Eyebrow = ({ t, children }) => (
  <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: t.faint, marginBottom: 18 }}>{children}</div>
);

export default function Landing({ t, themeName, onToggleTheme, onStart }) {
  const [openFaq, setOpenFaq] = useState(0);
  const wrap = { maxWidth: 1080, margin: "0 auto", padding: "0 24px" };
  const rule = `1px solid ${t.border}`;
  const sectionPad = "clamp(56px, 9vw, 104px)";

  return (
    <div style={{ background: t.bg }}>
      {/* Nav — hairline underline, no card */}
      <header style={{ borderBottom: rule }}>
        <div style={{ ...wrap, display: "flex", alignItems: "center", gap: 12, height: 68 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: t.accent, display: "grid", placeItems: "center" }}>
            <Wallet size={17} color={ACCENT.on} />
          </div>
          <strong style={{ color: t.text, fontSize: 17, letterSpacing: "-0.01em" }}>Sarmaya</strong>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
            <IconBtn t={t} label={themeName === "dark" ? "Switch to light mode" : "Switch to dark mode"} aria-pressed={themeName === "dark"} onClick={onToggleTheme}>
              {themeName === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </IconBtn>
            <button onClick={onStart} className="sm-underline sm-hover" style={{ background: "transparent", border: "none", cursor: "pointer", color: t.text, fontSize: 14.5, fontWeight: 600, padding: "8px 4px" }}>Sign in</button>
          </div>
        </div>
      </header>

      {/* Hero — asymmetric, big type, one honest sample panel (no floating cards) */}
      <section style={{ ...wrap, padding: `${sectionPad} 24px` }}>
        <div className="land-hero">
          <div className="sm-slide-up">
            <Eyebrow t={t}>Your personalized expense tracker</Eyebrow>
            <h1 style={{ fontSize: "clamp(2.6rem, 6vw, 4.4rem)", lineHeight: 1.02, letterSpacing: "-0.035em", fontWeight: 800, margin: "0 0 22px", color: t.text }}>
              Your very own<br />expense tracker.<br /><span style={{ color: t.sub }}>Personalized to you.</span>
            </h1>
            <p style={{ fontSize: 18, color: t.sub, lineHeight: 1.6, margin: "0 0 32px", maxWidth: 470 }}>
              Track spending, goals and debt in one calm place — with a coach that reads your real numbers, does the math, and helps you decide what's next.
            </p>
            <div style={{ display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap" }}>
              <Btn t={t} onClick={onStart} style={{ padding: "14px 26px", fontSize: 15, borderRadius: 10 }}>Get started <ChevronRight size={16} /></Btn>
              <button onClick={onStart} className="sm-underline sm-hover" style={{ background: "transparent", border: "none", cursor: "pointer", color: t.text, fontSize: 15, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 7 }}>
                Try the demo <ArrowRight size={15} />
              </button>
            </div>
            <div style={{ marginTop: 34, fontSize: 13, color: t.faint, letterSpacing: "0.01em" }}>
              Ten currencies · httpOnly sessions · your rows, scoped to you.
            </div>
          </div>

          {/* One restrained sample of the product's actual voice — hairline framed, flat. */}
          <div style={{ border: rule, borderRadius: 14, background: t.surface, padding: "22px 24px" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ fontWeight: 700, color: t.text, fontSize: 15 }}>What changed?</span>
              <span style={{ fontSize: 12, color: t.faint }}>August vs July</span>
            </div>
            <div style={{ fontSize: 17, color: t.text, fontWeight: 600, marginBottom: 16 }}>You spent Rs 4,250 more this month.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 16 }}>
              {[["Food", "+Rs 2,100"], ["Transport", "+Rs 1,350"], ["Shopping", "+Rs 800"]].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, paddingBottom: 9, borderBottom: rule }}>
                  <span style={{ color: t.sub }}>{k}</span>
                  <span style={{ color: t.text, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 14.5, color: t.text }}>You kept <strong>Rs 3,200</strong> more than last month.</div>
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: rule, fontSize: 12.5, color: t.faint }}>Computed from real transactions — a sample, not an account.</div>
          </div>
        </div>
      </section>

      {/* Principles band — the identity, stated boldly, hairline-divided */}
      <section style={{ borderTop: rule, borderBottom: rule }}>
        <div style={{ ...wrap, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "clamp(24px, 5vw, 56px)", padding: "clamp(40px, 6vw, 68px) 24px" }}>
          {PILLARS.map((p) => (
            <div key={p.word}>
              <div style={{ fontSize: "clamp(1.5rem, 2.4vw, 1.9rem)", fontWeight: 800, letterSpacing: "-0.02em", color: t.text, marginBottom: 8 }}>{p.word}</div>
              <div style={{ fontSize: 14.5, color: t.sub, lineHeight: 1.55 }}>{p.line}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features — numbered editorial rows, separated by rules, accent-edge on hover */}
      <section style={{ ...wrap, padding: `${sectionPad} 24px` }}>
        <div className="land-two">
          <div>
            <Eyebrow t={t}>What you get</Eyebrow>
            <h2 style={{ fontSize: "clamp(1.7rem, 3vw, 2.2rem)", fontWeight: 700, letterSpacing: "-0.025em", color: t.text, margin: 0, lineHeight: 1.1 }}>
              Everything you need to see your money clearly.
            </h2>
          </div>
          <div>
            {FEATURES.map((f, i) => (
              <div key={f.title} className="sm-feature" style={{ display: "grid", gridTemplateColumns: "44px 1fr", gap: 18, paddingTop: 22, paddingBottom: 22, borderTop: i === 0 ? "none" : rule, alignItems: "baseline" }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: t.faint, fontVariantNumeric: "tabular-nums" }}>0{i + 1}</span>
                <div>
                  <div style={{ fontWeight: 700, color: t.text, fontSize: 18, marginBottom: 6, letterSpacing: "-0.01em" }}>{f.title}</div>
                  <div style={{ fontSize: 15, color: t.sub, lineHeight: 1.6, maxWidth: 520 }}>{f.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works — large muted numerals, minimal */}
      <section style={{ borderTop: rule }}>
        <div style={{ ...wrap, padding: `${sectionPad} 24px` }}>
          <Eyebrow t={t}>How it works</Eyebrow>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "clamp(28px, 5vw, 56px)" }}>
            {STEPS.map((s, i) => (
              <div key={s.title}>
                <div style={{ fontSize: "clamp(2.4rem, 4vw, 3.2rem)", fontWeight: 800, color: t.faint, opacity: 0.5, lineHeight: 1, marginBottom: 14, letterSpacing: "-0.04em" }}>{i + 1}</div>
                <div style={{ fontWeight: 700, color: t.text, fontSize: 17, marginBottom: 6 }}>{s.title}</div>
                <div style={{ fontSize: 14.5, color: t.sub, lineHeight: 1.6, maxWidth: 300 }}>{s.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ — hairline disclosure rows, no cards */}
      <section style={{ borderTop: rule }}>
        <div style={{ ...wrap, padding: `${sectionPad} 24px` }}>
          <div className="land-two">
            <div>
              <Eyebrow t={t}>Questions</Eyebrow>
              <h2 style={{ fontSize: "clamp(1.7rem, 3vw, 2.2rem)", fontWeight: 700, letterSpacing: "-0.025em", color: t.text, margin: 0, lineHeight: 1.1 }}>
                The honest answers.
              </h2>
            </div>
            <div>
              {FAQS.map((f, i) => {
                const open = openFaq === i;
                return (
                  <div key={f.q} style={{ borderTop: i === 0 ? "none" : rule }}>
                    <button
                      onClick={() => setOpenFaq(open ? -1 : i)}
                      aria-expanded={open}
                      className="sm-hover"
                      style={{ display: "flex", alignItems: "center", gap: 16, width: "100%", padding: "20px 0", background: "transparent", border: "none", cursor: "pointer", color: t.text, fontSize: 16, fontWeight: 600, textAlign: "left" }}
                    >
                      {f.q}
                      <ChevronDown size={18} style={{ marginLeft: "auto", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .22s cubic-bezier(.2,.7,.3,1)", color: t.faint }} />
                    </button>
                    {open ? <div style={{ padding: "0 0 22px", color: t.sub, fontSize: 15, lineHeight: 1.65, maxWidth: 560 }}>{f.a}</div> : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Close — one strong statement, one accent action */}
      <section style={{ borderTop: rule }}>
        <div style={{ ...wrap, padding: `${sectionPad} 24px`, textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(2rem, 4.5vw, 3.1rem)", fontWeight: 800, letterSpacing: "-0.03em", color: t.text, margin: "0 auto 20px", lineHeight: 1.05, maxWidth: 620 }}>
            Start tracking in minutes.
          </h2>
          <p style={{ color: t.sub, fontSize: 17, margin: "0 auto 30px", maxWidth: 420, lineHeight: 1.6 }}>Free, private, and genuinely yours — set up your account and see your money take shape.</p>
          <Btn t={t} onClick={onStart} style={{ padding: "15px 28px", fontSize: 15.5, borderRadius: 10 }}>Create your account <ChevronRight size={16} /></Btn>
        </div>
      </section>

      <footer style={{ borderTop: rule }}>
        <div style={{ ...wrap, display: "flex", alignItems: "center", gap: 10, height: 64, flexWrap: "wrap" }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, background: t.accent, display: "grid", placeItems: "center" }}><Wallet size={12} color={ACCENT.on} /></div>
          <span style={{ color: t.sub, fontSize: 13 }}>Sarmaya</span>
          <span style={{ marginLeft: "auto", color: t.faint, fontSize: 12.5 }}>Your personal finance, in one calm place.</span>
        </div>
      </footer>
    </div>
  );
}
