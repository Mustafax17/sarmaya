import { useEffect, useState } from "react";
import { Star, Mail, Trash2 } from "lucide-react";
import { api } from "../lib/api.js";
import { fmtDate } from "../lib/format.js";
import { PageHeader } from "../components/PageHeader.jsx";
import { Card, Btn, Field, Loading, ErrorNote, Chip, inputStyle } from "../components/ui.jsx";

// Read-only star row.
function Stars({ value, color, size = 16 }) {
  return (
    <span style={{ display: "inline-flex", gap: 2 }} role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} color={color} strokeWidth={1.75} fill={n <= value ? color : "transparent"} style={{ opacity: n <= value ? 1 : 0.35 }} />
      ))}
    </span>
  );
}

// Interactive 1–5 picker (keyboard + mouse).
function StarPicker({ t, value, onChange }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div role="radiogroup" aria-label="Your rating" style={{ display: "inline-flex", gap: 4 }} onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          onMouseEnter={() => setHover(n)}
          onFocus={() => setHover(n)}
          onBlur={() => setHover(0)}
          onClick={() => onChange(n)}
          className="sm-hover"
          style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2, lineHeight: 0, borderRadius: 8 }}
        >
          <Star size={30} color={t.warn} strokeWidth={1.75} fill={n <= shown ? t.warn : "transparent"} style={{ opacity: n <= shown ? 1 : 0.4 }} />
        </button>
      ))}
    </div>
  );
}

export default function Reviews({ t, user }) {
  const [reviews, setReviews] = useState([]);
  const [email, setEmail] = useState("");
  const [state, setState] = useState("loading"); // loading | ready | error
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const locale = user.locale || "en-US";

  const load = async () => {
    setState("loading");
    try {
      const [rev, meta] = await Promise.all([api.getReviews(), api.meta()]);
      setReviews(rev.reviews);
      setEmail(meta.supportEmail || "");
      const own = rev.reviews.find((r) => r.mine);
      if (own) { setRating(own.rating); setComment(own.comment); }
      setState("ready");
    } catch {
      setState("error");
    }
  };
  useEffect(() => { load(); }, []);

  const mine = reviews.find((r) => r.mine) || null;

  const submit = async () => {
    setErr("");
    if (!(rating >= 1 && rating <= 5)) { setErr("Pick a star rating from 1 to 5."); return; }
    setBusy(true);
    try {
      await api.saveReview({ rating, comment: comment.trim() });
      await load();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true); setErr("");
    try { await api.deleteReview(); setRating(0); setComment(""); await load(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  if (state === "loading") return <Loading t={t} />;
  if (state === "error") return <ErrorNote t={t} message="Couldn't load reviews." onRetry={load} />;

  const count = reviews.length;
  const avg = count ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : null;

  return (
    <div className="sm-fade">
      <PageHeader t={t} title="Reviews" sub="Tell us how Sarmaya's working for you — a rating and a note. Every review here is written by a real person using the app." />

      {email ? (
        <Card t={t} style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ width: 40, height: 40, borderRadius: 11, background: t.chip, display: "grid", placeItems: "center", color: t.accentSoft, flexShrink: 0 }}><Mail size={18} /></span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: t.text }}>Questions or feedback?</div>
            <a href={`mailto:${email}`} style={{ color: t.accentSoft, fontSize: 14, textDecoration: "none", fontWeight: 600, wordBreak: "break-all" }}>{email}</a>
          </div>
        </Card>
      ) : null}

      <Card t={t} style={{ marginBottom: 18 }}>
        <h3 style={{ margin: "0 0 12px", color: t.text, fontSize: 16 }}>{mine ? "Your review" : "Leave a review"}</h3>
        <Field t={t} label="Your rating">
          <StarPicker t={t} value={rating} onChange={setRating} />
        </Field>
        <Field t={t} label="Comment" hint={`Optional — ${comment.length}/1000 characters.`}>
          <textarea
            value={comment}
            maxLength={1000}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            placeholder="What's working, what isn't…"
            className="sm-in"
            style={{ ...inputStyle(t), resize: "vertical", minHeight: 92, fontFamily: "inherit", lineHeight: 1.5 }}
          />
        </Field>
        {err ? <div role="alert" style={{ color: t.neg, fontSize: 13, marginBottom: 10 }}>{err}</div> : null}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Btn t={t} onClick={submit} disabled={busy}>{mine ? "Update review" : "Post review"}</Btn>
          {mine ? <Btn t={t} kind="danger" onClick={remove} disabled={busy}><Trash2 size={15} /> Remove</Btn> : null}
        </div>
      </Card>

      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "0 0 12px", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, color: t.text, fontSize: 16 }}>What people say</h3>
        {avg != null ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: t.sub, fontSize: 13.5 }}>
            <Stars value={Math.round(avg)} color={t.warn} size={15} />
            <strong style={{ color: t.text }}>{avg}</strong> · {count} review{count === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      {count === 0 ? (
        <Card t={t}><p style={{ color: t.sub, margin: 0, fontSize: 14 }}>No reviews yet — be the first.</p></Card>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {reviews.map((r) => (
            <Card t={t} key={r.id} accent={r.mine ? t.accent : undefined}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: r.comment ? 8 : 0, flexWrap: "wrap" }}>
                <Stars value={r.rating} color={t.warn} size={16} />
                <strong style={{ color: t.text, fontSize: 14 }}>{r.name}</strong>
                {r.mine ? <Chip t={t} color={t.accentSoft} tint={t.accent}>You</Chip> : null}
                <span style={{ marginLeft: "auto", color: t.faint, fontSize: 12.5 }}>{fmtDate(r.createdAt.slice(0, 10), locale)}{r.updatedAt ? " · edited" : ""}</span>
              </div>
              {r.comment ? (
                <p style={{ margin: 0, color: t.sub, fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{r.comment}</p>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
