import { useEffect, useState } from "react";
import { Users, Copy, Download, Check, ShieldCheck, Mail, Send } from "lucide-react";
import { api } from "../lib/api.js";
import { fmtDate } from "../lib/format.js";
import { PageHeader } from "../components/PageHeader.jsx";
import { Card, Btn, Loading, ErrorNote, Chip } from "../components/ui.jsx";

// CSV-escape a field (quote if it contains a comma, quote or newline).
const csv = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export default function Admin({ t, user }) {
  const [rows, setRows] = useState([]);
  const [state, setState] = useState("loading");
  const [copied, setCopied] = useState(false);
  const [mail, setMail] = useState(null); // { configured, dueForReminder }
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState("");
  const locale = user.locale || "en-US";

  const load = () => {
    setState("loading");
    Promise.all([api.adminUsers(), api.adminMailStatus().catch(() => null)])
      .then(([d, m]) => { setRows(d.users); setMail(m); setState("ready"); })
      .catch(() => setState("error"));
  };
  useEffect(load, []);

  const runReminders = async () => {
    setSending(true); setSendMsg("");
    try {
      const r = await api.adminSendReminders();
      setSendMsg(
        r.configured
          ? `Sent ${r.sent} reminder${r.sent === 1 ? "" : "s"} · ${r.skipped} complete profile${r.skipped === 1 ? "" : "s"} skipped${r.errors?.length ? ` · ${r.errors.length} failed` : ""}.`
          : r.message,
      );
      const st = await api.adminMailStatus().catch(() => null);
      if (st) setMail(st);
    } catch (e) { setSendMsg(e.message); } finally { setSending(false); }
  };

  // Defensive: the server enforces this, but don't even render the directory to a
  // non-admin who somehow reaches the route.
  if (!user.isAdmin) {
    return (
      <div className="sm-fade">
        <PageHeader t={t} title="Admin" sub="Restricted." />
        <Card t={t}><p style={{ color: t.sub, margin: 0 }}>This area is for the account owner only.</p></Card>
      </div>
    );
  }

  if (state === "loading") return <Loading t={t} label="Loading the directory…" />;
  if (state === "error") return <ErrorNote t={t} message="Couldn't load the user directory." onRetry={load} />;

  const emails = rows.map((r) => r.email).filter(Boolean);

  const copyEmails = async () => {
    try {
      await navigator.clipboard.writeText(emails.join(", "));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked — the CSV export is the fallback */ }
  };

  const exportCsv = () => {
    const header = ["email", "name", "currency", "incomeType", "onboarded", "transactions", "goals", "debts", "coachOptOut", "joined"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([r.email, r.name, r.currency, r.incomeType, r.onboarded, r.transactions, r.goals, r.debts, r.coachOptOut, r.createdAt].map(csv).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sarmaya-users-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const th = { textAlign: "left", fontSize: 12, fontWeight: 600, color: t.faint, textTransform: "uppercase", letterSpacing: "0.04em", padding: "0 14px 10px", whiteSpace: "nowrap" };
  const td = { fontSize: 13.5, color: t.text, padding: "11px 14px", borderTop: `1px solid ${t.border}`, whiteSpace: "nowrap" };

  return (
    <div className="sm-fade">
      <PageHeader
        t={t}
        title="Admin"
        sub="Everyone who's signed up — profile basics, activity, and emails for your mailing list."
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn t={t} kind="ghost" onClick={copyEmails} disabled={!emails.length}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy emails"}</Btn>
            <Btn t={t} onClick={exportCsv} disabled={!rows.length}><Download size={15} /> Export CSV</Btn>
          </div>
        }
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <Chip t={t} tint={t.accent} color={t.accentSoft}><Users size={13} /> {rows.length} user{rows.length === 1 ? "" : "s"}</Chip>
        <Chip t={t}><ShieldCheck size={13} /> {rows.filter((r) => r.onboarded).length} onboarded</Chip>
      </div>

      {/* Email reminders — nudge users with unfinished profiles to finish setup. */}
      <Card t={t} style={{ marginBottom: 16, display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: t.chip, color: t.accentSoft, display: "grid", placeItems: "center", flexShrink: 0 }}><Mail size={17} /></span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <strong style={{ color: t.text }}>Profile-completion reminders</strong>
          <p style={{ margin: "4px 0 0", fontSize: 13.5, color: t.sub, lineHeight: 1.55 }}>
            {mail?.configured
              ? <>Gmail is connected. <strong style={{ color: t.text }}>{mail.dueForReminder}</strong> user{mail.dueForReminder === 1 ? "" : "s"} still have an unfinished profile and can be emailed a nudge.</>
              : <>Email isn't set up yet. Add <code style={{ color: t.text }}>GMAIL_USER</code> and <code style={{ color: t.text }}>GMAIL_APP_PASSWORD</code> to <code style={{ color: t.text }}>server/.env</code> to enable sending (a Google App Password, with 2FA on).</>}
          </p>
          {sendMsg ? <p role="status" style={{ margin: "8px 0 0", fontSize: 13, color: t.text }}>{sendMsg}</p> : null}
        </div>
        <Btn t={t} onClick={runReminders} disabled={!mail?.configured || sending}><Send size={15} /> {sending ? "Sending…" : "Send reminders now"}</Btn>
      </Card>

      <Card t={t} style={{ padding: 6, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <thead>
            <tr>
              <th style={th}>Email</th>
              <th style={th}>Name</th>
              <th style={th}>Currency</th>
              <th style={th}>Income</th>
              <th style={th}>Onboarded</th>
              <th style={{ ...th, textAlign: "right" }}>Tx</th>
              <th style={{ ...th, textAlign: "right" }}>Goals</th>
              <th style={{ ...th, textAlign: "right" }}>Debts</th>
              <th style={th}>Joined</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="sm-row">
                <td style={{ ...td, fontWeight: 600 }}>{r.email}</td>
                <td style={{ ...td, color: r.name ? t.text : t.faint }}>{r.name || "—"}</td>
                <td style={td}>{r.currency}</td>
                <td style={td}>{r.incomeType}</td>
                <td style={{ ...td, color: r.onboarded ? t.pos : t.faint }}>{r.onboarded ? "Yes" : "No"}</td>
                <td style={{ ...td, textAlign: "right", color: t.sub }}>{r.transactions}</td>
                <td style={{ ...td, textAlign: "right", color: t.sub }}>{r.goals}</td>
                <td style={{ ...td, textAlign: "right", color: t.sub }}>{r.debts}</td>
                <td style={{ ...td, color: t.sub }}>{fmtDate((r.createdAt || "").slice(0, 10), locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p style={{ fontSize: 12.5, color: t.faint, marginTop: 14, lineHeight: 1.55, maxWidth: 640 }}>
        This directory is visible to the owner account only. If you email these users, make sure you have their consent and include an unsubscribe option.
      </p>
    </div>
  );
}
