// ─────────────────────────────────────────────────────────────
// eClean — Buyer Theme v2
// ─────────────────────────────────────────────────────────────
//
// Inspired by Zomato, Uber, Rapido, Swiggy — bold, consumer-
// driven, high-contrast. Designed for quick scanning and one-
// thumb operation. Vibrant coral CTA draws the eye to the main
// action; deep ink text is easy to read in bright sunlight.
//
// Palette logic:
//   • Primary (#1E293B) — deep slate ink for headers & text
//   • CTA (#F43F5E) — vibrant rose/coral for buttons & actions
//   • Accent (#6366F1) — indigo for links & interactive elements
//   • Success green for completed, warm amber for pending
//   • Pure white cards on soft gray (#F1F5F9) backgrounds
// ─────────────────────────────────────────────────────────────

export const BUYER_THEME = {
  // ── Primary palette ──────────────────────────────────────
  primary:      '#F43F5E',         // vibrant rose — THE main CTA color
  primaryLight: '#FB7185',         // lighter rose for pressed states
  primaryDark:  '#E11D48',         // darker rose for contrast
  primaryTint:  '#FFF1F2',         // whisper-pink background tint

  // ── Secondary / accent ───────────────────────────────────
  secondary:    '#6366F1',         // indigo — links, toggles, info badges
  secondaryLight: '#EEF2FF',       // indigo tint for backgrounds
  secondaryDark:  '#4F46E5',       // deeper indigo for hover

  // ── Gradient ─────────────────────────────────────────────
  gradient: ['#1E293B', '#334155'] as const,  // slate ink gradient for headers

  // ── Surfaces ─────────────────────────────────────────────
  surface:    '#FFFFFF',
  background: '#F8FAFC',           // very light cool gray — Uber-style
  card:       '#FFFFFF',
  border:     '#E2E8F0',           // soft slate border
  shadow:     'rgba(15, 23, 42, 0.08)',

  // ── Text ─────────────────────────────────────────────────
  text: {
    primary:   '#0F172A',          // near-black slate — max readability
    secondary: '#475569',          // medium slate
    muted:     '#94A3B8',          // light slate — timestamps
    inverse:   '#FFFFFF',
  },

  // ── Accent ───────────────────────────────────────────────
  accent:     '#6366F1',           // indigo — same as secondary

  // ── Status colors ────────────────────────────────────────
  status: {
    success:  '#10B981',           // emerald — bolder than before
    warning:  '#F59E0B',           // amber
    error:    '#EF4444',           // red
    info:     '#3B82F6',           // blue
  },

  // ── Tab bar ──────────────────────────────────────────────
  tab: {
    active:     '#F43F5E',         // rose — selected tab
    inactive:   '#94A3B8',         // muted slate
    background: '#FFFFFF',
    border:     '#E2E8F0',
  },

  // ── Stat / dashboard card tints ──────────────────────────
  tint: {
    blue:   '#EFF6FF',
    gold:   '#FEF3C7',
    green:  '#ECFDF5',
    purple: '#EEF2FF',
    rose:   '#FFF1F2',
    orange: '#FFF7ED',
  },

  // ── Misc tokens ──────────────────────────────────────────
  overlay:    'rgba(15, 23, 42, 0.50)',
  skeleton:   '#E2E8F0',
  divider:    '#E2E8F0',
} as const

export type BuyerTheme = typeof BUYER_THEME
