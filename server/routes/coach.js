import { Router } from "../lib/router.js";
import { db } from "../db.js";
import { buildFacts, buildMathContext } from "../facts.js";
import { HttpError, str } from "../validate.js";
import { evaluate, extractExpression, numbersIn, percentOf, compoundInterest, simpleInterest, futureValueMonthly, monthsToTarget } from "../lib/calc.js";

const router = Router();

// Deterministic calculator dispatch. Given the user's message + a raw-number math
// context, returns an EXACT answer string for recognised money-math questions, or
// null. The server does the arithmetic; the coach only relays what this returns.
// Exported for tests.
export function tryCompute(message, math) {
  const low = message.toLowerCase();

  // 1) A percentage of one of the user's own figures ("15% of my income").
  const pctBase = low.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)\s*(?:of\s*)?(?:my\s*)?(income|salary|savings?|spending|spend|expenses?|discretionary)/);
  if (pctBase) {
    const p = parseFloat(pctBase[1]);
    const key = pctBase[2];
    let baseMinor = null;
    let label = "";
    if (/income|salary/.test(key)) { baseMinor = math.monthlyIncomeMinor ?? math.incomeEstimateMinor ?? math.incomeFloorMinor; label = "monthly income"; }
    else if (/saving/.test(key)) { baseMinor = math.savingsMinor; label = "savings"; }
    else { baseMinor = math.discretionaryMinor || math.monthlySpendMinor; label = "monthly spending"; }
    if (baseMinor != null) {
      const val = percentOf(p, math.major(baseMinor));
      return {
        text: `${p}% of your ${label} (${math.money(baseMinor)}) is ${math.fmtCur(val)}.`,
        breakdown: {
          title: `${p}% of your ${label}`, result: math.fmtCur(val),
          steps: [{ label: `Your ${label}`, value: math.money(baseMinor) }, { label: "Percentage", value: `${p}%` }],
          formula: `${math.money(baseMinor)} × ${p} ÷ 100 = ${math.fmtCur(val)}`,
        },
      };
    }
  }

  // 2) Savings rate from self-reported income vs spending.
  if (/savings?\s*rate|what\s*(%|percent).*sav|how much.*income.*(save|keep)/.test(low) && math.monthlyIncomeMinor && math.monthlySpendMinor != null) {
    const inc = math.major(math.monthlyIncomeMinor);
    const spend = math.major(math.monthlySpendMinor);
    if (inc > 0) {
      const rate = Math.round(((inc - spend) / inc) * 100);
      return {
        text: `From what you told me — ${math.money(math.monthlyIncomeMinor)} income and ${math.money(math.monthlySpendMinor)} spending a month — your savings rate is about ${rate}%, keeping ${math.fmtCur(inc - spend)} a month. Those are self-reported; logging real income and spending will make it exact.`,
        breakdown: {
          title: "Savings rate", result: `${rate}%`,
          steps: [{ label: "Income (self-reported)", value: math.money(math.monthlyIncomeMinor) }, { label: "Spending (self-reported)", value: math.money(math.monthlySpendMinor) }, { label: "Kept", value: math.fmtCur(inc - spend) }],
          formula: `(${math.money(math.monthlyIncomeMinor)} − ${math.money(math.monthlySpendMinor)}) ÷ ${math.money(math.monthlyIncomeMinor)} = ${rate}%`,
        },
      };
    }
  }

  // 3) How long to reach a goal at a given monthly amount. Requires an explicit
  // duration question ("how long / how many months / when will I") so it doesn't
  // hijack a future-value question ("save X a month for N years", handled below).
  if (/(how long|how many months|when (?:will|can) i).*(save|saving|reach|hit|goal|target)/.test(low) && math.goals.length) {
    const m = low.match(/(?:save|put|set aside|invest)\s*(?:rs\.?|pkr|\$|₹|£|€)?\s*([\d.,]+\s*(?:k|thousand|lac|lakh|m|mn|million|cr|crore)?)\s*(?:a|per|each|every)\s*month/);
    const monthly = m ? numbersIn(m[1])[0] : null;
    const goal = math.goals.find((g) => low.includes(g.name.toLowerCase())) || math.goals[0];
    if (monthly && goal && goal.remainingMinor > 0) {
      const months = monthsToTarget(math.major(goal.remainingMinor), monthly);
      if (months != null) {
        const yrs = months / 12;
        const tail = months >= 12 ? ` (about ${yrs.toFixed(yrs < 2 ? 1 : 0)} year${months === 12 ? "" : "s"})` : "";
        return {
          text: `At ${math.fmtCur(monthly)} a month, reaching ${goal.name} — ${math.money(goal.remainingMinor)} to go — takes about ${months} month${months === 1 ? "" : "s"}${tail}.`,
          breakdown: {
            title: `Reaching ${goal.name}`, result: `${months} month${months === 1 ? "" : "s"}`,
            steps: [{ label: "Remaining to save", value: math.money(goal.remainingMinor) }, { label: "Saving each month", value: math.fmtCur(monthly) }],
            formula: `${math.money(goal.remainingMinor)} ÷ ${math.fmtCur(monthly)} = ${months} months (rounded up)`,
          },
        };
      }
    }
  }

  // 4) Interest on a lump sum ("compound interest on 100000 at 12% for 2 years").
  if (/interest/.test(low) || /(at|@)\s*\d+(?:\.\d+)?\s*%.*(year|yr|annum)/.test(low)) {
    const rateM = low.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)/);
    const yearsM = low.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/);
    const nums = numbersIn(message);
    if (rateM && yearsM && nums.length) {
      const rate = parseFloat(rateM[1]);
      const years = parseFloat(yearsM[1]);
      const principal = nums.filter((n) => n !== rate && n !== years).sort((a, b) => b - a)[0];
      if (principal) {
        const simple = /simple/.test(low);
        const monthly = /month/.test(low);
        const r = simple ? simpleInterest(principal, rate, years) : compoundInterest(principal, rate, years, monthly ? 12 : 1);
        if (r) return {
          text: `${simple ? "Simple" : "Compound"} interest on ${math.fmtCur(principal)} at ${rate}% for ${years} year${years === 1 ? "" : "s"}: it grows to ${math.fmtCur(r.total)} — ${math.fmtCur(r.interest)} of interest. A projection from the rate you gave, not a guaranteed return.`,
          breakdown: {
            title: `${simple ? "Simple" : "Compound"} interest`, result: math.fmtCur(r.total),
            steps: [{ label: "Principal", value: math.fmtCur(principal) }, { label: "Rate", value: `${rate}% / year` }, { label: "Term", value: `${years} year${years === 1 ? "" : "s"}` }, { label: "Interest earned", value: math.fmtCur(r.interest) }],
            formula: simple
              ? `${math.fmtCur(principal)} × ${rate}% × ${years} = ${math.fmtCur(r.interest)} interest → ${math.fmtCur(r.total)}`
              : `${math.fmtCur(principal)} × (1 + ${rate}%${monthly ? " ÷ 12" : ""})^${monthly ? years * 12 : years} = ${math.fmtCur(r.total)}`,
          },
        };
      }
    }
  }

  // 5) Future value of a fixed monthly saving/investment over N years.
  if (/(save|invest|put away|set aside).*(a|per|each|every)\s*month.*(year|yr)/.test(low)) {
    const m = low.match(/(?:save|invest|put away|set aside)\s*(?:rs\.?|pkr|\$|₹|£|€)?\s*([\d.,]+\s*(?:k|thousand|lac|lakh|m|mn|million|cr|crore)?)\s*(?:a|per|each|every)\s*month/);
    const yearsM = low.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/);
    const rateM = low.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)/);
    const monthly = m ? numbersIn(m[1])[0] : null;
    const years = yearsM ? parseFloat(yearsM[1]) : null;
    if (monthly && years) {
      const rate = rateM ? parseFloat(rateM[1]) : 0;
      const r = futureValueMonthly(monthly, years, rate);
      if (r) return {
        text: rate
          ? `Saving ${math.fmtCur(monthly)} a month for ${years} year${years === 1 ? "" : "s"} at ${rate}% grows to about ${math.fmtCur(r.total)} — ${math.fmtCur(r.contributed)} you put in plus ${math.fmtCur(r.growth)} of growth. A projection, not a promise.`
          : `Saving ${math.fmtCur(monthly)} a month for ${years} year${years === 1 ? "" : "s"} adds up to ${math.fmtCur(r.total)} over ${r.months} months.`,
        breakdown: {
          title: "Future value of monthly saving", result: math.fmtCur(r.total),
          steps: [
            { label: "Each month", value: math.fmtCur(monthly) },
            { label: "Term", value: `${years} year${years === 1 ? "" : "s"} (${r.months} months)` },
            ...(rate ? [{ label: "Assumed return", value: `${rate}% / year` }, { label: "You put in", value: math.fmtCur(r.contributed) }, { label: "Growth", value: math.fmtCur(r.growth) }] : []),
          ],
          formula: rate
            ? `${math.fmtCur(monthly)}/mo compounded monthly at ${rate}% for ${r.months} months = ${math.fmtCur(r.total)}`
            : `${math.fmtCur(monthly)} × ${r.months} months = ${math.fmtCur(r.total)}`,
        },
      };
    }
  }

  // 6) Plain arithmetic the user typed ("what's 4500 * 12", "1200+800+300").
  const expr = extractExpression(message);
  if (expr) {
    const val = evaluate(expr);
    if (val != null) {
      const moneyCue = /\b(rs|pkr|rupees?|salary|income|spend|save|cost|price|budget|money|pay|afford)\b|[₨₹$£€]/.test(low);
      const shown = moneyCue ? math.fmtCur(val) : math.fmtNum(val);
      return {
        text: `That works out to ${shown}.`,
        breakdown: { title: "Calculation", result: shown, steps: [{ label: "Expression", value: expr }], formula: `${expr} = ${shown}` },
      };
    }
  }

  return null;
}

// The coach system prompt — VERBATIM behavioural contract. The coach turns the
// server-computed FACTS into language; it never computes, never sees raw
// transactions, and refuses rather than guesses. {name} is templated per user.
const SYSTEM_PROMPT = `You are the Sarmaya Coach, a personal finance assistant for Pakistani users. You
are talking to {name}, and you help them understand their own money. You work only
from the data Sarmaya has logged for {name} — delivered to you as a FACTS object
with each message (money in FACTS is already formatted; state it exactly, never
reformat it). Follow these rules exactly.

## 1. NEVER GUESS
Only state a number you can trace to {name}'s actual logged data in FACTS. If FACTS
doesn't hold enough to answer a question, say so plainly, using the real count from
FACTS.txCount:
"I don't have enough data yet to answer that accurately — you've logged [X]
transactions so far. Once you've logged a bit more, I can give you a real answer
instead of a guess."
Never fill a gap with an average, an estimate, or a "typical" number. Fields listed
in FACTS.selfReported came from onboarding, not from data — speak of them as "you
told me…", never as analysis. A blank answer is better than a confident wrong one.

## 2. ALWAYS SHOW THE MATH
Every recommendation must come with a visible breakdown the user can expand — the
Sarmaya app renders this "show the math" panel from the server's exact figures. So
when a COMPUTED line accompanies the message, THAT figure is the answer: state it,
never recompute it, never contradict it with a number of your own. Structure any
calculation as:
- The question, restated in one line
- The exact numbers used (income, category totals, obligations — from FACTS)
- The calculation itself
- The conclusion
Never give a bare answer like "You can afford it." Always show why. When there is no
COMPUTED line, use only exact FACTS figures or numbers the user gave you, and never
invent a missing input — ask for it.

## 3. IRREGULAR INCOME
If FACTS.incomeType is "irregular", never budget against their highest or most
recent month, and never state a single monthly income figure. Use their rolling
income floor (FACTS.incomeFloor — their lowest reliable months) as the base for any
affordability or savings advice, and say this explicitly: "Since your income varies,
I'm using your lowest recent month (Rs X) as the safe baseline, not your average."
FACTS.incomeEstimate is a self-reported "typical month" — you may reference it as
their estimate, but never plan against it and never build a savings rate on it.

## 4. INFORMAL DEBT
Treat money owed to or by friends and family (FACTS.debts with kind "informal") as
seriously as formal debt, but with more care. Its cost is time and goodwill, not
interest — reason from monthsOpen, not APR.
- Never assume the user will or won't be repaid — ask, don't assume.
- Never suggest legal or aggressive collection language, and never offer to contact
  the other person (Sarmaya never messages anyone on the user's behalf).
- Ask clarifying questions before advising: "Is there a timeline you and [person]
  agreed on, or is this open-ended?"

## 5. NO GENERIC ADVICE
Never say "spend less" or "save more" without pointing to the user's actual category
data. Instead: "Your Food spending was Rs 12,000 higher than last month — mainly
[merchant/category]. That's the one place a change would actually move your number."
Anchor on their biggest discretionary category (FACTS.topCategory) and the
month-over-month change. FACTS.obligationsInWindow (family support, fixed
commitments) is money that was never a choice — never suggest cutting it.

## 6. STAY INSIDE YOUR DATA
If asked something outside what Sarmaya tracks — general investing strategy, tax law,
specific stock/coin/fund picks — give general, non-personalised information only, and
say clearly: "This isn't based on your Sarmaya data — it's general information. For
advice specific to your situation, a financial advisor would be better placed than
me." Never name a specific security to buy or sell, never predict a price, and never
promise or imply a return. Never imply you know {name}'s full financial picture
beyond what's logged in the app.

## 7. TONE
Direct, calm, and specific. No hype, no guilt-tripping, no generic motivational
language. Treat the user as capable of handling honest numbers. Lead with the
number, then what it means. Never use "simply", "just", or "easy". No emoji, no
exclamation marks on financial facts. Contractions are fine; corporate register is
not.

## Safety (above all of the above)
Money stress is real distress. If someone sounds overwhelmed, frightened, or unable
to cover essentials, drop the coaching tone — acknowledge it plainly and be
practical about immediate options, don't optimise their savings rate at them. If
they mention self-harm or crisis, say plainly that this is beyond what an app should
handle and encourage them to reach out to someone they trust or local support
services.`;

// ---- Deterministic, FACTS-grounded fallback (used when no ANTHROPIC_API_KEY) ----
// Grounded in the same FACTS object, refuses the same things. Never fabricates.
// Exported for tests.
export function fallbackReply(q, f, math) {
  const low = q.toLowerCase();
  const cat = f.topCategory;
  const catIsSelf = f.selfReported.includes("topCategory");
  const cap = (b) => b.charAt(0).toUpperCase() + b.slice(1);

  const distress = /(scared|overwhelmed|can'?t (afford|cover|pay)|desperate|panic|broke|hopeless|kill myself|end it|suicide|harm)/;
  if (distress.test(low)) {
    if (/(kill myself|end it|suicide|harm)/.test(low))
      return "That's beyond what an app should handle, and I don't want to give you a glib answer. Please reach out to someone you trust, or a local support service, right now. You don't have to sort this alone.";
    return "That sounds genuinely stressful, and money stress is real stress. Let's not optimise anything right now — what's the most urgent bill or need in front of you? We can look at what you've actually got to work with.";
  }

  // Exact server-computed math, when the question is a calculation. Placed high so
  // "what's 15% of my income" / "how long to save for X" get a precise answer.
  if (math) {
    const computed = tryCompute(q, math);
    if (computed) return computed.text;
  }
  // Saving vs investing — prioritization from THEIR numbers, not market advice.
  // Placed BEFORE the investment refusal so "should i invest / save or invest"
  // reach this nuanced answer. Guard: if a SPECIFIC product is named
  // (bitcoin/stocks/gold/…), let it fall through to the flat refusal instead.
  if (/(save.{0,15}(or|vs|versus|instead).{0,15}invest|should i (be )?invest|start investing|ready to invest|focus on saving)/.test(low)
      && !/(bitcoin|crypto|stock|shares|etf|mutual|gold|forex|nft|coin|token)/.test(low)) {
    const thinIncome = f.incomeType === "irregular" && f.incomeFloor;
    const parts = [];
    if (f.balance)
      parts.push(`with about ${f.balance} to hand${f.savings ? ` (including the ${f.savings} you told me you'd saved)` : ""}, the amount shapes the answer: money you'd need soon, or your only cushion, stays somewhere safe — only what's beyond a covered buffer${f.debts && f.debts.length ? " and any interest-bearing debt" : ""} is what you'd actually invest`);
    if (thinIncome)
      parts.push(`your income varies and your worst recent month was ${f.incomeFloor}, so a cash buffer you could actually live on comes before investing — money you might need shouldn't be locked up`);
    else
      parts.push("the order that protects you is a solid emergency buffer first, then investing only what you genuinely won't need for years");
    if (f.debts && f.debts.length)
      parts.push("you've got debt open too — if it carries interest, clearing it is a guaranteed return few investments beat, so it comes ahead of investing");
    parts.push("then on where it goes: spread that investable part across a broad, low-cost mix rather than one bet, match how much risk you take to how long you can leave it untouched, and steer clear of concentrating everything in a single stock or coin");
    const sentence = parts.map((b) => b.charAt(0).toUpperCase() + b.slice(1)).join(". ");
    return sentence + ". How long could you leave this money untouched? That's the piece that shapes the rest — tell me and I'll walk it through. I won't name a specific stock or coin, though: no one can honestly promise which way those go.";
  }

  // Investing / a specific asset: ADVISE with the fiduciary framework + their own
  // numbers — never a specific security, price, or promised return. `fund` scoped
  // so "emergency fund" (a goal) doesn't read as an investment.
  if (/(bitcoin|crypto|stock|invest|shares|etf|mutual|gold|forex|nft|coin|token|(?<!emergency )\bfunds?\b)/.test(low)) {
    const parts = ["here's how I'd think it through with you, the way a planner would"];
    // Amount-aware: anchor the advice to the actual sum they have.
    if (f.balance) parts.push(`you've got about ${f.balance} to hand${f.savings ? ` (including the ${f.savings} you told me you'd saved)` : ""}, and the amount changes the answer: if that's your only cushion or you'd need it within a year or two, it belongs somewhere safe and reachable, not in something that can swing`);
    parts.push(`only the part BEYOND a covered buffer${f.incomeFloor ? ` (sized against your lean month around ${f.incomeFloor})` : ""}${f.debts && f.debts.length ? " and any interest-bearing debt" : ""} is money you'd actually invest`);
    parts.push("and on where it goes: one coin or one stock is concentrated risk — spread the investable part across a broad, low-cost mix, and match how much risk you take to how long you can leave it untouched");
    const sentence = parts.map((b) => b.charAt(0).toUpperCase() + b.slice(1)).join(". ");
    return sentence + ". What I won't do is tell you to buy or avoid a specific one or put a price on it — no one can honestly compute which way it goes. How long could you leave this untouched? Answer that and I'll tailor the rest.";
  }
  if (/(estimate|guess|average).{0,20}(income|earn|make)|(monthly|my) income|how much do i (earn|make)/.test(low)) {
    if (f.monthlyIncome == null) {
      let r = "I won't put a single monthly income figure on you — yours varies, and an average would be the kind of number that breaks you in a bad month.";
      if (f.incomeEstimate) r += ` You told me a typical month is around ${f.incomeEstimate}; I'll treat that as your estimate, not a fixed number.`;
      r += ` Your realistic worst recent month was ${f.incomeFloor || "not something I can see yet"} — that's what I'd plan against.`;
      if (f.incomeSource) r += ` With income from ${f.incomeSource}, a solid cash buffer is worth prioritising.`;
      return r;
    }
    return `You told me your monthly income is ${f.monthlyIncome}${f.incomeSource ? ` from ${f.incomeSource.toLowerCase()}` : ""}. I'll work from that, not an estimate.`;
  }
  if (/(what day|which day|weekday|weekend|friday|monday|time of day)/.test(low))
    return "I don't actually know — I don't track what day or time things happen, so I can't tell you whether one day is different for you. The trigger tags might get at it another way.";

  // Goals — "how are my goals doing?", "close to my laptop goal?"
  // Guard: let affordability questions that name a goal-ish item (car/house/…)
  // fall through to the `afford` branch instead of being answered as a goal.
  if (/(goal|target|saving up|laptop|car|house|wedding|emergency)/.test(low)
      && !/(afford|can i buy|should i buy)/.test(low)) {
    if (f.goals && f.goals.length) {
      const g = f.goals.find((x) => low.includes(x.name.toLowerCase())) || f.goals[0];
      return `${g.name}: ${g.saved} saved of ${g.target}${g.deadline ? `, aiming for ${g.deadline}` : ""}. I won't guess whether you'll hit it — that depends on months I can't see yet — but that's where it stands.`;
    }
    return "You haven't set any goals yet. Add one and I'll track where you are against it.";
  }

  // Obligations — "how much goes to family / commitments?"
  if (/(family|parent|obligation|commitment|send money|support)/.test(low)) {
    if (f.obligationsInWindow)
      return `${f.obligationsInWindow} went to obligations in the last 30 days. That's not spending to cut — it's money that was never a choice. I keep it separate from your discretionary spending on purpose.`;
    return "You haven't logged any obligations yet — money to family or fixed commitments. Log them and I'll keep them out of your 'spending to cut' picture.";
  }

  // Savings standalone — "how much have I saved?"
  if (/(how much.{0,15}(saved|savings)|total savings|net worth)/.test(low)) {
    if (f.savings)
      return `You've got ${f.savings} saved — but that's the figure you gave me at signup, not something I've computed from transactions. Once you log income and spending over time, I can track it for real.`;
    return "You haven't told me your current savings yet. Add it in settings and I'll factor it in.";
  }

  // Balance — "how much do I have to work with?"
  if (/(my balance|how much do i have|money left|current balance|to work with|how much can i)/.test(low)) {
    if (f.balance)
      return `You've got about ${f.balance} to work with — ${f.savings ? `the ${f.savings} you told me you'd saved` : "your savings"} plus your logged income and spending since. The savings part is your figure, not one I've verified. Weigh it against a lean month (${f.incomeFloor || "which I can't size yet"})${f.obligationsInWindow ? ` and your ${f.obligationsInWindow} of obligations` : ""} — that's the real cushion.`;
    return "I can't put a balance on it yet. Add your current savings in settings and log a few transactions, and I'll show you what you've got to work with.";
  }

  // Top categories — "top two", "where does my money go?"
  if (/(top two|top 2|where.{0,10}money go|breakdown|categories)/.test(low)) {
    if (f.topCategory && !f.selfReported.includes("topCategory")) {
      let r = `Your biggest is ${f.topCategory.name} at ${f.topCategory.amount}`;
      if (f.secondCategory) r += `, then ${f.secondCategory.name} at ${f.secondCategory.amount}`;
      return r + " — over the last 30 days, from what you've logged.";
    }
    if (f.estimatedExpenses && f.estimatedExpenses.length)
      return `I can't break it down from real spending yet, but from what you told me at signup: ${f.estimatedExpenses.slice(0, 3).map((e) => `${e.category} ~${e.monthly}/mo`).join(", ")} — guesses, not tracked. Log a few transactions and I'll show the real split.`;
    return "I can't break down your categories yet — not enough logged. Add some transactions and this fills in.";
  }

  // Estimates — self-reported guesses from onboarding, never presented as computed.
  if (/(estimate|rough|guess|told you|what did i say|typed at signup)/.test(low)) {
    if (f.estimatedExpenses && f.estimatedExpenses.length)
      return `From what you told me at signup — rough guesses, not tracked: ${f.estimatedExpenses.map((e) => `${e.category} ~${e.monthly}/mo`).join(", ")}. Once you log real transactions in these, I'll swap the guess for what actually happens.`;
    return "You didn't give me monthly estimates, and I haven't got enough logged to compute your spending yet. Add a few transactions and the picture fills in.";
  }

  // What don't you know — "what should I log?"
  if (/(what don'?t you know|what should i log|what.{0,10}missing|gaps?)/.test(low)) {
    if (f.dataGaps && f.dataGaps.length)
      return `A few things would sharpen what I can tell you: ${f.dataGaps.join("; ")}.`;
    return "I've got a decent picture right now — keep logging transactions and tagging why you spent, and it only gets sharper.";
  }

  if (/(weak|biggest|most|worst|spend most)/.test(low)) {
    if (cat && !catIsSelf)
      return `Your biggest discretionary category is ${cat.name} at ${cat.amount}${cat.pctOfDiscretionary != null ? ` — ${cat.pctOfDiscretionary}% of your discretionary spending in the last 30 days` : ""}. That's the first place I'd look.`;
    if (cat && catIsSelf)
      return `You told me ${cat.name} is your biggest spend during onboarding. I can't verify that yet — log a few weeks of transactions and I'll check it against what actually happened.`;
    return "I can't name a biggest category yet — there isn't enough logged. Add some transactions and I'll find the pattern.";
  }
  if (/(afford|can i buy|should i buy|spend on)/.test(low)) {
    const bits = [];
    if (f.balance) bits.push(`You've got about ${f.balance} to work with${f.savings ? ` (including the ${f.savings} you told me you'd saved)` : ""}`);
    else if (f.savings) bits.push(`You've told me you've got ${f.savings} saved`);
    if (f.incomeType === "irregular" && f.incomeFloor)
      bits.push(`your income varies, and your worst recent month was ${f.incomeFloor}${f.obligationsInWindow ? ` against ${f.obligationsInWindow} of obligations` : ""}`);
    bits.push(`you spent ${f.discretionaryInWindow} discretionary in the last 30 days`);
    const sentence = bits.map((b) => b.charAt(0).toUpperCase() + b.slice(1)).join(". ");
    return sentence + ". I can't do the math on a specific purchase for you, but that's the picture to weigh it against — your call.";
  }
  // Income adequacy — "do I need more income / earn more / not enough / a raise".
  // Placed before save/cut so it isn't answered as an expense question.
  if (/(need more income|earn more|make more money|not enough (money|income|to)|ends meet|a raise|second (job|income|stream)|side (income|hustle)|increase my income|more income)/.test(low)) {
    const bits = [];
    if (f.incomeType === "irregular" && f.incomeFloor)
      bits.push(`your income varies, so the honest number to plan against is your worst recent month, ${f.incomeFloor}`);
    else if (f.monthlyIncome)
      bits.push(`you told me you bring in ${f.monthlyIncome} a month`);
    if (f.obligationsInWindow) bits.push(`with ${f.obligationsInWindow} already committed to obligations`);
    let r = bits.length ? bits.map(cap).join(", ") + ". " : "";
    r += "Whether you need to earn more comes down to one test: does your leanest month cover the essentials and obligations with something left to save? ";
    r += "If it barely clears them, that's an income gap — trimming small treats won't close it, and the real move is raising or steadying income: a raise, a higher freelance rate, a second stream, or a buffer to smooth the swings. If it clears them with room, the lever is saving and investing the surplus, not earning more. ";
    r += "I won't put a target figure on it — that's yours — but that's the question to answer.";
    return r;
  }
  if (/(save|cut|reduce|less|budget|how (do i|to) save|pay ?off)/.test(low)) {
    const bits = [];
    if (cat && !catIsSelf)
      bits.push(`${cat.name} is where your discretionary money goes (${cat.amount} in the last 30 days) — the lever with the most room, and one weekly cap there frees the most cash. Obligations stay off the table; those were never a choice`);
    else
      bits.push("I can't name your biggest category from real data yet — log a couple of weeks and I'll point to the exact one with the most room");
    bits.push("on the how: pay yourself first — move a set amount the day money lands, before you spend, and automate it at the START of the month instead of saving whatever's left (that's the trap)");
    bits.push("a fair first target is one month of expenses as a starter buffer, then build toward three to six");
    return bits.map(cap).join(". ") + ".";
  }
  if (/(pattern|trigger|why do i)/.test(low)) {
    if (f.patterns)
      return `From your tagged spending (${f.patterns.sampleSize} tagged so far): ${f.patterns.byTrigger.slice(0, 2).map((t) => `${t.trigger.replace("_", " ")} averages ${t.avg}${t.worthItPct != null ? `, ${t.worthItPct}% marked worth it` : ""}`).join("; ")}. That's what the tags say — draw your own conclusion.`;
    return "I can't see why you spend yet — nothing's tagged. Add a one-tap tag for how you felt when you log an expense, and your patterns start showing from the very first one.";
  }
  if (/(debt|owe|owed)/.test(low)) {
    if (f.debts.length) {
      const d = f.debts[0];
      return `${d.direction === "owe" ? `You owe ${d.counterparty} ${d.outstanding}` : `${d.counterparty} owes you ${d.outstanding}`}${d.monthsOpen != null ? `, open ${d.monthsOpen} month${d.monthsOpen === 1 ? "" : "s"}` : ""}. With informal debt the cost is time, not interest — that's the number that matters.`;
    }
    return "You haven't logged any debts, so there's nothing for me to weigh in on there.";
  }
  if (/(month|trend|doing|progress|how am i)/.test(low)) {
    if (f.monthOverMonth && f.monthOverMonth.spending != null) {
      const pct = Math.abs(Math.round(f.monthOverMonth.spending * 100));
      return `Your discretionary spending is ${f.monthOverMonth.spending <= 0 ? "down" : "up"} ${pct}% month over month. ${f.monthOverMonth.spending <= 0 ? "Good direction." : "Worth a look."}`;
    }
    return "I need a second month of data before I can talk about trends. You're not there yet — keep logging.";
  }
  const canAnswer = [];
  if (f.topCategory) canAnswer.push("your biggest expense");
  if (f.goals && f.goals.length) canAnswer.push("how your goals are going");
  if (f.debts && f.debts.length) canAnswer.push("who you owe");
  if (f.monthOverMonth) canAnswer.push("this month's trend");
  if (f.patterns) canAnswer.push("your spending patterns");
  canAnswer.push("whether you can afford something");
  return `I work from your real numbers — ${f.txCount} transaction${f.txCount === 1 ? "" : "s"} across ${f.monthsOfData} month${f.monthsOfData === 1 ? "" : "s"} so far. I can tell you about ${canAnswer.join(", ")}.`;
}

// ---- Conversation memory ----------------------------------------------------
// The coach remembers the thread: prior turns are stored per user and replayed to
// the model each message. Only PLAIN prior turns are kept (the FACTS/COMPUTED
// scaffolding is attached to the current turn only, never re-sent as history).

const HISTORY_TURNS = 16; // last N stored messages replayed to the model (~8 exchanges)
const HISTORY_CAP = 200; // keep at most this many messages per user on disk

// Oldest→newest recent history as [{ role, content }] for the LLM.
async function loadHistory(userId, limit = HISTORY_TURNS) {
  const rows = await db
    .prepare("SELECT role, content FROM coach_messages WHERE userId = ? ORDER BY id DESC LIMIT ?")
    .all(userId, limit);
  return rows.reverse();
}

// Persist one exchange, then prune anything past the cap so storage stays bounded.
function saveExchange(userId, userText, assistantText) {
  const now = new Date().toISOString();
  const insert = "INSERT INTO coach_messages (userId, role, content, createdAt) VALUES (?,?,?,?)";
  return db.batch([
    [insert, userId, "user", userText, now],
    [insert, userId, "assistant", assistantText, now],
    [
      "DELETE FROM coach_messages WHERE userId = ? AND id NOT IN (SELECT id FROM coach_messages WHERE userId = ? ORDER BY id DESC LIMIT ?)",
      userId, userId, HISTORY_CAP,
    ],
  ]);
}

// ---- LLM providers. Only a first name + computed FACTS ever leave here. ----

// Anthropic (preferred; paid). Uses ANTHROPIC_API_KEY.
async function callAnthropic(system, userMsg, history = []) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const resp = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system,
    messages: [...history, { role: "user", content: userMsg }],
  });
  return (resp.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}

// Any OpenAI-compatible /chat/completions backend — the FREE routes:
//   • local Ollama:  LLM_BASE_URL=http://localhost:11434/v1  LLM_MODEL=llama3.1   (no key, no cost, private)
//   • Groq free tier: LLM_BASE_URL=https://api.groq.com/openai/v1  LLM_MODEL=llama-3.3-70b-versatile  LLM_API_KEY=gsk_...
// Timed out so a dead endpoint can never hang the chat.
async function callOpenAICompatible(system, userMsg, history = []) {
  const base = process.env.LLM_BASE_URL.replace(/\/+$/, "");
  const headers = { "Content-Type": "application/json" };
  if (process.env.LLM_API_KEY) headers.Authorization = `Bearer ${process.env.LLM_API_KEY}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const resp = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers,
      signal: ctrl.signal,
      body: JSON.stringify({
        model: process.env.LLM_MODEL || "llama3.1",
        temperature: 0.4,
        max_tokens: 1024,
        messages: [
          { role: "system", content: system },
          ...history,
          { role: "user", content: userMsg },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`${resp.status} ${(await resp.text()).slice(0, 200)}`);
    const data = await resp.json();
    return (data.choices?.[0]?.message?.content || "").trim();
  } finally {
    clearTimeout(timer);
  }
}

// POST /api/coach/message — { message } -> { reply, source, facts }
router.post("/message", async (req, res) => {
  if (req.user.coachOptOut) throw new HttpError(403, "You've turned the coach off. Turn it back on in Settings to use it.", "coach_off");
  const message = str(req.body?.message, "message", { max: 1000 });
  const facts = await buildFacts(req.user);
  const math = await buildMathContext(req.user);
  const system = SYSTEM_PROMPT.replace("{name}", facts.name);
  // If the message is a calculation, the SERVER computes the exact answer and
  // hands it to the model as authoritative — the model relays it, never recomputes.
  const computed = tryCompute(message, math); // { text, breakdown } | null
  // Pre-formatted money + named denominators — the model computes/reformats nothing.
  const userMsg =
    `FACTS:\n${JSON.stringify(facts, null, 2)}\n` +
    (computed ? `\nCOMPUTED (authoritative — the server calculated this exactly; state this figure, do not recompute it):\n${computed.text}\n` : "") +
    `\nUser: ${message}`;

  // Conversation memory: replay recent PLAIN turns so the coach follows the thread.
  const history = await loadHistory(req.user.id);

  // Provider order: Anthropic (preferred, paid) -> any OpenAI-compatible backend
  // (FREE: local Ollama, or Groq/Gemini/OpenRouter free tiers) -> the deterministic,
  // FACTS-grounded fallback. Any provider error degrades gracefully; the chat
  // never fails. `source` tells the client which brain answered. Every exchange is
  // stored so the next message has context.
  let reply = null;
  let source = "fallback";
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const text = await callAnthropic(system, userMsg, history);
      if (text) { reply = text; source = "llm"; }
    } catch (err) {
      console.error("[sarmaya] coach (anthropic) error:", err?.message || err);
    }
  }
  if (reply == null && process.env.LLM_BASE_URL) {
    try {
      const text = await callOpenAICompatible(system, userMsg, history);
      if (text) { reply = text; source = "llm"; }
    } catch (err) {
      console.error("[sarmaya] coach (openai-compatible) error:", err?.message || err);
    }
  }
  if (reply == null) reply = fallbackReply(message, facts, math);

  await saveExchange(req.user.id, message, reply);
  // `computation` carries the server's exact working (formula + steps) for the
  // "show the math" drawer, when the question was a calculation.
  return res.json({ reply, source, facts, computation: computed?.breakdown ?? null });
});

// GET /api/coach/facts — the computed FACTS (for the UI's insight cards).
router.get("/facts", async (req, res) => {
  res.json({ facts: await buildFacts(req.user), optedOut: Boolean(req.user.coachOptOut) });
});

// GET /api/coach/history — the stored conversation, oldest first, for the chat UI.
router.get("/history", async (req, res) => {
  const rows = await db
    .prepare("SELECT role, content, createdAt FROM coach_messages WHERE userId = ? ORDER BY id ASC")
    .all(req.user.id);
  res.json({ history: rows });
});

// DELETE /api/coach/history — forget the conversation (the "clear chat" action).
router.delete("/history", async (req, res) => {
  await db.prepare("DELETE FROM coach_messages WHERE userId = ?").run(req.user.id);
  res.json({ ok: true });
});

export default router;
