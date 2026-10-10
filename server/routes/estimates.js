import { Router } from "../lib/router.js";
import { db } from "../db.js";
import { intMinor, str } from "../validate.js";

// SELF-REPORTED monthly expense estimates — scaffolding for a day-one dashboard.
// These are NOT transactions: they never get a date, never enter the
// transactions table, and never feed a "computed from your transactions" figure.
// Every row is source='estimate' and is overridden the moment real transactions
// exist in that category.
const router = Router();

const mapEst = (r) => ({ id: r.id, category: r.category, monthly: r.monthly, source: r.source });

router.get("/", async (req, res) => {
  const rows = await db.prepare("SELECT * FROM estimated_expenses WHERE userId = ? ORDER BY id ASC").all(req.user.id);
  res.json({ estimates: rows.map(mapEst) });
});

// PUT — replace the whole set (onboarding sends only the filled-in categories).
// Empty/absent categories are simply not stored; absence is fine.
router.put("/", async (req, res) => {
  const raw = Array.isArray(req.body?.estimates) ? req.body.estimates : [];
  const clean = [];
  const seen = new Set();
  for (const e of raw) {
    const category = str(e?.category, "category", { max: 60 });
    const monthly = intMinor(e?.monthly, "monthly", { min: 1 });
    const keyLc = category.toLowerCase();
    if (seen.has(keyLc)) continue; // de-dupe by category (UNIQUE userId+category)
    seen.add(keyLc);
    clean.push({ category, monthly });
  }
  const now = new Date().toISOString();
  await db.batch([
    ["DELETE FROM estimated_expenses WHERE userId = ?", req.user.id],
    ...clean.map((c) => [
      "INSERT INTO estimated_expenses (userId, category, monthly, source, createdAt) VALUES (?,?,?,'estimate',?)",
      req.user.id, c.category, c.monthly, now,
    ]),
  ]);
  const rows = await db.prepare("SELECT * FROM estimated_expenses WHERE userId = ? ORDER BY id ASC").all(req.user.id);
  res.json({ estimates: rows.map(mapEst) });
});

export default router;
