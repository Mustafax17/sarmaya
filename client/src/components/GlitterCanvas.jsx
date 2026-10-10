import { useEffect, useRef } from "react";
import { registerCanvas, unregisterCanvas } from "../lib/glitter.js";

// Mounts the single shared glitter canvas once, at the app root. Purely
// decorative: fixed, full-viewport, pointer-events:none, aria-hidden. Cancels
// its animation frame and clears the pool on unmount (see lib/glitter.js).
export default function GlitterCanvas() {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) registerCanvas(ref.current);
    return () => unregisterCanvas();
  }, []);
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{ position: "fixed", inset: 0, zIndex: 90, pointerEvents: "none" }}
    />
  );
}
