// Vercel serverless entry: every /api/* request is rewritten here (see vercel.json)
// and handled by the same Express app that server/index.js runs locally.
//
// If the app fails to load (almost always a missing environment variable), answer
// every request with that reason as JSON instead of crashing the function, so the
// problem is visible from the browser and not only in the Vercel logs.
let app;
let startupError;
try {
  ({ default: app } = await import("../server/app.js"));
} catch (err) {
  startupError = err;
  console.error("[sarmaya] startup failed:", err);
}

export default function handler(req, res) {
  if (startupError) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    const message = String(startupError.message || startupError).startsWith("[sarmaya]")
      ? startupError.message
      : "Server failed to start. Check the function logs in Vercel.";
    res.end(JSON.stringify({ error: { message, code: "server_misconfigured" } }));
    return;
  }
  return app(req, res);
}
