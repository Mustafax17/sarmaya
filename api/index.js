// Vercel serverless entry: every /api/* request is rewritten here (see vercel.json)
// and handled by the same Express app that server/index.js runs locally.
export { default } from "../server/app.js";
