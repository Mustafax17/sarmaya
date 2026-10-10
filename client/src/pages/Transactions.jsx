import { useMemo, useRef, useState } from "react";
import { Plus, X, ArrowUpRight, ArrowDownRight, Wallet, Undo2, ThumbsUp, ThumbsDown, Check, Pencil, Receipt, AlertTriangle } from "lucide-react";
import { fmtMoney, fmtDate, toMinor, toMajor, todayISO } from "../lib/format.js";
import { parseNL } from "../lib/stats.js";
import { api, ApiError } from "../lib/api.js";
import { catColor } from "../theme.js";
import { catIcon } from "../lib/icons.js";
import { Card, Btn, IconBtn, EmptyState, Loading, TextInput, Select, Field, Spinner } from "../components/ui.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { burst } from "../lib/glitter.js";

const CATEGORIES = ["Food", "Transport", "Fuel", "Utilities", "Shopping", "Entertainment", "Health", "Education", "Bills"];
// One-tap "why", offered AFTER a save. Fully optional, never blocks.
const TRIGGERS = [["planned", "Planned"], ["with_friends", "With friends"], ["hungry", "Hungry"], ["bored", "Bored"], ["stressed", "Stressed"], ["celebrating", "Celebrating"], ["other", "Other"]];
// role -> {type, kind}. Obligations (money that isn't a choice) are logged here too.
const ROLE_MAP = { expense: { type: "out", kind: "discretionary" }, obligation: { type: "out", kind: "obligation" }, income: { type: "in", kind: "income" } };

export default function Transactions({ t, user, data, state, query, setQuery, addTransaction, deleteTransaction, restoreTransaction, tagTransaction }) {
  const { currency, locale } = user;
  const txs = data.transactions;

  const [entry, setEntry] = useState("");
  const [parseError, setParseError] = useState("");
  const [preview, setPreview] = useState(null); // parsed result awaiting confirm
  const [previewEdit, setPreviewEdit] = useState(false); // chips vs editable fields
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", cat: "Food", amount: "", role: "expense", date: todayISO() });
  const [filter, setFilter] = useState("All");
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState(null); // last deleted tx
  const [justAdded, setJustAdded] = useState(null); // new discretionary expense awaiting an optional tag
  const [err, setErr] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState(""); // why a scan didn't fill everything in
  const fileRef = useRef(null);

  const money = (v) => fmtMoney(v, currency, locale);

  const runParse = () => {
    const p = parseNL(entry);
    if (!p.ok) { setParseError(p.error); setPreview(null); return; }
    setParseError(""); setScanNote("");
    setPreview(p);
    setPreviewEdit(false);
  };

  const confirmParsed = async () => {
    if (!preview) return;
    if (!(Number(preview.amountMajor) > 0)) { setErr("Enter the amount before saving."); return; }
    setBusy(true); setErr("");
    try {
      const kind = preview.type === "in" ? "income" : "discretionary";
      const tx = await addTransaction({ name: preview.name, cat: preview.cat, amount: toMinor(preview.amountMajor, currency), type: preview.type, kind, date: preview.date || todayISO() });
      burst(2);
      setEntry(""); setPreview(null); setScanNote("");
      if (kind === "discretionary") setJustAdded(tx);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  // --- Receipt scan. Produces a DRAFT for the same confirm card above; nothing
  // is saved until the user presses Confirm, exactly like typed entry. Any
  // failure falls back to the text box rather than surfacing a dead end. ---
  const readAsBase64 = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("Couldn't read that file."));
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.readAsDataURL(file);
  });

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be picked again after a failure
    if (!file) return;
    setErr(""); setScanNote(""); setParseError(""); setPreview(null);
    if (file.size > 5 * 1024 * 1024) { setScanNote("That file is over 5MB. Try a smaller photo, or type it in below."); return; }
    setScanning(true);
    try {
      const base64 = await readAsBase64(file);
      const { draft } = await api.scanReceipt(base64, file.type);
      const notes = [];
      if (draft.currencyMismatch) notes.push(`That looks like a ${draft.receiptCurrency} receipt but your account is in ${currency}. Sarmaya doesn't convert, so enter the amount yourself.`);
      else if (draft.amountMinor == null) notes.push("Couldn't read the total clearly — fill it in and save.");
      if (draft.confidence === "low" && !notes.length) notes.push("Some of this was hard to read. Check it before saving.");
      setScanNote(notes.join(" "));
      setPreview({
        ok: true,
        amountMajor: draft.amountMinor != null ? toMajor(draft.amountMinor, currency) : "",
        cat: draft.suggestedCategory || "Food",
        name: draft.merchant || "",
        type: "out",
        date: draft.date || todayISO(),
        fromReceipt: true,
        confidence: draft.confidence,
        categoryGuessed: !draft.suggestedCategory,
      });
      // Anything unresolved opens straight into the editable fields.
      setPreviewEdit(draft.amountMinor == null || !draft.merchant || !draft.suggestedCategory);
    } catch (e2) {
      const msg = e2 instanceof ApiError && e2.code === "coach_off"
        ? "Receipt scanning is off because you've turned off sending your data to the AI. Turn it back on in Settings, or type it in below."
        : e2 instanceof ApiError ? `${e2.message}` : "Couldn't read that receipt. Type it in below instead.";
      setScanNote(msg);
    } finally { setScanning(false); }
  };

  const submitForm = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !(Number(form.amount) > 0)) { setErr("Enter a name and a positive amount."); return; }
    setBusy(true); setErr("");
    try {
      const { type, kind } = ROLE_MAP[form.role];
      const tx = await addTransaction({ name: form.name.trim(), cat: form.cat, amount: toMinor(form.amount, currency), type, kind, date: form.date });
      burst(2);
      setForm({ name: "", cat: "Food", amount: "", role: "expense", date: todayISO() });
      setShowForm(false);
      if (kind === "discretionary") setJustAdded(tx);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  // Post-save tagging — never blocks the save; updates the row in place.
  const tagField = async (patch) => {
    if (!justAdded) return;
    try { const tx = await tagTransaction(justAdded.id, patch); setJustAdded(tx); }
    catch (e) { setErr(e.message); }
  };
  const tagChip = (active) => ({ padding: "5px 11px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${active ? t.accent : t.border}`, background: active ? t.accent : "transparent", color: active ? t.accentOn : t.sub });

  const remove = async (tx) => {
    setErr("");
    try {
      await deleteTransaction(tx);
      setUndo(tx);
      setTimeout(() => setUndo((u) => (u && u.id === tx.id ? null : u)), 6000);
    } catch (e) { setErr(e.message); }
  };

  const doUndo = async () => {
    if (!undo) return;
    const tx = undo; setUndo(null);
    try { await restoreTransaction(tx); } catch (e) { setErr(e.message); }
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...txs]
      .filter((x) => (filter === "All" ? true : x.cat === filter))
      .filter((x) => (q ? `${x.name} ${x.cat}`.toLowerCase().includes(q) : true))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [txs, filter, query]);

  if (state === "loading" || state === "idle") return <Loading t={t} />;

  return (
    <div className="sm-fade">
      <PageHeader t={t} title="Transactions" sub="Type it the way you'd say it — “spent 1850 on foodpanda”, “2k petrol”, “salary 185000”. Or scan a receipt and check what it read." />

      <Card t={t} style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <TextInput t={t} value={entry} invalid={!!parseError}
            onChange={(e) => { setEntry(e.target.value); setParseError(""); setPreview(null); }}
            onKeyDown={(e) => e.key === "Enter" && runParse()}
            placeholder="e.g. spent 1200 on groceries" aria-label="Add transaction in natural language"
            style={{ flex: 1, minWidth: 200 }} />
          <Btn t={t} onClick={runParse}><Plus size={16} /> Parse</Btn>
          <Btn t={t} kind="ghost" onClick={() => fileRef.current?.click()} disabled={scanning} aria-label="Scan a receipt">
            {scanning ? <Spinner t={t} size={16} /> : <Receipt size={16} />} {scanning ? "Reading your receipt…" : "Scan receipt"}
          </Btn>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" onChange={onFile} style={{ display: "none" }} tabIndex={-1} />
        </div>
        {parseError ? <div role="alert" style={{ color: t.neg, fontSize: 13, marginTop: 8 }}>{parseError}</div> : null}
        {scanNote ? (
          <div className="sm-fade" style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 10, padding: "10px 13px", borderRadius: 10, background: `${t.warn}14`, border: `1px solid ${t.warn}44` }}>
            <AlertTriangle size={16} color={t.warn} style={{ marginTop: 1, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: t.sub, lineHeight: 1.5 }}>{scanNote}</span>
          </div>
        ) : null}

        {preview ? (
          <div className="sm-fade" role="group" aria-label="Parsed transaction preview" style={{ marginTop: 12, padding: 14, borderRadius: 12, background: t.surface2, border: `1px solid ${t.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: t.sub }}>
                {preview.fromReceipt ? "Here's what I read off your receipt — check it, then save:" : "Here's what I read — check it, then save:"}
              </span>
              {preview.fromReceipt && preview.confidence !== "high" ? (
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", color: t.warn, background: `${t.warn}1F`, border: `1px solid ${t.warn}55`, borderRadius: 999, padding: "1px 8px" }}>
                  {preview.confidence === "low" ? "Low confidence" : "Please check"}
                </span>
              ) : null}
            </div>
            {previewEdit ? (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
                <TextInput t={t} type="number" min="0" step="any" value={preview.amountMajor} onChange={(e) => setPreview({ ...preview, amountMajor: e.target.value === "" ? "" : Number(e.target.value) })} placeholder={currency} style={{ width: 120 }} aria-label="Amount" />
                <Select t={t} value={preview.cat} onChange={(e) => setPreview({ ...preview, cat: e.target.value, categoryGuessed: false })} style={{ width: 150 }} aria-label="Category">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
                <Select t={t} value={preview.type} onChange={(e) => setPreview({ ...preview, type: e.target.value })} style={{ width: 120 }} aria-label="Type">
                  <option value="out">Expense</option><option value="in">Income</option>
                </Select>
                {preview.fromReceipt ? (
                  <TextInput t={t} type="date" value={preview.date} onChange={(e) => setPreview({ ...preview, date: e.target.value })} style={{ width: 160 }} aria-label="Date" />
                ) : null}
                <TextInput t={t} value={preview.name} onChange={(e) => setPreview({ ...preview, name: e.target.value })} placeholder="Merchant or note" style={{ flex: 1, minWidth: 160 }} aria-label="Merchant or note" />
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                {[
                  ["Amount", <span key="a" className="sm-priv">{money(toMinor(preview.amountMajor, currency))}</span>, true],
                  ["Category", preview.cat, false],
                  ["Type", preview.type === "in" ? "Income" : "Expense", false],
                  ...(preview.fromReceipt ? [["Date", fmtDate(preview.date, locale), false]] : []),
                  [preview.type === "in" ? "Note" : "Merchant / note", preview.name, false],
                ].map(([label, value, strong]) => (
                  <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 13px", borderRadius: 999, background: t.chip, border: `1px solid ${t.border}` }}>
                    <span style={{ fontSize: 10.5, color: t.faint, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>{label}</span>
                    <span style={{ fontSize: 13.5, color: t.text, fontWeight: strong ? 700 : 600 }}>{value}</span>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Btn t={t} kind="ghost" onClick={() => setPreviewEdit((e) => !e)} aria-pressed={previewEdit}><Pencil size={15} /> {previewEdit ? "Done editing" : "Edit"}</Btn>
              <Btn t={t} onClick={confirmParsed} disabled={busy}><Check size={16} /> Confirm &amp; Save</Btn>
            </div>
          </div>
        ) : null}

        <button onClick={() => setShowForm((s) => !s)} className="sm-hover" style={{ marginTop: 12, background: "transparent", border: "none", color: t.accentSoft, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
          {showForm ? "Hide detailed form" : "Prefer a form? Add manually"}
        </button>
        {showForm ? (
          <form onSubmit={submitForm} className="sm-fade" style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, alignItems: "end" }}>
            <Field t={t} label="Name"><TextInput t={t} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Dinner" /></Field>
            <Field t={t} label="Category"><Select t={t} value={form.cat} onChange={(e) => setForm({ ...form, cat: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
            <Field t={t} label={`Amount (${currency})`}><TextInput t={t} type="number" min="0" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" /></Field>
            <Field t={t} label="Type"><Select t={t} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="expense">Expense</option><option value="obligation">Obligation (not a choice)</option><option value="income">Income</option></Select></Field>
            <Field t={t} label="Date"><TextInput t={t} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Btn t={t} type="submit" disabled={busy} style={{ height: 42 }}>Add</Btn>
          </form>
        ) : null}
        {err ? <div role="alert" style={{ color: t.neg, fontSize: 13, marginTop: 8 }}>{err}</div> : null}
      </Card>

      {justAdded ? (
        <Card t={t} accent={t.accent} className="sm-fade" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <span style={{ fontSize: 13.5, color: t.text, fontWeight: 500 }}>Added “{justAdded.name}”. How did it feel?</span>
            <span style={{ fontSize: 12, color: t.faint }}>optional — powers your Patterns</span>
            <Btn t={t} kind="ghost" onClick={() => setJustAdded(null)} style={{ marginLeft: "auto", padding: "5px 12px" }}>Done</Btn>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {TRIGGERS.map(([k, label]) => (
              <button key={k} aria-pressed={justAdded.trigger === k} onClick={() => tagField({ trigger: k })} className="sm-hover" style={tagChip(justAdded.trigger === k)}>{label}</button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: t.sub }}>Worth it?</span>
            <IconBtn t={t} label="Worth it" onClick={() => tagField({ worthIt: true })} active={justAdded.worthIt === true} style={{ width: 36, height: 36, color: justAdded.worthIt === true ? t.pos : t.sub }}><ThumbsUp size={16} /></IconBtn>
            <IconBtn t={t} label="Not worth it" onClick={() => tagField({ worthIt: false })} active={justAdded.worthIt === false} style={{ width: 36, height: 36, color: justAdded.worthIt === false ? t.neg : t.sub }}><ThumbsDown size={16} /></IconBtn>
          </div>
        </Card>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {["All", ...CATEGORIES].map((c) => (
          <button key={c} onClick={() => setFilter(c)} aria-pressed={filter === c} className="sm-hover"
            style={{ padding: "6px 12px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1px solid ${filter === c ? t.accent : t.border}`, background: filter === c ? t.accent : "transparent", color: filter === c ? "#fff" : t.sub }}>
            {c}
          </button>
        ))}
      </div>

      {undo ? (
        <div className="sm-fade" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, background: t.surface2, border: `1px solid ${t.border}`, marginBottom: 12 }}>
          <span style={{ color: t.sub, fontSize: 14 }}>Deleted “{undo.name}”.</span>
          <Btn t={t} kind="ghost" onClick={doUndo} style={{ marginLeft: "auto", padding: "6px 12px" }}><Undo2 size={15} /> Undo</Btn>
        </div>
      ) : null}

      <Card t={t} style={{ padding: 8 }}>
        {visible.length ? (
          <div>
            {visible.map((tx) => {
              const I = catIcon(tx.cat);
              return (
                <div key={tx.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px", borderBottom: `1px solid ${t.border}` }}>
                  <span style={{ width: 34, height: 34, borderRadius: 10, background: t.chip, display: "grid", placeItems: "center", color: catColor(tx.cat) }}>
                    {tx.type === "in" ? <ArrowUpRight size={16} color={t.pos} /> : <I size={16} />}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: t.text, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 7 }}>
                      {tx.name}
                      {tx.estimated ? <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", color: t.warn, background: `${t.warn}1F`, border: `1px solid ${t.warn}55`, borderRadius: 999, padding: "1px 7px", flexShrink: 0 }}>Estimated</span> : null}
                    </div>
                    <div style={{ color: t.faint, fontSize: 12 }}>{fmtDate(tx.date, locale)} · {tx.cat}</div>
                  </div>
                  {tx.estimated ? (
                    <button onClick={() => tagTransaction(tx.id, { estimated: false })} className="sm-hover" title="Confirm this is your actual amount"
                      style={{ background: "transparent", border: `1px solid ${t.border}`, borderRadius: 8, padding: "5px 10px", color: t.accentSoft, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
                      Confirm
                    </button>
                  ) : null}
                  <div className="sm-priv" style={{ fontWeight: 700, color: tx.type === "in" ? t.pos : t.text, flexShrink: 0 }}>
                    {tx.type === "in" ? "+" : "−"}{money(tx.amount)}
                  </div>
                  <IconBtn t={t} label={`Delete ${tx.name}`} onClick={() => remove(tx)} style={{ color: t.faint }}><X size={16} /></IconBtn>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState t={t} icon={<Wallet size={20} />} title={query || filter !== "All" ? "No matches" : "No transactions yet"} hint={query || filter !== "All" ? "Try a different search or filter." : "Add your first above — in plain language or via the form."} />
        )}
      </Card>
    </div>
  );
}
