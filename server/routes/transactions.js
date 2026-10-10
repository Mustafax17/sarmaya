import { Router } from "../lib/router.js";
import { db } from "../db.js";
import { HttpError, idParam, intMinor, isoDate, oneOf, str, boolNull } from "../validate.js";
import { TX_TYPES, TX_KINDS, TRIGGERS } from "../constants.js";

const router = Router();

const mapTx = (r) => ({
  id: r.id,
  name: r.name,
  cat: r.cat,
  amount: r.amount, // minor units, positive
  type: r.type, // 'in' | 'out'
  kind: r.kind, // discretionary | obligation | income
  trigger: r.trigger, // nullable
  worthIt: r.worthIt === null ? null : Boolean(r.worthIt),
  obligationId: r.obligationId ?? null,
  estimated: Boolean(r.estimated), // seeded from onboarding, awaiting confirmation
  date: r.date,
});

// Default kind follows type unless the client is explicit: income for 'in',
// discretionary for 'out'. 'obligation' is only valid on an outflow.
function resolveKind(rawKind, type) {
  if (rawKind === undefined || rawKind === null) return type === "in" ? "income" : "discretionary";
  const kind = oneOf(rawKind, "kind", TX_KINDS);
  if (type === "in" && kind !== "income") throw new HttpError(422, "income transactions must have kind 'income'");
  if (type === "out" && kind === "income") throw new HttpError(422, "an expense can't have kind 'income'");
  return kind;
}

router.get("/", async (req, res) => {
  const rows = await db
    .prepare("SELECT * FROM transactions WHERE userId = ? ORDER BY date DESC, id DESC")
    .all(req.user.id);
  res.json({ transactions: rows.map(mapTx) });
});

router.post("/", async (req, res) => {
  const b = req.body || {};
  const name = str(b.name, "name", { max: 120 });
  const cat = str(b.cat, "cat", { max: 60 });
  const amount = intMinor(b.amount, "amount", { min: 1 });
  const type = oneOf(b.type, "type", TX_TYPES);
  const kind = resolveKind(b.kind, type);
  const trigger = kind === "discretionary" ? oneOf(b.trigger, "trigger", TRIGGERS, { allowNull: true }) : null;
  const worthIt = kind === "discretionary" ? boolNull(b.worthIt) : null;
  const date = isoDate(b.date, "date");
  const estimated = b.estimated ? 1 : 0; // seeded onboarding rows flag themselves
  // An obligation instance may reference a commitment template (must be the user's).
  let obligationId = null;
  if (kind === "obligation" && b.obligationId != null) {
    obligationId = idParam(b.obligationId);
    const owns = await db.prepare("SELECT id FROM obligations WHERE id = ? AND userId = ?").get(obligationId, req.user.id);
    if (!owns) throw new HttpError(422, "unknown obligation");
  }
  const createdAt = new Date().toISOString();

  const info = await db
    .prepare(
      `INSERT INTO transactions (userId, name, cat, amount, type, kind, trigger, worthIt, obligationId, estimated, date, createdAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(req.user.id, name, cat, amount, type, kind, trigger, worthIt, obligationId, estimated, date, createdAt);
  const row = await db.prepare("SELECT * FROM transactions WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ transaction: mapTx(row) });
});

// PATCH — post-save tagging (trigger / worthIt), plus CONFIRMING a seeded estimate:
// the client may correct the `amount` and set `estimated:false` to accept it as real.
router.patch("/:id", async (req, res) => {
  const id = idParam(req.params.id);
  const existing = await db.prepare("SELECT * FROM transactions WHERE id = ? AND userId = ?").get(id, req.user.id);
  if (!existing) throw new HttpError(404, "Transaction not found");
  const b = req.body || {};
  const trigger = b.trigger !== undefined ? oneOf(b.trigger, "trigger", TRIGGERS, { allowNull: true }) : existing.trigger;
  const worthIt = b.worthIt !== undefined ? boolNull(b.worthIt) : existing.worthIt;
  const amount = b.amount !== undefined ? intMinor(b.amount, "amount", { min: 1 }) : existing.amount;
  const estimated = b.estimated !== undefined ? (b.estimated ? 1 : 0) : existing.estimated;
  await db.prepare("UPDATE transactions SET trigger = ?, worthIt = ?, amount = ?, estimated = ? WHERE id = ? AND userId = ?")
    .run(trigger, worthIt, amount, estimated, id, req.user.id);
  const row = await db.prepare("SELECT * FROM transactions WHERE id = ?").get(id);
  res.json({ transaction: mapTx(row) });
});

router.delete("/:id", async (req, res) => {
  const id = idParam(req.params.id);
  const info = await db.prepare("DELETE FROM transactions WHERE id = ? AND userId = ?").run(id, req.user.id);
  if (info.changes === 0) throw new HttpError(404, "Transaction not found");
  res.json({ ok: true });
});

export default router;
