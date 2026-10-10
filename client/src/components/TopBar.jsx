import { useState } from "react";
import { Menu, Search, X, Moon, Sun, Bell, LogOut, Settings, Eye, EyeOff } from "lucide-react";
import { ACCENT } from "../theme.js";
import { IconBtn } from "./ui.jsx";
import { useOutside } from "../hooks/useOutside.js";

function AccountMenu({ t, user, onLogout, onSettings }) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(() => setOpen(false));
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="sm-hover"
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px 5px 5px", borderRadius: 999, cursor: "pointer", background: t.chip, border: `1px solid ${t.border}`, color: t.text }}
      >
        <span style={{ width: 30, height: 30, borderRadius: 999, background: t.accent, color: ACCENT.on, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 13 }}>
          {(user.name || user.email || "U").slice(0, 1).toUpperCase()}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{(user.name || user.email).split(" ")[0]}</span>
      </button>
      {open ? (
        <div role="menu" className="sm-fade" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 230, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, boxShadow: t.shadow, padding: 12, zIndex: 30 }}>
          <div style={{ padding: "4px 6px 10px", borderBottom: `1px solid ${t.border}` }}>
            <div style={{ fontWeight: 700, color: t.text }}>{user.name || "You"}</div>
            <div style={{ fontSize: 12, color: t.sub, overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</div>
          </div>
          <button role="menuitem" onClick={() => { setOpen(false); onSettings(); }} className="sm-hover" style={menuItem(t, t.text)}>
            <Settings size={16} /> Settings
          </button>
          <button role="menuitem" onClick={onLogout} className="sm-hover" style={menuItem(t, t.neg)}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

const menuItem = (t, color) => ({
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  marginTop: 6,
  padding: "9px 8px",
  borderRadius: 10,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  color,
  fontSize: 14,
  fontWeight: 600,
  textAlign: "left",
});

export default function TopBar({ t, wide, onMenu, user, onLogout, onSettings, themeName, onToggleTheme, query, setQuery, onSearchFocus, stealth, onToggleStealth }) {
  return (
    <header
      style={{ position: "sticky", top: 0, zIndex: 20, display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", background: t.surface, borderBottom: `1px solid ${t.border}` }}
    >
      {!wide ? (
        <IconBtn t={t} label="Open menu" onClick={onMenu}><Menu size={20} /></IconBtn>
      ) : null}

      {/* Real search — filters the transactions list and jumps there. */}
      <form
        role="search"
        onSubmit={(e) => { e.preventDefault(); onSearchFocus?.(); }}
        style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, maxWidth: 420, padding: "8px 12px", borderRadius: 12, background: t.chip, border: `1px solid ${t.border}` }}
      >
        <Search size={16} color={t.faint} />
        <input
          className="sm-in"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={onSearchFocus}
          placeholder="Search transactions…"
          aria-label="Search transactions"
          style={{ border: "none", outline: "none", background: "transparent", color: t.text, fontSize: 14, width: "100%" }}
        />
        {query ? (
          <IconBtn t={t} label="Clear search" onClick={() => setQuery("")} style={{ width: 26, height: 26 }}><X size={14} /></IconBtn>
        ) : null}
      </form>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        {/* Stealth / privacy mode — blurs every money value for shoulder-surfing. */}
        <IconBtn t={t} label={stealth ? "Show amounts" : "Hide amounts (privacy mode)"} aria-pressed={stealth} active={stealth} onClick={onToggleStealth}>
          {stealth ? <EyeOff size={18} /> : <Eye size={18} />}
        </IconBtn>
        <IconBtn t={t} label={themeName === "dark" ? "Switch to light mode" : "Switch to dark mode"} aria-pressed={themeName === "dark"} onClick={onToggleTheme}>
          {themeName === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </IconBtn>
        {/* Honestly inert: no unread dot, disabled + labelled — never fakes state. */}
        <IconBtn t={t} label="Notifications (none yet)" disabled style={{ opacity: 0.5 }}>
          <Bell size={18} />
        </IconBtn>
        <AccountMenu t={t} user={user} onLogout={onLogout} onSettings={onSettings} />
      </div>
    </header>
  );
}
