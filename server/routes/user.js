import { Router } from "../lib/router.js";
import bcrypt from "bcryptjs";
import { db, deleteUser } from "../db.js";
import { publicUser, clearAuthCookie, setAuthCookie } from "../auth.js";
import { HttpError, intMinor, oneOf, str } from "../validate.js";
import { CURRENCY_CODES, CURRENCIES, DEFAULT_CATEGORIES, FOCUS_OPTIONS, INCOME_TYPES, INCOME_SOURCES, ESTIMATE_CATEGORIES, SUPPORT_EMAIL } from "../constants.js";

const router = Router();

const localeFor = (code) => CURRENCIES.find((c) => c.code === code)?.locale || "en-US";

// PATCH /api/user — partial update of profile + onboarding answers.
// Every field is optional; only provided keys are written. This backs both the
// step-by-step onboarding saves and the settings page.
router.patch("/", async (req, res) => {
  const u = req.user;
  const b = req.body || {};
  const fields = {};

  if (b.name !== undefined) fields.name = str(b.name, "name", { max: 120 });
  if (b.currency !== undefined) {
    fields.currency = oneOf(b.currency, "currency", CURRENCY_CODES);
    // Locale is derived from currency unless explicitly provided.
    fields.locale = typeof b.locale === "string" && b.locale ? b.locale.slice(0, 35) : localeFor(fields.currency);
  } else if (b.locale !== undefined) {
    fields.locale = str(b.locale, "locale", { max: 35 });
  }
  if (b.incomeType !== undefined) {
    fields.incomeType = oneOf(b.incomeType, "incomeType", INCOME_TYPES);
    // Each mode owns a different amount field; clear the other so no stale figure
    // survives a switch. Fixed → monthlyIncome; irregular → incomeEstimate.
    if (fields.incomeType === "irregular") fields.monthlyIncome = null;
    if (fields.incomeType === "fixed") fields.incomeEstimate = null;
  }
  if (b.coachOptOut !== undefined) fields.coachOptOut = b.coachOptOut ? 1 : 0;
  // Source(s) of income — MULTI-SELECT: known keys and/or the user's own "other"
  // text. Accepts an array (preferred) or a single string; stored as a JSON array.
  // Empty / null clears it. Free-text-capable, so no oneOf restriction.
  if (b.incomeSource !== undefined) {
    const v = b.incomeSource;
    if (v === null || v === "" || (Array.isArray(v) && v.length === 0)) {
      fields.incomeSource = null;
    } else {
      const arr = (Array.isArray(v) ? v : [v]).map((s) => str(s, "incomeSource", { max: 80 }));
      fields.incomeSource = JSON.stringify([...new Set(arr)].slice(0, 12));
    }
  }
  // Don't let an explicit monthlyIncome override the null we just set for a
  // same-request switch to irregular income (irregular has no single figure).
  if (b.monthlyIncome !== undefined && fields.incomeType !== "irregular") {
    fields.monthlyIncome = intMinor(b.monthlyIncome, "monthlyIncome", { min: 0, allowNull: true });
  }
  // Irregular income's self-reported "typical month" — an ESTIMATE, never a fixed
  // salary. Symmetric guard: ignored if we're switching to fixed in the same request.
  if (b.incomeEstimate !== undefined && fields.incomeType !== "fixed") {
    fields.incomeEstimate = intMinor(b.incomeEstimate, "incomeEstimate", { min: 0, allowNull: true });
  }
  if (b.monthlySpend !== undefined) fields.monthlySpend = intMinor(b.monthlySpend, "monthlySpend", { min: 0, allowNull: true });
  if (b.savings !== undefined) fields.savings = intMinor(b.savings, "savings", { min: 0, allowNull: true });
  if (b.topCategory !== undefined) {
    fields.topCategory =
      b.topCategory === null || b.topCategory === "" ? null : str(b.topCategory, "topCategory", { max: 60 });
  }
  // Financial focus — MULTI-SELECT: an array of known keys (or a single key),
  // stored as a JSON array. Empty / null clears it.
  if (b.focus !== undefined) {
    const v = b.focus;
    if (v === null || v === "" || (Array.isArray(v) && v.length === 0)) {
      fields.focus = null;
    } else {
      const arr = (Array.isArray(v) ? v : [v]).map((k) => oneOf(k, "focus", FOCUS_OPTIONS));
      fields.focus = JSON.stringify([...new Set(arr)]);
    }
  }
  if (b.habits !== undefined) {
    if (b.habits === null) {
      fields.habits = null;
    } else {
      // Stored as an opaque JSON blob, so cap it rather than let an arbitrary
      // object ride the 64kb body limit straight into the row.
      const json = JSON.stringify(b.habits);
      if (json.length > 2000) throw new HttpError(422, "habits is too large");
      fields.habits = json;
    }
  }
  if (b.onboarded !== undefined) fields.onboarded = b.onboarded ? 1 : 0;

  const keys = Object.keys(fields);
  if (keys.length === 0) throw new HttpError(422, "No valid fields to update");

  const setSql = keys.map((k) => `${k} = @${k}`).join(", ");
  await db.prepare(`UPDATE users SET ${setSql} WHERE id = @id`).run({ ...fields, id: u.id });
  const row = await db.prepare("SELECT * FROM users WHERE id = ?").get(u.id);
  res.json({ user: publicUser(row) });
});

// POST /api/user/password — change password, requires the current one.
router.post("/password", async (req, res) => {
  const current = str(req.body?.current, "current", { min: 1, max: 200, trim: false });
  const next = str(req.body?.next, "next", { min: 8, max: 200, trim: false });
  if (!bcrypt.compareSync(current, req.user.passwordHash)) {
    throw new HttpError(401, "Current password is incorrect", "bad_credentials");
  }
  const hash = bcrypt.hashSync(next, 12);
  // Bump tokenVersion so every previously issued JWT (other devices, any stolen
  // token) is instantly rejected, then re-mint this session's cookie so the user
  // who just changed their password stays signed in on this device.
  const newVersion = (req.user.tokenVersion ?? 0) + 1;
  await db.prepare("UPDATE users SET passwordHash = ?, tokenVersion = ? WHERE id = ?").run(hash, newVersion, req.user.id);
  setAuthCookie(res, req.user.id, newVersion);
  res.json({ ok: true });
});

// DELETE /api/user — delete the account and ALL its rows, clear cookie.
router.delete("/", async (req, res) => {
  await deleteUser(req.user.id);
  clearAuthCookie(res);
  res.json({ ok: true });
});

// GET /api/user/meta — reference data the client needs (currencies, categories).
router.get("/meta", (_req, res) => {
  res.json({ currencies: CURRENCIES, categories: DEFAULT_CATEGORIES, focusOptions: FOCUS_OPTIONS, incomeSources: INCOME_SOURCES, estimateCategories: ESTIMATE_CATEGORIES, supportEmail: SUPPORT_EMAIL });
});

export default router;
