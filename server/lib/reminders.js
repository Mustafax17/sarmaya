// "Finish your setup" reminders. Finds users whose profile still has unfilled
// details (no income, no logged spending, no savings, no goal) and emails them a
// gentle nudge. Sends nothing unless the mailer is configured (see lib/mailer.js).
import { db } from "../db.js";
import { isConfigured, sendMail } from "./mailer.js";

const APP_URL = process.env.APP_URL || "http://localhost:5173";

// What's still missing for one user row (same rule as the on-site dashboard nudge).
function missingFor(u) {
  const missing = [];
  if (!(u.monthlyIncome != null || u.incomeEstimate != null || u.incomeCount > 0)) missing.push("your income");
  if (u.txCount === 0) missing.push("some spending");
  if (u.savings == null) missing.push("your savings");
  if (u.goalCount === 0) missing.push("a savings goal");
  return missing;
}

function joinList(items) {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function bodyText(u, missing) {
  const name = (u.name || "there").split(" ")[0];
  return [
    `Hi ${name},`,
    "",
    `Your Sarmaya account is almost set up — you still need to add ${joinList(missing)}.`,
    "Filling these in unlocks your full dashboard, spending patterns and analytics.",
    "",
    `Finish setup: ${APP_URL}`,
    "",
    "— Sarmaya",
    "",
    "You're receiving this because you started an account. It stops once your profile is complete.",
  ].join("\n");
}

// The user's own name goes into an HTML email. It is user-controlled text, so it
// gets escaped — never interpolate a profile field into markup raw, even when the
// only recipient is the person who set it.
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function bodyHtml(u, missing) {
  const name = esc((u.name || "there").split(" ")[0]);
  const items = missing.map((m) => `<li>${esc(m)}</li>`).join("");
  return `<div style="font-family:Inter,Arial,sans-serif;color:#12211a;max-width:520px">
    <p>Hi ${name},</p>
    <p>Your Sarmaya account is almost set up — you still need to add:</p>
    <ul>${items}</ul>
    <p>Filling these in unlocks your full dashboard, spending patterns and analytics.</p>
    <p><a href="${APP_URL}" style="display:inline-block;background:#8A6A15;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Finish setup</a></p>
    <p style="color:#7a8b80;font-size:12px">You're receiving this because you started a Sarmaya account. It stops once your profile is complete.</p>
  </div>`;
}

// Run one reminder pass. Returns a summary; never throws (per-user errors collected).
export async function sendReminders() {
  if (!isConfigured()) {
    return { configured: false, sent: 0, skipped: 0, candidates: 0, errors: [], message: "Email isn't configured. Add GMAIL_USER and GMAIL_APP_PASSWORD to server/.env." };
  }
  const rows = await db
    .prepare(
      `SELECT u.id, u.email, u.name, u.monthlyIncome, u.incomeEstimate, u.savings,
        (SELECT COUNT(*) FROM transactions t WHERE t.userId = u.id) AS txCount,
        (SELECT COUNT(*) FROM transactions t WHERE t.userId = u.id AND t.type = 'in') AS incomeCount,
        (SELECT COUNT(*) FROM goals g WHERE g.userId = u.id) AS goalCount
       FROM users u`,
    )
    .all();

  let sent = 0;
  let skipped = 0;
  const errors = [];
  for (const u of rows) {
    const missing = missingFor(u);
    if (missing.length === 0) { skipped++; continue; }
    try {
      await sendMail({ to: u.email, subject: "Finish setting up your Sarmaya", text: bodyText(u, missing), html: bodyHtml(u, missing) });
      sent++;
    } catch (e) {
      errors.push({ email: u.email, error: e?.message || String(e) });
    }
  }
  return { configured: true, candidates: rows.length, sent, skipped, errors };
}
