// Shared page title row + a themed recharts tooltip style factory.

export function PageHeader({ t, title, sub, action }) {
  return (
    <div className="sm-slide-up" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 27, fontWeight: 800, color: t.text }}>{title}</h1>
        {sub ? <p style={{ margin: "6px 0 0", color: t.sub, fontSize: 14.5, maxWidth: 660, lineHeight: 1.55 }}>{sub}</p> : null}
      </div>
      {action}
    </div>
  );
}

export const chartTooltip = (t) => ({
  contentStyle: { background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, boxShadow: t.shadowLg, color: t.text, padding: "10px 14px" },
  labelStyle: { color: t.sub, fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: t.text, fontWeight: 600 },
  cursor: { fill: t.chip },
  animationDuration: 180,
});

export const gridProps = (t) => ({ stroke: t.grid, vertical: false });
export const axisProps = (t) => ({ stroke: t.faint, tick: { fontSize: 12, fill: t.sub }, tickLine: false, axisLine: false });
