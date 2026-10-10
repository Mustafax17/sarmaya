// Deterministic calculation engine for the coach. THE MODEL NEVER DOES ARITHMETIC
// — this file does, exactly, on the server, and the coach only relays the result.
//
// SECURITY: there is NO eval / Function / dynamic execution anywhere here. The
// expression evaluator is a hand-written recursive-descent parser over a strict
// character whitelist ([0-9 . + - * / ( ) %] only), with input length + result
// finiteness guards. Nothing a user types can execute as code.

const SUFFIX = {
  k: 1e3, thousand: 1e3, lac: 1e5, lakh: 1e5,
  m: 1e6, mn: 1e6, million: 1e6, cr: 1e7, crore: 1e7, bn: 1e9, billion: 1e9,
};

// Round to at most 2 decimals, dropping a trailing ".00" feel by keeping Number.
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// --- Safe arithmetic evaluator -------------------------------------------------
// Accepts ONLY a pre-cleaned string of digits, . + - * / ( ) % and spaces.
// Returns a finite number, or null if it can't parse/compute safely.
export function evaluate(expr) {
  if (typeof expr !== "string") return null;
  const src = expr.trim();
  if (!src || src.length > 200) return null;
  if (!/^[\d\s.+\-*/()%]+$/.test(src)) return null; // hard whitelist — no code can slip in

  let pos = 0;
  const peek = () => src[pos];
  const skip = () => { while (pos < src.length && src[pos] === " ") pos++; };

  function parsePrimary() {
    skip();
    const c = peek();
    if (c === "(") {
      pos++;
      const v = parseExpr();
      skip();
      if (peek() !== ")") return null;
      pos++;
      return v;
    }
    if (c === "-") { pos++; const v = parseFactor(); return v === null ? null : -v; }
    if (c === "+") { pos++; return parseFactor(); }
    let num = "";
    while (pos < src.length && /[\d.]/.test(src[pos])) num += src[pos++];
    if (num === "" || num === ".") return null;
    const val = parseFloat(num);
    return Number.isFinite(val) ? val : null;
  }
  function parseFactor() {
    let v = parsePrimary();
    if (v === null) return null;
    skip();
    while (peek() === "%") { pos++; v = v / 100; skip(); } // postfix percent
    return v;
  }
  function parseTerm() {
    let v = parseFactor();
    if (v === null) return null;
    skip();
    while (peek() === "*" || peek() === "/") {
      const op = src[pos++];
      const r = parseFactor();
      if (r === null) return null;
      if (op === "/") { if (r === 0) return null; v = v / r; } else v = v * r;
      skip();
    }
    return v;
  }
  function parseExpr() {
    let v = parseTerm();
    if (v === null) return null;
    skip();
    while (peek() === "+" || peek() === "-") {
      const op = src[pos++];
      const r = parseTerm();
      if (r === null) return null;
      v = op === "+" ? v + r : v - r;
      skip();
    }
    return v;
  }

  const result = parseExpr();
  skip();
  if (pos !== src.length) return null; // trailing garbage → not a clean expression
  return result !== null && Number.isFinite(result) ? round2(result) : null;
}

// Expand "12k", "3 lakh", "1.5m", "2 crore" → their numeric value.
function expandSuffixes(s) {
  return s.replace(
    /(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|lac|lakh|mn|million|cr|crore|bn|billion|m)\b/gi,
    (_m, n, suf) => String(parseFloat(n.replace(/,/g, "")) * (SUFFIX[suf.toLowerCase()] || 1)),
  );
}

// Pull a clean arithmetic expression out of a natural-language message, or null
// if the message isn't a calculation. Conservative: unknown words are dropped,
// and a lone number (no operator/percent) is NOT treated as a calc.
export function extractExpression(message) {
  if (typeof message !== "string") return null;
  let s = ` ${message.toLowerCase()} `;
  s = s
    .replace(/\bmultiplied by\b/g, " * ")
    .replace(/\bdivided by\b/g, " / ")
    .replace(/\btimes\b/g, " * ")
    .replace(/\bplus\b/g, " + ")
    .replace(/\bminus\b/g, " - ")
    .replace(/\bpercent of\b/g, " % * ")
    .replace(/\bpercent\b/g, " % ")
    .replace(/\bof\b/g, " * ");
  s = expandSuffixes(s);
  s = s.replace(/(\d)\s*x\s*(\d)/g, "$1 * $2"); // "12 x 5" → multiply
  s = s.replace(/,/g, ""); // thousands separators
  s = s.replace(/[^0-9.+\-*/()%\s]/g, " "); // drop currency words/symbols, ?, letters — everything else
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return null;
  const nums = s.match(/\d+(?:\.\d+)?/g) || [];
  if (nums.length === 0) return null;
  const hasOp = /[+*/%]/.test(s) || /\d\s*-\s*\d/.test(s); // real operator (not just a leading minus)
  if (!hasOp) return null;
  if (nums.length < 2 && !s.includes("%")) return null; // needs two operands, unless it's "N%"
  return s;
}

// All numeric values in a string, with k/lakh/m/crore suffixes expanded.
// e.g. "save 12k a month for 3 years at 8%" → [12000, 3, 8].
export function numbersIn(text) {
  const s = expandSuffixes(String(text).toLowerCase().replace(/,/g, ""));
  return (s.match(/\d+(?:\.\d+)?/g) || []).map(Number);
}

// --- Financial formulas (all deterministic) ------------------------------------

// N% of a base amount.
export const percentOf = (pct, base) => round2((pct / 100) * base);

// Compound interest. Returns { total, interest }. rate is an annual % (e.g. 12).
export function compoundInterest(principal, annualRatePct, years, perYear = 1) {
  if (![principal, annualRatePct, years].every(Number.isFinite) || years < 0) return null;
  const total = principal * Math.pow(1 + annualRatePct / 100 / perYear, perYear * years);
  return { total: round2(total), interest: round2(total - principal) };
}

// Simple interest. Returns { total, interest }.
export function simpleInterest(principal, annualRatePct, years) {
  if (![principal, annualRatePct, years].every(Number.isFinite) || years < 0) return null;
  const interest = principal * (annualRatePct / 100) * years;
  return { total: round2(principal + interest), interest: round2(interest) };
}

// Future value of a fixed MONTHLY contribution over `years`, optional annual
// return %. Returns { total, contributed, growth }. Rate 0 → plain sum.
export function futureValueMonthly(monthly, years, annualRatePct = 0) {
  if (![monthly, years].every(Number.isFinite) || monthly < 0 || years < 0) return null;
  const n = Math.round(years * 12);
  const contributed = monthly * n;
  let total;
  if (!annualRatePct) {
    total = contributed;
  } else {
    const r = annualRatePct / 100 / 12;
    total = monthly * ((Math.pow(1 + r, n) - 1) / r);
  }
  return { total: round2(total), contributed: round2(contributed), growth: round2(total - contributed), months: n };
}

// Months to reach a remaining target by saving `monthly`. null if monthly <= 0.
export function monthsToTarget(remaining, monthly) {
  if (![remaining, monthly].every(Number.isFinite) || monthly <= 0 || remaining <= 0) return null;
  return Math.ceil(remaining / monthly);
}
