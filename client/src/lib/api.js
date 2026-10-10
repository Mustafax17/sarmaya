// Thin fetch wrapper around the backend. Always sends the httpOnly auth cookie
// (credentials: "include"); never touches localStorage for the token. Throws a
// typed ApiError on non-2xx so callers can show real error + retry.

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Network failure (server down, offline). Distinct from an HTTP error.
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0, "network");
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const msg = data?.error?.message || `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, data?.error?.code);
  }
  return data;
}

export const api = {
  get: (p) => request("GET", p),
  post: (p, b) => request("POST", p, b),
  patch: (p, b) => request("PATCH", p, b),
  del: (p) => request("DELETE", p),

  // Auth
  register: (b) => request("POST", "/auth/register", b),
  login: (b) => request("POST", "/auth/login", b),
  logout: () => request("POST", "/auth/logout"),
  me: () => request("GET", "/auth/me"),

  // Reference data
  meta: () => request("GET", "/user/meta"),

  // User
  updateUser: (b) => request("PATCH", "/user", b),
  changePassword: (b) => request("POST", "/user/password", b),
  deleteAccount: () => request("DELETE", "/user"),

  // Self-reported monthly estimates (never transactions)
  getEstimates: () => request("GET", "/estimates"),
  saveEstimates: (estimates) => request("PUT", "/estimates", { estimates }),

  // Coach (grounded in server-computed FACTS)
  coachFacts: () => request("GET", "/coach/facts"),
  coachMessage: (message) => request("POST", "/coach/message", { message }),
  coachHistory: () => request("GET", "/coach/history"),
  clearCoachHistory: () => request("DELETE", "/coach/history"),

  // Receipt scanning — returns a DRAFT for the confirm card, never a saved row.
  scanReceipt: (imageBase64, mediaType) => request("POST", "/receipts/scan", { imageBase64, mediaType }),

  // Reviews (public wall; one editable review per person)
  getReviews: () => request("GET", "/reviews"),
  saveReview: (b) => request("POST", "/reviews", b),
  deleteReview: () => request("DELETE", "/reviews"),

  // Admin (owner account only — server enforces)
  adminUsers: () => request("GET", "/admin/users"),
  adminMailStatus: () => request("GET", "/admin/mail-status"),
  adminSendReminders: () => request("POST", "/admin/send-reminders", {}),
};
