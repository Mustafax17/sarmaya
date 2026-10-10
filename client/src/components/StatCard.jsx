import { Card, SelfReportTag, TrendBadge, CountUp, Explain } from "./ui.jsx";

// A dashboard stat. `value` is already formatted (money via Intl at the edge).
// Optional: `accent` (coloured strip + icon tint), `icon`, and `count`
// ({ amount, format }) to animate the number on mount. `selfReported` shows the
// "you told us" tag when the figure came from onboarding rather than computed data.
// `explain` ({ title, rows, formula, note }) adds an ⓘ that shows the working.
export default function StatCard({ t, label, value, delta, deltaTone = "neutral", deltaDir, hint, selfReported, accent, icon, count, explain }) {
  const c = accent || t.accent;
  return (
    <Card t={t} accent={accent} className="sm-lift" style={{ padding: 18, overflow: "visible" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        {icon ? (
          <span style={{ width: 32, height: 32, borderRadius: 10, display: "grid", placeItems: "center", background: `${c}1A`, color: c }}>{icon}</span>
        ) : null}
        <span style={{ fontSize: 13, color: t.sub, fontWeight: 500 }}>{label}</span>
        {selfReported || explain ? (
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
            {selfReported ? <SelfReportTag t={t} /> : null}
            {explain ? <Explain t={t} {...explain} /> : null}
          </span>
        ) : null}
      </div>
      <div className="sm-priv" style={{ fontSize: 27, fontWeight: 700, color: t.text, letterSpacing: "-0.02em", width: "fit-content" }}>
        {count ? <CountUp value={count.amount} format={count.format} /> : value}
      </div>
      {delta ? (
        <div style={{ marginTop: 8 }}>
          <TrendBadge t={t} tone={deltaTone} dir={deltaDir}>{delta}</TrendBadge>
        </div>
      ) : null}
      {hint ? <div style={{ marginTop: delta ? 6 : 6, fontSize: 12, color: t.faint }}>{hint}</div> : null}
    </Card>
  );
}
