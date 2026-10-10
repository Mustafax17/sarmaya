import { Router } from "../lib/router.js";
import { db } from "../db.js";
import { HttpError, str } from "../validate.js";

const router = Router();

const MAX_COMMENT = 1000;

// Public shape of a review. Only the reviewer's FIRST name is exposed (privacy —
// consistent with the coach), plus a `mine` flag so the client can offer edit/delete.
const mapReview = (r, viewerId) => ({
  id: r.id,
  rating: r.rating,
  comment: r.comment,
  name: (r.name || "Someone").split(" ")[0],
  createdAt: r.createdAt,
  updatedAt: r.updatedAt ?? null,
  mine: r.userId === viewerId,
});

// Validate + normalise a review body. Rating must be an integer 1..5; comment is
// optional free text, trimmed and length-capped (stored/rendered as plain text).
function parseReview(b) {
  const rating = Number(b?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new HttpError(422, "Rating must be a whole number from 1 to 5");
  }
  let comment = "";
  if (b?.comment !== undefined && b.comment !== null && b.comment !== "") {
    comment = str(b.comment, "comment", { min: 1, max: MAX_COMMENT });
  }
  return { rating, comment };
}

// GET /api/reviews — the public wall: everyone's reviews, newest first.
router.get("/", async (req, res) => {
  const rows = await db
    .prepare(
      `SELECT r.*, u.name AS name
         FROM reviews r JOIN users u ON u.id = r.userId
        ORDER BY r.createdAt DESC`,
    )
    .all();
  res.json({ reviews: rows.map((r) => mapReview(r, req.user.id)) });
});

// POST /api/reviews — create or update the caller's single review (upsert).
router.post("/", async (req, res) => {
  const { rating, comment } = parseReview(req.body || {});
  const now = new Date().toISOString();
  const existing = await db.prepare("SELECT * FROM reviews WHERE userId = ?").get(req.user.id);
  if (existing) {
    await db.prepare("UPDATE reviews SET rating = ?, comment = ?, updatedAt = ? WHERE userId = ?").run(rating, comment, now, req.user.id);
  } else {
    await db.prepare("INSERT INTO reviews (userId, rating, comment, createdAt) VALUES (?,?,?,?)").run(req.user.id, rating, comment, now);
  }
  const row = await db
    .prepare("SELECT r.*, u.name AS name FROM reviews r JOIN users u ON u.id = r.userId WHERE r.userId = ?")
    .get(req.user.id);
  res.status(existing ? 200 : 201).json({ review: mapReview(row, req.user.id) });
});

// DELETE /api/reviews — remove the caller's own review only.
router.delete("/", async (req, res) => {
  const info = await db.prepare("DELETE FROM reviews WHERE userId = ?").run(req.user.id);
  if (info.changes === 0) throw new HttpError(404, "You haven't left a review yet");
  res.json({ ok: true });
});

export default router;
