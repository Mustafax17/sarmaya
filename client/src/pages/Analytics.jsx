import { useMemo } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { LineChart as LineChartIcon, Wallet } from "lucide-react";
import { fmtMoney, fmtCompact } from "../lib/format.js";
import { spendStats, monthlyTotals, momSpending } from "../lib/stats.js";
import { Card, EmptyState, Loading, Bar as ProgBar } from "../components/ui.jsx";
import StatCard from "../components/StatCard.jsx";
import { PageHeader, chartTooltip, gridProps, axisProps } from "../components/PageHeader.jsx";

export default function Analytics({ t, user, data, state }) {
  const { currency, locale } = user;
  const txs = data.transactions;
  const money = (v) => fmtMoney(v, currency, locale);

  const stats = useMemo(() => spendStats(txs), [txs]);
  const months = useMemo(() => monthlyTotals(txs, locale), [txs, locale]);
  const mom = useMemo(() => momSpending(txs, locale), [txs, locale]);
  // Savings growth: cumulative net (income - spend) across months.
  const growth = useMemo(() => {
    let run = 0;
    return months.map((m) => { run += m.net; return { label: m.label, savings: run }; });
  }, [months]);
  const avg = stats.count > 0 ? Math.round(stats.total / stats.count) : 0;
  const totalIncome = useMemo(() => txs.filter((x) => x.type === "in").reduce((s, x) => s + x.amount, 0), [txs]);
  const tip = chartTooltip(t);

  if (state === "loading" || state === "idle") return <Loading t={t} />;

  const hasData = txs.length > 0;

  return (
    <div className="sm-fade">
      <PageHeader t={t} title="Analytics" sub="Every figure here is computed from your logged transactions — nothing estimated." />

      {!hasData ? (
        <Card t={t}><EmptyState t={t} icon={<LineChartIcon size={20} />} title="Nothing to analyse yet" hint="Log some transactions and this fills with real breakdowns." /></Card>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14, marginBottom: 16 }}>
            <StatCard t={t} label="Income logged" accent={t.pos} value={money(totalIncome)} hint={totalIncome === 0 ? "None logged yet" : undefined} />
            <StatCard t={t} label="Total spent" value={money(stats.total)} hint={`${stats.count} expenses`} />
            <StatCard t={t} label="Avg / transaction" value={money(avg)} />
            <StatCard t={t} label="Month over month" value={mom && mom.pct != null ? `${mom.pct > 0 ? "+" : ""}${mom.pct}%` : "—"} deltaTone={mom ? (mom.diff <= 0 ? "pos" : "neg") : "neutral"} hint={mom ? `vs ${mom.prev.label}` : "Need two months"} />
          </div>

          <Card t={t} style={{ marginBottom: 14 }}>
            <h3 style={{ margin: "0 0 12px", color: t.text, fontSize: 16 }}>Income vs spending</h3>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={months} margin={{ left: -8, right: 6, top: 6 }}>
                  <CartesianGrid {...gridProps(t)} />
                  <XAxis dataKey="label" {...axisProps(t)} />
                  <YAxis {...axisProps(t)} width={52} tickFormatter={(v) => fmtCompact(v, currency, locale)} />
                  <Tooltip {...tip} formatter={(v) => money(v)} />
                  <Legend wrapperStyle={{ fontSize: 12, color: t.sub }} />
                  <Bar dataKey="income" name="Income" fill={t.pos} radius={[6, 6, 0, 0]} />
                  <Bar dataKey="spend" name="Spending" fill={t.accent2} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {totalIncome === 0 ? (
              <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 10, background: `${t.warn}14`, border: `1px solid ${t.warn}44`, fontSize: 13, color: t.sub, lineHeight: 1.5 }}>
                Only spending shows above because <strong style={{ color: t.text }}>no income is logged yet</strong>. Analytics is computed from real transactions, so add your salary or other income (Transactions → e.g. “salary 185000”) and the green income bars will appear here.
              </div>
            ) : null}
          </Card>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14 }}>
            <Card t={t}>
              <h3 style={{ margin: "0 0 12px", color: t.text, fontSize: 16 }}>Where it goes</h3>
              {stats.categories.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {stats.categories.map((c) => (
                    <div key={c.name}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
                        <span style={{ color: t.text }}>{c.name}</span>
                        <span style={{ color: t.sub }}>{money(c.amount)} · {Math.round(c.share * 100)}%</span>
                      </div>
                      <ProgBar t={t} value={c.share} color={c.color} />
                    </div>
                  ))}
                </div>
              ) : <EmptyState t={t} icon={<Wallet size={20} />} title="No expenses yet" />}
            </Card>

            <Card t={t}>
              <h3 style={{ margin: "0 0 12px", color: t.text, fontSize: 16 }}>Cumulative savings</h3>
              <div style={{ fontSize: 12, color: t.faint, marginBottom: 8 }}>Running income minus spending across your logged months.</div>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={growth} margin={{ left: -8, right: 6, top: 6 }}>
                    <CartesianGrid {...gridProps(t)} />
                    <XAxis dataKey="label" {...axisProps(t)} />
                    <YAxis {...axisProps(t)} width={52} tickFormatter={(v) => fmtCompact(v, currency, locale)} />
                    <Tooltip {...tip} formatter={(v) => [money(v), "Net saved"]} />
                    <Line type="monotone" dataKey="savings" stroke={t.accent} strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
