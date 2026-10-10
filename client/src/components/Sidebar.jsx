import {
  LayoutDashboard, Wallet, Target, CreditCard, LineChart, MessageSquareHeart,
  Trophy, Settings, X, Activity, Star, Users,
} from "lucide-react";
import { ACCENT } from "../theme.js";
import { IconBtn } from "./ui.jsx";
import { useDialog } from "../hooks/useDialog.js";
import { burst } from "../lib/glitter.js";

export const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "transactions", label: "Transactions", icon: Wallet },
  { id: "goals", label: "Goals", icon: Target },
  { id: "debt", label: "Debt", icon: CreditCard },
  { id: "patterns", label: "Patterns", icon: Activity },
  { id: "analytics", label: "Analytics", icon: LineChart },
  { id: "coach", label: "Coach", icon: MessageSquareHeart },
  { id: "challenges", label: "Challenges", icon: Trophy },
  { id: "reviews", label: "Reviews", icon: Star },
  { id: "settings", label: "Settings", icon: Settings },
];

// Owner-only nav entry, appended when the current account is the admin.
const ADMIN_ITEM = { id: "admin", label: "Admin", icon: Users };

function Nav({ t, page, setPage, drawer, onClose, badges, isAdmin }) {
  const items = isAdmin ? [...NAV, ADMIN_ITEM] : NAV;
  return (
    <nav
      aria-label="Primary"
      style={{
        width: 250,
        flexShrink: 0,
        background: t.sidebar,
        color: t.sideText,
        height: "100%",
        padding: "22px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 5,
        borderRight: `1px solid ${t.border}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px 18px" }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: t.accent, display: "grid", placeItems: "center" }}>
          <Wallet size={18} color={ACCENT.on} />
        </div>
        <div>
          <div style={{ fontWeight: 700, color: t.sideText }}>Sarmaya</div>
          <div style={{ fontSize: 11, color: t.sideSub }}>Personal finance</div>
        </div>
        {drawer ? (
          <IconBtn t={t} label="Close menu" onClick={onClose} style={{ marginLeft: "auto", color: t.sideText }}>
            <X size={18} />
          </IconBtn>
        ) : null}
      </div>

      {items.map(({ id, label, icon: I }) => {
        const active = page === id;
        const count = badges?.[id] || 0; // live, derived; 0 → no badge (never a zero, never a dot)
        return (
          <button
            key={id}
            aria-current={active ? "page" : undefined}
            onClick={() => setPage(id)}
            onPointerDown={() => burst(1)}
            className="sm-hover"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "11px 12px",
              borderRadius: 12,
              cursor: "pointer",
              border: "none",
              textAlign: "left",
              fontSize: 14,
              fontWeight: active ? 700 : 500,
              color: active ? t.sideText : t.sideSub,
              background: active ? `linear-gradient(90deg, ${t.accent}33, ${t.sideHover})` : "transparent",
              boxShadow: active ? `inset 3px 0 0 ${t.accentSoft}` : "none",
            }}
          >
            <I size={18} color={active ? t.accentSoft : t.sideSub} />
            {label}
            {count > 0 ? (
              <span
                aria-label={`${count} needing attention`}
                style={{
                  marginLeft: "auto",
                  minWidth: 18,
                  height: 18,
                  padding: "0 6px",
                  borderRadius: 999,
                  background: `${t.warn}26`,
                  color: t.warn,
                  fontSize: 11,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
      <div style={{ marginTop: "auto", padding: "12px 8px 0", fontSize: 11, color: t.sideSub }}>Your data · one currency</div>
    </nav>
  );
}

export default function Sidebar({ t, page, setPage, wide, open, onClose, badges, isAdmin }) {
  const ref = useDialog(!wide && open, onClose); // trap focus while drawer is open

  if (wide) return <Nav t={t} page={page} setPage={setPage} drawer={false} onClose={onClose} badges={badges} isAdmin={isAdmin} />;

  return (
    <>
      {open ? (
        <div onClick={onClose} aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 40, background: t.scrim, backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }} />
      ) : null}
      <div
        ref={ref}
        role="dialog"
        aria-modal={open ? "true" : undefined}
        aria-label="Navigation menu"
        style={{
          position: "fixed",
          top: 0,
          bottom: 0,
          left: 0,
          zIndex: 50,
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform .22s ease",
          visibility: open ? "visible" : "hidden",
        }}
      >
        <Nav t={t} page={page} setPage={setPage} drawer onClose={onClose} badges={badges} isAdmin={isAdmin} />
      </div>
    </>
  );
}
