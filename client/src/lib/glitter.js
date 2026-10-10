// ONE pooled glitter particle system for the whole app. A single <canvas>, a
// single requestAnimationFrame loop, and a fixed particle pool that is recycled
// — never a component-per-burst. Everything is decorative:
//   • the canvas is pointer-events:none + aria-hidden (see GlitterCanvas)
//   • bursts never block interaction and are never on the critical path
//   • prefers-reduced-motion disables it entirely (no "reduced" motion variant)
//   • a persisted setting gates it: "full" | "milestones" | "off" (default full)
//   • NEVER call burst() on a failure — callers only fire on success/press
//
// Tiers:
//   1 ambient   — nav/tabs/toggles/secondary: a few quick flecks (<400ms)
//   2 action    — submit/save/contribute/join: a fuller, longer burst
//   3 milestone — goal complete / debt cleared / streak: full confetti moment

const STORE_KEY = "sarmaya.glitter";
const POOL_MAX = 260; // hard cap on concurrent particles

const TIER = {
  1: { count: 10, speed: [60, 190], life: [300, 460], size: [2, 4.2], gravity: 230, spread: Math.PI * 2, up: 20 },
  2: { count: 28, speed: [140, 440], life: [620, 980], size: [3, 6], gravity: 520, spread: Math.PI * 2, up: 80 },
  3: { count: 100, speed: [280, 760], life: [1200, 1900], size: [3.5, 8], gravity: 900, spread: Math.PI * 2, up: 280 },
};

let canvas = null;
let ctx = null;
let dpr = 1;
let colors = ["#C4B5FD", "#A78BFA", "#C084FC", "#F3E7C9"];
let mode = readMode();

// Fixed-size pool of particle objects, reused across bursts.
const pool = Array.from({ length: POOL_MAX }, () => ({ active: false }));
let live = 0;
let raf = 0;
let lastT = 0;

// Track the last pointer position so callers can fire a burst without threading
// coordinates through their logic. Capture-phase so it runs before handlers.
let lastX = typeof window !== "undefined" ? window.innerWidth / 2 : 0;
let lastY = typeof window !== "undefined" ? window.innerHeight / 2 : 0;
if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    (e) => { lastX = e.clientX; lastY = e.clientY; },
    { capture: true, passive: true },
  );
}

function readMode() {
  try { return localStorage.getItem(STORE_KEY) || "full"; } catch { return "full"; }
}
export function getGlitterMode() { return mode; }
export function setGlitterMode(next) {
  mode = next === "off" || next === "milestones" ? next : "full";
  try { localStorage.setItem(STORE_KEY, mode); } catch { /* private mode */ }
}

export function setGlitterColors(next) {
  if (Array.isArray(next) && next.length) colors = next;
}

const reduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Called once by <GlitterCanvas>.
export function registerCanvas(el) {
  canvas = el;
  ctx = el.getContext("2d");
  resize();
  window.addEventListener("resize", resize);
}
export function unregisterCanvas() {
  window.removeEventListener("resize", resize);
  if (raf) cancelAnimationFrame(raf);
  raf = 0; live = 0; canvas = null; ctx = null;
  for (const p of pool) p.active = false;
}

function resize() {
  if (!canvas) return;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
}

const rand = (a, b) => a + Math.random() * (b - a);

/**
 * Emit a glitter burst. Safe to call anywhere; it no-ops when disabled.
 * @param {1|2|3} tier
 * @param {number} [x] origin (defaults to last pointer position)
 * @param {number} [y]
 */
export function burst(tier = 1, x = lastX, y = lastY) {
  if (mode === "off") return;
  if (mode === "milestones" && tier < 3) return;
  if (reduced() || !ctx) return;

  const spec = TIER[tier] || TIER[1];
  for (let i = 0; i < spec.count; i++) {
    const p = pool.find((q) => !q.active);
    if (!p) break; // pool exhausted — drop extras rather than grow
    const ang = Math.random() * spec.spread;
    const spd = rand(spec.speed[0], spec.speed[1]);
    p.active = true;
    p.x = x; p.y = y;
    p.vx = Math.cos(ang) * spd;
    p.vy = Math.sin(ang) * spd - spec.up; // slight upward bias
    p.g = spec.gravity;
    p.life = 0;
    p.max = rand(spec.life[0], spec.life[1]);
    p.size = rand(spec.size[0], spec.size[1]);
    p.rot = Math.random() * Math.PI;
    p.vr = rand(-8, 8);
    p.color = colors[(Math.random() * colors.length) | 0];
    p.square = Math.random() < 0.5;
    live++;
  }
  if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(loop); }
}

function loop(now) {
  const dt = Math.min(48, now - lastT) / 1000; // clamp big gaps (tab switch)
  lastT = now;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(dpr, dpr);
  for (const p of pool) {
    if (!p.active) continue;
    p.life += dt * 1000;
    if (p.life >= p.max) { p.active = false; live--; continue; }
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    const a = 1 - p.life / p.max; // fade out via opacity only
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.shadowBlur = 6; // soft glow for extra sparkle
    ctx.shadowColor = p.color;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    if (p.square) ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    else { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  if (live > 0) raf = requestAnimationFrame(loop);
  else { raf = 0; ctx.clearRect(0, 0, canvas.width, canvas.height); }
}
