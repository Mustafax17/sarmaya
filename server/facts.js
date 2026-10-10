// Builds the FACTS object the coach reasons from. THE COACH NEVER SEES RAW
// TRANSACTIONS AND NEVER DOES ARITHMETIC — the server computes everything here.
// Every rule from the coach architecture is enforced in this file:
//   • money is pre-formatted with Intl (the model never formats currency)
//   • null (not zero) for unknowns — absence must be distinguishable from a fact
//   • every denominator and window is named in the field itself
//     (pctOfDiscretionary, obligationsInWindow, savings-cumulative, ...)
//   • provenance is marked: selfReported lists onboarding-sourced fields
//   • only a first name ever leaves; no email / account ids

import { db } from "./db.js";
import { incomeSourceLabel } from "./constants.js";

const PATTERN_MIN_SAMPLE = 1; // patterns surface from the first tagged transaction; sample size is always stated
const ZERO_DECIMAL = new Set(["JPY"]);

function moneyFmt(currency, locale) {
  let fmt;
  try {
    fmt = new Intl.NumberFormat(locale || "en-US", { style: "currency", currency, maximumFractionDigits: 0 });
  } catch {
    fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  }
  const factor = ZERO_DECIMAL.has(currency) ? 1 : 100;
  return (minor) => (minor == null ? null : fmt.format(minor / factor));
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const monthKey = (iso) => (typeof iso === "string" ? iso.slice(0, 7) : "");
const monthName = (key, locale) => {
  const [y, m] = key.split("-").map(Number);
  try {
    return new Intl.DateTimeFormat(locale || "en-US", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
  } catch {
    return key;
  }
};
const monthsBetween = (iso) => {
  if (!iso) return null;
  const then = new Date(iso + "T00:00:00");
  if (Number.isNaN(then.getTime())) return null;
  const now = new Date();
  return Math.max(0, Math.round((now - then) / (1000 * 60 * 60 * 24 * 30.4)));
};

export async function buildFacts(user) {
  const money = moneyFmt(user.currency, user.locale);
  const txs = await db.prepare("SELECT * FROM transactions WHERE userId = ? ORDER BY date DESC").all(user.id);
  const windowStart = daysAgoISO(30);
  const inWindow = (t) => t.date >= windowStart;

  const discretionary = (t) => t.type === "out" && t.kind !== "obligation" && t.kind !== "income";
  const obligation = (t) => t.type === "out" && t.kind === "obligation";
  const income = (t) => t.type === "in";

  // --- window sums ---
  const winTx = txs.filter(inWindow);
  const obligationsInWindow = winTx.filter(obligation).reduce((s, t) => s + t.amount, 0);
  const discTx = winTx.filter(discretionary);
  const discretionaryInWindow = discTx.reduce((s, t) => s + t.amount, 0);

  // Balance-awareness: `netFlow` is purely computed (all logged income minus all
  // logged outflow); `balance` is what the dashboard shows the user actually has
  // to work with — self-reported savings PLUS that computed net flow. Because it
  // includes savings, its savings portion is self-reported (see selfReported).
  const netFlowMinor = txs.reduce((s, t) => s + (t.type === "in" ? t.amount : -t.amount), 0);
  const balanceMinor = (user.savings || 0) + netFlowMinor;

  // --- category breakdown (discretionary, in window) with named denominator ---
  const byCat = new Map();
  for (const t of discTx) byCat.set(t.cat, (byCat.get(t.cat) || 0) + t.amount);
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const pctOfDisc = (amt) => (discretionaryInWindow > 0 ? Math.round((amt / discretionaryInWindow) * 100) : null);
  const enoughForComputed = discTx.length >= 5;

  let topCategory = null;
  let secondCategory = null;
  const selfReported = ["savings"]; // savings is always an onboarding figure
  if (enoughForComputed && cats[0]) {
    topCategory = { name: cats[0][0], amount: money(cats[0][1]), pctOfDiscretionary: pctOfDisc(cats[0][1]) };
    if (cats[1]) secondCategory = { name: cats[1][0], amount: money(cats[1][1]), pctOfDiscretionary: pctOfDisc(cats[1][1]) };
  } else if (user.topCategory) {
    // Not enough real data — fall back to the self-reported guess, and SAY so.
    topCategory = { name: user.topCategory, amount: null, pctOfDiscretionary: null };
    selfReported.push("topCategory");
  }

  // --- income floor (rolling 6-month low) ---
  const incByMonth = new Map();
  for (const t of txs) if (income(t)) incByMonth.set(monthKey(t.date), (incByMonth.get(monthKey(t.date)) || 0) + t.amount);
  const incMonths = [...incByMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
  const incomeFloorMinor = incMonths.length ? Math.min(...incMonths.map(([, v]) => v)) : null;

  // --- months of data + month-over-month discretionary spending ---
  const allMonths = [...new Set(txs.map((t) => monthKey(t.date)).filter(Boolean))].sort();
  const spendByMonth = new Map();
  for (const t of txs) if (discretionary(t)) spendByMonth.set(monthKey(t.date), (spendByMonth.get(monthKey(t.date)) || 0) + t.amount);
  let monthOverMonth = null;
  if (allMonths.length >= 2) {
    const cur = spendByMonth.get(allMonths[allMonths.length - 1]) || 0;
    const prev = spendByMonth.get(allMonths[allMonths.length - 2]) || 0;
    monthOverMonth = {
      spending: prev > 0 ? Math.round(((cur - prev) / prev) * 100) / 100 : null,
      savings: null, // we don't keep a savings history, so we cannot compute this
    };
  }

  // --- goals & debts ---
  const goals = (await db.prepare("SELECT name, target, saved, deadline FROM goals WHERE userId = ?").all(user.id))
    .map((g) => ({ name: g.name, target: money(g.target), saved: money(g.saved), deadline: g.deadline }));

  const debts = (await db.prepare("SELECT * FROM debts WHERE userId = ?").all(user.id))
    .map((d) => ({
      counterparty: d.counterparty || d.name,
      direction: d.direction,
      outstanding: money(Math.max(0, d.principal - d.paid)),
      monthsOpen: monthsBetween(d.since),
      kind: d.kind,
    }));

  // --- patterns (locked until minimum tagged sample) ---
  const tagged = txs.filter((t) => t.type === "out" && t.trigger);
  let patterns = null;
  if (tagged.length >= PATTERN_MIN_SAMPLE) {
    const map = new Map();
    for (const t of tagged) {
      const r = map.get(t.trigger) || { trigger: t.trigger, total: 0, count: 0, rated: 0, yes: 0 };
      r.total += t.amount;
      r.count += 1;
      if (t.worthIt === 1 || t.worthIt === 0) {
        r.rated += 1;
        if (t.worthIt === 1) r.yes += 1;
      }
      map.set(t.trigger, r);
    }
    patterns = {
      sampleSize: tagged.length,
      byTrigger: [...map.values()]
        .sort((a, b) => b.total / b.count - a.total / a.count)
        .map((r) => ({
          trigger: r.trigger,
          avg: money(Math.round(r.total / r.count)),
          count: r.count,
          worthItPct: r.rated ? Math.round((r.yes / r.rated) * 100) : null,
        })),
    };
  }

  // --- data gaps ---
  const dataGaps = [];
  if (winTx.length === 0) dataGaps.push("no transactions logged in the last 30 days");
  if (user.incomeType === "fixed" && user.monthlyIncome == null) dataGaps.push("monthly income not shared");
  if (incMonths.length && allMonths.length) {
    const lastMonth = allMonths[allMonths.length - 1];
    if (!incByMonth.has(lastMonth)) dataGaps.push(`no income logged in ${monthName(lastMonth, user.locale)}`);
  }
  if (patterns === null) dataGaps.push("no spending tagged yet — add a one-tap trigger tag and patterns begin");

  // Self-reported monthly estimates. Override rule: drop an estimate the moment
  // real discretionary transactions exist in that category (case-insensitive).
  const realCats = new Set([...byCat.keys()].map((c) => c.toLowerCase()));
  const estimatedExpenses = (await db.prepare("SELECT category, monthly FROM estimated_expenses WHERE userId = ?").all(user.id))
    .filter((e) => !realCats.has(e.category.toLowerCase()))
    .map((e) => ({ category: e.category, monthly: money(e.monthly) }));
  if (estimatedExpenses.length) selfReported.push("estimatedExpenses");

  if (user.incomeType === "fixed" && user.monthlyIncome != null) selfReported.push("monthlyIncome");

  // Self-reported income context — used to reason about cash-flow STABILITY, never
  // to state a number the user didn't give. incomeEstimate is the irregular-income
  // "typical month" the user typed; it is an estimate and only surfaces when irregular.
  // incomeSource is now multi-select (JSON array; older rows may be a single string).
  const incomeSourceList = (() => {
    const s = user.incomeSource;
    if (s == null || s === "") return [];
    if (typeof s === "string" && s.startsWith("[")) { try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch { return []; } }
    return [s];
  })();
  const incomeSource = incomeSourceList.length ? incomeSourceList.map(incomeSourceLabel).filter(Boolean).join(", ") : null;
  if (incomeSource) selfReported.push("incomeSource");
  const incomeEstimateMinor = user.incomeType === "irregular" ? user.incomeEstimate : null;
  if (incomeEstimateMinor != null) selfReported.push("incomeEstimate");

  return {
    window: "last_30_days",
    currency: user.currency,
    locale: user.locale,
    name: (user.name || "there").split(" ")[0],
    incomeType: user.incomeType,
    incomeSource, // self-reported source (known label or the user's own words), or null
    incomeFloor: money(incomeFloorMinor),
    monthlyIncome: user.incomeType === "irregular" ? null : money(user.monthlyIncome),
    incomeEstimate: money(incomeEstimateMinor), // self-reported typical month (irregular only); NEVER a computed income
    obligationsInWindow: money(obligationsInWindow),
    discretionaryInWindow: money(discretionaryInWindow),
    savings: money(user.savings), // cumulative, self-reported, NOT windowed
    netFlow: money(netFlowMinor), // computed: all logged income minus all logged outflow
    balance: money(balanceMinor), // what they have to work with = savings + netFlow
    topCategory,
    secondCategory,
    txCount: txs.length,
    monthsOfData: allMonths.length,
    monthOverMonth,
    goals,
    debts,
    patterns,
    estimatedExpenses, // self-reported guesses; NEVER computed. Overridden by real data.
    selfReported,
    dataGaps,
  };
}

// Raw-number context for the deterministic calculator (lib/calc.js). This NEVER
// goes to the model — the model still receives only the formatted FACTS. It lets
// the SERVER compute exact answers ("15% of your income", "months to your goal")
// which the coach then relays. Money is in minor units; `major()`/`fmtCur()` bridge
// to human amounts.
export async function buildMathContext(user) {
  const money = moneyFmt(user.currency, user.locale);
  const factor = ZERO_DECIMAL.has(user.currency) ? 1 : 100;
  const locale = user.locale || "en-US";
  let curFmt, numFmt;
  try { curFmt = new Intl.NumberFormat(locale, { style: "currency", currency: user.currency, maximumFractionDigits: 2 }); }
  catch { curFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }); }
  try { numFmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }); }
  catch { numFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }); }

  const txs = await db.prepare("SELECT * FROM transactions WHERE userId = ?").all(user.id);
  const windowStart = daysAgoISO(30);
  const disc = (t) => t.type === "out" && t.kind !== "obligation" && t.kind !== "income";
  const winDisc = txs.filter((t) => t.date >= windowStart && disc(t));
  const discretionaryMinor = winDisc.reduce((s, t) => s + t.amount, 0);
  const byCat = new Map();
  for (const t of winDisc) byCat.set(t.cat, (byCat.get(t.cat) || 0) + t.amount);
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);

  const incByMonth = new Map();
  for (const t of txs) if (t.type === "in") { const k = (t.date || "").slice(0, 7); if (k) incByMonth.set(k, (incByMonth.get(k) || 0) + t.amount); }
  const incVals = [...incByMonth.values()];
  const incomeFloorMinor = incVals.length ? Math.min(...incVals) : null;

  const goals = (await db.prepare("SELECT name, target, saved FROM goals WHERE userId = ?").all(user.id))
    .map((g) => ({ name: g.name, targetMinor: g.target, savedMinor: g.saved, remainingMinor: Math.max(0, g.target - g.saved) }));

  return {
    currency: user.currency,
    money,                                    // minor units -> "Rs 1,234"
    fmtCur: (major) => curFmt.format(major),  // major number -> currency string
    fmtNum: (n) => numFmt.format(n),          // plain number -> grouped string
    major: (minor) => (minor == null ? null : minor / factor),
    savingsMinor: user.savings ?? null,
    monthlyIncomeMinor: user.incomeType === "fixed" ? (user.monthlyIncome ?? null) : null,
    incomeEstimateMinor: user.incomeType === "irregular" ? (user.incomeEstimate ?? null) : null,
    monthlySpendMinor: user.monthlySpend ?? null,
    incomeFloorMinor,
    discretionaryMinor,
    topCategory: cats[0] ? { name: cats[0][0], amountMinor: cats[0][1] } : null,
    catAmountMinor: (name) => byCat.get(name) ?? null,
    goals,
  };
}

export { PATTERN_MIN_SAMPLE };
