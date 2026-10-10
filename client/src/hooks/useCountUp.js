import { useEffect, useRef, useState } from "react";

// Animate a number from its previous value to `target`. Respects
// prefers-reduced-motion (snaps instantly). Returns the current animated value.
export function useCountUp(target, duration = 600) {
  // Seed from 0 so the first mount animates up to the target (a later change
  // animates from the previous value). Reduced-motion snaps instantly.
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    const to = Number(target) || 0;
    if (reduce || from === to) {
      fromRef.current = to;
      setValue(to);
      return;
    }
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(from + (to - from) * eased);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return value;
}
