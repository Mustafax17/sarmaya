import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { db } from "./db.js";
import { HttpError, email as vEmail, str } from "./validate.js";

const BCRYPT_COST = 12;

// Public shape of a user — never leaks passwordHash.
export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    currency: row.currency,
    locale: row.locale,
    incomeType: row.incomeType || "fixed",
    incomeSource: parseList(row.incomeSource), // now multi-select → array
    incomeEstimate: row.incomeEstimate ?? null,
    coachOptOut: Boolean(row.coachOptOut),
    monthlyIncome: row.monthlyIncome,
    monthlySpend: row.monthlySpend,
    savings: row.savings,
    topCategory: row.topCategory,
    focus: parseList(row.focus), // now multi-select → array
    habits: row.habits ? safeParse(row.habits) : null,
    onboarded: Boolean(row.onboarded),
    isAdmin: Boolean(row.email && row.email.toLowerCase() === config.adminEmail),
    createdAt: row.createdAt,
  };
}

const safeParse = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

// Multi-select columns store a JSON array; older rows may hold a single string.
// Always hand the client a clean array.
const parseList = (s) => {
  if (s == null || s === "") return [];
  if (typeof s === "string" && s.startsWith("[")) {
    try {
      const a = JSON.parse(s);
      return Array.isArray(a) ? a.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  }
  return [s];
};

export function setAuthCookie(res, userId, tokenVersion = 0) {
  const token = jwt.sign({ uid: userId, tv: tokenVersion }, config.jwtSecret, {
    algorithm: "HS256", // pin the signing algorithm explicitly
    expiresIn: config.tokenTtlSeconds,
  });
  res.cookie(config.cookieName, token, {
    httpOnly: true, // JS can't read it — no token in localStorage, ever
    secure: config.isProd, // HTTPS-only in production
    sameSite: "lax",
    maxAge: config.tokenTtlSeconds * 1000,
    path: "/",
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(config.cookieName, { path: "/" });
}

// Reads + verifies the cookie, loads the user. Attaches req.user or throws 401.
export async function requireAuth(req, _res, next) {
  let payload;
  try {
    const token = req.cookies?.[config.cookieName];
    if (!token) throw new HttpError(401, "Not signed in");
    // Pin the accepted algorithm — never let a token dictate its own verification
    // (blocks alg:none and HS/RS confusion attacks).
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
  } catch (err) {
    if (err instanceof HttpError) return next(err);
    return next(new HttpError(401, "Session expired or invalid"));
  }
  // A database outage is a 500, not a "please sign in again".
  let row;
  try {
    row = await db.prepare("SELECT * FROM users WHERE id = ?").get(payload.uid);
  } catch (err) {
    return next(err);
  }
  if (!row) return next(new HttpError(401, "Session no longer valid"));
  // Token must match the account's current version. A password change bumps the
  // version, instantly invalidating every previously issued token. Tokens minted
  // before this feature carry no tv → treated as 0, so they keep working.
  if ((payload.tv ?? 0) !== (row.tokenVersion ?? 0)) return next(new HttpError(401, "Session no longer valid"));
  req.user = row;
  next();
}

export async function register(req, res) {
  const email = vEmail(req.body?.email);
  const password = str(req.body?.password, "password", { min: 1, max: 200, trim: false });
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 120) : "";

  // Enforce a minimum strength server-side (never trust the client). Coded so
  // the client can surface a specific "weak password" message.
  if (password.length < 8) throw new HttpError(422, "Password must be at least 8 characters", "weak_password");

  const existing = await db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) throw new HttpError(409, "That email is already registered", "email_taken");

  const passwordHash = bcrypt.hashSync(password, BCRYPT_COST);
  const createdAt = new Date().toISOString();
  const info = await db
    .prepare(
      `INSERT INTO users (email, passwordHash, name, currency, locale, onboarded, createdAt)
       VALUES (?,?,?,?,?,0,?)`,
    )
    .run(email, passwordHash, name, "USD", "en-US", createdAt);

  setAuthCookie(res, info.lastInsertRowid, 0);
  const row = await db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ user: publicUser(row) });
}

export async function login(req, res) {
  const email = vEmail(req.body?.email);
  const password = str(req.body?.password, "password", { min: 1, max: 200, trim: false });

  const row = await db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  // Same generic error whether the email exists or not — no account enumeration.
  // Still run a hash compare to avoid timing leaks when the email is unknown.
  const ok = row
    ? bcrypt.compareSync(password, row.passwordHash)
    : bcrypt.compareSync(password, "$2a$12$............................................invalid");
  if (!row || !ok) throw new HttpError(401, "Incorrect email or password", "bad_credentials");

  setAuthCookie(res, row.id, row.tokenVersion ?? 0);
  res.json({ user: publicUser(row) });
}

export function logout(_req, res) {
  clearAuthCookie(res);
  res.json({ ok: true });
}

export function me(req, res) {
  res.json({ user: publicUser(req.user) });
}
