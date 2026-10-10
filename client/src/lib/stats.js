// THE single source of truth for spending analysis. Every breakdown, chart and
// headline number derives from spendStats(). Nothing here invents a figure —
// empty input yields honest zeroes/empty arrays, and callers render empty states.
//
// Transactions: { id, name, cat, amount (minor, positive), type: 'in'|'out', date }

import { monthKey, monthLabel } from "./format.js";
import { catColor } from "../theme.js";

const isIn = (t) => t.type === "in";
// "Spending" is DISCRETIONARY outflow only. Obligations (family support, fixed
// commitments) leave money but were never a choice — never counted as spending.
const isDiscretionary = (t) => t.type === "out" && t.kind !== "obligation";
const isObligation = (t) => t.type === "out" && t.kind === "obligation";

// Total obligations logged (money that left but wasn't discretionary).
export function obligationsSum(transactions) {
  return transactions.filter(isObligation).reduce((s, t) => s + t.amount, 0);
}

// Spending grouped by category (discretionary only). Minor units. Guarded for [].
export function spendStats(transactions) {
  const out = transactions.filter(isDiscretionary);
  const total = out.reduce((s, t) => s + t.amount, 0);
  const byCat = new Map();
  for (const t of out) byCat.set(t.cat, (byCat.get(t.cat) || 0) + t.amount);
  const categories = [...byCat.entries()]
    .map(([name, amount]) => ({
      name,
      amount,
      share: total > 0 ? amount / total : 0,
      color: catColor(name),
    }))
    .sort((a, b) => b.amount - a.amount);
  return { total, count: out.length, categories, top: categories[0] || null };
}

// Per-month income / discretionary spend / obligations / net, ascending.
export function monthlyTotals(transactions, locale = "en-US") {
  const map = new Map();
  for (const t of transactions) {
    const k = monthKey(t.date);
    if (!k) continue;
    const row = map.get(k) || { key: k, spend: 0, obligation: 0, income: 0 };
    if (isObligation(t)) row.obligation += t.amount;
    else if (isDiscretionary(t)) row.spend += t.amount;
    else if (isIn(t)) row.income += t.amount;
    map.set(k, row);
  }
  return [...map.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((r) => ({ ...r, label: monthLabel(r.key, locale), net: r.income - r.spend - r.obligation }));
}

// Rolling income FLOOR: the lowest monthly income total across the trailing six
// months that carry income. The average lies to people whose worst month is the
// one that breaks them. null when no income has been logged.
export function incomeFloor(transactions) {
  const byMonth = new Map();
  for (const t of transactions) {
    if (!isIn(t)) continue;
    const k = monthKey(t.date);
    if (k) byMonth.set(k, (byMonth.get(k) || 0) + t.amount);
  }
  if (byMonth.size === 0) return null;
  const recent = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
  return Math.min(...recent.map(([, v]) => v));
}

// Behavioural patterns from trigger tags. Shown from the very first tagged
// transaction — the breakdown reflects exactly however many tags exist (the page
// always states the sample size, so a small sample reads as a small sample).
// Never infers a trigger the user didn't tag.
export function patternStats(transactions, minSample = 1) {
  const tagged = transactions.filter((t) => t.type === "out" && t.trigger);
  if (tagged.length < minSample) {
    return { unlocked: false, sampleSize: tagged.length, minSample, needed: minSample - tagged.length, byTrigger: [] };
  }
  const map = new Map();
  for (const t of tagged) {
    const r = map.get(t.trigger) || { trigger: t.trigger, total: 0, count: 0, ratedYes: 0, rated: 0 };
    r.total += t.amount;
    r.count += 1;
    if (t.worthIt === true || t.worthIt === false) {
      r.rated += 1;
      if (t.worthIt) r.ratedYes += 1;
    }
    map.set(t.trigger, r);
  }
  const byTrigger = [...map.values()]
    .map((r) => ({
      trigger: r.trigger,
      total: r.total,
      count: r.count,
      avg: Math.round(r.total / r.count),
      worthItPct: r.rated ? Math.round((r.ratedYes / r.rated) * 100) : null,
    }))
    .sort((a, b) => b.avg - a.avg);
  return { unlocked: true, sampleSize: tagged.length, minSample, byTrigger };
}

// Month-over-month spending change for the two most recent months present.
export function momSpending(transactions, locale = "en-US") {
  const months = monthlyTotals(transactions, locale);
  if (months.length < 2) return null;
  const cur = months[months.length - 1];
  const prev = months[months.length - 2];
  const diff = cur.spend - prev.spend;
  const pct = prev.spend > 0 ? Math.round((diff / prev.spend) * 100) : null;
  return { cur, prev, diff, pct };
}

// "What changed?" — a plain-language month-over-month comparison, derived ENTIRELY
// from logged transactions. Returns null until two calendar months carry activity,
// so we never narrate a month we can't see. `spendDelta` is discretionary spending;
// `netDelta` is what was KEPT (income minus every outflow) — the honest stand-in
// for a savings change, since the app keeps no savings history to compute against.
export function monthComparison(transactions, locale = "en-US") {
  const months = monthlyTotals(transactions, locale);
  if (months.length < 2) return null;
  const cur = months[months.length - 1];
  const prev = months[months.length - 2];

  // Discretionary spend by category, for one month key.
  const catFor = (key) => {
    const m = new Map();
    for (const t of transactions) {
      if (monthKey(t.date) !== key) continue;
      if (!(t.type === "out" && t.kind !== "obligation")) continue;
      m.set(t.cat, (m.get(t.cat) || 0) + t.amount);
    }
    return m;
  };
  const curCat = catFor(cur.key);
  const prevCat = catFor(prev.key);
  const deltas = [...new Set([...curCat.keys(), ...prevCat.keys()])].map((name) => ({
    name,
    delta: (curCat.get(name) || 0) - (prevCat.get(name) || 0),
  }));
  const increases = deltas.filter((c) => c.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3);
  const decreases = deltas.filter((c) => c.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3);

  return {
    cur,
    prev,
    spendDelta: cur.spend - prev.spend, // discretionary spending change
    netDelta: cur.net - prev.net, // change in what was kept (income - all outflow)
    incomeDelta: cur.income - prev.income,
    hasIncome: cur.income > 0 || prev.income > 0,
    increases,
    decreases,
  };
}

// Coach insight cards — each computed from real transactions. Returns [] when
// there isn't enough data (caller then falls back to self-report, clearly labeled).
export function buildInsights(transactions, locale = "en-US") {
  const stats = spendStats(transactions);
  if (stats.count === 0) return [];
  const cards = [];
  const months = monthlyTotals(transactions, locale);

  if (stats.top) {
    cards.push({
      id: "top-cat",
      tone: "neutral",
      iconName: "TrendingUp",
      title: `${stats.top.name} is your biggest expense`,
      body: `It's ${Math.round(stats.top.share * 100)}% of your logged spending, across ${stats.count} transactions.`,
      source: "computed",
    });
  }

  const mom = momSpending(transactions, locale);
  if (mom) {
    cards.push({
      id: "mom",
      tone: mom.diff <= 0 ? "good" : "warn",
      iconName: mom.diff <= 0 ? "PiggyBank" : "Flame",
      title: mom.diff <= 0 ? `Spending down in ${mom.cur.label}` : `Spending up in ${mom.cur.label}`,
      body:
        mom.pct === null
          ? `Compared with ${mom.prev.label}.`
          : `${mom.diff <= 0 ? "Down" : "Up"} ${Math.abs(mom.pct)}% vs ${mom.prev.label}.`,
      source: "computed",
    });
  }

  const cur = months[months.length - 1];
  if (cur && cur.income > 0) {
    // Savings rate is net of ALL outflow (discretionary + obligations).
    const rate = Math.round((cur.net / cur.income) * 100);
    cards.push({
      id: "savings",
      tone: rate >= 20 ? "good" : rate >= 0 ? "neutral" : "warn",
      iconName: "Target",
      title: `Savings rate: ${rate}% in ${cur.label}`,
      body: rate >= 0 ? `You kept ${rate}% of your income that month.` : `You spent more than you earned that month.`,
      source: "computed",
    });
  }

  return cards;
}

/* ---------------- Natural-language transaction parser ----------------
 * Prefers a currency-anchored number, else the largest number in the string.
 * Understands k / lakh suffixes and commas. Matches merchant/keywords to a
 * category. Fails gracefully with a helpful message when nothing parses.
 * Returns { ok, amountMajor, cat, name, type } or { ok:false, error }.
 */
const CAT_HINTS = [
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
const INCOME_WORDS = ["salary", "income", "got paid", "received", "refund", "bonus", "freelance", "earned", "paycheck"];

function guessCategory(text) {
  const low = text.toLowerCase();
  for (const [cat, words] of CAT_HINTS) if (words.some((w) => low.includes(w))) return cat;
  return "Food"; // most common default for an unmatched expense; user can change
}

export function parseNL(raw) {
  const text = (raw || "").trim();
  if (!text) return { ok: false, error: "Type something like “spent 1850 on foodpanda”." };
  const low = text.toLowerCase();

  const numRe = /(?:(rs|pkr|₨|rupees?|\$|usd|£|€|₹|aed|sar|cad|aud|¥|jpy)\s*)?([\d,]+(?:\.\d+)?)\s*(k|lakh|lac|m|million)?/gi;
  const found = [];
  let m;
  while ((m = numRe.exec(text)) !== null) {
    let value = parseFloat(m[2].replace(/,/g, ""));
    if (Number.isNaN(value)) continue;
    const suffix = (m[3] || "").toLowerCase();
    if (suffix === "k") value *= 1000;
    else if (suffix === "lakh" || suffix === "lac") value *= 100000;
    else if (suffix === "m" || suffix === "million") value *= 1000000;
    found.push({ value, anchored: Boolean(m[1]) });
  }
  if (found.length === 0) return { ok: false, error: "Couldn't find an amount. Try “500 groceries”." };

  const anchored = found.filter((f) => f.anchored);
  const pick = (anchored.length ? anchored : found).reduce((a, b) => (b.value > a.value ? b : a));
  const amountMajor = pick.value;
  if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
    return { ok: false, error: "That amount didn't look right." };
  }

  const type = INCOME_WORDS.some((w) => low.includes(w)) ? "in" : "out";
  const cat = type === "in" ? "Bills" : guessCategory(text);

  let name = text
    .replace(numRe, " ")
    .replace(/\b(on|for|at|spent|paid|got|received|yesterday|today|the|a|an)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) name = type === "in" ? "Income" : cat;
  name = name.charAt(0).toUpperCase() + name.slice(1);

  return { ok: true, amountMajor, cat, name, type };
}
