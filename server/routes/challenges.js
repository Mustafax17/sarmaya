import { Router } from "../lib/router.js";
import { db } from "../db.js";
import { HttpError, idParam, num, oneOf } from "../validate.js";
import { CHALLENGE_KEYS } from "../constants.js";

const router = Router();

const mapCh = (r) => ({ id: r.id, key: r.key, joined: Boolean(r.joined), streak: r.streak });

router.get("/", async (req, res) => {
  const rows = await db.prepare("SELECT * FROM challenges WHERE userId = ? ORDER BY id ASC").all(req.user.id);
  res.json({ challenges: rows.map(mapCh) });
});

// POST /api/challenges — join a challenge by key (idempotent per user+key).
router.post("/", async (req, res) => {
  const key = oneOf(req.body?.key, "key", CHALLENGE_KEYS);
  const existing = await db.prepare("SELECT * FROM challenges WHERE userId = ? AND key = ?").get(req.user.id, key);
  if (existing) {
    await db.prepare("UPDATE challenges SET joined = 1 WHERE id = ?").run(existing.id);
    const row = await db.prepare("SELECT * FROM challenges WHERE id = ?").get(existing.id);
    return res.json({ challenge: mapCh(row) });
  }
  const info = await db
    .prepare("INSERT INTO challenges (userId, key, joined, streak, createdAt) VALUES (?,?,1,0,?)")
    .run(req.user.id, key, new Date().toISOString());
  const row = await db.prepare("SELECT * FROM challenges WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ challenge: mapCh(row) });
});

// PATCH /api/challenges/:id — update streak / joined state.
router.patch("/:id", async (req, res) => {
  const id = idParam(req.params.id);
  const existing = await db.prepare("SELECT * FROM challenges WHERE id = ? AND userId = ?").get(id, req.user.id);
  if (!existing) throw new HttpError(404, "Challenge not found");
  const b = req.body || {};
  const streak = b.streak !== undefined ? num(b.streak, "streak", { min: 0, max: 100000 }) : existing.streak;
  const joined = b.joined !== undefined ? (b.joined ? 1 : 0) : existing.joined;
  await db.prepare("UPDATE challenges SET streak = ?, joined = ? WHERE id = ? AND userId = ?").run(
    Math.round(streak),
    joined,
    id,
    req.user.id,
  );
  const row = await db.prepare("SELECT * FROM challenges WHERE id = ?").get(id);
  res.json({ challenge: mapCh(row) });
});

router.delete("/:id", async (req, res) => {
  const id = idParam(req.params.id);
  const info = await db.prepare("DELETE FROM challenges WHERE id = ? AND userId = ?").run(id, req.user.id);
  if (info.changes === 0) throw new HttpError(404, "Challenge not found");
  res.json({ ok: true });
});

export default router;
