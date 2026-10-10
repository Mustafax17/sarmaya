import { Router } from "../lib/router.js";
import { db } from "../db.js";
import { HttpError, idParam, intMinor, oneOf, str } from "../validate.js";
import { CADENCES } from "../constants.js";

// Recurring commitment TEMPLATES ("25,000 to parents, monthly"). These are NOT
// spending and are never summed into the dashboard's outflow — they only prompt
// the user to log an actual instance. The money-that-left figure always comes
// from transactions with kind='obligation', never from these rows.
const router = Router();

const mapOb = (r) => ({
  id: r.id,
  label: r.label,
  amount: r.amount,
  cadence: r.cadence,
  active: Boolean(r.active),
});

router.get("/", async (req, res) => {
  const rows = await db.prepare("SELECT * FROM obligations WHERE userId = ? ORDER BY id ASC").all(req.user.id);
  res.json({ obligations: rows.map(mapOb) });
});

router.post("/", async (req, res) => {
  const b = req.body || {};
  const label = str(b.label, "label", { max: 120 });
  const amount = intMinor(b.amount, "amount", { min: 1 });
  const cadence = b.cadence !== undefined ? oneOf(b.cadence, "cadence", CADENCES) : "monthly";
  const info = await db
    .prepare("INSERT INTO obligations (userId, label, amount, cadence, active, createdAt) VALUES (?,?,?,?,1,?)")
    .run(req.user.id, label, amount, cadence, new Date().toISOString());
  const row = await db.prepare("SELECT * FROM obligations WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ obligation: mapOb(row) });
});

router.patch("/:id", async (req, res) => {
  const id = idParam(req.params.id);
  const existing = await db.prepare("SELECT * FROM obligations WHERE id = ? AND userId = ?").get(id, req.user.id);
  if (!existing) throw new HttpError(404, "Obligation not found");
  const b = req.body || {};
  const label = b.label !== undefined ? str(b.label, "label", { max: 120 }) : existing.label;
  const amount = b.amount !== undefined ? intMinor(b.amount, "amount", { min: 1 }) : existing.amount;
  const cadence = b.cadence !== undefined ? oneOf(b.cadence, "cadence", CADENCES) : existing.cadence;
  const active = b.active !== undefined ? (b.active ? 1 : 0) : existing.active;
  await db.prepare("UPDATE obligations SET label=?, amount=?, cadence=?, active=? WHERE id=? AND userId=?")
    .run(label, amount, cadence, active, id, req.user.id);
  const row = await db.prepare("SELECT * FROM obligations WHERE id = ?").get(id);
  res.json({ obligation: mapOb(row) });
});

router.delete("/:id", async (req, res) => {
  const id = idParam(req.params.id);
  const info = await db.prepare("DELETE FROM obligations WHERE id = ? AND userId = ?").run(id, req.user.id);
  if (info.changes === 0) throw new HttpError(404, "Obligation not found");
  res.json({ ok: true });
});

export default router;
