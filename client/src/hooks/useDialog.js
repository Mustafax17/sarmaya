import { useEffect, useRef } from "react";

// Overlay behavior for modals + the mobile drawer: Escape to close, focus trap
// (Tab cycles within), focus first element on open, restore focus on close.
//
// IMPORTANT: the effect depends ONLY on `active`. Callers pass a fresh inline
// `onClose` on every render; if it were in the dep array the effect would tear
// down and re-run on each keystroke, and `first.focus()` would yank focus off
// the input you're typing in. We read the latest onClose from a ref instead.
export function useDialog(active, onClose) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    const prevFocus = document.activeElement;
    const sel = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';
    const items = () =>
      node ? [...node.querySelectorAll(sel)].filter((el) => el.offsetParent !== null) : [];

    const first = items()[0];
    if (first) first.focus();

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;
      const list = items();
      if (list.length === 0) return;
      const a = list[0];
      const b = list[list.length - 1];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        b.focus();
      } else if (!e.shiftKey && document.activeElement === b) {
        e.preventDefault();
        a.focus();
      }
    };
    node?.addEventListener("keydown", onKey);
    return () => {
      node?.removeEventListener("keydown", onKey);
      if (prevFocus && typeof prevFocus.focus === "function") prevFocus.focus();
    };
  }, [active]);
  return ref;
}
