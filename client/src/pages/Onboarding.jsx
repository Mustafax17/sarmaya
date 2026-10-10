import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Check, Wallet } from "lucide-react";
import { ACCENT, catColor } from "../theme.js";
import { api } from "../lib/api.js";
import { toMinor, toMajor, todayISO } from "../lib/format.js";
import { GOAL_LIBRARY, resolveIcon, catIcon } from "../lib/icons.js";
import { Btn, Card, Field, TextInput, Select, Spinner, Chip } from "../components/ui.jsx";

const CATEGORIES = ["Food", "Transport", "Fuel", "Utilities", "Shopping", "Entertainment", "Health", "Education", "Bills"];
const FOCI = [
  { key: "save_consistently", label: "Save consistently" },
  { key: "pay_off_debt", label: "Pay off debt" },
  { key: "emergency_fund", label: "Build an emergency fund" },
  { key: "save_for_goal", label: "Save for something specific" },
];
// Fallback until /meta loads the server's list (kept in sync with constants.js).
const INCOME_SOURCE_FALLBACK = [
  { key: "salaried", label: "Salaried job" },
  { key: "freelance", label: "Freelance / self-employed" },
  { key: "business", label: "Business" },
  { key: "family_support", label: "Family support / allowance" },
  { key: "remittance", label: "Remittance" },
  { key: "investments", label: "Investments" },
  { key: "multiple", label: "Multiple sources" },
];
const INCOME_SOURCE_KEYS = INCOME_SOURCE_FALLBACK.map((s) => s.key);

// Onboarding is the ONLY place the app earns the right to say anything about the
// user. Every answer is written to the server; nothing is assumed. Each step is
// skippable and back-able, and answers persist as you go (refresh-safe). Steps
// carry an optional `commit` for side-effects, so order can change safely.
export default function Onboarding({ t, user, onUser, onComplete }) {
  const [step, setStep] = useState(0);
  const [currencies, setCurrencies] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [incomeSources, setIncomeSources] = useState(INCOME_SOURCE_FALLBACK);
  // incomeSource / focus are MULTI-SELECT arrays. Split any stored sources into the
  // known keys plus a single free-text "other" value.
  const initSources = Array.isArray(user.incomeSource) ? user.incomeSource : [];
  const initOther = initSources.find((s) => !INCOME_SOURCE_KEYS.includes(s)) || "";
  const initFocus = Array.isArray(user.focus) ? user.focus : user.focus ? [user.focus] : [];

  const [draft, setDraft] = useState({
    name: user.name || "",
    currency: user.currency || "USD",
    incomeType: user.incomeType || "fixed",
    incomeSource: initOther ? [...initSources.filter((s) => INCOME_SOURCE_KEYS.includes(s)), "other"] : initSources,
    incomeSourceOther: initOther,
    incomeEstimate: user.incomeEstimate != null ? String(toMajor(user.incomeEstimate, user.currency)) : "",
    monthlyIncome: user.monthlyIncome != null ? String(toMajor(user.monthlyIncome, user.currency)) : "",
    monthlySpend: user.monthlySpend != null ? String(toMajor(user.monthlySpend, user.currency)) : "",
    savings: user.savings != null ? String(toMajor(user.savings, user.currency)) : "",
    topCategory: user.topCategory || "",
    focus: initFocus,
    habits: user.habits || { eatOut: "", tracksToday: "", savesWhen: "" },
  });
  const [oblDraft, setOblDraft] = useState({ label: "", amount: "" });
  const [debtDraft, setDebtDraft] = useState({ kind: "informal", counterparty: "", direction: "owe", amount: "", since: "", name: "", apr: "" });
  const [goalPicks, setGoalPicks] = useState([]);
  // Estimated monthly expenses — empty by default, all optional, never pre-filled.
  const [estimateCats, setEstimateCats] = useState(["Food", "Transport", "Rent/Housing", "Subscriptions", "Bills/Utilities", "Health", "Shopping", "Education"]);
  const [estDraft, setEstDraft] = useState({}); // category -> amount string
  const [customEst, setCustomEst] = useState({ name: "", amount: "" });

  useEffect(() => {
    api.meta().then((d) => {
      setCurrencies(d.currencies);
      if (d.estimateCategories?.length) setEstimateCats(d.estimateCategories);
      if (d.incomeSources?.length) setIncomeSources(d.incomeSources);
    }).catch(() => setCurrencies([{ code: "USD", label: "US Dollar" }]));
  }, []);

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const setH = (k, v) => setDraft((d) => ({ ...d, habits: { ...d.habits, [k]: v } }));
  const toggle = (k, v) => setDraft((d) => ({ ...d, [k]: d[k].includes(v) ? d[k].filter((x) => x !== v) : [...d[k], v] }));
  const cur = draft.currency;

  // Shared pill style for single-select option chips (income source, etc.).
  const chipBtn = (active) => ({
    display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 12,
    cursor: "pointer", border: `1px solid ${active ? t.accent : t.border}`,
    background: active ? t.chip : "transparent", color: t.text, fontWeight: 600, fontSize: 14,
  });

  // Resolve the multi-select income sources to the array we store: the selected
  // known keys plus the "other" free text (if any). null when nothing's chosen.
  const resolveSource = () => {
    const out = draft.incomeSource.filter((s) => s !== "other");
    if (draft.incomeSource.includes("other") && draft.incomeSourceOther.trim()) out.push(draft.incomeSourceOther.trim());
    return out.length ? out : null;
  };

  const saveProfile = async (extra = {}) => {
    const irregular = draft.incomeType === "irregular";
    const body = {
      name: draft.name || undefined,
      currency: draft.currency,
      incomeType: draft.incomeType,
      incomeSource: resolveSource(),
      monthlyIncome: irregular || draft.monthlyIncome === "" ? null : toMinor(draft.monthlyIncome, cur),
      // Irregular "typical month" is stored as a self-reported estimate; fixed clears it.
      incomeEstimate: irregular && draft.incomeEstimate !== "" ? toMinor(draft.incomeEstimate, cur) : null,
      monthlySpend: draft.monthlySpend === "" ? null : toMinor(draft.monthlySpend, cur),
      savings: draft.savings === "" ? null : toMinor(draft.savings, cur),
      topCategory: draft.topCategory || null,
      focus: draft.focus.length ? draft.focus : null,
      habits: draft.habits,
      ...extra,
    };
    const d = await api.updateUser(body);
    onUser(d.user);
    return d.user;
  };

  const steps = [
    // 0 — Name
    { title: "What should we call you?", body: (
      <Field t={t} label="Name"><TextInput t={t} value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="Your name" autoFocus /></Field>
    ) },
    // 1 — Currency
    { title: "Which currency do you use?", hint: "Everything in Sarmaya is shown in this currency. We don't convert between currencies.", body: (
      <Field t={t} label="Currency">
        <Select t={t} value={draft.currency} onChange={(e) => set("currency", e.target.value)}>
          {currencies.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
        </Select>
      </Field>
    ) },
    // 2 — Income type
    { title: "Is your income the same each month?", hint: "Freelancers, shopkeepers and commission earners don't have one fixed figure — and the average lies to whoever's worst month is what breaks them.", body: (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[["fixed", "Yes — a fixed monthly amount"], ["irregular", "No — it varies"]].map(([k, l]) => {
          const active = draft.incomeType === k;
          return (
            <button key={k} onClick={() => set("incomeType", k)} aria-pressed={active} className="sm-hover"
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 16px", borderRadius: 12, cursor: "pointer", border: `1px solid ${active ? t.accent : t.border}`, background: active ? t.chip : "transparent", color: t.text, fontWeight: 600, fontSize: 15, textAlign: "left" }}>
              <span style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${active ? t.accent : t.border}`, display: "grid", placeItems: "center" }}>{active ? <Check size={13} color={t.accent} /> : null}</span>
              {l}
            </button>
          );
        })}
      </div>
    ) },
    // 3 — Source(s) of income (self-reported; optional, MULTI-select).
    { title: "Where does your income come from?",
      hint: "Pick all that apply — this helps your Coach judge how steady your cash flow is, and never becomes a figure. Skip if you'd rather not say.",
      body: (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {incomeSources.map((src) => {
              const active = draft.incomeSource.includes(src.key);
              return (
                <button key={src.key} onClick={() => toggle("incomeSource", src.key)} aria-pressed={active} className="sm-hover" style={chipBtn(active)}>{src.label}</button>
              );
            })}
            <button onClick={() => toggle("incomeSource", "other")} aria-pressed={draft.incomeSource.includes("other")} className="sm-hover" style={chipBtn(draft.incomeSource.includes("other"))}>Other</button>
          </div>
          {draft.incomeSource.includes("other") ? (
            <Field t={t} label="In your words"><TextInput t={t} value={draft.incomeSourceOther} onChange={(e) => set("incomeSourceOther", e.target.value)} placeholder="e.g. Rental income" autoFocus /></Field>
          ) : null}
        </div>
      ) },
    // 4 — How much. Fixed: a monthly figure. Irregular: a typical month, stored as an ESTIMATE.
    { title: draft.incomeType === "irregular" ? "In a typical month, roughly how much comes in?" : "Roughly what's your monthly income?",
      hint: draft.incomeType === "irregular"
        ? "A rough, typical month is fine — we store it as an estimate, never a fixed figure, and still budget against your realistic floor from logged income. Skip if you'd rather not say."
        : "Optional. If you skip it, we simply won't show a savings rate rather than invent one.",
      body: draft.incomeType === "irregular" ? (
        <Field t={t} label={`Typical month (${cur})`} hint="Stored as an estimate — “you told us”, not computed.">
          <TextInput t={t} type="number" min="0" value={draft.incomeEstimate} onChange={(e) => set("incomeEstimate", e.target.value)} placeholder="e.g. 120000" />
        </Field>
      ) : (
        <Field t={t} label={`Monthly income (${cur})`} hint="Leave blank for “prefer not to say”.">
          <TextInput t={t} type="number" min="0" value={draft.monthlyIncome} onChange={(e) => set("monthlyIncome", e.target.value)} placeholder="e.g. 185000" />
        </Field>
      ) },
    // 4 — Monthly spending
    { title: "About how much do you spend a month?", hint: "Optional and just a starting estimate — real transactions replace it.", body: (
      <Field t={t} label={`Typical monthly spending (${cur})`}>
        <TextInput t={t} type="number" min="0" value={draft.monthlySpend} onChange={(e) => set("monthlySpend", e.target.value)} placeholder="e.g. 90000" />
      </Field>
    ) },
    // 5 — Obligations (the field that makes every other number correct)
    { title: "Does part of your income go to family or fixed commitments?",
      hint: "Money you send to parents, a sibling's fees, support you can't skip. It's not spending — tagging it right stops the app ever telling you to cut what was never yours to cut.",
      commit: async () => {
        const amt = Number(oblDraft.amount);
        if (oblDraft.label.trim() && amt > 0) {
          await api.post("/obligations", { label: oblDraft.label.trim(), amount: toMinor(oblDraft.amount, cur), cadence: "monthly" });
          setOblDraft({ label: "", amount: "" });
        }
      },
      body: (
        <div>
          <Field t={t} label="Who / what"><TextInput t={t} value={oblDraft.label} onChange={(e) => setOblDraft((d) => ({ ...d, label: e.target.value }))} placeholder="e.g. Parents" /></Field>
          <Field t={t} label={`Amount per month (${cur})`} hint="You can add more later in Settings."><TextInput t={t} type="number" min="0" value={oblDraft.amount} onChange={(e) => setOblDraft((d) => ({ ...d, amount: e.target.value }))} placeholder="e.g. 25000" /></Field>
        </div>
      ) },
    // 6 — Top category
    { title: "What do you spend the most on?", hint: "This seeds your Coach until enough real transactions exist — then computed data takes over and we say so.", body: (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {CATEGORIES.map((c) => {
          const I = catIcon(c); const active = draft.topCategory === c;
          return (
            <button key={c} onClick={() => set("topCategory", active ? "" : c)} aria-pressed={active} className="sm-hover"
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 12, cursor: "pointer", border: `1px solid ${active ? t.accent : t.border}`, background: active ? t.chip : "transparent", color: t.text, fontWeight: 600, fontSize: 14 }}>
              <I size={16} color={catColor(c)} /> {c}
            </button>
          );
        })}
      </div>
    ) },
    // 6b — Estimated monthly expenses (self-reported scaffolding, never transactions)
    { title: "Roughly what do you spend each month?",
      hint: "Rough guesses are fine — you can log real transactions later, and those will replace these estimates. Skip anything that doesn't apply to you.",
      commit: async () => {
        const rows = [];
        for (const [cat, val] of Object.entries(estDraft)) {
          if (val !== "" && Number(val) > 0) rows.push({ category: cat, monthly: toMinor(val, cur) });
        }
        const cn = customEst.name.trim();
        if (cn && Number(customEst.amount) > 0) rows.push({ category: cn, monthly: toMinor(customEst.amount, cur) });
        await api.saveEstimates(rows); // replaces the set; [] clears — refresh-safe
      },
      body: (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
            {estimateCats.map((c) => (
              <label key={c} style={{ fontSize: 13, color: t.sub }}>
                {c}
                <TextInput t={t} type="number" min="0" value={estDraft[c] ?? ""} onChange={(e) => setEstDraft((d) => ({ ...d, [c]: e.target.value }))} placeholder={cur} style={{ marginTop: 5 }} />
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginTop: 4 }}>
            <label style={{ flex: 2, fontSize: 13, color: t.sub }}>Something else?
              <TextInput t={t} value={customEst.name} onChange={(e) => setCustomEst((d) => ({ ...d, name: e.target.value }))} placeholder="Custom category" style={{ marginTop: 5 }} />
            </label>
            <label style={{ flex: 1, fontSize: 13, color: t.sub }}>{`Amount (${cur})`}
              <TextInput t={t} type="number" min="0" value={customEst.amount} onChange={(e) => setCustomEst((d) => ({ ...d, amount: e.target.value }))} placeholder={cur} style={{ marginTop: 5 }} />
            </label>
          </div>
          <p style={{ fontSize: 12, color: t.faint, margin: "2px 0 0" }}>Every field is optional and shown as “you told us” until you log real transactions in that category.</p>
        </div>
      ) },
    // 7 — Current savings
    { title: "How much do you have set aside right now?", hint: "This is the only source for your starting “total savings”. Skip if you'd rather not say.", body: (
      <Field t={t} label={`Current savings (${cur})`}>
        <TextInput t={t} type="number" min="0" value={draft.savings} onChange={(e) => set("savings", e.target.value)} placeholder="e.g. 300000" />
      </Field>
    ) },
    // 8 — Debts (informal owe/owed + formal)
    { title: "Any debts to track?",
      hint: "Money you owe a friend, money owed to you, or a formal loan. Optional.",
      commit: async () => {
        const amt = Number(debtDraft.amount);
        if (amt <= 0) return;
        if (debtDraft.kind === "informal") {
          const who = debtDraft.counterparty.trim();
          if (!who) return;
          await api.post("/debts", { kind: "informal", name: who, counterparty: who, direction: debtDraft.direction, since: debtDraft.since || null, principal: toMinor(debtDraft.amount, cur) });
        } else if (debtDraft.name.trim()) {
          await api.post("/debts", { kind: "formal", name: debtDraft.name.trim(), direction: "owe", principal: toMinor(debtDraft.amount, cur), apr: Number(debtDraft.apr) || 0 });
        }
        setDebtDraft({ kind: "informal", counterparty: "", direction: "owe", amount: "", since: "", name: "", apr: "" });
      },
      body: (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {[["informal", "Between people"], ["formal", "Formal loan"]].map(([k, l]) => (
              <button key={k} onClick={() => setDebtDraft((d) => ({ ...d, kind: k }))} aria-pressed={debtDraft.kind === k} className="sm-hover"
                style={{ flex: 1, padding: "9px 12px", borderRadius: 12, fontSize: 13.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${debtDraft.kind === k ? t.accent : t.border}`, background: debtDraft.kind === k ? t.chip : "transparent", color: t.text }}>{l}</button>
            ))}
          </div>
          {debtDraft.kind === "informal" ? (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                {[["owe", "I owe them"], ["owed", "They owe me"]].map(([k, l]) => (
                  <button key={k} onClick={() => setDebtDraft((d) => ({ ...d, direction: k }))} aria-pressed={debtDraft.direction === k} className="sm-hover"
                    style={{ flex: 1, padding: "8px 12px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1px solid ${debtDraft.direction === k ? t.accent : t.border}`, background: "transparent", color: debtDraft.direction === k ? t.text : t.sub }}>{l}</button>
                ))}
              </div>
              <Field t={t} label="Who?"><TextInput t={t} value={debtDraft.counterparty} onChange={(e) => setDebtDraft((d) => ({ ...d, counterparty: e.target.value }))} placeholder="e.g. Ahmed" /></Field>
              <div style={{ display: "flex", gap: 12 }}>
                <Field t={t} label={`Amount (${cur})`}><TextInput t={t} type="number" min="0" value={debtDraft.amount} onChange={(e) => setDebtDraft((d) => ({ ...d, amount: e.target.value }))} /></Field>
                <Field t={t} label="Since"><TextInput t={t} type="date" value={debtDraft.since} onChange={(e) => setDebtDraft((d) => ({ ...d, since: e.target.value }))} /></Field>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Field t={t} label="Name"><TextInput t={t} value={debtDraft.name} onChange={(e) => setDebtDraft((d) => ({ ...d, name: e.target.value }))} placeholder="e.g. Credit card" /></Field>
              <Field t={t} label={`Amount (${cur})`}><TextInput t={t} type="number" min="0" value={debtDraft.amount} onChange={(e) => setDebtDraft((d) => ({ ...d, amount: e.target.value }))} /></Field>
              <Field t={t} label="APR %"><TextInput t={t} type="number" min="0" value={debtDraft.apr} onChange={(e) => setDebtDraft((d) => ({ ...d, apr: e.target.value }))} /></Field>
            </div>
          )}
        </div>
      ) },
    // 9 — Focus (MULTI-select)
    { title: "What are your financial focuses?", hint: "Pick any that apply.", body: (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {FOCI.map((f) => {
          const active = draft.focus.includes(f.key);
          return (
            <button key={f.key} onClick={() => toggle("focus", f.key)} aria-pressed={active} className="sm-hover"
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 16px", borderRadius: 12, cursor: "pointer", border: `1px solid ${active ? t.accent : t.border}`, background: active ? t.chip : "transparent", color: t.text, fontWeight: 600, fontSize: 15, textAlign: "left" }}>
              <span style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${active ? t.accent : t.border}`, display: "grid", placeItems: "center" }}>{active ? <Check size={13} color={t.accent} /> : null}</span>
              {f.label}
            </button>
          );
        })}
      </div>
    ) },
    // 10 — Goals
    { title: "Pick a goal or two", hint: "Choose from the library — you can set targets on the Goals page.",
      commit: async () => {
        for (const g of goalPicks) {
          await api.post("/goals", { name: g.name, target: 100, saved: 0, iconName: g.iconName });
        }
        // Clear the picks once created, or stepping Back and forward again would
        // post them a second time. Same guard the obligation and debt steps use.
        setGoalPicks([]);
      },
      body: (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {GOAL_LIBRARY.map((g) => {
            const I = resolveIcon(g.iconName);
            const active = goalPicks.some((x) => x.name === g.name);
            return (
              <button key={g.name} aria-pressed={active} className="sm-hover"
                onClick={() => setGoalPicks((p) => active ? p.filter((x) => x.name !== g.name) : p.length < 3 ? [...p, g] : p)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 12, cursor: "pointer", border: `1px solid ${active ? t.accent : t.border}`, background: active ? t.chip : "transparent", color: t.text, fontWeight: 600, fontSize: 14 }}>
                <I size={16} color={t.accentSoft} /> {g.name}
              </button>
            );
          })}
        </div>
      ) },
    // 11 — Habits
    { title: "A couple of habits", hint: "These tune your Coach's tone. They're self-reported and always labelled as such.", body: (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field t={t} label="How often do you eat out?">
          <Select t={t} value={draft.habits.eatOut} onChange={(e) => setH("eatOut", e.target.value)}>
            <option value="">Prefer not to say</option><option value="rarely">Rarely</option><option value="weekly">Weekly</option><option value="often">Several times a week</option>
          </Select>
        </Field>
        <Field t={t} label="Do you track your spending today?">
          <Select t={t} value={String(draft.habits.tracksToday)} onChange={(e) => setH("tracksToday", e.target.value)}>
            <option value="">Prefer not to say</option><option value="true">Yes</option><option value="false">No</option>
          </Select>
        </Field>
        <Field t={t} label="When do you save?">
          <Select t={t} value={draft.habits.savesWhen} onChange={(e) => setH("savesWhen", e.target.value)}>
            <option value="">Prefer not to say</option><option value="start">At the start of the month</option><option value="end">Whatever's left at the end</option>
          </Select>
        </Field>
      </div>
    ) },
  ];

  const isLast = step === steps.length - 1;
  const progress = (step + 1) / steps.length;

  // Turn what the user told us at signup into their first real transactions, so the
  // dashboard, analytics and month view aren't empty on day one. Dated today. Runs
  // once, at completion. Rent/bills-type categories are logged as obligations (money
  // that wasn't a choice) so the Coach never suggests cutting them.
  const OBLIGATION_RE = /rent|housing|bills|utilit|loan|fee|insurance|mortgage/i;
  const seedFromOnboarding = async () => {
    const date = todayISO();
    const rows = [];
    if (draft.incomeType === "fixed" && draft.monthlyIncome !== "" && Number(draft.monthlyIncome) > 0) {
      rows.push({ name: "Monthly income", cat: "Income", amount: toMinor(draft.monthlyIncome, cur), type: "in", kind: "income", estimated: true, date });
    }
    const estEntries = Object.entries(estDraft).filter(([, v]) => v !== "" && Number(v) > 0);
    for (const [category, val] of estEntries) {
      rows.push({ name: category, cat: category, amount: toMinor(val, cur), type: "out", kind: OBLIGATION_RE.test(category) ? "obligation" : "discretionary", estimated: true, date });
    }
    if (customEst.name.trim() && Number(customEst.amount) > 0) {
      const c = customEst.name.trim();
      rows.push({ name: c, cat: c, amount: toMinor(customEst.amount, cur), type: "out", kind: OBLIGATION_RE.test(c) ? "obligation" : "discretionary", estimated: true, date });
    }
    // No per-category detail but a monthly-spend total → one general expense.
    if (estEntries.length === 0 && !(customEst.name.trim() && Number(customEst.amount) > 0) && draft.monthlySpend !== "" && Number(draft.monthlySpend) > 0) {
      rows.push({ name: "Monthly spending", cat: "Other", amount: toMinor(draft.monthlySpend, cur), type: "out", kind: "discretionary", estimated: true, date });
    }
    for (const r of rows) {
      try { await api.post("/transactions", r); } catch { /* best-effort seeding; never block finishing onboarding */ }
    }
  };

  const go = async (dir) => {
    setError("");
    setBusy(true);
    try {
      await saveProfile();
      if (dir > 0 && steps[step].commit) await steps[step].commit();
      if (isLast && dir > 0) {
        await seedFromOnboarding();
        const finalUser = await saveProfile({ onboarded: true });
        onComplete(finalUser);
        return;
      }
      setStep((s) => Math.min(steps.length - 1, Math.max(0, s + dir)));
    } catch (e) {
      setError(e.message || "Couldn't save. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  // Skip the rest of setup and go straight into the app — keeping whatever's filled
  // so far. The dashboard then reminds them to finish the unfilled bits later.
  const skipAll = async () => {
    setError(""); setBusy(true);
    try {
      await seedFromOnboarding();
      const finalUser = await saveProfile({ onboarded: true });
      onComplete(finalUser);
    } catch (e) {
      setError(e.message || "Couldn't save. Check your connection.");
      setBusy(false);
    }
  };

  const s = steps[step];

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "min(520px, 100%)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: t.accent, display: "grid", placeItems: "center" }}><Wallet size={16} color={ACCENT.on} /></div>
          <strong style={{ color: t.text }}>Setting up Sarmaya</strong>
          <span style={{ marginLeft: "auto", fontSize: 13, color: t.sub }}>Step {step + 1} of {steps.length}</span>
          <button onClick={skipAll} disabled={busy} className="sm-hover" style={{ background: "transparent", border: "none", color: t.accentSoft, cursor: "pointer", fontSize: 13, fontWeight: 600, padding: "2px 4px" }}>
            Skip for now
          </button>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: t.chip, overflow: "hidden", marginBottom: 20 }}>
          <div style={{ width: `${progress * 100}%`, height: "100%", background: t.accent, transition: "width .3s ease" }} />
        </div>

        <Card t={t} className="sm-fade" key={step}>
          <h2 style={{ margin: "0 0 6px", color: t.text, fontSize: 20 }}>{s.title}</h2>
          {s.hint ? <p style={{ margin: "0 0 18px", color: t.sub, fontSize: 14, lineHeight: 1.5 }}>{s.hint}</p> : <div style={{ height: 10 }} />}
          {s.body}
          {error ? <div role="alert" style={{ color: t.neg, fontSize: 13, marginTop: 10 }}>{error}</div> : null}

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 22 }}>
            {step > 0 ? <Btn t={t} kind="ghost" onClick={() => go(-1)} disabled={busy}><ChevronLeft size={16} /> Back</Btn> : null}
            <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
              {!isLast ? <Btn t={t} kind="subtle" onClick={() => go(1)} disabled={busy}>Skip</Btn> : null}
              <Btn t={t} onClick={() => go(1)} disabled={busy}>
                {busy ? <Spinner t={t} size={16} /> : isLast ? "Enter Sarmaya" : "Continue"} {!busy && !isLast ? <ChevronRight size={16} /> : null}
              </Btn>
            </div>
          </div>
        </Card>
        <p style={{ textAlign: "center", color: t.faint, fontSize: 12.5, marginTop: 14 }}>
          No rush — skip anything, and finish the rest later from your dashboard or Settings.
        </p>
      </div>
    </div>
  );
}
