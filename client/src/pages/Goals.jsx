import { useId, useState } from "react";
import { Plus, Check, Target, Trash2 } from "lucide-react";
import { fmtMoney, toMinor } from "../lib/format.js";
import { resolveIcon, GOAL_LIBRARY } from "../lib/icons.js";
import { Card, Btn, IconBtn, Ring, Chip, EmptyState, Loading, Modal, ConfirmDialog, Field, TextInput, Select } from "../components/ui.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { burst } from "../lib/glitter.js";

export default function Goals({ t, user, data, state, ops }) {
  const { currency, locale } = user;
  const goals = data.goals;
  const money = (v) => fmtMoney(v, currency, locale);

  const [contribute, setContribute] = useState(null);
  const [amount, setAmount] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newGoal, setNewGoal] = useState({ name: "", iconName: "Target", target: "" });
  const [busy, setBusy] = useState(false);
  // One error slot per dialog — a shared one leaks the add form's message into
  // the contribute form and vice versa.
  const [cErr, setCErr] = useState("");
  const [aErr, setAErr] = useState("");
  const [confirmDel, setConfirmDel] = useState(null); // goal pending deletion
  const cLabel = useId();
  const aLabel = useId();

  const doContribute = async () => {
    const v = Number(amount);
    // Previously a silent no-op: pressing Add funds with an empty box did
    // nothing and said nothing.
    if (!(v > 0)) { setCErr("Enter an amount greater than zero."); return; }
    setBusy(true); setCErr("");
    try {
      const g = contribute;
      const updated = await ops.update(g.id, { saved: g.saved + toMinor(v, currency) });
      const reached = updated.saved >= updated.target && g.saved < g.target;
      burst(reached ? 3 : 2); // Tier 3 milestone on completion, else Tier 2 action
      setContribute(null); setAmount("");
    } catch (e) { setCErr(e.message); } finally { setBusy(false); }
  };

  const doAdd = async () => {
    if (!newGoal.name.trim() || !(Number(newGoal.target) > 0)) { setAErr("Name and a target amount are required."); return; }
    setBusy(true); setAErr("");
    try {
      await ops.add({ name: newGoal.name.trim(), iconName: newGoal.iconName, target: toMinor(newGoal.target, currency), saved: 0 });
      burst(2);
      setNewGoal({ name: "", iconName: "Target", target: "" }); setShowAdd(false);
    } catch (e) { setAErr(e.message); } finally { setBusy(false); }
  };

  const doDelete = async () => {
    if (!confirmDel) return;
    setBusy(true);
    try { await ops.remove(confirmDel.id); setConfirmDel(null); }
    catch (e) { setCErr(e.message); setConfirmDel(null); } finally { setBusy(false); }
  };

  if (state === "loading" || state === "idle") return <Loading t={t} />;

  return (
    <div className="sm-fade">
      <PageHeader t={t} title="Goals" sub="Save toward what matters. Contributions update progress instantly."
        action={<Btn t={t} onClick={() => { setAErr(""); setShowAdd(true); }}><Plus size={16} /> New goal</Btn>} />

      {goals.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 14 }}>
          {goals.map((g) => {
            const pct = g.target > 0 ? g.saved / g.target : 0;
            const done = g.saved >= g.target;
            const I = resolveIcon(g.iconName);
            return (
              <Card t={t} key={g.id} className="sm-lift" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
                <div style={{ position: "relative", width: "100%", display: "flex", justifyContent: "center" }}>
                  <Ring t={t} value={pct} color={done ? t.pos : t.accent}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                      <I size={18} color={t.sub} />
                      <strong style={{ color: t.text, fontSize: 18 }}>{Math.round(pct * 100)}%</strong>
                    </div>
                  </Ring>
                  <IconBtn t={t} label={`Delete ${g.name}`} onClick={() => setConfirmDel(g)} style={{ position: "absolute", top: -4, right: -4, width: 32, height: 32, color: t.faint }}><Trash2 size={15} /></IconBtn>
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: t.text }}>{g.name}</div>
                  <div style={{ color: t.sub, fontSize: 13, marginTop: 2 }}>{money(g.saved)} of {money(g.target)}</div>
                </div>
                {done ? <Chip t={t} color={t.pos}><Check size={13} /> Reached</Chip>
                  : <Btn t={t} kind="subtle" onClick={() => { setCErr(""); setContribute(g); }} style={{ width: "100%" }}><Plus size={15} /> Add funds</Btn>}
              </Card>
            );
          })}
        </div>
      ) : (
        <Card t={t}><EmptyState t={t} icon={<Target size={20} />} title="No goals yet" hint="Create one to start tracking progress." action={<Btn t={t} onClick={() => setShowAdd(true)}>New goal</Btn>} /></Card>
      )}

      <ConfirmDialog
        t={t}
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={doDelete}
        busy={busy}
        title="Delete this goal?"
        body={confirmDel ? `“${confirmDel.name}” and its progress of ${money(confirmDel.saved)} will be permanently removed. This can't be undone.` : ""}
        confirmLabel="Delete goal"
      />

      {/* Contribute modal */}
      <Modal t={t} open={!!contribute} onClose={() => { setContribute(null); setCErr(""); }} title={contribute ? `Add to ${contribute.name}` : ""} labelId={cLabel}>
        <Field t={t} label={`Amount (${currency})`} error={cErr}>
          <TextInput t={t} type="number" min="1" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doContribute()} autoFocus />
        </Field>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn t={t} kind="ghost" onClick={() => { setContribute(null); setCErr(""); }}>Cancel</Btn>
          <Btn t={t} onClick={doContribute} disabled={busy}>Add funds</Btn>
        </div>
      </Modal>

      {/* Add goal modal */}
      <Modal t={t} open={showAdd} onClose={() => { setShowAdd(false); setAErr(""); }} title="New goal" labelId={aLabel}>
        <Field t={t} label="Name"><TextInput t={t} value={newGoal.name} onChange={(e) => setNewGoal({ ...newGoal, name: e.target.value })} placeholder="e.g. New laptop" autoFocus /></Field>
        <Field t={t} label="Icon">
          <Select t={t} value={newGoal.iconName} onChange={(e) => setNewGoal({ ...newGoal, iconName: e.target.value })}>
            {GOAL_LIBRARY.map((g) => <option key={g.iconName} value={g.iconName}>{g.name}</option>)}
            <option value="Target">Other</option>
          </Select>
        </Field>
        <Field t={t} label={`Target amount (${currency})`} error={aErr}><TextInput t={t} type="number" min="1" step="any" value={newGoal.target} onChange={(e) => setNewGoal({ ...newGoal, target: e.target.value })} placeholder="e.g. 250000" /></Field>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn t={t} kind="ghost" onClick={() => { setShowAdd(false); setAErr(""); }}>Cancel</Btn>
          <Btn t={t} onClick={doAdd} disabled={busy}>Create goal</Btn>
        </div>
      </Modal>
    </div>
  );
}
