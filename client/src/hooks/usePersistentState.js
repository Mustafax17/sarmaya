import { useEffect, useState } from "react";

// localStorage-backed state for UI PREFERENCES ONLY (theme, sidebar). Financial
// data never lives here — it's in SQLite behind the API. Wrapped in try/catch
// for private-mode / quota failures.
export function usePersistentState(key, initial) {
  const [state, setState] = useState(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw != null ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* ignore quota / unavailable storage */
    }
  }, [key, state]);
  return [state, setState];
}
