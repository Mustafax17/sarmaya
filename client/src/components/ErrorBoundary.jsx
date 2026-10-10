import React from "react";
import { themes } from "../theme.js";

// Root error boundary with a reload fallback. Pulls from the STATIC dark token
// object (a plain import, not React context) so it stays on-brand green-black yet
// still renders even if the themed component tree is what broke.
const t = themes.dark;
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("[sarmaya] render error:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: t.bg, color: t.text, padding: 24 }}>
          <div style={{ textAlign: "center", maxWidth: 440 }}>
            <h1 style={{ fontSize: 22, marginBottom: 8 }}>Something went wrong</h1>
            <p style={{ color: t.sub, marginBottom: 18 }}>
              The app hit an unexpected error. Your data is safe on the server.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: "10px 18px", borderRadius: 12, border: "none", background: t.accent, color: t.accentOn, fontWeight: 600, cursor: "pointer" }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
