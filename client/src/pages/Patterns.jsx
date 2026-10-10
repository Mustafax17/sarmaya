import { useId, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Activity, Wallet } from "lucide-react";
import { fmtMoney, fmtCompact } from "../lib/format.js";
import { spendStats } from "../lib/stats.js";
import { catColor } from "../theme.js";
import { catIcon } from "../lib/icons.js";
import { Card, EmptyState, Loading, Bar as ProgBar, Btn } from "../components/ui.jsx";
import { PageHeader, chartTooltip, gridProps, axisProps } from "../components/PageHeader.jsx";

// Patterns = where your money goes, broken down by category (food, transport,
// bills, subscriptions…). Computed from real logged spending, never estimated.
export default function Patterns({ t, user, data, state, onAddFirst }) {
  const { currency, locale } = user;
  const txs = data.transactions;
  const money = (v) => fmtMoney(v, currency, locale);
  const stats = useMemo(() => spendStats(txs), [txs]);
  const tip = chartTooltip(t);
  const gid = useId().replace(/:/g, "");

  if (state === "loading" || state === "idle") return <Loading t={t} />;

  if (stats.total === 0) {
    return (
      <div className="sm-fade">
        <PageHeader t={t} title="Patterns" sub="Where your money goes — a breakdown by category, from your logged spending." />
        <Card t={t}>
          <EmptyState t={t} icon={<Wallet size={20} />} title="No spending yet" hint="Log a few expenses and you'll see exactly how your money splits across food, transport, bills, subscriptions and more." action={<Btn t={t} onClick={onAddFirst}>Add a transaction</Btn>} />
        </Card>
      </div>
    );
  }

  const chartData = stats.categories.map((c) => ({ label: c.name, amount: c.amount, color: c.color }));
  const top = stats.categories[0];

  return (
    <div className="sm-fade">
      <PageHeader t={t} title="Patterns" sub={`Where your money goes — by category, across ${stats.count} logged expense${stats.count === 1 ? "" : "s"}.`} />

      <Card t={t} style={{ marginBottom: 14 }}>
        <h3 style={{ margin: "0 0 12px", color: t.text, fontSize: 16 }}>Spending by category</h3>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ left: -8, right: 6, top: 6 }}>
              <defs>
                {/* Glossy 3D column per category colour — a specular top, true colour
                    below, deepening to a grounded base. Shades derived from the
                    category's theme colour (no brand hex). */}
                {chartData.map((r, i) => (
                  <linearGradient key={r.label} id={`pat-${gid}-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style={{ stopColor: `color-mix(in srgb, ${r.color} 55%, white)` }} />
                    <stop offset="14%" style={{ stopColor: `color-mix(in srgb, ${r.color} 88%, white)` }} />
                    <stop offset="52%" style={{ stopColor: r.color }} />
                    <stop offset="100%" style={{ stopColor: `color-mix(in srgb, ${r.color} 74%, black)` }} />
                  </linearGradient>
                ))}
                <filter id={`patsh-${gid}`} x="-40%" y="-12%" width="180%" height="140%">
                  <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor={t.shadowColor} floodOpacity="1" />
                </filter>
              </defs>
              <CartesianGrid {...gridProps(t)} strokeOpacity={0.35} />
              <XAxis dataKey="label" {...axisProps(t)} interval={0} angle={-12} textAnchor="end" height={54} />
              <YAxis {...axisProps(t)} width={52} tickFormatter={(v) => fmtCompact(v, currency, locale)} />
              <Tooltip {...tip} formatter={(v) => [money(v), "Spent"]} cursor={{ fill: t.chip }} />
              <Bar dataKey="amount" radius={[7, 7, 2, 2]} maxBarSize={56} filter={`url(#patsh-${gid})`} background={{ fill: t.chip, radius: 7 }}>
                {chartData.map((r, i) => <Cell key={r.label} fill={`url(#pat-${gid}-${i})`} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 14 }}>
        {stats.categories.map((c) => {
          const I = catIcon(c.name);
          return (
            <Card t={t} key={c.name} accent={c.color}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ width: 34, height: 34, borderRadius: 10, background: `${c.color}1F`, color: c.color, display: "grid", placeItems: "center" }}><I size={17} /></span>
                <strong style={{ color: t.text }}>{c.name}</strong>
                <span style={{ marginLeft: "auto", fontSize: 12.5, color: t.sub }}>{Math.round(c.share * 100)}%</span>
              </div>
              <div className="sm-priv" style={{ fontSize: 22, fontWeight: 700, color: t.text, width: "fit-content", marginBottom: 10 }}>{money(c.amount)}</div>
              <ProgBar t={t} value={c.share} color={c.color} />
            </Card>
          );
        })}
      </div>

      {top ? (
        <Card t={t} style={{ marginTop: 14, background: t.surface2, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <Activity size={18} color={t.accent} style={{ marginTop: 2, flexShrink: 0 }} />
          <p style={{ margin: 0, color: t.sub, fontSize: 14, lineHeight: 1.55 }}>
            Your biggest category is <strong style={{ color: t.text }}>{top.name}</strong> at <span className="sm-priv" style={{ color: t.text, fontWeight: 600 }}>{money(top.amount)}</span> — {Math.round(top.share * 100)}% of your logged spending. That's the first place to look if you want to free up room.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
