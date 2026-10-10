import express from "express";

// Express 4 catches a synchronous throw but not a rejected promise, and every
// handler is async now that database calls are awaited. Without this, an HttpError
// thrown after an `await` would hang the request instead of reaching the error
// middleware. Drop-in replacement for express.Router().
const wrap = (fn) => (fn.length === 4 ? fn : (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next));

export function Router() {
  const router = express.Router();
  for (const method of ["get", "post", "put", "patch", "delete"]) {
    const original = router[method].bind(router);
    router[method] = (path, ...handlers) => original(path, ...handlers.map(wrap));
  }
  return router;
}
