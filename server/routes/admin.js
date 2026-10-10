import { Router } from "../lib/router.js";
import { db } from "../db.js";
import { config } from "../config.js";
import { HttpError } from "../validate.js";
import { isConfigured as mailerConfigured } from "../lib/mailer.js";
import { sendReminders } from "../lib/reminders.js";

const router = Router();

// Owner-only. This is the ONE place the per-account isolation is lifted, so the
// gate is strict: the caller's email must exactly match the configured admin
// address. Anyone else — including any ordinary logged-in user — gets 403.
// requireAuth runs before this (mounted in index.js), so req.user is set.
router.use((req, _res, next) => {
  if (!req.user?.email || req.user.email.toLowerCase() !== config.adminEmail) {
    return next(new HttpError(403, "Admins only.", "forbidden"));
  }
  next();
});

// GET /api/admin/users — the user directory: who's signed up, when, their profile
// basics + activity counts, and their email for the owner's mailing list. NEVER
// returns password hashes or raw transaction rows.
router.get("/users", async (_req, res) => {
  const rows = await db
    .prepare(
      `SELECT u.id, u.email, u.name, u.currency, u.incomeType, u.onboarded, u.coachOptOut, u.createdAt,
        (SELECT COUNT(*) FROM transactions t WHERE t.userId = u.id) AS transactions,
        (SELECT COUNT(*) FROM goals g WHERE g.userId = u.id) AS goals,
        (SELECT COUNT(*) FROM debts d WHERE d.userId = u.id) AS debts
       FROM users u
       ORDER BY u.createdAt DESC`,
    )
    .all();
  res.json({
    count: rows.length,
    users: rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name || "",
      currency: r.currency,
      incomeType: r.incomeType,
      onboarded: Boolean(r.onboarded),
      coachOptOut: Boolean(r.coachOptOut),
      createdAt: r.createdAt,
      transactions: r.transactions,
      goals: r.goals,
      debts: r.debts,
    })),
  });
});

// GET /api/admin/mail-status — is email configured, and how many users are due a
// reminder right now. Lets the owner see the state before triggering a send.
router.get("/mail-status", async (_req, res) => {
  const due = (await db
    .prepare(
      `SELECT COUNT(*) AS n FROM users u WHERE
         NOT (u.monthlyIncome IS NOT NULL OR u.incomeEstimate IS NOT NULL
              OR (SELECT COUNT(*) FROM transactions t WHERE t.userId = u.id AND t.type = 'in') > 0)
         OR (SELECT COUNT(*) FROM transactions t WHERE t.userId = u.id) = 0
         OR u.savings IS NULL
         OR (SELECT COUNT(*) FROM goals g WHERE g.userId = u.id) = 0`,
    )
    .get()).n;
  res.json({ configured: mailerConfigured(), dueForReminder: due });
});

// POST /api/admin/send-reminders — email every user with an unfinished profile.
// No-ops with a clear message if the Gmail mailer isn't configured.
router.post("/send-reminders", async (_req, res) => {
  res.json(await sendReminders());
});

export default router;
