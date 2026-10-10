import express from "express";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { config } from "./config.js";
import { initSchema } from "./db.js";
import { HttpError } from "./validate.js";
import { requireAuth, register, login, logout, me } from "./auth.js";
import txRoutes from "./routes/transactions.js";
import goalRoutes from "./routes/goals.js";
import debtRoutes from "./routes/debts.js";
import obligationRoutes from "./routes/obligations.js";
import estimateRoutes from "./routes/estimates.js";
import challengeRoutes from "./routes/challenges.js";
import coachRoutes from "./routes/coach.js";
import receiptRoutes from "./routes/receipts.js";
import reviewRoutes from "./routes/reviews.js";
import adminRoutes from "./routes/admin.js";
import userRoutes from "./routes/user.js";

// The Express app, without listen(). index.js serves it locally; on Vercel,
// api/index.js exports it as the serverless function handler.

// Schema setup runs once per process (once per cold start on Vercel). A failure
// is not cached, so the next request retries instead of the instance staying broken.
let schemaReady = null;
const ensureSchema = () => {
  schemaReady ??= initSchema().catch((err) => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
};

const app = express();

// Don't advertise the framework. (helmet also strips this; belt and braces.)
app.disable("x-powered-by");

// If deployed behind exactly one reverse proxy (nginx, etc.), set TRUST_PROXY=1
// so req.ip / secure cookies reflect the real client. Left OFF by default: when
// directly exposed, trusting X-Forwarded-For would let a client spoof its IP and
// slip the rate limiter. Only enable it when a proxy you control sets the header.
if (config.trustProxy) app.set("trust proxy", config.trustProxy);

// Security headers. This is a JSON API, so lock the CSP down to nothing-loads —
// responses carry no HTML/scripts, and a strict policy means an accidental HTML
// response still can't pull a resource. HSTS only bites over HTTPS (prod).
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    hsts: { maxAge: 15552000, includeSubDomains: true }, // 180 days
    referrerPolicy: { policy: "no-referrer" },
    crossOriginResourcePolicy: { policy: "same-origin" },
  }),
);

// Receipt uploads carry a base64 image, which blows straight past the 64kb that
// every other route lives comfortably within. Mounted BEFORE the global parser:
// body-parser marks the request parsed and the global one then skips it, so this
// is a raised ceiling for exactly one path rather than for the whole API.
app.use("/api/receipts", express.json({ limit: "8mb" }));
app.use(express.json({ limit: "64kb" }));
app.use(cookieParser());

// CSRF / cross-origin defense for state-changing requests — belt-and-braces on top
// of the sameSite cookie. A classic CSRF is an auto-submitting HTML form, which can
// ONLY send form-urlencoded / multipart / text-plain and cannot set a custom or
// JSON content-type without a CORS preflight we never grant. So:
//   1) if a body content-type is present, it MUST be application/json (blocks the
//      form-submission vector); bodyless requests (logout, deletes) are allowed.
//   2) reject anything a modern browser flags as a genuinely cross-site request.
// The SPA only ever sends application/json (or nothing), so this changes nothing
// for legitimate traffic.
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
app.use((req, _res, next) => {
  if (!MUTATING.has(req.method)) return next();
  const site = (req.get("sec-fetch-site") || "").toLowerCase();
  if (site === "cross-site") return next(new HttpError(403, "Cross-site request blocked.", "csrf"));
  const ct = (req.get("content-type") || "").toLowerCase();
  if (ct && !ct.startsWith("application/json")) return next(new HttpError(415, "Unsupported content type.", "unsupported_media_type"));
  next();
});

// Wrap sync/async handlers so thrown HttpErrors reach the error middleware.
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Rate-limit auth endpoints hard to blunt brute force / credential stuffing /
// enumeration. Keyed by client IP (the default).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "Too many attempts. Please try again later." } },
});

// A generous ceiling over the whole API — normal use (a page load hits a handful
// of endpoints) never approaches it; a scripted flood does. Abuse resistance, not
// a UX gate.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "Too many requests. Please slow down." } },
});

// The coach calls a paid/rate-limited LLM, so throttle it PER USER (not per IP) —
// an authenticated account can't run up cost or hammer the provider. requireAuth
// runs first, so req.user is always set here.
const coachLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?.id ?? req.ip),
  message: { error: { message: "You're sending messages very fast. Give it a moment." } },
});

// A vision call costs several times what a coach message does, so receipts get
// their own DAILY per-user ceiling on top of the coach's per-5-minute one.
// In-memory like every other limiter here: a restart forgives the count, which
// is the honest tradeoff for not adding a table to track it.
const receiptLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?.id ?? req.ip),
  message: { error: { message: "You've hit today's receipt-scan limit. You can still add transactions by typing them." } },
});

// Health check stays unmetered (monitoring), defined before the global limiter.
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Everything else under /api is subject to the global ceiling.
app.use("/api", apiLimiter);

// Every route below touches the database, so wait for the schema first.
app.use("/api", (_req, _res, next) => {
  ensureSchema().then(() => next(), next);
});

// --- Auth (public, rate-limited) ---
app.post("/api/auth/register", authLimiter, h(register));
app.post("/api/auth/login", authLimiter, h(login));
app.post("/api/auth/logout", h(logout));
app.get("/api/auth/me", requireAuth, h(me));

// --- Protected resources: requireAuth authenticates AND every handler
//     additionally authorizes by req.user.id on each read and write. ---
app.use("/api/user", requireAuth, userRoutes);
app.use("/api/transactions", requireAuth, txRoutes);
app.use("/api/goals", requireAuth, goalRoutes);
app.use("/api/debts", requireAuth, debtRoutes);
app.use("/api/obligations", requireAuth, obligationRoutes);
app.use("/api/estimates", requireAuth, estimateRoutes);
app.use("/api/challenges", requireAuth, challengeRoutes);
app.use("/api/coach", requireAuth, coachLimiter, coachRoutes);
app.use("/api/receipts", requireAuth, receiptLimiter, receiptRoutes);
app.use("/api/reviews", requireAuth, reviewRoutes);
app.use("/api/admin", requireAuth, adminRoutes);

// Unknown API route -> 404 JSON (not an HTML page).
app.use("/api", (_req, res) => res.status(404).json({ error: { message: "Not found" } }));

// Consistent error shape. Never leak stack traces or internal error text.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  // Honour a deliberate status from our own HttpError, or a 4xx set by upstream
  // middleware (e.g. body-parser's malformed-JSON 400 / payload-too-large 413).
  // Anything else is a genuine server fault → 500.
  const upstream = Number.isInteger(err.status) ? err.status : Number.isInteger(err.statusCode) ? err.statusCode : null;
  const status = err instanceof HttpError ? err.status : upstream && upstream >= 400 && upstream < 600 ? upstream : 500;
  if (status >= 500) console.error("[sarmaya] server error:", err);
  // Only OUR HttpError messages are curated + safe to show. For everything else
  // (parser internals, library errors) send a generic message for the status.
  const generic = status === 413 ? "Request too large." : status >= 500 ? "Something went wrong on our end." : "Malformed or invalid request.";
  res.status(status).json({
    error: {
      message: err instanceof HttpError ? err.message : generic,
      code: err instanceof HttpError ? err.code : undefined,
    },
  });
});

export { ensureSchema };
export default app;
