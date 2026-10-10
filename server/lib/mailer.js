// Gmail mailer, gated entirely on env credentials. Set these in server/.env to
// enable real sending (nothing is ever sent without them):
//   GMAIL_USER=you@gmail.com
//   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx   ← a Google "App Password", not your
//                                              normal password (needs 2FA enabled)
// Until they're present, isConfigured() is false and callers no-op gracefully.
import nodemailer from "nodemailer";

const USER = process.env.GMAIL_USER;
const PASS = process.env.GMAIL_APP_PASSWORD;

let transport = null;

export function isConfigured() {
  return Boolean(USER && PASS);
}

function getTransport() {
  if (transport) return transport;
  if (!isConfigured()) return null;
  transport = nodemailer.createTransport({ service: "gmail", auth: { user: USER, pass: PASS } });
  return transport;
}

// Send one email. Throws if the mailer isn't configured or Gmail rejects it.
export async function sendMail({ to, subject, text, html }) {
  const tx = getTransport();
  if (!tx) throw new Error("Email not configured (set GMAIL_USER and GMAIL_APP_PASSWORD in server/.env).");
  return tx.sendMail({ from: `Sarmaya <${USER}>`, to, subject, text, html });
}
