// Injects a <style> tag: keyframes, media queries, scrollbars, focus rings, the
// smoky atmosphere (drifting radial fog + grain), glass-blur utility, and 3D
// depth. Glitter is a separate pooled canvas (lib/glitter.js) — no per-button
// particle CSS here. Theme colours arrive via CSS variables set in App.

// Subtle film grain (inline SVG turbulence, no network asset).
const GRAIN_URI =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`,
  );

const CSS = `
  * { box-sizing: border-box; }
  html, body, #root { height: 100%; }
  body { margin: 0; font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; letter-spacing: -0.011em; }
  h1, h2, h3 { letter-spacing: -0.02em; }
  input, button, textarea, select { font: inherit; }

  .sm-root { position: relative; isolation: isolate; min-height: 100%; }

  /* Green-black ambient: a soft greenish-gold haze bleeding from the TOP CORNERS,
     plus a faint top wash. Static and calm — no drift (reduced-motion safe). Sits
     behind everything (z-index -2) and never reduces text contrast. Colours come
     entirely from theme tokens (--blob-a/b/c); only the positions live here. */
  .sm-fog { position: fixed; inset: 0; z-index: -2; pointer-events: none;
    background:
      radial-gradient(58% 46% at 0% 0%, var(--blob-a), transparent 60%),
      radial-gradient(58% 46% at 100% 0%, var(--blob-b), transparent 60%),
      radial-gradient(90% 50% at 50% -12%, var(--blob-c), transparent 72%); }
  /* Optional faint grain on the canvas — very low opacity, behind all UI. */
  .sm-grain { position: fixed; inset: 0; z-index: -1; pointer-events: none;
    background-image: url("${GRAIN_URI}"); background-size: 200px 200px;
    opacity: var(--grain-opacity); mix-blend-mode: soft-light; }

  /* Translucent glass surfaces (top bar, modal) lift out of the haze. */
  .sm-glass { backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }

  .sm-root :focus-visible { outline: none; box-shadow: var(--glow); border-radius: 10px; }
  .sm-root a:focus-visible, .sm-root button:focus-visible { outline: none; box-shadow: var(--glow); }

  .sm-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
  .sm-scroll::-webkit-scrollbar-thumb { background: var(--scroll-thumb); border-radius: 8px; }
  .sm-scroll::-webkit-scrollbar-track { background: transparent; }

  /* Card: 3D raised surface (inset top highlight lives in the shadow token). */
  .sm-card { position: relative; transition: transform .2s cubic-bezier(.2,.7,.3,1), box-shadow .2s ease, border-color .2s ease; }
  .sm-card.sm-lift:hover { transform: translateY(-4px) scale(1.012); box-shadow: var(--shadow-lg); border-color: var(--ring); }

  .sm-hover { transition: background .16s ease, transform .16s ease, border-color .16s ease, box-shadow .16s ease, opacity .16s ease, color .16s ease; }
  .sm-lift:hover { transform: translateY(-3px); }
  .sm-in::placeholder { color: var(--placeholder); }
  .sm-in:focus { border-color: var(--ring) !important; box-shadow: var(--glow); }

  /* Buttons (glitter comes from the canvas primitive, not CSS). */
  .sm-btn { transition: transform .14s cubic-bezier(.2,.7,.3,1), box-shadow .18s ease, filter .18s ease, background .18s ease, border-color .16s ease, opacity .16s ease; }
  .sm-btn:not(:disabled):hover { transform: translateY(-1px); }
  .sm-btn:not(:disabled):active { transform: translateY(1px); }
  .sm-btn-primary:not(:disabled):hover { box-shadow: 0 10px 26px var(--ring); filter: brightness(1.05); }

  /* rows / tables */
  .sm-row { transition: background .14s ease; }
  .sm-row:hover { background: var(--row-hover); }

  .sm-grad-text { background: var(--grad-text); -webkit-background-clip: text; background-clip: text; color: transparent; }

  /* Stealth / privacy mode: blur every money value marked .sm-priv while the app
     root carries data-stealth. Hover/focus a value to peek at it. */
  .sm-priv { transition: filter .16s ease; }
  [data-stealth="1"] .sm-priv { filter: blur(8px); cursor: default; user-select: none; }
  [data-stealth="1"] .sm-priv:hover, [data-stealth="1"] .sm-priv:focus-within { filter: blur(0); }

  /* Landing: editorial layout + crisp, intentional interaction states.
     Accent appears ONLY on hover/focus (interaction), never as decoration. */
  .land-hero { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 56px; align-items: center; }
  .land-two { display: grid; grid-template-columns: 0.9fr 1.1fr; gap: 56px; }
  @media (max-width: 860px) { .land-hero, .land-two { grid-template-columns: 1fr; gap: 32px; } }

  /* Animated text-underline link (grows from the left on hover). */
  .sm-underline { position: relative; text-decoration: none; }
  .sm-underline::after { content: ""; position: absolute; left: 0; right: 0; bottom: -3px; height: 1.5px;
    background: currentColor; transform: scaleX(0); transform-origin: left; transition: transform .24s cubic-bezier(.2,.7,.3,1); }
  .sm-underline:hover::after { transform: scaleX(1); }

  /* Feature row: a crisp accent edge on hover instead of a boxed card + shadow. */
  .sm-feature { border-left: 2px solid transparent; transition: border-color .18s ease, background .18s ease, padding-left .18s ease; }
  .sm-feature:hover { border-left-color: var(--accent); background: var(--row-hover); padding-left: 22px; }

  /* skeleton shimmer */
  .sm-skel { position: relative; overflow: hidden; background: var(--scroll-thumb); border-radius: 8px; }
  .sm-skel::after { content: ""; position: absolute; inset: 0; transform: translateX(-100%);
    background: linear-gradient(90deg, transparent, var(--shimmer), transparent); }
  @media (prefers-reduced-motion: no-preference) { .sm-skel::after { animation: smShimmer 1.4s infinite; } }
  @keyframes smShimmer { 100% { transform: translateX(100%); } }

  @keyframes smSpin { to { transform: rotate(360deg); } }
  @keyframes smFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  @keyframes smSlideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
  @keyframes smScaleIn { from { opacity: 0; transform: scale(.96); } to { opacity: 1; transform: none; } }
  @keyframes smFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }

  .sm-fade { animation: smFade .28s ease both; }
  .sm-slide-up { animation: smSlideUp .5s cubic-bezier(.2,.7,.3,1) both; }
  .sm-scale-in { animation: smScaleIn .4s cubic-bezier(.2,.7,.3,1) both; }
  @media (prefers-reduced-motion: no-preference) { .sm-float { animation: smFloat 5s ease-in-out infinite; } }
  @media (max-width: 560px) { .sm-floatcard { display: none !important; } }
  @media (prefers-reduced-motion: reduce) {
    .sm-fade, .sm-slide-up, .sm-scale-in { animation: none; }
  }
`;

export default function GlobalStyle() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}
