import { useEffect, useState, useId } from "react";
import { AlertTriangle, Check, Sparkles, MessageSquareHeart } from "lucide-react";
import { api } from "../lib/api.js";
import { toMinor, toMajor } from "../lib/format.js";
import { Card, Btn, Field, TextInput, Select, Modal, Spinner } from "../components/ui.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { burst, getGlitterMode, setGlitterMode } from "../lib/glitter.js";

const GLITTER_MODES = [["full", "Full"], ["milestones", "Milestones only"], ["off", "Off"]];

const CATEGORIES = ["Food", "Transport", "Fuel", "Utilities", "Shopping", "Entertainment", "Health", "Education", "Bills"];
const FOCI = [
  { key: "", label: "—" },
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

export default function Settings({ t, user, onUser, onLogout }) {
  const [currencies, setCurrencies] = useState([{ code: user.currency, label: user.currency }]);
  const [incomeSources, setIncomeSources] = useState(INCOME_SOURCE_FALLBACK);
  const majors = (v) => (v != null ? String(toMajor(v, user.currency)) : "");
  // incomeSource / focus are MULTI-SELECT arrays; split stored sources into known
  // keys + one free-text "other".
  const initSources = Array.isArray(user.incomeSource) ? user.incomeSource : [];
  const initOther = initSources.find((s) => !INCOME_SOURCE_KEYS.includes(s)) || "";
  const [form, setForm] = useState({
    name: user.name || "",
    currency: user.currency,
    incomeType: user.incomeType || "fixed",
    incomeSource: initOther ? [...initSources.filter((s) => INCOME_SOURCE_KEYS.includes(s)), "other"] : initSources,
    incomeSourceOther: initOther,
    incomeEstimate: majors(user.incomeEstimate),
    monthlyIncome: majors(user.monthlyIncome),
    monthlySpend: majors(user.monthlySpend),
    savings: majors(user.savings),
    topCategory: user.topCategory || "",
    focus: Array.isArray(user.focus) ? user.focus : user.focus ? [user.focus] : [],
  });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [glitter, setGlitter] = useState(getGlitterMode());

  const [pw, setPw] = useState({ current: "", next: "" });
  const [pwMsg, setPwMsg] = useState({ ok: "", err: "" });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const delLabel = useId();

  useEffect(() => {
    api.meta().then((d) => {
      setCurrencies(d.currencies);
      if (d.incomeSources?.length) setIncomeSources(d.incomeSources);
    }).catch(() => {});
  }, []);

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); };
  const toggle = (k, v) => { setForm((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] })); setSaved(false); };
  const currencyChanged = form.currency !== user.currency;

  const save = async () => {
    setBusy(true); setErr(""); setSaved(false);
    try {
      const cur = form.currency;
      const d = await api.updateUser({
        name: form.name,
        currency: form.currency,
        incomeType: form.incomeType,
        incomeSource: (() => {
          const out = form.incomeSource.filter((s) => s !== "other");
          if (form.incomeSource.includes("other") && form.incomeSourceOther.trim()) out.push(form.incomeSourceOther.trim());
          return out.length ? out : null;
        })(),
        monthlyIncome: form.incomeType === "irregular" || form.monthlyIncome === "" ? null : toMinor(form.monthlyIncome, cur),
        incomeEstimate: form.incomeType === "irregular" && form.incomeEstimate !== "" ? toMinor(form.incomeEstimate, cur) : null,
        monthlySpend: form.monthlySpend === "" ? null : toMinor(form.monthlySpend, cur),
        savings: form.savings === "" ? null : toMinor(form.savings, cur),
        topCategory: form.topCategory || null,
        focus: form.focus.length ? form.focus : null,
      });
      onUser(d.user);
      burst(2);
      setSaved(true);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const toggleCoach = async () => {
    try { const d = await api.updateUser({ coachOptOut: !user.coachOptOut }); onUser(d.user); }
    catch (e) { setErr(e.message); }
  };
  const changeGlitter = (m) => {
    setGlitterMode(m);
    setGlitter(m);
    if (m !== "off") setTimeout(() => burst(m === "milestones" ? 3 : 2), 10); // preview
  };

  const changePw = async (e) => {
    e.preventDefault();
    setPwMsg({ ok: "", err: "" });
    if (pw.next.length < 8) { setPwMsg({ err: "New password must be at least 8 characters.", ok: "" }); return; }
    try {
      await api.changePassword({ current: pw.current, next: pw.next });
      setPwMsg({ ok: "Password updated.", err: "" });
      setPw({ current: "", next: "" });
    } catch (e2) { setPwMsg({ err: e2.message, ok: "" }); }
  };

  const doDelete = async () => {
    try { await api.deleteAccount(); onLogout(); }
    catch (e) { setErr(e.message); }
  };

  return (
    <div className="sm-fade" style={{ maxWidth: 720 }}>
      <PageHeader t={t} title="Settings" sub="Everything you told us during onboarding — editable anytime." />

      <Card t={t} style={{ marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 14px", color: t.text, fontSize: 16 }}>Profile</h3>
        <Field t={t} label="Name"><TextInput t={t} value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field t={t} label="Currency" hint={currencyChanged ? undefined : "Amounts across the app use this currency."}>
          <Select t={t} value={form.currency} onChange={(e) => set("currency", e.target.value)}>
            {currencies.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
          </Select>
        </Field>
        {currencyChanged ? (
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 12, borderRadius: 12, background: t.surface2, border: `1px solid ${t.warn}`, marginBottom: 14 }}>
            <AlertTriangle size={18} color={t.warn} style={{ marginTop: 1 }} />
            <div style={{ fontSize: 13, color: t.sub }}>
              Changing currency <strong style={{ color: t.text }}>re-labels</strong> your existing amounts — it does not convert them (that would need live exchange rates, which we won't fake). A “1,000” stays “1,000” in the new currency.
            </div>
          </div>
        ) : null}
        <Field t={t} label="Income" hint={form.incomeType === "irregular" ? "Sarmaya learns from your logged income and its floor — never a single monthly figure." : undefined}>
          <Select t={t} value={form.incomeType} onChange={(e) => set("incomeType", e.target.value)}>
            <option value="fixed">Fixed monthly</option>
            <option value="irregular">It varies</option>
          </Select>
        </Field>
        <Field t={t} label="Source of income" hint="Pick all that apply — helps the Coach judge how steady your cash flow is. It never becomes a figure.">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[...incomeSources, { key: "other", label: "Other" }].map((s) => {
              const active = form.incomeSource.includes(s.key);
              return (
                <button key={s.key} type="button" onClick={() => toggle("incomeSource", s.key)} aria-pressed={active} className="sm-hover"
                  style={{ padding: "8px 13px", borderRadius: 10, cursor: "pointer", fontSize: 13.5, fontWeight: 600, border: `1px solid ${active ? t.accent : t.border}`, background: active ? t.chip : "transparent", color: t.text }}>{s.label}</button>
              );
            })}
          </div>
        </Field>
        {form.incomeSource.includes("other") ? (
          <Field t={t} label="Your income source"><TextInput t={t} value={form.incomeSourceOther} onChange={(e) => set("incomeSourceOther", e.target.value)} placeholder="e.g. Rental income" /></Field>
        ) : null}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {form.incomeType === "fixed" ? (
            <Field t={t} label={`Monthly income (${form.currency})`}><TextInput t={t} type="number" min="0" value={form.monthlyIncome} onChange={(e) => set("monthlyIncome", e.target.value)} placeholder="blank = not shared" /></Field>
          ) : (
            <Field t={t} label={`Typical month (${form.currency})`} hint="Stored as an estimate, not a fixed figure.">
              <TextInput t={t} type="number" min="0" value={form.incomeEstimate} onChange={(e) => set("incomeEstimate", e.target.value)} placeholder="blank = not shared" />
            </Field>
          )}
          <Field t={t} label={`Monthly spending (${form.currency})`}><TextInput t={t} type="number" min="0" value={form.monthlySpend} onChange={(e) => set("monthlySpend", e.target.value)} /></Field>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Field t={t} label={`Current savings (${form.currency})`}><TextInput t={t} type="number" min="0" value={form.savings} onChange={(e) => set("savings", e.target.value)} /></Field>
          <Field t={t} label="Top spending category">
            <Select t={t} value={form.topCategory} onChange={(e) => set("topCategory", e.target.value)}>
              <option value="">—</option>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
        </div>
        <Field t={t} label="Financial focus" hint="Pick any that apply.">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {FOCI.filter((f) => f.key).map((f) => {
              const active = form.focus.includes(f.key);
              return (
                <button key={f.key} type="button" onClick={() => toggle("focus", f.key)} aria-pressed={active} className="sm-hover"
                  style={{ padding: "8px 13px", borderRadius: 10, cursor: "pointer", fontSize: 13.5, fontWeight: 600, border: `1px solid ${active ? t.accent : t.border}`, background: active ? t.chip : "transparent", color: t.text }}>{f.label}</button>
              );
            })}
          </div>
        </Field>
        {err ? <div role="alert" style={{ color: t.neg, fontSize: 13, marginBottom: 10 }}>{err}</div> : null}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Btn t={t} onClick={save} disabled={busy}>{busy ? <Spinner t={t} size={16} /> : "Save changes"}</Btn>
          {saved ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: t.pos, fontSize: 13, fontWeight: 600 }}><Check size={15} /> Saved</span> : null}
        </div>
      </Card>

      <Card t={t} style={{ marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 10px", color: t.text, fontSize: 16 }}>Coach &amp; sparkle</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${t.border}` }}>
          <MessageSquareHeart size={18} color={t.accentSoft} style={{ flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ color: t.text, fontWeight: 600, fontSize: 14 }}>AI coach &amp; receipt scanning</div>
            <div style={{ color: t.sub, fontSize: 12.5 }}>{user.coachOptOut ? "Off — nothing is sent to the AI, and receipt scanning is disabled." : "On — your first name and computed figures phrase replies; scanned receipt images are read, then discarded."}</div>
          </div>
          <Btn t={t} kind={user.coachOptOut ? "primary" : "ghost"} onClick={toggleCoach} style={{ marginLeft: "auto", padding: "8px 14px", flexShrink: 0 }}>{user.coachOptOut ? "Turn on" : "Turn off"}</Btn>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 12, flexWrap: "wrap" }}>
          <Sparkles size={18} color={t.accentSoft} style={{ flexShrink: 0 }} />
          <div><div style={{ color: t.text, fontWeight: 600, fontSize: 14 }}>Glitter</div><div style={{ color: t.sub, fontSize: 12.5 }}>Sparkle on button presses. Reduced-motion disables it entirely.</div></div>
          <div role="group" aria-label="Glitter intensity" style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
            {GLITTER_MODES.map(([m, l]) => (
              <button key={m} onClick={() => changeGlitter(m)} aria-pressed={glitter === m} className="sm-hover"
                style={{ padding: "7px 12px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1px solid ${glitter === m ? t.accent : t.border}`, background: glitter === m ? t.accent : "transparent", color: glitter === m ? t.accentOn : t.sub }}>{l}</button>
            ))}
          </div>
        </div>
      </Card>

      <Card t={t} style={{ marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 14px", color: t.text, fontSize: 16 }}>Change password</h3>
        <form onSubmit={changePw}>
          <Field t={t} label="Current password"><TextInput t={t} type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" /></Field>
          <Field t={t} label="New password" hint="At least 8 characters."><TextInput t={t} type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" /></Field>
          {pwMsg.err ? <div role="alert" style={{ color: t.neg, fontSize: 13, marginBottom: 10 }}>{pwMsg.err}</div> : null}
          {pwMsg.ok ? <div style={{ color: t.pos, fontSize: 13, marginBottom: 10 }}>{pwMsg.ok}</div> : null}
          <Btn t={t} type="submit" kind="ghost">Update password</Btn>
        </form>
      </Card>

      <Card t={t} style={{ borderColor: t.neg }}>
        <h3 style={{ margin: "0 0 6px", color: t.text, fontSize: 16 }}>Delete account</h3>
        <p style={{ margin: "0 0 14px", color: t.sub, fontSize: 14 }}>Permanently deletes your account and every transaction, goal, debt and challenge. This can't be undone.</p>
        <Btn t={t} kind="danger" onClick={() => { setDeleteText(""); setConfirmDelete(true); }}>Delete my account</Btn>
      </Card>

      <Modal t={t} open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete account?" labelId={delLabel}>
        <p style={{ margin: "0 0 12px", color: t.sub, fontSize: 14 }}>Type <strong style={{ color: t.text }}>DELETE</strong> to confirm. All your data will be removed from the server.</p>
        <TextInput t={t} value={deleteText} onChange={(e) => setDeleteText(e.target.value)} placeholder="DELETE" aria-label="Type DELETE to confirm" style={{ marginBottom: 14 }} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn t={t} kind="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Btn>
          <Btn t={t} kind="danger" onClick={doDelete} disabled={deleteText !== "DELETE"}>Permanently delete</Btn>
        </div>
      </Modal>
    </div>
  );
}
