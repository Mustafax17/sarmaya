import { useId, useState } from "react";
import { X, ArrowUpRight, ArrowDownRight, Info } from "lucide-react";
import { ACCENT } from "../theme.js";
import { useDialog } from "../hooks/useDialog.js";
import { useCountUp } from "../hooks/useCountUp.js";
import { burst } from "../lib/glitter.js";

/* Card ---------------------------------------------------------------- */
// Optional `accent` paints a coloured top strip; `.sm-card` gives the layered
// shadow + hover lift/glow. Pass className="sm-lift" for interactive cards.
export function Card({ t, children, style, className = "", accent, ...rest }) {
  return (
    <div
      className={`sm-card sm-hover ${className}`}
      style={{
        position: "relative",
        background: t.surface,
        border: `1px solid ${t.border}`,
        borderRadius: 20,
        boxShadow: t.shadow,
        padding: 20,
        overflow: "hidden",
        ...style,
      }}
      {...rest}
    >
      {accent ? (
        <span
          aria-hidden="true"
          style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 4,
            background: `linear-gradient(90deg, ${accent}, ${accent}00)`,
            // Follow the card's corner so the strip never nubs past a rounded
            // corner on cards that render with overflow:visible (e.g. StatCard).
            borderRadius: "inherit",
          }}
        />
      ) : null}
      {children}
    </div>
  );
}

/* Buttons ------------------------------------------------------------- */
// Glitter comes from the pooled canvas (lib/glitter.js). Secondary/ghost/subtle
// buttons emit an ambient Tier-1 shimmer on press (they never "fail"); primary
// action buttons stay silent here — the fuller Tier-2 burst fires at the SUCCESS
// site, so a rejected form never sparkles.
export function Btn({ t, kind = "primary", children, style, onPointerDown, ...rest }) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontSize: 14,
    fontWeight: 600,
    padding: "10px 16px",
    borderRadius: 12,
    cursor: rest.disabled ? "not-allowed" : "pointer",
    opacity: rest.disabled ? 0.55 : 1,
    border: "1px solid transparent",
  };
  const kinds = {
    primary: { background: t.gradPrimary, color: t.btnText, borderColor: "transparent", boxShadow: "0 8px 20px rgba(0,0,0,.30)" },
    ghost: { background: t.surface, color: t.text, borderColor: t.border },
    subtle: { background: t.chip, color: t.text },
    success: { background: t.pos, color: "#04140B", borderColor: "transparent" },
    danger: { background: `${t.neg}14`, color: t.neg, borderColor: `${t.neg}55` },
  };
  const ambient = (kind === "ghost" || kind === "subtle") && !rest.disabled;
  return (
    <button
      className={kind === "primary" ? "sm-btn sm-btn-primary" : "sm-btn"}
      style={{ ...base, ...kinds[kind], ...style }}
      onPointerDown={(e) => { if (ambient) burst(1); onPointerDown?.(e); }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function IconBtn({ t, label, children, active, style, onPointerDown, ...rest }) {
  return (
    <button
      aria-label={label}
      title={label}
      className="sm-hover"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 40,
        height: 40,
        borderRadius: 12,
        cursor: rest.disabled ? "default" : "pointer",
        background: active ? t.chip : "transparent",
        color: t.sub,
        border: `1px solid ${active ? t.border : "transparent"}`,
        ...style,
      }}
      onPointerDown={(e) => { if (!rest.disabled) burst(1); onPointerDown?.(e); }}
      {...rest}
    >
      {children}
    </button>
  );
}

/* Explain — an ⓘ that reveals exactly how a number was calculated -------
 * Rows are the inputs (already formatted at the edge); `formula` is the working.
 * This is the "always explain" principle made literal: nothing is asserted without
 * showing its arithmetic. */
export function Explain({ t, title = "How this is calculated", rows = [], formula, note, label = "How this is calculated" }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", lineHeight: 0 }}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        title={label}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="sm-hover"
        style={{ display: "inline-grid", placeItems: "center", width: 22, height: 22, borderRadius: 999, border: `1px solid ${t.border}`, background: "transparent", color: t.faint, cursor: "pointer" }}
      >
        <Info size={13} />
      </button>
      {open ? (
        <>
          <div onClick={(e) => { e.stopPropagation(); setOpen(false); }} aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 70 }} />
          <div
            role="dialog"
            onClick={(e) => e.stopPropagation()}
            style={{ position: "absolute", top: "130%", right: 0, zIndex: 71, width: 264, maxWidth: "80vw", background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 14, boxShadow: t.shadowLg, padding: 14, textAlign: "left", cursor: "default" }}
          >
            <div style={{ fontWeight: 700, color: t.text, fontSize: 13.5, marginBottom: rows.length || formula ? 8 : 0 }}>{title}</div>
            {rows.map((r) => (
              <div key={r.label} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, padding: "3px 0" }}>
                <span style={{ color: t.sub }}>{r.label}</span>
                <span style={{ color: t.text, fontWeight: 600 }}>{r.value}</span>
              </div>
            ))}
            {formula ? (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${t.border}`, fontSize: 12.5, color: t.sub, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{formula}</div>
            ) : null}
            {note ? <div style={{ marginTop: 8, fontSize: 12, color: t.faint, lineHeight: 1.45 }}>{note}</div> : null}
          </div>
        </>
      ) : null}
    </span>
  );
}

/* Animated number (respects reduced-motion via the hook) -------------- */
export function CountUp({ value, format = (n) => Math.round(n).toString(), duration = 700 }) {
  const n = useCountUp(Number(value) || 0, duration);
  return <>{format(n)}</>;
}

/* Chip + "you told us" tag -------------------------------------------- */
export function Chip({ t, children, color, tint, style }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        fontWeight: 600,
        padding: "4px 11px",
        borderRadius: 999,
        background: tint ? `${tint}1A` : t.chip,
        color: color || t.sub,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// Trend pill. `tone` sets the colour (pos/neg = good/bad; "slate" = neutral
// comparison/context — the secondary voice). `dir` sets the arrow independently
// of tone, so a slate comparison can still show up/down without implying good/bad.
export function TrendBadge({ t, tone = "neutral", dir, children, style }) {
  const c = tone === "pos" ? t.pos : tone === "neg" ? t.neg : tone === "slate" ? (t.slate || t.sub) : t.sub;
  const up = dir ? dir === "up" : tone === "pos";
  const down = dir ? dir === "down" : tone === "neg";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: `${c}1A`, color: c, ...style }}>
      {up ? <ArrowUpRight size={13} /> : down ? <ArrowDownRight size={13} /> : null}
      {children}
    </span>
  );
}

// Marks a figure as self-reported (from onboarding) rather than computed.
export function SelfReportTag({ t, style }) {
  return (
    <span
      title="You told us this during onboarding — it isn't computed from transactions yet."
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: 0.3,
        textTransform: "uppercase",
        padding: "2px 7px",
        borderRadius: 999,
        border: `1px dashed ${t.border}`,
        color: t.faint,
        ...style,
      }}
    >
      you told us
    </span>
  );
}

/* Inputs -------------------------------------------------------------- */
export function Field({ t, label, hint, error, children }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      {label ? <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: t.sub, marginBottom: 6 }}>{label}</span> : null}
      {children}
      {error ? (
        <span role="alert" style={{ display: "block", color: t.neg, fontSize: 12.5, marginTop: 5 }}>{error}</span>
      ) : hint ? (
        <span style={{ display: "block", color: t.faint, fontSize: 12, marginTop: 5 }}>{hint}</span>
      ) : null}
    </label>
  );
}

export function inputStyle(t, invalid) {
  return {
    width: "100%",
    padding: "11px 14px",
    borderRadius: 12,
    border: `1px solid ${invalid ? t.neg : t.border}`,
    background: t.surface2,
    color: t.text,
    fontSize: 14,
    outline: "none",
    transition: "border-color .16s ease, box-shadow .16s ease",
  };
}

// Optional leading `icon` renders inside the input.
export function TextInput({ t, invalid, style, icon, ...rest }) {
  if (icon) {
    return (
      <span style={{ position: "relative", display: "block" }}>
        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: t.faint, display: "grid", placeItems: "center", pointerEvents: "none" }}>{icon}</span>
        <input className="sm-in" style={{ ...inputStyle(t, invalid), paddingLeft: 38, ...style }} {...rest} />
      </span>
    );
  }
  return <input className="sm-in" style={{ ...inputStyle(t, invalid), ...style }} {...rest} />;
}

export function Select({ t, style, children, ...rest }) {
  return (
    <select className="sm-in" style={{ ...inputStyle(t), ...style }} {...rest}>
      {children}
    </select>
  );
}

/* Progress bar -------------------------------------------------------- */
export function Bar({ t, value, color, height = 8 }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div style={{ height, borderRadius: 999, background: t.chip, overflow: "hidden" }}>
      <div style={{ width: `${pct * 100}%`, height: "100%", background: color || t.gradPrimary, borderRadius: 999, transition: "width .5s cubic-bezier(.2,.7,.3,1)" }} />
    </div>
  );
}

/* Progress ring — unique gradient id per instance --------------------- */
export function Ring({ t, value, size = 116, stroke = 12, color, children }) {
  const gid = useId().replace(/:/g, "");
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const c1 = color || t.accent;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <defs>
          <linearGradient id={`ring-${gid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={c1} />
            <stop offset="100%" stopColor={t.accentSoft} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={t.chip} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#ring-${gid})`}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset .6s cubic-bezier(.2,.7,.3,1)" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
        {children ?? <strong style={{ color: t.text, fontSize: 18 }}>{Math.round(pct * 100)}%</strong>}
      </div>
    </div>
  );
}

/* Empty state --------------------------------------------------------- */
export function EmptyState({ t, icon, title, hint, action }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 8, padding: "34px 20px", color: t.sub }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, display: "grid", placeItems: "center", background: `${t.accent}14`, color: t.accent }}>{icon}</div>
      <strong style={{ color: t.text }}>{title}</strong>
      {hint ? <span style={{ fontSize: 13, maxWidth: 340 }}>{hint}</span> : null}
      {action ? <div style={{ marginTop: 6 }}>{action}</div> : null}
    </div>
  );
}

/* Skeleton loader block ---------------------------------------------- */
export function Skeleton({ height = 16, width = "100%", style }) {
  return <div className="sm-skel" style={{ height, width, ...style }} />;
}

/* Spinner ------------------------------------------------------------- */
export function Spinner({ t, size = 22 }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2.5px solid ${t.chip}`,
        borderTopColor: t.accent,
        animation: "smSpin .7s linear infinite",
      }}
    />
  );
}

export function Loading({ t, label = "Loading…" }) {
  return (
    <div role="status" style={{ display: "flex", alignItems: "center", gap: 10, color: t.sub, padding: "40px 0", justifyContent: "center" }}>
      <Spinner t={t} /> {label}
    </div>
  );
}

/* Inline error with retry -------------------------------------------- */
export function ErrorNote({ t, message, onRetry }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center", padding: "30px 16px", color: t.sub, flexWrap: "wrap" }}>
      <span style={{ color: t.neg }}>⚠</span>
      <span>{message}</span>
      {onRetry ? <Btn t={t} kind="ghost" onClick={onRetry} style={{ padding: "6px 14px" }}>Retry</Btn> : null}
    </div>
  );
}

/* Confirm — a destructive action that can't be undone asks first ------
 * Transactions get an undo toast instead; everything that deletes permanently
 * (goals, debts, challenge streaks) routes through here so a misclick can't
 * silently destroy months of data. */
export function ConfirmDialog({ t, open, onClose, onConfirm, title, body, confirmLabel = "Delete", busy }) {
  const labelId = useId();
  return (
    <Modal t={t} open={open} onClose={onClose} title={title} labelId={labelId}>
      <p style={{ margin: "0 0 18px", color: t.sub, fontSize: 14, lineHeight: 1.55 }}>{body}</p>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Btn t={t} kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn t={t} kind="danger" onClick={onConfirm} disabled={busy}>{confirmLabel}</Btn>
      </div>
    </Modal>
  );
}

/* Modal — role=dialog, aria-modal, focus trap, Escape, backdrop -------
 * The backdrop carries WebkitBackdropFilter alongside the standard property:
 * Safari below 18 only honours the prefixed form, and React does not add vendor
 * prefixes to inline styles. */
export function Modal({ t, open, onClose, title, children, labelId }) {
  const ref = useDialog(open, onClose);
  if (!open) return null;
  return (
    <div
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "grid", placeItems: "center", padding: 20, background: t.scrim, backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        className="sm-scale-in"
        style={{ width: "min(460px, 100%)", maxHeight: "90vh", overflowY: "auto", background: t.surface, border: `1px solid ${t.border}`, borderRadius: 22, boxShadow: t.shadowLg, padding: 24 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 id={labelId} style={{ margin: 0, fontSize: 18, color: t.text }}>{title}</h2>
          <IconBtn t={t} label="Close dialog" onClick={onClose}><X size={18} /></IconBtn>
        </div>
        {children}
      </div>
    </div>
  );
}
