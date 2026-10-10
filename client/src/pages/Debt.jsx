import { useMemo, useState } from "react";
import { CreditCard, Plus, Trash2, ArrowUpRight, ArrowDownLeft, Clock, Users, CalendarClock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { fmtMoney, fmtCompact, fmtDate, toMinor, toMajor, todayISO } from "../lib/format.js";
import { Card, Btn, IconBtn, Bar as ProgBar, Chip, EmptyState, Loading, Modal, ConfirmDialog, Field, TextInput, Select } from "../components/ui.jsx";
import StatCard from "../components/StatCard.jsx";
import { PageHeader, chartTooltip, gridProps, axisProps } from "../components/PageHeader.jsx";
import { burst } from "../lib/glitter.js";
import { monthsOpen, AGE_MONTHS } from "../lib/debt.js"; // shared with the sidebar badge

const ageLabel = (m) => (m == null ? "" : m === 0 ? "opened this month" : `open ${m} month${m === 1 ? "" : "s"}`);

// A user-set plan's cadence -> the period phrase in the reminder copy.
const CADENCE_PHRASE = { weekly: "this week", monthly: "this month", quarterly: "this quarter" };
// Advance a date by the user's chosen cadence (mechanical — no plan is invented;
// the user chose the cadence, we only step the next date forward from it).
function nextFromCadence(iso, cadence) {
  const d = new Date(iso + "T00:00:00");
  if (cadence === "weekly") d.setDate(d.getDate() + 7);
  else if (cadence === "quarterly") d.setMonth(d.getMonth() + 3);
  else d.setMonth(d.getMonth() + 1);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Formal-debt payoff simulation (interest accrues; extra goes to the focus debt).
function simulate(debts, strategy, extra) {
  let bal = debts.map((d) => ({ rem: Math.max(0, d.principal - d.paid), apr: d.apr || 0, min: d.minPayment || 0 })).filter((d) => d.rem > 0);
  if (bal.length === 0) return { months: 0, interest: 0, feasible: true };
  let interest = 0, months = 0;
  const CAP = 1200;
  while (bal.some((d) => d.rem > 0) && months < CAP) {
    months++;
    for (const d of bal) { const i = Math.round((d.rem * (d.apr / 100)) / 12); d.rem += i; interest += i; }
    let budget = bal.reduce((s, d) => s + d.min, 0) + extra;
    for (const d of bal) { const pay = Math.min(d.min, d.rem); d.rem -= pay; budget -= pay; }
    const order = [...bal].filter((d) => d.rem > 0).sort((a, b) => (strategy === "avalanche" ? b.apr - a.apr : a.rem - b.rem));
    for (const d of order) { if (budget <= 0) break; const pay = Math.min(budget, d.rem); d.rem -= pay; budget -= pay; }
    bal = bal.filter((d) => d.rem > 0.5);
    if (extra === 0 && bal.every((d) => d.min === 0)) return { months: Infinity, interest: Infinity, feasible: false };
  }
  return { months, interest, feasible: months < CAP };
}

export default function Debt({ t, user, data, state, ops }) {
  const { currency, locale } = user;
  const debts = data.debts;
  const money = (v) => fmtMoney(v, currency, locale);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ kind: "informal", counterparty: "", direction: "owe", since: todayISO(), name: "", principal: "", paid: "", apr: "", minPayment: "" });
  const [extraStr, setExtraStr] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const label = "add-debt-modal";
  const [planFor, setPlanFor] = useState(null); // debt whose reminder plan is being edited
  const [plan, setPlan] = useState({ amount: "", cadence: "monthly" });
  const [confirmDel, setConfirmDel] = useState(null); // debt pending deletion

  // Deleting a debt is permanent and has no undo, unlike a transaction.
  const doDelete = async () => {
    if (!confirmDel) return;
    setBusy(true);
    try { await ops.remove(confirmDel.id); setConfirmDel(null); }
    catch (e) { setErr(e.message); setConfirmDel(null); } finally { setBusy(false); }
  };

  const informal = useMemo(() => debts.filter((d) => d.kind === "informal"), [debts]);
  const formal = useMemo(() => debts.filter((d) => d.kind !== "informal"), [debts]);
  const owe = informal.filter((d) => d.direction === "owe");
  const owed = informal.filter((d) => d.direction === "owed");

  const totalOwe = owe.reduce((s, d) => s + Math.max(0, d.principal - d.paid), 0) + formal.reduce((s, d) => s + Math.max(0, d.principal - d.paid), 0);
  const totalOwed = owed.reduce((s, d) => s + Math.max(0, d.principal - d.paid), 0);

  const extra = toMinor(Number(extraStr) || 0, currency);
  const avalanche = useMemo(() => simulate(formal, "avalanche", extra), [formal, extra]);
  const snowball = useMemo(() => simulate(formal, "snowball", extra), [formal, extra]);
  // Baseline (no extra) so we can show what the slider's extra payment BUYS you.
  const baseline = useMemo(() => simulate(formal, "avalanche", 0), [formal]);
  const monthsSaved = baseline.feasible && avalanche.feasible ? Math.max(0, baseline.months - avalanche.months) : null;
  const interestSaved = baseline.feasible && avalanche.feasible ? Math.max(0, baseline.interest - avalanche.interest) : null;
  const totalFormalRem = formal.reduce((s, d) => s + Math.max(0, d.principal - d.paid), 0);
  // Slider ceiling: roughly enough to clear everything in ~6 months, rounded, min 1000.
  const sliderMaxMajor = Math.max(1000, Math.ceil(toMajor(totalFormalRem, currency) / 6 / 500) * 500);
  const sliderStep = sliderMaxMajor >= 5000 ? 500 : 100;
  const barData = useMemo(() => formal.map((d) => ({ name: d.name, Paid: d.paid, Remaining: Math.max(0, d.principal - d.paid) })), [formal]);
  const tip = chartTooltip(t);

  const doAdd = async () => {
    const isInformal = form.kind === "informal";
    const displayName = isInformal ? form.counterparty.trim() : form.name.trim();
    if (!displayName || !(Number(form.principal) > 0)) { setErr(isInformal ? "A name and amount are required." : "Name and amount owed are required."); return; }
    setBusy(true); setErr("");
    try {
      await ops.add(isInformal
        ? { kind: "informal", name: displayName, counterparty: displayName, direction: form.direction, since: form.since || null, principal: toMinor(form.principal, currency), paid: form.paid ? toMinor(form.paid, currency) : 0 }
        : { kind: "formal", name: displayName, direction: "owe", since: form.since || null, principal: toMinor(form.principal, currency), paid: form.paid ? toMinor(form.paid, currency) : 0, apr: Number(form.apr) || 0, minPayment: form.minPayment ? toMinor(form.minPayment, currency) : 0 });
      burst(2);
      setForm({ kind: "informal", counterparty: "", direction: "owe", since: todayISO(), name: "", principal: "", paid: "", apr: "", minPayment: "" });
      setShowAdd(false);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  // --- Mode 2: optional user-set repayment plan (never guessed) ---
  const openPlan = (d) => {
    setErr("");
    setPlan({ amount: d.reminderAmount != null ? String(toMajor(d.reminderAmount, currency)) : "", cadence: d.reminderCadence || "monthly" });
    setPlanFor(d);
  };
  const savePlan = async () => {
    if (!(Number(plan.amount) > 0)) { setErr("Enter the amount you plan to pay."); return; }
    setBusy(true); setErr("");
    try {
      await ops.update(planFor.id, {
        reminderAmount: toMinor(plan.amount, currency),
        reminderCadence: plan.cadence,
        nextReminder: nextFromCadence(todayISO(), plan.cadence),
      });
      burst(2);
      setPlanFor(null);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const removePlan = async (d) => {
    try { await ops.update(d.id, { reminderAmount: null, reminderCadence: null, nextReminder: null }); }
    catch (e) { setErr(e.message); }
  };

  if (state === "loading" || state === "idle") return <Loading t={t} />;

  const fmtMonths = (m) => (!Number.isFinite(m) ? "never at this rate" : m <= 0 ? "already clear" : `${m} month${m === 1 ? "" : "s"}`);

  const debtRow = (d) => {
    const rem = Math.max(0, d.principal - d.paid);
    const m = monthsOpen(d.since);
    const hasPlan = d.reminderAmount != null; // user set a plan
    const nudge = !hasPlan && m != null && m >= AGE_MONTHS; // age nudge only when there's no plan
    const linkBtn = { background: "transparent", border: "none", color: t.accentSoft, cursor: "pointer", fontSize: 11.5, fontWeight: 600, padding: 0 };
    return (
      <Card t={t} key={d.id} accent={d.direction === "owed" ? t.pos : hasPlan ? t.accentSoft : nudge ? t.warn : t.accent}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ width: 38, height: 38, borderRadius: 11, background: t.chip, display: "grid", placeItems: "center", color: d.direction === "owed" ? t.pos : t.accentSoft }}>
            {d.direction === "owed" ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: t.text }}>{d.counterparty || d.name}</div>
            <div style={{ fontSize: 12.5, color: nudge ? t.warn : t.faint, display: "flex", alignItems: "center", gap: 5 }}>
              <Clock size={12} /> {ageLabel(m) || (d.direction === "owed" ? "owes you" : "you owe")}
            </div>
          </div>
          <IconBtn t={t} label={`Remove ${d.counterparty || d.name}`} onClick={() => setConfirmDel(d)} style={{ marginLeft: "auto", color: t.faint }}><Trash2 size={15} /></IconBtn>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <strong className="sm-priv" style={{ fontSize: 20, color: t.text }}>{money(rem)}</strong>
          <span style={{ fontSize: 12.5, color: t.sub }}>{d.direction === "owed" ? "owed to you" : "you owe"}</span>
        </div>
        {/* Mode 2 — the user's OWN plan, echoed back. Never an invented amount. */}
        {hasPlan ? (
          <div style={{ margin: "10px 0 0", padding: "10px 12px", borderRadius: 10, background: t.surface2, border: `1px solid ${t.border}` }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <CalendarClock size={15} color={t.accentSoft} style={{ marginTop: 1, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: t.text, fontWeight: 500 }}>
                You planned to pay {d.counterparty || d.name} {money(d.reminderAmount)} {CADENCE_PHRASE[d.reminderCadence] || ""}.
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6, paddingLeft: 23 }}>
              <span style={{ fontSize: 11.5, color: t.faint }}>{money(d.reminderAmount)} {d.reminderCadence}{d.nextReminder ? ` · next ${fmtDate(d.nextReminder, locale)}` : ""}</span>
              <button onClick={() => openPlan(d)} className="sm-hover" style={linkBtn}>Edit</button>
              <button onClick={() => removePlan(d)} className="sm-hover" style={{ ...linkBtn, color: t.faint }}>Remove</button>
            </div>
          </div>
        ) : nudge ? (
          // Mode 1 — a true fact, gently surfaced. No fabricated amount or due date.
          <p style={{ margin: "10px 0 0", fontSize: 12.5, color: t.sub, lineHeight: 1.45 }}>
            {d.direction === "owed"
              ? `${d.counterparty || d.name} has owed you ${money(rem)} for ${m} months — worth a nudge?`
              : `You've owed ${d.counterparty || d.name} ${money(rem)} for ${m} months.`}{" "}
            <span style={{ color: t.faint }}>Sarmaya never messages anyone for you.</span>
          </p>
        ) : null}
        {/* Offer a plan only on money the USER owes, and only if none is set. */}
        {d.direction === "owe" && !hasPlan ? (
          <button onClick={() => openPlan(d)} className="sm-hover"
            style={{ marginTop: 10, background: "transparent", border: `1px solid ${t.border}`, borderRadius: 10, padding: "6px 12px", color: t.accentSoft, cursor: "pointer", fontSize: 12.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <CalendarClock size={14} /> Set a reminder
          </button>
        ) : null}
        {d.paid > 0 ? <div style={{ fontSize: 12, color: t.faint, marginTop: 8 }}>{money(d.paid)} settled so far</div> : null}
      </Card>
    );
  };

  const hasAny = debts.length > 0;

  return (
    <div className="sm-fade">
      <PageHeader t={t} title="Debt" sub="Money between people first — tracked by who and how long, not interest. Formal loans below."
        action={<Btn t={t} onClick={() => { setErr(""); setShowAdd(true); }}><Plus size={16} /> Add debt</Btn>} />

      {hasAny ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, marginBottom: 18 }}>
          <StatCard t={t} label="You owe" accent={t.neg} icon={<ArrowUpRight size={17} />} value={money(totalOwe)} count={{ amount: totalOwe, format: money }} />
          <StatCard t={t} label="Owed to you" accent={t.pos} icon={<ArrowDownLeft size={17} />} value={money(totalOwed)} count={{ amount: totalOwed, format: money }} hint="The one your bank never tracks" />
        </div>
      ) : null}

      {/* Informal — the default */}
      {informal.length ? (
        <>
          {owe.length ? (
            <>
              <h3 style={{ color: t.text, fontSize: 15, margin: "0 0 12px", display: "flex", alignItems: "center", gap: 8 }}><Users size={16} color={t.accentSoft} /> You owe</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 14, marginBottom: owed.length ? 20 : 14 }}>{owe.map(debtRow)}</div>
            </>
          ) : null}
          {owed.length ? (
            <>
              <h3 style={{ color: t.text, fontSize: 15, margin: "0 0 12px", display: "flex", alignItems: "center", gap: 8 }}><Users size={16} color={t.pos} /> Owed to you</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 14, marginBottom: 14 }}>{owed.map(debtRow)}</div>
            </>
          ) : null}
        </>
      ) : null}

      {/* Formal — for users who have it */}
      {formal.length ? (
        <>
          <h3 style={{ color: t.text, fontSize: 15, margin: "18px 0 12px", display: "flex", alignItems: "center", gap: 8 }}><CreditCard size={16} color={t.accentSoft} /> Formal loans</h3>
          <Card t={t} style={{ marginBottom: 14 }}>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ left: -8, right: 6, top: 6 }}>
                  <CartesianGrid {...gridProps(t)} />
                  <XAxis dataKey="name" {...axisProps(t)} />
                  <YAxis {...axisProps(t)} width={52} tickFormatter={(v) => fmtCompact(v, currency, locale)} />
                  <Tooltip {...tip} formatter={(v) => money(v)} cursor={{ fill: t.chip }} />
                  <Bar dataKey="Paid" stackId="a" fill={t.pos} />
                  <Bar dataKey="Remaining" stackId="a" fill={t.neg} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card t={t} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <h3 style={{ margin: 0, color: t.text, fontSize: 16 }}>Which debt to pay first</h3>
              <span style={{ fontSize: 11, color: t.faint, border: `1px dashed ${t.border}`, borderRadius: 999, padding: "2px 8px" }}>estimate</span>
            </div>
            <Field t={t} label={`Extra you could pay each month (${currency})`} hint="On top of minimums. Applied to the focus debt. Drag to simulate.">
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <input
                  type="range"
                  min={0}
                  max={sliderMaxMajor}
                  step={sliderStep}
                  value={Math.min(Number(extraStr) || 0, sliderMaxMajor)}
                  onChange={(e) => setExtraStr(e.target.value)}
                  aria-label="Extra monthly payment"
                  aria-valuetext={money(extra)}
                  style={{ flex: 1, minWidth: 200, accentColor: t.accent, cursor: "pointer" }}
                />
                <TextInput t={t} type="number" min="0" value={extraStr} onChange={(e) => setExtraStr(e.target.value)} placeholder="0" style={{ width: 130 }} />
              </div>
            </Field>
            {extra > 0 && monthsSaved != null && (monthsSaved > 0 || interestSaved > 0) ? (
              <div role="status" style={{ display: "flex", flexWrap: "wrap", gap: 16, padding: "12px 14px", borderRadius: 12, background: `${t.pos}14`, border: `1px solid ${t.pos}44`, marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 12, color: t.sub }}>Debt-free sooner</div>
                  <strong style={{ fontSize: 18, color: t.pos }}>{monthsSaved} month{monthsSaved === 1 ? "" : "s"}</strong>
                </div>
                <div style={{ borderLeft: `1px solid ${t.border}`, paddingLeft: 16 }}>
                  <div style={{ fontSize: 12, color: t.sub }}>Interest saved</div>
                  <strong className="sm-priv" style={{ fontSize: 18, color: t.pos }}>{Number.isFinite(interestSaved) ? money(interestSaved) : "—"}</strong>
                </div>
                <div style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12.5, color: t.sub, maxWidth: 220 }}>
                  …by paying <span className="sm-priv" style={{ color: t.text, fontWeight: 600 }}>{money(extra)}</span> more a month (highest-interest-first).
                </div>
              </div>
            ) : null}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginTop: 6 }}>
              {[["Highest interest first", "Avalanche", avalanche, "saves the most money overall"], ["Smallest balance first", "Snowball", snowball, "quick wins to build momentum"]].map(([title, orig, r, sub]) => (
                <div key={orig} style={{ padding: 14, borderRadius: 12, background: t.surface2, border: `1px solid ${t.border}` }}>
                  <div style={{ fontWeight: 700, color: t.text }}>{title}</div>
                  <div style={{ fontSize: 11, color: t.faint, marginBottom: 6 }}>{orig}</div>
                  <div style={{ fontSize: 13, color: t.sub, marginBottom: 10, lineHeight: 1.4 }}>{sub}</div>
                  <div style={{ fontSize: 13, color: t.sub }}>Clear in <strong style={{ color: t.text }}>{fmtMonths(r.months)}</strong></div>
                  <div style={{ fontSize: 13, color: t.sub }}>Total interest <strong style={{ color: t.text }}>{Number.isFinite(r.interest) ? money(r.interest) : "—"}</strong></div>
                </div>
              ))}
            </div>
          </Card>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 14 }}>
            {formal.map((d) => {
              const rem = Math.max(0, d.principal - d.paid);
              const pct = d.principal > 0 ? d.paid / d.principal : 0;
              return (
                <Card t={t} key={d.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <span style={{ width: 36, height: 36, borderRadius: 10, background: t.chip, display: "grid", placeItems: "center", color: t.accentSoft }}><CreditCard size={18} /></span>
                    <div><div style={{ fontWeight: 700, color: t.text }}>{d.name}</div><div style={{ fontSize: 12, color: t.faint }}>{d.apr > 0 ? `${d.apr}% APR` : "0% APR"}</div></div>
                    <IconBtn t={t} label={`Delete ${d.name}`} onClick={() => setConfirmDel(d)} style={{ marginLeft: "auto", color: t.faint }}><Trash2 size={15} /></IconBtn>
                  </div>
                  <ProgBar t={t} value={pct} />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 13, color: t.sub }}><span>{money(d.paid)} paid</span><span>{money(rem)} left</span></div>
                </Card>
              );
            })}
          </div>
        </>
      ) : null}

      {!hasAny ? (
        <Card t={t}><EmptyState t={t} icon={<Users size={20} />} title="Nothing tracked yet" hint="Add money you owe a friend, money owed to you, or a formal loan." action={<Btn t={t} onClick={() => setShowAdd(true)}>Add debt</Btn>} /></Card>
      ) : null}

      <Modal t={t} open={showAdd} onClose={() => setShowAdd(false)} title="Add a debt" labelId={label}>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {[["informal", "Between people"], ["formal", "Formal loan"]].map(([k, l]) => (
            <button key={k} onClick={() => setForm({ ...form, kind: k })} aria-pressed={form.kind === k} className="sm-hover"
              style={{ flex: 1, padding: "9px 12px", borderRadius: 12, fontSize: 13.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${form.kind === k ? t.accent : t.border}`, background: form.kind === k ? t.accent : "transparent", color: form.kind === k ? t.accentOn : t.sub }}>{l}</button>
          ))}
        </div>
        {form.kind === "informal" ? (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {[["owe", "I owe them"], ["owed", "They owe me"]].map(([k, l]) => (
                <button key={k} onClick={() => setForm({ ...form, direction: k })} aria-pressed={form.direction === k} className="sm-hover"
                  style={{ flex: 1, padding: "8px 12px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1px solid ${form.direction === k ? t.accent : t.border}`, background: "transparent", color: form.direction === k ? t.text : t.sub }}>{l}</button>
              ))}
            </div>
            <Field t={t} label="Who?"><TextInput t={t} value={form.counterparty} onChange={(e) => setForm({ ...form, counterparty: e.target.value })} placeholder="e.g. Ahmed" autoFocus /></Field>
            <div style={{ display: "flex", gap: 12 }}>
              <Field t={t} label={`Amount (${currency})`}><TextInput t={t} type="number" min="0" value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} /></Field>
              <Field t={t} label="Since"><TextInput t={t} type="date" value={form.since} onChange={(e) => setForm({ ...form, since: e.target.value })} /></Field>
            </div>
          </>
        ) : (
          <>
            <Field t={t} label="Name"><TextInput t={t} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Credit card" autoFocus /></Field>
            <div style={{ display: "flex", gap: 12 }}>
              <Field t={t} label={`Amount owed (${currency})`}><TextInput t={t} type="number" min="0" value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} /></Field>
              <Field t={t} label={`Already paid (${currency})`}><TextInput t={t} type="number" min="0" value={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.value })} /></Field>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <Field t={t} label="APR %"><TextInput t={t} type="number" min="0" value={form.apr} onChange={(e) => setForm({ ...form, apr: e.target.value })} /></Field>
              <Field t={t} label={`Min payment (${currency})`}><TextInput t={t} type="number" min="0" value={form.minPayment} onChange={(e) => setForm({ ...form, minPayment: e.target.value })} /></Field>
            </div>
          </>
        )}
        {err ? <div role="alert" style={{ color: t.neg, fontSize: 13, marginBottom: 10 }}>{err}</div> : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn t={t} kind="ghost" onClick={() => setShowAdd(false)}>Cancel</Btn>
          <Btn t={t} onClick={doAdd} disabled={busy}>Add debt</Btn>
        </div>
      </Modal>

      {/* Mode 2 — set your OWN repayment plan. The app never picks the number. */}
      <Modal t={t} open={!!planFor} onClose={() => setPlanFor(null)} title={planFor ? `Reminder — ${planFor.counterparty || planFor.name}` : ""} labelId="plan-modal">
        <p style={{ margin: "0 0 14px", fontSize: 13, color: t.sub, lineHeight: 1.5 }}>
          Your plan, your numbers — Sarmaya won't guess an amount or a schedule, and never messages {planFor?.counterparty || "anyone"}. Leave it off and you'll just get a gentle age reminder.
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          <Field t={t} label={`I'll pay (${currency})`}><TextInput t={t} type="number" min="1" value={plan.amount} onChange={(e) => setPlan({ ...plan, amount: e.target.value })} placeholder="e.g. 2000" autoFocus /></Field>
          <Field t={t} label="How often"><Select t={t} value={plan.cadence} onChange={(e) => setPlan({ ...plan, cadence: e.target.value })}>
            <option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option>
          </Select></Field>
        </div>
        {err ? <div role="alert" style={{ color: t.neg, fontSize: 13, marginBottom: 10 }}>{err}</div> : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {planFor && planFor.reminderAmount != null ? <Btn t={t} kind="danger" onClick={() => { removePlan(planFor); setPlanFor(null); }} style={{ marginRight: "auto" }}>Remove plan</Btn> : null}
          <Btn t={t} kind="ghost" onClick={() => setPlanFor(null)}>Cancel</Btn>
          <Btn t={t} onClick={savePlan} disabled={busy}>Save reminder</Btn>
        </div>
      </Modal>

      <ConfirmDialog
        t={t}
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={doDelete}
        busy={busy}
        title="Delete this debt?"
        body={confirmDel
          ? `“${confirmDel.counterparty || confirmDel.name}” and its repayment history will be permanently removed. This can't be undone.`
          : ""}
        confirmLabel="Delete debt"
      />
    </div>
  );
}
