// ─────────────────────────────────────────────────────────────
// eClean — Buyer Theme
// ─────────────────────────────────────────────────────────────
//
// A self-contained theme object for the BUYER role.
// Workers keep the existing green COLORS from colors.ts — this
// file is a parallel palette that buyer screens can import
// instead. To reskin the buyer experience, change values here;
// no other file needs editing.
//
// Design rationale
// ----------------
// Buyers are *paying clients* — the feel should be corporate,
// trustworthy, and premium. Deep navy conveys authority and
// reliability (banks, insurance, enterprise SaaS). The gold
// accent adds a touch of premium without being flashy.
// Cool-toned grays replace the warm creams of the worker theme
// so the two roles feel visually distinct at a glance.
//
// The navy primary (#0A2463) is already used as the Android
// adaptive-icon background and notification accent in app.json,
// so it is the natural "brand navy" for this app.
// ─────────────────────────────────────────────────────────────

export const BUYER_THEME = {
  // ── Primary palette ──────────────────────────────────────
  // Deep navy — authoritative, trustworthy (matches adaptive icon)
  primary:      '#0A2463',
  // Slightly lighter navy for hover / pressed states
  primaryLight: '#143A8C',
  // Very dark navy for contrast-heavy text-on-dark situations
  primaryDark:  '#061740',
  // Featherweight tint of the primary — use for icon backgrounds,
  // badges, or subtle highlights on white surfaces
  primaryTint:  '#E8EDF7',

  // ── Secondary / accent ───────────────────────────────────
  // Warm gold — the premium accent. Use sparingly: CTA shimmer,
  // price tags, "featured" badges. Contrast-safe on dark navy.
  secondary:    '#D4A843',
  // Lighter gold for backgrounds (e.g. a "pending review" banner)
  secondaryLight: '#F5E6B8',
  // Darker gold for text-on-light where the secondary feels too washed
  secondaryDark:  '#A17E2E',

  // ── Gradient ─────────────────────────────────────────────
  // Two-stop gradient for header banners and hero sections.
  // Goes from primary navy to a mid-navy — gives depth without
  // introducing a new hue. Use with LinearGradient.
  gradient: ['#0A2463', '#143A8C'] as const,

  // ── Surfaces ─────────────────────────────────────────────
  // Cool-toned rather than the warm cream (#FAF8F4) of COLORS.
  // This makes buyer screens feel crisper and more "business app".
  surface:    '#FFFFFF',                   // cards, sheets, modals
  background: '#F4F6FA',                   // screen background — cool blue-gray
  card:       '#FFFFFF',                   // explicit alias for card bg
  border:     '#DFE3EC',                   // subtle cool-gray dividers
  shadow:     'rgba(10, 36, 99, 0.06)',    // navy-tinted shadow for depth

  // ── Text ─────────────────────────────────────────────────
  text: {
    primary:   '#111827',   // near-black — high contrast on white
    secondary: '#4B5563',   // medium-gray — subtitles, metadata
    muted:     '#9CA3AF',   // light-gray — timestamps, placeholders
    inverse:   '#FFFFFF',   // text on dark / gradient backgrounds
  },

  // ── Accent ───────────────────────────────────────────────
  // A vibrant mid-blue for interactive highlights — links,
  // focus rings, toggle-on states. Distinct from the deep navy
  // primary so it reads as "interactive" not "header".
  accent:     '#3B82F6',

  // ── Status colors ────────────────────────────────────────
  // Re-declared here so buyer screens can pull everything from
  // one import. Values match the global COLORS.status palette
  // for consistency.
  status: {
    success:  '#16A34A',   // slightly brighter green than worker brand
    warning:  '#F59E0B',   // golden orange — review-needed banners
    error:    '#DC2626',   // vibrant red — destructive actions
    info:     '#3B82F6',   // same as accent — informational toasts
  },

  // ── Tab bar ──────────────────────────────────────────────
  // Purpose-built tokens for the bottom-tab navigator so the
  // buyer tab bar is navy-accented rather than green.
  tab: {
    active:     '#0A2463',    // selected icon + label — navy
    inactive:   '#9CA3AF',    // unselected icon + label — muted gray
    background: '#FFFFFF',    // tab bar surface
    border:     '#DFE3EC',    // thin top-border of the tab bar
  },

  // ── Stat / dashboard card tints ──────────────────────────
  // Pre-mixed light backgrounds for dashboard stat cards.
  // Each is a barely-there wash of the corresponding accent.
  tint: {
    blue:   '#E8EDF7',   // "Posted" stat — maps to primary
    gold:   '#FEF9C3',   // "Active" stat — maps to secondary
    green:  '#DCFCE7',   // "Completed" stat
    purple: '#F3E8FF',   // "Spent" stat
  },

  // ── Misc tokens ──────────────────────────────────────────
  // Quick-reference values that avoid magic strings in styles.
  overlay:    'rgba(10, 36, 99, 0.40)',    // modal / bottom-sheet scrim
  skeleton:   '#E5E7EB',                   // shimmer placeholder color
  divider:    '#E5E7EB',                   // horizontal rule in lists
} as const

// ── Type export ────────────────────────────────────────────
// Useful if you want to accept the theme as a prop or build
// a ThemeContext later. `typeof BUYER_THEME` captures every
// nested literal type automatically.
export type BuyerTheme = typeof BUYER_THEME
