// Debt reminder logic shared by the Debt page (its nudge) and the sidebar badge,
// so the two can never drift. Everything here is derived on render from real
// debt data — nothing is stored or faked.

import { todayISO } from "./format.js";

// The age at which an unpaid informal debt earns a gentle nudge.
export const AGE_MONTHS = 3;

// Months since an ISO date (age, not interest). Null for missing/invalid dates.
export function monthsOpen(since) {
  if (!since) return null;
  const d = new Date(since + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.round((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.4)));
}

// Live count of debts needing attention RIGHT NOW — the same rules the Debt page
// surfaces: an informal debt past the age threshold with no plan, OR any debt
// whose user-set repayment reminder is due (nextReminder today or past). It is
// true the moment it returns > 0 and drops to 0 the moment the debts are handled.
export function debtsNeedingAttention(debts = []) {
  const today = todayISO();
  return debts.reduce((n, d) => {
    if (d.reminderAmount != null) {
      // has a user-set plan → counts only when the reminder is due
      return n + (d.nextReminder && d.nextReminder <= today ? 1 : 0);
    }
    // no plan → the age nudge (informal debts only), identical to the page
    const m = monthsOpen(d.since);
    return n + (d.kind === "informal" && m != null && m >= AGE_MONTHS ? 1 : 0);
  }, 0);
}
