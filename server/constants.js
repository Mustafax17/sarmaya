// Domain constants shared across server routes for validation.
// The client mirrors these (with icons/colors, which can't live server-side).

// Public contact address, surfaced to the client via /api/user/meta so it lives
// in exactly one place. Change it here and the whole app follows.
export const SUPPORT_EMAIL = "ayeshairfan9991@gmail.com";

// ISO 4217 currency codes we support. Easy to extend — add a code here and the
// client's currency picker + Intl formatting pick it up automatically.
export const CURRENCIES = [
  { code: "PKR", label: "Pakistani Rupee", locale: "en-PK" },
  { code: "USD", label: "US Dollar", locale: "en-US" },
  { code: "EUR", label: "Euro", locale: "en-IE" },
  { code: "GBP", label: "British Pound", locale: "en-GB" },
  { code: "INR", label: "Indian Rupee", locale: "en-IN" },
  { code: "AED", label: "UAE Dirham", locale: "en-AE" },
  { code: "SAR", label: "Saudi Riyal", locale: "en-SA" },
  { code: "CAD", label: "Canadian Dollar", locale: "en-CA" },
  { code: "AUD", label: "Australian Dollar", locale: "en-AU" },
  { code: "JPY", label: "Japanese Yen", locale: "ja-JP" },
];
export const CURRENCY_CODES = CURRENCIES.map((c) => c.code);

// Zero-decimal currencies (no minor unit). Used to interpret integer amounts.
export const ZERO_DECIMAL = new Set(["JPY"]);

// Default seed categories. Users may add custom categories on top of these.
export const DEFAULT_CATEGORIES = [
  "Food",
  "Transport",
  "Fuel",
  "Utilities",
  "Shopping",
  "Entertainment",
  "Health",
  "Education",
  "Bills",
];

export const TX_TYPES = ["in", "out"];

// Suggested (optional, never assumed) categories for the onboarding "roughly
// what do you spend each month?" estimates step. Easy to extend; the user can
// also add a custom category. These are SELF-REPORTED, never transactions.
export const ESTIMATE_CATEGORIES = [
  "Food", "Transport", "Fuel", "Rent/Housing", "Subscriptions",
  "Utilities", "Bills/Utilities", "Health", "Shopping", "Education",
];

// A transaction's economic role. Obligations are money that leaves but was
// never a choice (family support, fixed commitments) — never "spending".
export const TX_KINDS = ["discretionary", "obligation", "income"];

// Optional one-tap behavioural context captured at log time (see Patterns).
export const TRIGGERS = ["bored", "hungry", "with_friends", "celebrating", "stressed", "planned", "other"];

// Income model + informal-debt vocabulary.
export const INCOME_TYPES = ["fixed", "irregular"];

// Where someone's money comes from — a self-reported pick used to reason about
// cash-flow STABILITY (e.g. irregular freelance income → prioritise a buffer),
// never to invent an amount. "Other" is free text, stored verbatim, so a stored
// incomeSource is EITHER one of these keys OR the user's own words.
export const INCOME_SOURCES = [
  { key: "salaried", label: "Salaried job" },
  { key: "freelance", label: "Freelance / self-employed" },
  { key: "business", label: "Business" },
  { key: "family_support", label: "Family support / allowance" },
  { key: "remittance", label: "Remittance" },
  { key: "investments", label: "Investments" },
  { key: "multiple", label: "Multiple sources" },
];
export const INCOME_SOURCE_KEYS = INCOME_SOURCES.map((s) => s.key);
// Human label for a stored incomeSource: a known key maps to its label; anything
// else is the user's own free text and is returned as-is.
export function incomeSourceLabel(v) {
  if (!v) return null;
  return INCOME_SOURCES.find((s) => s.key === v)?.label || v;
}

export const DEBT_KINDS = ["informal", "formal"];
export const DEBT_DIRECTIONS = ["owe", "owed"];
export const CADENCES = ["weekly", "monthly", "quarterly", "yearly"];

// Financial focus options (onboarding step 9).
export const FOCUS_OPTIONS = ["save_consistently", "pay_off_debt", "emergency_fund", "save_for_goal"];

// Zero-decimal-aware conversion between what a person reads on a receipt and
// what we store. Mirrors client/src/lib/format.js — ¥1,850 is 1850 minor units,
// Rs 1,850.00 is 185000. Getting this wrong by a factor of 100 is the single
// most damaging bug this app could ship, so it lives next to ZERO_DECIMAL.
const minorFactor = (currency) => (ZERO_DECIMAL.has(currency) ? 1 : 100);
export function toMinorUnits(major, currency) {
  const n = Number(major);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * minorFactor(currency));
}

// Merchant / keyword -> category. MIRRORS the CAT_HINTS table in
// client/src/lib/stats.js: the client needs it for typed natural-language entry,
// the server for receipt extraction, and a server route can't import client code.
// Change one, change the other.
export const CAT_HINTS = [
  ["Food", ["food", "lunch", "dinner", "breakfast", "grocer", "restaurant", "chai", "biryani", "eat", "cafe", "coffee", "snack", "foodpanda", "pizza", "burger", "khana"]],
  ["Fuel", ["fuel", "petrol", "diesel", "cng", "gas station", "filling station", "pump"]],
  ["Utilities", ["electric", "electricity", "utility", "utilities", "water bill", "gas bill", "internet", "wifi", "broadband"]],
  ["Transport", ["uber", "careem", "rickshaw", "bus", "metro", "taxi", "travel", "ride", "fare"]],
  ["Bills", ["bill", "rent", "phone", "mobile", "subscription", "netflix", "spotify"]],
  ["Shopping", ["shop", "clothes", "shirt", "shoes", "amazon", "daraz", "mall", "bought", "buy"]],
  ["Health", ["doctor", "medicine", "pharmacy", "hospital", "gym", "clinic", "health", "dentist"]],
  ["Entertainment", ["movie", "cinema", "game", "party", "concert", "outing", "netflix"]],
  ["Education", ["course", "book", "tuition", "class", "udemy", "fee", "school", "university"]],
];

// Unlike the client's parser (which defaults an unmatched expense to "Food"
// because the user is watching and can correct it inline), this returns null on
// no match: a scanned receipt should leave the category blank and ask, rather
// than quietly file a pharmacy run under Food.
export function guessCategory(text) {
  const low = (text || "").toLowerCase();
  for (const [cat, words] of CAT_HINTS) if (words.some((w) => low.includes(w))) return cat;
  return null;
}

// Challenge library. `key` is stored per user-join; copy is client-side.
export const CHALLENGE_LIBRARY = [
  { key: "no_spend_week", name: "No-spend week" },
  { key: "cook_at_home", name: "Cook at home 5 days" },
  { key: "cancel_subscription", name: "Cancel one subscription" },
  { key: "round_up_savings", name: "Round-up savings" },
  { key: "track_daily", name: "Log every expense for a week" },
];
export const CHALLENGE_KEYS = CHALLENGE_LIBRARY.map((c) => c.key);
