// Small server-side validation helpers. Every route uses these before touching
// the DB — the client is never trusted.

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || undefined;
  }
}

export const bad = (msg, code) => {
  throw new HttpError(422, msg, code);
};

export function str(v, field, { min = 1, max = 200, trim = true } = {}) {
  if (typeof v !== "string") bad(`${field} must be a string`);
  const s = trim ? v.trim() : v;
  if (s.length === 0) bad(`${field} is required`);
  if (s.length < min) bad(`${field} must be at least ${min} characters`);
  if (s.length > max) bad(`${field} is too long`);
  return s;
}

export function optStr(v, field, opts) {
  if (v === undefined || v === null || v === "") return null;
  return str(v, field, opts);
}

// Integer minor units. Rejects floats, NaN, negatives (unless allowNeg).
export function intMinor(v, field, { min = 0, allowNull = false } = {}) {
  if ((v === undefined || v === null) && allowNull) return null;
  if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v)) {
    bad(`${field} must be an integer amount in minor units`);
  }
  if (v < min) bad(`${field} must be >= ${min}`);
  return v;
}

export function num(v, field, { min = -Infinity, max = Infinity, allowNull = false } = {}) {
  if ((v === undefined || v === null) && allowNull) return null;
  if (typeof v !== "number" || !Number.isFinite(v)) bad(`${field} must be a number`);
  if (v < min || v > max) bad(`${field} out of range`);
  return v;
}

export function oneOf(v, field, allowed, { allowNull = false } = {}) {
  if ((v === undefined || v === null || v === "") && allowNull) return null;
  if (!allowed.includes(v)) bad(`${field} is invalid`);
  return v;
}

// Nullable boolean. null/undefined -> null (absence); anything else coerced to 0/1.
export function boolNull(v) {
  if (v === undefined || v === null) return null;
  return v ? 1 : 0;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export function isoDate(v, field, { allowNull = false } = {}) {
  if ((v === undefined || v === null || v === "") && allowNull) return null;
  if (typeof v !== "string" || !ISO_DATE.test(v)) bad(`${field} must be a YYYY-MM-DD date`);
  const d = new Date(v + "T00:00:00");
  if (Number.isNaN(d.getTime())) bad(`${field} is not a valid date`);
  return v;
}

export function email(v) {
  const s = str(v, "email", { max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) bad("Enter a valid email address");
  return s;
}

// A positive integer id from a route param.
export function idParam(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(404, "Not found");
  return n;
}
