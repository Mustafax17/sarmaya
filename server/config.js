import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Vercel sets VERCEL=1 in every deployment (production and preview).
const onVercel = Boolean(process.env.VERCEL);

// JWT_SECRET is mandatory. No default fallback — a predictable secret would let
// anyone forge sessions. Fail loud and early instead of running insecurely.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === "replace-me-with-a-long-random-string" || JWT_SECRET.length < 16) {
  // On Vercel, throw instead of exiting: api/index.js turns it into a readable
  // JSON error rather than a bare FUNCTION_INVOCATION_FAILED.
  if (onVercel) {
    throw new Error("[sarmaya] JWT_SECRET is missing or too weak (min 16 chars). Set it in the Vercel project's Environment Variables.");
  }
  console.error(
    "\n[sarmaya] FATAL: JWT_SECRET is missing or too weak.\n" +
      "Create server/.env from server/.env.example and set a long random JWT_SECRET.\n" +
      'Generate one:  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n',
  );
  process.exit(1);
}

// A serverless function's disk is read-only and wiped between invocations, so a
// local SQLite file would silently lose every write. Require the hosted database.
if (onVercel && !process.env.TURSO_DATABASE_URL) {
  throw new Error(
    "[sarmaya] TURSO_DATABASE_URL is not set. Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in the Vercel project's Environment Variables.",
  );
}

const dbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(__dirname, "data", "sarmaya.sqlite");

export const config = {
  jwtSecret: JWT_SECRET,
  port: Number(process.env.PORT) || 4000,
  isProd: process.env.NODE_ENV === "production" || onVercel,
  // Off unless explicitly set (see app.js). Accepts a hop count ("1") or a
  // subnet; anything else is treated as truthy → Express's permissive mode.
  // On Vercel exactly one trusted proxy (Vercel's edge) sits in front of every
  // request, so default to 1 there — otherwise every visitor shares one IP and
  // one rate-limit bucket.
  trustProxy: process.env.TRUST_PROXY
    ? (/^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY)
    : onVercel ? 1 : false,
  dbPath,
  // Hosted Turso database when set (required on Vercel), else the local file.
  dbUrl: process.env.TURSO_DATABASE_URL || pathToFileURL(dbPath).href,
  dbAuthToken: process.env.TURSO_AUTH_TOKEN || undefined,
  // The ONE account allowed to see the user directory (the owner). Override via
  // ADMIN_EMAIL; defaults to the owner's address. Compared lowercased.
  adminEmail: (process.env.ADMIN_EMAIL || "ayeshairfan9991@gmail.com").toLowerCase(),
  cookieName: "sarmaya_token",
  tokenTtlSeconds: 60 * 60 * 24 * 7, // 7 days
};
