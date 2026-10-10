// Local / long-running server entry. On Vercel the same app is served by
// api/index.js as a serverless function instead, and none of this runs.
import app, { ensureSchema } from "./app.js";
import { config } from "./config.js";
import { isConfigured as mailerConfigured } from "./lib/mailer.js";
import { sendReminders } from "./lib/reminders.js";

await ensureSchema();

app.listen(config.port, () => {
  console.log(`[sarmaya] API listening on http://localhost:${config.port}`);
});

// Opt-in daily "finish your setup" reminder emails. Off unless BOTH the Gmail
// mailer is configured AND REMINDERS_DAILY=1 — so it never sends by surprise.
// (For production, an external cron hitting POST /api/admin/send-reminders is more
// robust than an in-process timer, which resets whenever the server restarts.)
if (process.env.REMINDERS_DAILY === "1" && mailerConfigured()) {
  const DAY_MS = 24 * 60 * 60 * 1000;
  setInterval(() => {
    sendReminders()
      .then((s) => console.log(`[sarmaya] reminders: sent ${s.sent}, skipped ${s.skipped}`))
      .catch((e) => console.error("[sarmaya] reminders error:", e?.message || e));
  }, DAY_MS);
  console.log("[sarmaya] daily profile-completion reminders enabled");
}
