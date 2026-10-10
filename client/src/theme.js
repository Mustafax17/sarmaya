// Sarmaya design system — PAKISTANI RUPEE (deep note-green + currency gold).
// A near-black canvas drawn from the flag/currency green, lit by a soft green-gold
// haze from the top corners. Features read as RAISED on a four-step elevation ramp
// that gets LIGHTER as it lifts (bg → surface → surface2 → surface3). The accent is
// CURRENCY GOLD — the note's foil — deliberately non-green so "interactive" never
// collides with income-green. Income is a bright emerald, expense a bright red.
// Light mode is a warm off-white with a faint green cast (gold darkens to bronze so
// it stays legible on white), not an inversion. EVERY colour routes through these
// tokens; contrast is VERIFIED (script), not eyeballed. Token NAMES are unchanged so
// nothing downstream breaks (the legacy `blue*` keys now carry gold values).

// Accent is currency gold. On dark it's bright with dark text; on light it darkens.
const GOLD = { main: "#CBA135", bright: "#DBB84A", deep: "#8A6A15", soft: "#E4C766" };

// Static accent for logos/chips. Dark text sits on the gold fill (AA).
export const ACCENT = { main: GOLD.main, soft: GOLD.soft, on: "#14210E" };

// Back-compat for components importing BRAND — distinct non-accent utility hues.
export const BRAND = {
  teal: "#3FAECB",
  green: "#34D6A0",
  mauve: "#9E8FD0",
  rose: "#E07A7A",
  amber: "#E07C3C", // legacy key
  purple: "#9E8FD0", // legacy key
};

// Category palette — a qualitative set kept clear of the GREEN base + income-green,
// the GOLD accent, and expense-red. Fuel (was amber) is now burnt orange and
// Education (was gold) is now indigo, so no category muddies into the gold accent.
// Paired with icons + labels everywhere; legible on note-green dark and warm-white.
export const CATEGORY_COLORS = {
  Food: "#E58B6B", // terracotta
  Transport: "#3FAECB", // cyan
  Fuel: "#E07C3C", // burnt orange (shifted off gold)
  Utilities: "#7E93B0", // slate blue-grey
  Shopping: "#D28CB2", // pink
  Entertainment: "#9E8FD0", // violet
  Health: "#E07A7A", // rose
  Education: "#7B84CE", // indigo (shifted off gold)
  Bills: "#99A6AD", // cool grey
};
export const catColor = (name) => CATEGORY_COLORS[name] || "#99A6AD";

// Multi-series chart palette — gold accent leads, then income-emerald, then hues.
// Distinct, none leaning on the green background or the gold accent.
export const CHART_SERIES = ["#CBA135", "#34D6A0", "#3FAECB", "#9E8FD0", "#E07A7A", "#7E93B0"];

// Glitter particle colours per mode — accent-blue flecks (the interactive shimmer).
export const glitterColors = (t) => t.glitter;
export const confettiColors = glitterColors; // back-compat alias

export const themes = {
  dark: {
    name: "dark",
    // Elevation ramp — each step LIGHTER as it lifts off the canvas (note-green).
    bg: "#07160D", // L0 canvas — deep flag/currency green-black
    sunken: "#040F08", // below the canvas (wells, progress tracks)
    surface: "#0E1E14", // L1 cards
    surface2: "#16291C", // L2 elevated (popovers / modals / nested)
    surface3: "#1F3527", // L3 highest (dropdowns / tooltips / hover lift)
    glass: "rgba(14,30,20,0.62)",
    border: "rgba(150,210,170,0.13)", // faint green edge — reads as raised
    borderStrong: "rgba(150,210,170,0.26)",

    text: "#EAF2EC", // warm near-white, faint green
    sub: "#A2B6A8",
    faint: "#6E8578",

    sidebar: "linear-gradient(180deg,#0B1A12 0%,#050F09 100%)",
    sideText: "rgba(234,242,236,0.92)",
    sideSub: "rgba(234,242,236,0.52)",
    sideHover: "rgba(203,161,53,0.14)", // gold-tinted (interactive)

    grid: "rgba(255,255,255,0.06)",
    shadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 2px 6px rgba(0,0,0,0.50), 0 18px 44px rgba(0,0,0,0.62)",
    shadowLg: "0 1px 0 rgba(255,255,255,0.05) inset, 0 4px 10px rgba(0,0,0,0.55), 0 34px 70px rgba(0,0,0,0.72)",
    shadowColor: "rgba(0,0,0,0.55)", // single shadow colour for SVG/CSS drop-shadows
    scrim: "rgba(3,10,6,0.58)", // green-black overlay behind modals / drawers
    chip: "rgba(150,205,170,0.08)", // green-tinted subtle raise

    accent: GOLD.main, // #CBA135 currency gold — dark text is AA; distinct from green
    accentSoft: GOLD.soft, // lighter gold for text/icons on dark
    accent2: GOLD.bright,
    accentOn: "#14210E", // dark green text on the gold fill
    btnText: "#14210E",
    gold: GOLD.soft, // (name kept) — accent highlight
    blue: GOLD.bright, // legacy key — now gold
    blueSoft: GOLD.soft,
    blueDeep: GOLD.deep,
    slate: "#8AA096", // neutral green-grey — comparison/context, distinct from accent
    slate2: "#6B8175",
    pos: "#34D6A0", // bright emerald income — pops against note-green
    neg: "#FF6B6B", // bright red expense
    warn: "#EF8E3C", // orange — distinct from the gold accent

    gradPrimary: "linear-gradient(135deg,#CBA135 0%,#B8901F 100%)",
    gradPrimaryHover: "linear-gradient(135deg,#DBB84A 0%,#CBA135 100%)",
    gradHero: "radial-gradient(62% 48% at 50% -8%, rgba(203,161,53,0.14), transparent 60%)",
    glow: "0 0 0 4px rgba(203,161,53,0.32)",
    ring: "rgba(203,161,53,0.55)",
    goldGlow: "0 0 16px rgba(203,161,53,0.45), 0 0 4px rgba(228,199,102,0.65)",

    // Ambient haze bleeding from the top corners — green-gold, low-opacity, behind
    // everything. Static (reduced-motion safe); never over text surfaces.
    blobA: "rgba(158,168,80,0.15)", // green-gold, top-left
    blobB: "rgba(64,150,100,0.12)", // green, top-right
    blobC: "rgba(40,100,64,0.10)", // faint green wash
    grain: 0.045,

    glitter: ["#E4C766", "#CBA135", "#F5E6B0", "#DBB84A", "#B8901F"], // gold flecks
  },
  light: {
    name: "light",
    // Warm off-white with a faint green cast — NOT an inversion. Lifts by whitening.
    bg: "#F1F5EF", // L0 canvas
    sunken: "#E7EDE4",
    surface: "#F8FBF6", // L1 cards
    surface2: "#FCFEFB", // L2 elevated
    surface3: "#FFFFFF", // L3 highest
    glass: "rgba(255,255,255,0.72)",
    border: "rgba(30,66,44,0.12)",
    borderStrong: "rgba(30,66,44,0.20)",

    text: "#12211A", // near-black, green cast
    sub: "#47584E",
    faint: "#7C8B81",

    sidebar: "linear-gradient(180deg,#0B1A12 0%,#050F09 100%)", // sidebar stays dark note-green in both modes
    sideText: "rgba(234,242,236,0.92)",
    sideSub: "rgba(234,242,236,0.55)",
    sideHover: "rgba(138,106,21,0.16)", // bronze-gold tint

    grid: "rgba(20,40,28,0.08)",
    shadow: "0 1px 2px rgba(20,45,30,0.06), 0 12px 30px rgba(20,45,30,0.10)",
    shadowLg: "0 2px 6px rgba(20,45,30,0.08), 0 28px 60px rgba(20,45,30,0.14)",
    shadowColor: "rgba(20,45,30,0.20)", // single shadow colour for SVG/CSS drop-shadows
    scrim: "rgba(12,22,15,0.42)", // green-tinted overlay behind modals / drawers
    chip: "rgba(20,50,32,0.05)",

    // Gold darkens to bronze on white so accented icons/links stay legible (AA).
    accent: "#8A6A15", // bronze-gold — AA as text/icon on warm-white, and as a fill
    accentSoft: "#6E5410",
    accent2: "#6E5410",
    accentOn: "#FFFFFF", // white text on the bronze-gold fill
    btnText: "#FFFFFF",
    gold: "#6E5410",
    blue: "#8A6A15", // legacy key — now bronze-gold
    blueSoft: "#6E5410",
    blueDeep: "#6E5410",
    slate: "#566159", // green-grey
    slate2: "#3C463C",
    pos: "#0A7C54", // darker emerald — AA on the warm-white base
    neg: "#D32F2F", // darker red — AA on the warm-white base
    warn: "#B0700F",

    gradPrimary: "linear-gradient(135deg,#9A7719 0%,#8A6A15 100%)",
    gradPrimaryHover: "linear-gradient(135deg,#A9841D 0%,#9A7719 100%)",
    gradHero: "radial-gradient(62% 48% at 50% -8%, rgba(138,106,21,0.10), transparent 60%)",
    glow: "0 0 0 4px rgba(138,106,21,0.22)",
    ring: "rgba(138,106,21,0.45)",
    goldGlow: "0 0 14px rgba(138,106,21,0.28), 0 0 3px rgba(110,84,16,0.5)",

    // Faint green-gold haze from the top corners — very low opacity on light,
    // never enough to drop text contrast on the surfaces above it.
    blobA: "rgba(160,160,84,0.10)", // green-gold, top-left
    blobB: "rgba(80,150,110,0.08)", // green, top-right
    blobC: "rgba(60,120,90,0.06)", // faint green wash
    grain: 0.02,

    glitter: ["#8A6A15", "#B8901F", "#CBA135", "#0A7C54", "#6E5410"], // bronze-gold flecks
  },
};
