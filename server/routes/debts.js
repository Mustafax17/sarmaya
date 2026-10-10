import { Router } from "../lib/router.js";
import { db } from "../db.js";
import { HttpError, idParam, intMinor, isoDate, num, oneOf, optStr, str } from "../validate.js";
import { DEBT_KINDS, DEBT_DIRECTIONS, CADENCES } from "../constants.js";

const router = Router();

const mapDebt = (r) => ({
  id: r.id,
  name: r.name,
  kind: r.kind, // 'informal' | 'formal'
  counterparty: r.counterparty ?? null,
  direction: r.direction, // 'owe' | 'owed'
  since: r.since ?? null, // ISO date the debt opened (age, not interest)
  principal: r.principal,
  paid: r.paid,
  apr: r.apr ?? null, // formal only
  minPayment: r.minPayment ?? null, // formal only
  // Optional USER-SET repayment plan (never guessed). null = no plan.
  reminderAmount: r.reminderAmount ?? null,
  reminderCadence: r.reminderCadence ?? null,
  nextReminder: r.nextReminder ?? null,
});

// Parse a debt body for POST/PATCH. Informal debts carry no APR/minPayment.
function parseDebt(b, existing) {
  const kind = b.kind !== undefined ? oneOf(b.kind, "kind", DEBT_KINDS) : existing?.kind ?? "formal";
  const name = b.name !== undefined ? str(b.name, "name", { max: 120 }) : existing?.name;
  const counterparty =
    b.counterparty !== undefined ? optStr(b.counterparty, "counterparty", { max: 120 }) : existing?.counterparty ?? null;
  const direction = b.direction !== undefined ? oneOf(b.direction, "direction", DEBT_DIRECTIONS) : existing?.direction ?? "owe";
  const since = b.since !== undefined ? isoDate(b.since, "since", { allowNull: true }) : existing?.since ?? null;
  const principal = b.principal !== undefined ? intMinor(b.principal, "principal", { min: 1 }) : existing?.principal;
  let paid = b.paid !== undefined ? intMinor(b.paid, "paid", { min: 0 }) : existing?.paid ?? 0;
  paid = Math.min(paid, principal); // can't pay more than you owe

  // APR / minPayment are meaningful only for formal debt; informal stays null.
  let apr = null;
  let minPayment = null;
  if (kind === "formal") {
    apr = b.apr !== undefined ? num(b.apr, "apr", { min: 0, max: 1000, allowNull: true }) : existing?.apr ?? 0;
    minPayment =
      b.minPayment !== undefined ? intMinor(b.minPayment, "minPayment", { min: 0, allowNull: true }) : existing?.minPayment ?? 0;
  }

  // Optional repayment plan — ONLY ever set from the request body, never invented.
  // Passing null for any field clears it (a debt with no plan just gets an age nudge).
  const reminderAmount =
    b.reminderAmount !== undefined ? intMinor(b.reminderAmount, "reminderAmount", { min: 1, allowNull: true }) : existing?.reminderAmount ?? null;
  const reminderCadence =
    b.reminderCadence !== undefined ? oneOf(b.reminderCadence, "reminderCadence", CADENCES, { allowNull: true }) : existing?.reminderCadence ?? null;
  const nextReminder =
    b.nextReminder !== undefined ? isoDate(b.nextReminder, "nextReminder", { allowNull: true }) : existing?.nextReminder ?? null;

  return { kind, name, counterparty, direction, since, principal, paid, apr, minPayment, reminderAmount, reminderCadence, nextReminder };
}

router.get("/", async (req, res) => {
  const rows = await db.prepare("SELECT * FROM debts WHERE userId = ? ORDER BY id ASC").all(req.user.id);
  res.json({ debts: rows.map(mapDebt) });
});

router.post("/", async (req, res) => {
  const d = parseDebt(req.body || {}, null);
  if (!d.name) throw new HttpError(422, "name is required");
  if (d.principal == null) throw new HttpError(422, "principal is required");
  const createdAt = new Date().toISOString();
  const info = await db
    .prepare(
      `INSERT INTO debts (userId, name, kind, counterparty, direction, since, principal, paid, apr, minPayment, reminderAmount, reminderCadence, nextReminder, createdAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(req.user.id, d.name, d.kind, d.counterparty, d.direction, d.since, d.principal, d.paid, d.apr, d.minPayment, d.reminderAmount, d.reminderCadence, d.nextReminder, createdAt);
  const row = await db.prepare("SELECT * FROM debts WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ debt: mapDebt(row) });
});

router.patch("/:id", async (req, res) => {
  const id = idParam(req.params.id);
  const existing = await db.prepare("SELECT * FROM debts WHERE id = ? AND userId = ?").get(id, req.user.id);
  if (!existing) throw new HttpError(404, "Debt not found");
  const d = parseDebt(req.body || {}, existing);
  await db.prepare(
    "UPDATE debts SET name=?, kind=?, counterparty=?, direction=?, since=?, principal=?, paid=?, apr=?, minPayment=?, reminderAmount=?, reminderCadence=?, nextReminder=? WHERE id=? AND userId=?",
  ).run(d.name, d.kind, d.counterparty, d.direction, d.since, d.principal, d.paid, d.apr, d.minPayment, d.reminderAmount, d.reminderCadence, d.nextReminder, id, req.user.id);
  const row = await db.prepare("SELECT * FROM debts WHERE id = ?").get(id);
  res.json({ debt: mapDebt(row) });
});

router.delete("/:id", async (req, res) => {
  const id = idParam(req.params.id);
  const info = await db.prepare("DELETE FROM debts WHERE id = ? AND userId = ?").run(id, req.user.id);
  if (info.changes === 0) throw new HttpError(404, "Debt not found");
  res.json({ ok: true });
});

export default router;
