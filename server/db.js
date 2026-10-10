import { createClient } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

// libSQL client. In production (Vercel) this is a hosted Turso database, because a
// serverless function has no persistent disk. Locally it falls back to the same
// SQLite file as before (file: URL), so dev keeps its existing data.
const isLocalFile = config.dbUrl.startsWith("file:");
if (isLocalFile) fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const client = createClient({ url: config.dbUrl, authToken: config.dbAuthToken });

// Rows come back as plain objects keyed by column name, like better-sqlite3 gave.
const toObjects = (rs) => rs.rows.map((r) => Object.fromEntries(rs.columns.map((c, i) => [c, r[i]])));

// A single plain-object argument is a set of named parameters (@name); anything
// else is positional (?).
const toArgs = (args) =>
  args.length === 1 && args[0] !== null && typeof args[0] === "object" && !Array.isArray(args[0]) ? args[0] : args;

// Same shape as the old better-sqlite3 API — prepare(sql).get/all/run — but every
// call returns a promise, so call sites just add `await`.
export const db = {
  prepare(sql) {
    return {
      async get(...args) {
        const rs = await client.execute({ sql, args: toArgs(args) });
        return toObjects(rs)[0];
      },
      async all(...args) {
        return toObjects(await client.execute({ sql, args: toArgs(args) }));
      },
      async run(...args) {
        const rs = await client.execute({ sql, args: toArgs(args) });
        return {
          changes: rs.rowsAffected,
          lastInsertRowid: rs.lastInsertRowid == null ? undefined : Number(rs.lastInsertRowid),
        };
      },
    };
  },
  // Several statements atomically: [[sql, ...args], ...]. Replaces db.transaction().
  async batch(stmts) {
    await client.batch(
      stmts.map(([sql, ...args]) => ({ sql, args: toArgs(args) })),
      "write",
    );
  },
  exec(sql) {
    return client.executeMultiple(sql);
  },
  close() {
    client.close();
  },
};

// Deletes a user and every row they own. Spelled out rather than relying on
// ON DELETE CASCADE: a remote libSQL connection doesn't keep PRAGMA foreign_keys
// on between requests, so the cascade can't be counted on there.
export function deleteUser(userId) {
  return db.batch([
    ...["transactions", "obligations", "goals", "debts", "challenges", "estimated_expenses", "reviews", "coach_messages"].map(
      (t) => [`DELETE FROM ${t} WHERE userId = ?`, userId],
    ),
    ["DELETE FROM users WHERE id = ?", userId],
  ]);
}

// Idempotently add any missing columns to an existing table (SQLite has no
// "ADD COLUMN IF NOT EXISTS"). Lets us evolve the schema without dropping data.
async function ensureColumns(table, cols) {
  const have = new Set((await db.prepare(`PRAGMA table_info(${table})`).all()).map((c) => c.name));
  for (const [name, ddl] of cols) {
    if (!have.has(name)) await db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

// Idempotent schema. Money is ALWAYS an INTEGER in minor units — never a float.
// Every non-user table carries a userId FK with ON DELETE CASCADE.
export async function initSchema() {
  if (isLocalFile) await db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT NOT NULL UNIQUE,
      passwordHash  TEXT NOT NULL,
      name          TEXT NOT NULL DEFAULT '',
      currency      TEXT NOT NULL DEFAULT 'USD',
      locale        TEXT NOT NULL DEFAULT 'en-US',
      incomeType    TEXT NOT NULL DEFAULT 'fixed',  -- 'fixed' | 'irregular'
      incomeSource  TEXT,                 -- self-reported: a known key or free text, nullable
      monthlyIncome INTEGER,              -- minor units, nullable (fixed only / may skip)
      incomeEstimate INTEGER,             -- minor units, self-reported typical month for IRREGULAR income, nullable
      monthlySpend  INTEGER,              -- self-reported, nullable
      savings       INTEGER,              -- self-reported current savings, nullable
      topCategory   TEXT,                 -- self-reported top spend category
      focus         TEXT,
      habits        TEXT,                 -- JSON blob
      coachOptOut   INTEGER NOT NULL DEFAULT 0,  -- 1 = never send data to the coach LLM
      tokenVersion  INTEGER NOT NULL DEFAULT 0,  -- bumped on password change to invalidate old JWTs
      onboarded     INTEGER NOT NULL DEFAULT 0,
      createdAt     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS obligations (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      userId   INTEGER NOT NULL,
      label    TEXT NOT NULL,             -- e.g. "Parents"
      amount   INTEGER NOT NULL,          -- minor units, the recurring commitment
      cadence  TEXT NOT NULL DEFAULT 'monthly',
      active   INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_oblig_user ON obligations(userId);

    CREATE TABLE IF NOT EXISTS transactions (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      userId   INTEGER NOT NULL,
      name     TEXT NOT NULL,
      cat      TEXT NOT NULL,
      amount   INTEGER NOT NULL,          -- minor units, always positive
      type     TEXT NOT NULL CHECK (type IN ('in','out')),
      kind     TEXT NOT NULL DEFAULT 'discretionary', -- discretionary | obligation | income
      trigger  TEXT,                      -- nullable: bored|hungry|with_friends|celebrating|stressed|planned|other
      worthIt  INTEGER,                   -- nullable boolean (0/1)
      obligationId INTEGER,               -- nullable FK -> obligations (for logged obligation instances)
      date     TEXT NOT NULL,             -- ISO 'YYYY-MM-DD'
      createdAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(userId, date);

    CREATE TABLE IF NOT EXISTS goals (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      userId   INTEGER NOT NULL,
      name     TEXT NOT NULL,
      target   INTEGER NOT NULL,
      saved    INTEGER NOT NULL DEFAULT 0,
      iconName TEXT NOT NULL DEFAULT 'Target',
      deadline TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_goal_user ON goals(userId);

    CREATE TABLE IF NOT EXISTS debts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      userId     INTEGER NOT NULL,
      name       TEXT NOT NULL,
      kind       TEXT NOT NULL DEFAULT 'formal',   -- 'informal' | 'formal'
      counterparty TEXT,                           -- informal: the person
      direction  TEXT NOT NULL DEFAULT 'owe',      -- 'owe' | 'owed'
      since      TEXT,                             -- ISO date the debt opened (age, not interest)
      principal  INTEGER NOT NULL,
      paid       INTEGER NOT NULL DEFAULT 0,
      apr        REAL,                             -- formal only, nullable
      minPayment INTEGER,                          -- formal only, nullable
      reminderAmount   INTEGER,                     -- USER-SET repayment plan, minor units, nullable
      reminderCadence  TEXT,                        -- USER-SET: 'weekly'|'monthly'|'quarterly', nullable
      nextReminder     TEXT,                        -- ISO date, derived from the user's cadence, nullable
      createdAt  TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_debt_user ON debts(userId);

    CREATE TABLE IF NOT EXISTS challenges (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      userId  INTEGER NOT NULL,
      key     TEXT NOT NULL,
      joined  INTEGER NOT NULL DEFAULT 1,
      streak  INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      UNIQUE (userId, key),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_challenge_user ON challenges(userId);

    CREATE TABLE IF NOT EXISTS estimated_expenses (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      userId    INTEGER NOT NULL,
      category  TEXT NOT NULL,
      monthly   INTEGER NOT NULL,            -- minor units, SELF-REPORTED estimate
      source    TEXT NOT NULL DEFAULT 'estimate',  -- never 'transaction'
      createdAt TEXT NOT NULL,
      UNIQUE (userId, category),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_est_user ON estimated_expenses(userId);

    CREATE TABLE IF NOT EXISTS reviews (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      userId    INTEGER NOT NULL,
      rating    INTEGER NOT NULL,            -- 1..5, enforced in the route
      comment   TEXT NOT NULL DEFAULT '',    -- rendered as TEXT on the client (React-escaped)
      createdAt TEXT NOT NULL,
      updatedAt TEXT,
      UNIQUE (userId),                       -- one review per person (editable)
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_review_created ON reviews(createdAt DESC);

    CREATE TABLE IF NOT EXISTS coach_messages (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      userId    INTEGER NOT NULL,
      role      TEXT NOT NULL CHECK (role IN ('user','assistant')),  -- conversation memory
      content   TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_coachmsg_user ON coach_messages(userId, id);
  `);

  // Evolve pre-existing tables (columns added after first release).
  await ensureColumns("users", [
    ["incomeType", "incomeType TEXT NOT NULL DEFAULT 'fixed'"],
    ["coachOptOut", "coachOptOut INTEGER NOT NULL DEFAULT 0"],
    ["incomeSource", "incomeSource TEXT"],
    ["incomeEstimate", "incomeEstimate INTEGER"],
    ["tokenVersion", "tokenVersion INTEGER NOT NULL DEFAULT 0"],
  ]);
  await ensureColumns("transactions", [
    ["kind", "kind TEXT NOT NULL DEFAULT 'discretionary'"],
    ["trigger", "trigger TEXT"],
    ["worthIt", "worthIt INTEGER"],
    ["obligationId", "obligationId INTEGER"],
    ["estimated", "estimated INTEGER NOT NULL DEFAULT 0"], // seeded from onboarding, not a real logged spend
  ]);
  await ensureColumns("debts", [
    ["kind", "kind TEXT NOT NULL DEFAULT 'formal'"],
    ["counterparty", "counterparty TEXT"],
    ["direction", "direction TEXT NOT NULL DEFAULT 'owe'"],
    ["since", "since TEXT"],
    ["reminderAmount", "reminderAmount INTEGER"],
    ["reminderCadence", "reminderCadence TEXT"],
    ["nextReminder", "nextReminder TEXT"],
  ]);

  // Informal debts have no APR/min-payment, so those columns must be nullable.
  // The original schema made them NOT NULL; ADD COLUMN can't relax that, so
  // rebuild the table once (preserving rows) if we detect the legacy shape.
  const debtInfo = await db.prepare("PRAGMA table_info(debts)").all();
  const legacyNotNull = debtInfo.some((c) => (c.name === "apr" || c.name === "minPayment") && c.notnull === 1);
  if (legacyNotNull) {
    await db.batch([
      ["ALTER TABLE debts RENAME TO _debts_legacy"],
      [`CREATE TABLE debts (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          userId     INTEGER NOT NULL,
          name       TEXT NOT NULL,
          kind       TEXT NOT NULL DEFAULT 'formal',
          counterparty TEXT,
          direction  TEXT NOT NULL DEFAULT 'owe',
          since      TEXT,
          principal  INTEGER NOT NULL,
          paid       INTEGER NOT NULL DEFAULT 0,
          apr        REAL,
          minPayment INTEGER,
          reminderAmount   INTEGER,
          reminderCadence  TEXT,
          nextReminder     TEXT,
          createdAt  TEXT NOT NULL,
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        )`],
      [`INSERT INTO debts (id,userId,name,kind,counterparty,direction,since,principal,paid,apr,minPayment,reminderAmount,reminderCadence,nextReminder,createdAt)
          SELECT id,userId,name,kind,counterparty,direction,since,principal,paid,apr,minPayment,reminderAmount,reminderCadence,nextReminder,createdAt FROM _debts_legacy`],
      ["DROP TABLE _debts_legacy"],
      ["CREATE INDEX IF NOT EXISTS idx_debt_user ON debts(userId)"],
    ]);
  }
}
