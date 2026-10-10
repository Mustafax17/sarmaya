import { useEffect, useState } from "react";

// Viewport width in state — never read `window` during render. SSR-guarded
// initializer; the only window reads are the initializer and the resize handler.
export function useIsWide(bp = 980) {
  const [wide, setWide] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= bp,
  );
  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= bp);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [bp]);
  return wide;
}
