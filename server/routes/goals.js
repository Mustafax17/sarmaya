import { Router } from "../lib/router.js";
import { db } from "../db.js";
import { HttpError, idParam, intMinor, isoDate, optStr, str } from "../validate.js";

const router = Router();

const mapGoal = (r) => ({
  id: r.id,
  name: r.name,
  target: r.target,
  saved: r.saved,
  iconName: r.iconName,
  deadline: r.deadline,
});

router.get("/", async (req, res) => {
  const rows = await db
    .prepare("SELECT * FROM goals WHERE userId = ? ORDER BY id ASC")
    .all(req.user.id);
  res.json({ goals: rows.map(mapGoal) });
});

router.post("/", async (req, res) => {
  const b = req.body || {};
  const name = str(b.name, "name", { max: 120 });
  const target = intMinor(b.target, "target", { min: 1 });
  const saved = intMinor(b.saved ?? 0, "saved", { min: 0 });
  const iconName = optStr(b.iconName, "iconName", { max: 40 }) || "Target";
  const deadline = isoDate(b.deadline, "deadline", { allowNull: true });
  // Savings can never exceed the target amount.
  const cappedSaved = Math.min(saved, target);
  const createdAt = new Date().toISOString();

  const info = await db
    .prepare(
      `INSERT INTO goals (userId, name, target, saved, iconName, deadline, createdAt)
       VALUES (?,?,?,?,?,?,?)`,
    )
    .run(req.user.id, name, target, cappedSaved, iconName, deadline, createdAt);
  const row = await db.prepare("SELECT * FROM goals WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ goal: mapGoal(row) });
});

// PATCH /api/goals/:id — update name/target/saved/deadline/icon (partial).
router.patch("/:id", async (req, res) => {
  const id = idParam(req.params.id);
  const existing = await db.prepare("SELECT * FROM goals WHERE id = ? AND userId = ?").get(id, req.user.id);
  if (!existing) throw new HttpError(404, "Goal not found");

  const b = req.body || {};
  const name = b.name !== undefined ? str(b.name, "name", { max: 120 }) : existing.name;
  const target = b.target !== undefined ? intMinor(b.target, "target", { min: 1 }) : existing.target;
  let saved = b.saved !== undefined ? intMinor(b.saved, "saved", { min: 0 }) : existing.saved;
  const iconName = b.iconName !== undefined ? str(b.iconName, "iconName", { max: 40 }) : existing.iconName;
  const deadline = b.deadline !== undefined ? isoDate(b.deadline, "deadline", { allowNull: true }) : existing.deadline;
  saved = Math.min(saved, target); // never exceed target

  await db.prepare(
    "UPDATE goals SET name=?, target=?, saved=?, iconName=?, deadline=? WHERE id=? AND userId=?",
  ).run(name, target, saved, iconName, deadline, id, req.user.id);
  const row = await db.prepare("SELECT * FROM goals WHERE id = ?").get(id);
  res.json({ goal: mapGoal(row) });
});

router.delete("/:id", async (req, res) => {
  const id = idParam(req.params.id);
  const info = await db.prepare("DELETE FROM goals WHERE id = ? AND userId = ?").run(id, req.user.id);
  if (info.changes === 0) throw new HttpError(404, "Goal not found");
  res.json({ ok: true });
});

export default router;
