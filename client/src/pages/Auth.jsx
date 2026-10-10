import { useState } from "react";
import { Wallet, ArrowLeft } from "lucide-react";
import { ACCENT } from "../theme.js";
import { api, ApiError } from "../lib/api.js";
import { Btn, Card, Field, TextInput, Spinner } from "../components/ui.jsx";

export default function Auth({ t, onAuthed, onBack }) {
  const [mode, setMode] = useState("signup"); // signup | signin
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    // Light client-side checks; the server validates authoritatively.
    const next = {};
    if (!email.includes("@")) next.email = "Enter a valid email.";
    if (password.length < 8) next.password = "At least 8 characters.";
    if (Object.keys(next).length) { setErrors(next); return; }

    setBusy(true);
    try {
      const d = isSignup
        ? await api.register({ name, email, password })
        : await api.login({ email, password });
      onAuthed(d.user);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : null;
      if (code === "email_taken") setErrors({ email: "That email is already registered." });
      else if (code === "weak_password") setErrors({ password: "Choose a stronger password (8+ characters)." });
      else if (code === "bad_credentials") setErrors({ form: "Incorrect email or password." });
      else setErrors({ form: err.message || "Something went wrong. Try again." });
    } finally {
      setBusy(false);
    }
  };

  const demoLogin = async () => {
    setErrors({}); setBusy(true);
    try {
      const d = await api.login({ email: "demo@sarmaya.app", password: "demodemo" });
      onAuthed(d.user);
    } catch (err) {
      // Match on the typed error CODE, not the message string — copy changes
      // shouldn't silently turn this into the wrong explanation.
      const code = err instanceof ApiError ? err.code : null;
      setErrors({ form: code === "bad_credentials" ? "Demo account not seeded. Run: npm run seed" : err.message });
    } finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "min(420px, 100%)" }}>
        <button onClick={onBack} className="sm-hover" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: "none", color: t.sub, cursor: "pointer", fontSize: 14, marginBottom: 14 }}>
          <ArrowLeft size={16} /> Back
        </button>
        <Card t={t}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: t.accent, display: "grid", placeItems: "center" }}>
              <Wallet size={18} color={ACCENT.on} />
            </div>
            <strong style={{ color: t.text, fontSize: 18 }}>{isSignup ? "Create your account" : "Welcome back"}</strong>
          </div>
          <p style={{ color: t.sub, fontSize: 14, margin: "0 0 18px" }}>
            {isSignup ? "A few seconds to set up — you'll tell us what matters next." : "Sign in to your Sarmaya account."}
          </p>

          <form onSubmit={submit} noValidate>
            {isSignup ? (
              <Field t={t} label="Name">
                <TextInput t={t} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" />
              </Field>
            ) : null}
            <Field t={t} label="Email" error={errors.email}>
              <TextInput t={t} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" invalid={!!errors.email} />
            </Field>
            <Field t={t} label="Password" error={errors.password} hint={isSignup ? "At least 8 characters." : undefined}>
              <TextInput t={t} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete={isSignup ? "new-password" : "current-password"} invalid={!!errors.password} />
            </Field>

            {errors.form ? <div role="alert" style={{ color: t.neg, fontSize: 13, marginBottom: 12 }}>{errors.form}</div> : null}

            <Btn t={t} type="submit" disabled={busy} style={{ width: "100%" }}>
              {busy ? <Spinner t={t} size={16} /> : isSignup ? "Create account" : "Sign in"}
            </Btn>
          </form>

          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0", color: t.faint, fontSize: 12 }}>
            <span style={{ flex: 1, height: 1, background: t.border }} /> or <span style={{ flex: 1, height: 1, background: t.border }} />
          </div>
          <Btn t={t} kind="ghost" onClick={demoLogin} disabled={busy} style={{ width: "100%" }}>Explore the demo sandbox</Btn>

          <p style={{ textAlign: "center", fontSize: 14, color: t.sub, marginTop: 16, marginBottom: 0 }}>
            {isSignup ? "Already have an account?" : "New here?"}{" "}
            <button onClick={() => { setMode(isSignup ? "signin" : "signup"); setErrors({}); }} style={{ background: "transparent", border: "none", color: t.accentSoft, cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
              {isSignup ? "Sign in" : "Create one"}
            </button>
          </p>
        </Card>
      </div>
    </div>
  );
}
