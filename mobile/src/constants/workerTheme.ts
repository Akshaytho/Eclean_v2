// ─────────────────────────────────────────────────────────────
// eClean — Worker Theme
// ─────────────────────────────────────────────────────────────
//
// Workers are field operators — the feel should be energetic,
// clear, and action-oriented. Deep emerald green conveys
// nature, growth, and trust. Workers need high contrast and
// bold CTAs because they use the app outdoors in bright sun.
//
// The green (#16A34A) is brighter than the original brand
// (#2E8B57) — better outdoor visibility. Dark variant is
// deep forest green for headers.
// ─────────────────────────────────────────────────────────────

export const WORKER_THEME = {
  // ── Primary palette ──────────────────────────────────────
  primary:      '#16A34A',   // vibrant green — active, energetic
  primaryLight: '#22C55E',   // lighter for gradients
  primaryDark:  '#15803D',   // deep forest for headers
  primaryTint:  '#DCFCE7',   // featherweight green background

  // ── Secondary / accent ───────────────────────────────────
  secondary:    '#F59E0B',   // amber — earnings, rewards, urgency
  secondaryLight: '#FEF3C7',
  secondaryDark:  '#D97706',

  // ── Gradient ─────────────────────────────────────────────
  gradient: ['#15803D', '#16A34A'] as const,

  // ── Surfaces ─────────────────────────────────────────────
  surface:    '#FFFFFF',
  background: '#F0FDF4',     // very light green wash
  card:       '#FFFFFF',
  border:     '#D1FAE5',     // soft green border
  shadow:     'rgba(22, 163, 74, 0.06)',

  // ── Text ─────────────────────────────────────────────────
  text: {
    primary:   '#111827',
    secondary: '#4B5563',
    muted:     '#9CA3AF',
    inverse:   '#FFFFFF',
  },

  // ── Accent ───────────────────────────────────────────────
  accent:     '#3B82F6',     // blue for GPS/tracking

  // ── Status ───────────────────────────────────────────────
  status: {
    success:  '#16A34A',
    warning:  '#F59E0B',
    error:    '#DC2626',
    info:     '#3B82F6',
  },

  // ── Tab bar ──────────────────────────────────────────────
  tab: {
    active:     '#15803D',
    inactive:   '#9CA3AF',
    background: '#FFFFFF',
    border:     '#D1FAE5',
  },

  // ── Stat tints ───────────────────────────────────────────
  tint: {
    green:  '#DCFCE7',
    amber:  '#FEF3C7',
    blue:   '#DBEAFE',
    purple: '#F3E8FF',
  },

  // ── Misc ─────────────────────────────────────────────────
  overlay:    'rgba(21, 128, 61, 0.40)',
  skeleton:   '#E5E7EB',
  divider:    '#E5E7EB',

  // ── Earnings specific ────────────────────────────────────
  earnings: {
    available:  '#16A34A',
    pending:    '#F59E0B',
    processing: '#3B82F6',
  },
} as const

export type WorkerTheme = typeof WORKER_THEME
