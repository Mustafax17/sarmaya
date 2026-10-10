// Locale-aware money + date formatting. Amounts are stored as INTEGER minor
// units everywhere; we convert to major units ONLY here, at the display edge.
// Never hand-roll "Rs. " + n — Intl knows each currency's symbol, placement,
// grouping and decimal count.

export const ZERO_DECIMAL = new Set(["JPY"]);

const minorFactor = (currency) => (ZERO_DECIMAL.has(currency) ? 1 : 100);

// Minor units (paisa/cents/yen) -> major units (rupees/dollars/yen).
export const toMajor = (minor, currency) => (Number(minor) || 0) / minorFactor(currency);

// Major units (what a user types) -> integer minor units for storage.
export const toMinor = (major, currency) => Math.round((Number(major) || 0) * minorFactor(currency));

const fmtCache = new Map();
function currencyFmt(locale, currency, opts) {
  const key = `${locale}|${currency}|${JSON.stringify(opts || {})}`;
  let f = fmtCache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale || "en-US", { style: "currency", currency, ...opts });
    } catch {
      // Fallback if a locale/currency combo is unsupported by the runtime.
      f = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", ...opts });
    }
    fmtCache.set(key, f);
  }
  return f;
}

// Full money format, e.g. "Rs 1,850", "$1,850.50", "¥1,850".
export function fmtMoney(minor, currency = "USD", locale = "en-US") {
  return currencyFmt(locale, currency).format(toMajor(minor, currency));
}

// Compact money, e.g. "Rs 1.2M", "$340K" — also locale-aware.
export function fmtCompact(minor, currency = "USD", locale = "en-US") {
  return currencyFmt(locale, currency, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(toMajor(minor, currency));
}

// The currency symbol alone (for input adornments).
export function currencySymbol(currency = "USD", locale = "en-US") {
  const parts = currencyFmt(locale, currency).formatToParts(0);
  return parts.find((p) => p.type === "currency")?.value || currency;
}

// --- Dates (ISO strings) ---
export function fmtDate(iso, locale = "en-US", opts = { month: "short", day: "numeric" }) {
  if (typeof iso !== "string") return "—";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(locale, opts).format(d);
  } catch {
    return new Intl.DateTimeFormat("en-US", opts).format(d);
  }
}

export const monthKey = (iso) => (typeof iso === "string" ? iso.slice(0, 7) : "");

export function monthLabel(key, locale = "en-US") {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, (m || 1) - 1, 1);
  try {
    return new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit" }).format(d);
  } catch {
    return key;
  }
}

export function todayISO() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
