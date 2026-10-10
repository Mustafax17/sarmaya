import { useState } from "react";
import { Trophy, Plus, Flame, Check, X } from "lucide-react";
import { CHALLENGE_COPY } from "../lib/icons.js";
import { resolveIcon } from "../lib/icons.js";
import { Card, Btn, IconBtn, Chip, EmptyState, Loading, ConfirmDialog } from "../components/ui.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { burst } from "../lib/glitter.js";

const ALL_KEYS = Object.keys(CHALLENGE_COPY);

export default function Challenges({ t, data, state, ops }) {
  const joined = data.challenges;
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(null); // challenge pending leave

  const byKey = new Map(joined.map((c) => [c.key, c]));
  const available = ALL_KEYS.filter((k) => !byKey.has(k));

  // `celebrate` true for joins / streak bumps (Tier 3 on a fresh streak win),
  // false for leaving. Never glitters on failure.
  const run = async (id, fn, celebrate = false) => {
    setBusy(id); setErr("");
    try { const r = await fn(); if (celebrate) burst(r && r.streak && r.streak % 7 === 0 ? 3 : 2); } catch (e) { setErr(e.message); } finally { setBusy(""); }
  };

  if (state === "loading" || state === "idle") return <Loading t={t} />;

  return (
    <div className="sm-fade">
      <PageHeader t={t} title="Challenges" sub="Small, joinable habits with streaks. Bump your streak each day you keep it up."
        action={joined.length ? <Chip t={t} color={t.pos}><Trophy size={14} /> {joined.length} active</Chip> : null} />

      {joined.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 14, marginBottom: 20 }}>
          {joined.map((c) => {
            const copy = CHALLENGE_COPY[c.key] || { name: c.key, desc: "", iconName: "Trophy" };
            const I = resolveIcon(copy.iconName);
            return (
              <Card t={t} key={c.id} className="sm-lift">
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ width: 40, height: 40, borderRadius: 12, background: t.chip, display: "grid", placeItems: "center", color: t.accentSoft }}><I size={18} /></span>
                  <div>
                    <div style={{ fontWeight: 700, color: t.text }}>{copy.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: t.warn, fontWeight: 600 }}>
                      <Flame size={13} /> {c.streak} day streak
                    </div>
                  </div>
                  <IconBtn t={t} label={`Leave ${copy.name}`} onClick={() => setConfirmLeave({ ...c, name: copy.name })} style={{ marginLeft: "auto", color: t.faint }}><X size={16} /></IconBtn>
                </div>
                <p style={{ margin: "0 0 12px", fontSize: 13, color: t.sub, lineHeight: 1.5 }}>{copy.desc}</p>
                <Btn t={t} onClick={() => run(c.id, () => ops.update(c.id, { streak: c.streak + 1 }), true)} disabled={busy === c.id} style={{ width: "100%" }}>
                  <Check size={15} /> Log today (+1)
                </Btn>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card t={t} style={{ marginBottom: 20 }}><EmptyState t={t} icon={<Trophy size={20} />} title="No active challenges" hint="Join one below to start a streak." /></Card>
      )}

      {available.length ? (
        <>
          <h3 style={{ color: t.text, fontSize: 16, margin: "0 0 12px" }}>Join a challenge</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 14 }}>
            {available.map((k) => {
              const copy = CHALLENGE_COPY[k];
              const I = resolveIcon(copy.iconName);
              return (
                <Card t={t} key={k}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span style={{ width: 40, height: 40, borderRadius: 12, background: t.chip, display: "grid", placeItems: "center", color: t.sub }}><I size={18} /></span>
                    <div style={{ fontWeight: 700, color: t.text }}>{copy.name}</div>
                  </div>
                  <p style={{ margin: "0 0 12px", fontSize: 13, color: t.sub, lineHeight: 1.5 }}>{copy.desc}</p>
                  <Btn t={t} kind="subtle" onClick={() => run(k, () => ops.join(k), true)} disabled={busy === k} style={{ width: "100%" }}><Plus size={15} /> Join</Btn>
                </Card>
              );
            })}
          </div>
        </>
      ) : null}
      {err ? <div role="alert" style={{ color: t.neg, fontSize: 13, marginTop: 12 }}>{err}</div> : null}

      {/* Leaving resets the streak to zero — worth one question first. */}
      <ConfirmDialog
        t={t}
        open={!!confirmLeave}
        onClose={() => setConfirmLeave(null)}
        onConfirm={() => { const c = confirmLeave; setConfirmLeave(null); run(c.id, () => ops.leave(c.id)); }}
        busy={!!busy}
        title="Leave this challenge?"
        body={confirmLeave
          ? `You'll lose your ${confirmLeave.streak}-day streak on “${confirmLeave.name}”. You can rejoin, but the streak starts again at zero.`
          : ""}
        confirmLabel="Leave challenge"
      />
    </div>
  );
}
