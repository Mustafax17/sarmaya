// Schema migration + optional demo seed.
//   node migrate.js          -> create/verify schema only
//   node migrate.js --seed   -> also (re)create a labelled demo sandbox account
//
// The demo account is a real, self-contained sandbox with genuine dated
// transactions so every computed insight is real — NOT fabricated data
// attributed to a live user. Login: demo@sarmaya.app / demodemo

import bcrypt from "bcryptjs";
import { db, deleteUser, initSchema } from "./db.js";

await initSchema();
console.log("[migrate] schema ready");

if (process.argv.includes("--seed")) {
  await seedDemo();
}

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function seedDemo() {
  const email = "demo@sarmaya.app";
  const now = new Date().toISOString();

  // Fresh start: delete any prior demo account and everything it owns.
  const existing = await db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) await deleteUser(existing.id);

  const passwordHash = bcrypt.hashSync("demodemo", 10);
  const { lastInsertRowid: userId } = await db
    .prepare(
      `INSERT INTO users (email, passwordHash, name, currency, locale, incomeType, monthlyIncome,
         monthlySpend, savings, topCategory, focus, habits, onboarded, createdAt)
       VALUES (@email,@passwordHash,@name,@currency,@locale,@incomeType,@monthlyIncome,
         @monthlySpend,@savings,@topCategory,@focus,@habits,1,@createdAt)`,
    )
    .run({
      email,
      passwordHash,
      name: "Ayesha",
      currency: "PKR",
      locale: "en-PK",
      incomeType: "irregular", // income varies — the app reasons from a floor, never a single figure
      monthlyIncome: null, // never a confident monthly figure for irregular earners
      monthlySpend: null,
      savings: 69200000, // Rs 692,000 (paisa)
      topCategory: "Food",
      focus: "save_consistently",
      habits: JSON.stringify({ eatOut: "weekly", tracksToday: true, savesWhen: "start" }),
      createdAt: now,
    });

  // Recurring commitment template (NOT a logged instance — never summed into spending).
  const { lastInsertRowid: oblId } = await db
    .prepare(`INSERT INTO obligations (userId, label, amount, cadence, active, createdAt) VALUES (?,?,?,?,1,?)`)
    .run(userId, "Parents", 2500000, "monthly", now);

  // Transactions: [name, cat, amount(paisa), type, daysAgo, kind, trigger, worthIt, obligationId]
  const tx = [
    // income — irregular, with a deliberately low recent month (the floor)
    ["Freelance payment", "Bills", 21000000, "in", 48, "income", null, null, null],
    ["Freelance payment", "Bills", 14200000, "in", 18, "income", null, null, null],
    // logged obligation instances (money that left, but was never a choice)
    ["Parents", "Bills", 2500000, "out", 45, "obligation", null, null, oblId],
    ["Parents", "Bills", 2500000, "out", 15, "obligation", null, null, oblId],
    // discretionary — many trigger-tagged so Patterns unlocks (>= 20)
    ["Bakery", "Food", 60000, "out", 40, "discretionary", "hungry", 1, null],
    ["Movie snacks", "Entertainment", 80000, "out", 38, "discretionary", "with_friends", 0, null],
    ["Grocery run", "Food", 840000, "out", 46, "discretionary", "planned", 1, null],
    ["Petrol", "Transport", 600000, "out", 43, "discretionary", "planned", 1, null],
    ["Coffee out", "Food", 90000, "out", 33, "discretionary", "bored", 0, null],
    ["Dinner with friends", "Food", 320000, "out", 35, "discretionary", "with_friends", 0, null],
    ["Shirt", "Shopping", 450000, "out", 31, "discretionary", "celebrating", 1, null],
    ["Takeout", "Food", 150000, "out", 29, "discretionary", "stressed", 0, null],
    ["Pharmacy", "Health", 210000, "out", 27, "discretionary", null, null, null],
    ["Book", "Education", 120000, "out", 25, "discretionary", "planned", 1, null],
    ["Cinema", "Entertainment", 180000, "out", 23, "discretionary", "with_friends", 1, null],
    ["Dinner out", "Food", 280000, "out", 22, "discretionary", "with_friends", 0, null],
    ["Snacks", "Food", 70000, "out", 20, "discretionary", "hungry", 1, null],
    ["Rickshaw", "Transport", 40000, "out", 19, "discretionary", "planned", 1, null],
    ["Grocery run", "Food", 920000, "out", 16, "discretionary", "planned", 1, null],
    ["Concert", "Entertainment", 500000, "out", 14, "discretionary", "with_friends", 1, null],
    ["Careem rides", "Transport", 340000, "out", 12, "discretionary", null, null, null],
    ["Internet bill", "Bills", 550000, "out", 10, "discretionary", "planned", 1, null],
    ["Uber home", "Transport", 120000, "out", 9, "discretionary", "with_friends", 0, null],
    ["Lunch with team", "Food", 260000, "out", 8, "discretionary", "with_friends", 0, null],
    ["Ice cream", "Food", 50000, "out", 6, "discretionary", "bored", 0, null],
    ["Gym membership", "Health", 400000, "out", 4, "discretionary", "planned", 1, null],
    ["Online course", "Education", 750000, "out", 2, "discretionary", "planned", 1, null],
  ];
  const insTx = `INSERT INTO transactions (userId, name, cat, amount, type, kind, trigger, worthIt, obligationId, date, createdAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`;
  const insGoal = `INSERT INTO goals (userId, name, target, saved, iconName, deadline, createdAt) VALUES (?,?,?,?,?,?,?)`;
  const insDebt = `INSERT INTO debts (userId, name, kind, counterparty, direction, since, principal, paid, apr, minPayment, createdAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`;
  const insCh = `INSERT INTO challenges (userId, key, joined, streak, createdAt) VALUES (?,?,?,?,?)`;

  // Debts: [name, kind, counterparty, direction, sinceDaysAgo, principal, paid, apr, minPayment]
  const debts = [
    ["Ahmed", "informal", "Ahmed", "owe", 210, 1500000, 0, null, null], // owed for ~7 months
    ["Sara", "informal", "Sara", "owed", 95, 500000, 0, null, null], // Sara owes the user
    ["Credit card", "formal", null, "owe", 300, 12000000, 7800000, 36, 500000],
    ["Phone installment", "formal", null, "owe", 180, 9000000, 3000000, 0, 750000],
  ];
  // One round trip for the whole sandbox rather than one per row.
  await db.batch([
    ...tx.map(([name, cat, amount, type, daysAgo, kind, trigger, worthIt, obligationId]) => [
      insTx, userId, name, cat, amount, type, kind, trigger, worthIt, obligationId, isoDaysAgo(daysAgo), now,
    ]),
    [insGoal, userId, "Laptop", 40000000, 26000000, "Laptop", isoDaysAgo(-137), now],
    [insGoal, userId, "Emergency fund", 30000000, 12000000, "PiggyBank", null, now],
    [insGoal, userId, "Trip to Hunza", 15000000, 4200000, "Plane", isoDaysAgo(-120), now],
    ...debts.map(([name, kind, cp, dir, sinceDays, principal, paid, apr, minP]) => [
      insDebt, userId, name, kind, cp, dir, isoDaysAgo(sinceDays), principal, paid, apr, minP, now,
    ]),
    [insCh, userId, "cook_at_home", 1, 5, now],
    [insCh, userId, "no_spend_week", 1, 2, now],
  ]);

  console.log(`[migrate] demo sandbox seeded — login: ${email} / demodemo`);
}

db.close();
