// eClean Design System — Color tokens
// Inspired by impact-street-heroes: warm cream backgrounds + teal-green primary
// HSL(152, 55%, 36%) → #2E8B57 (forest/emerald green — the brand color)
// HSL(40, 33%, 98%)  → #FAF8F4 (warm cream background)

export const COLORS = {
  brand: {
    primary:   '#2E8B57', // emerald teal-green — HSL(152,55%,36%)
    dark:      '#1A5C3A', // darker shade for gradients
    light:     '#4CAF80', // lighter shade for hover/tint
    tint:      '#E8F5EE', // very light tint for backgrounds
  },

  status: {
    success:   '#2E8B57', // same as brand primary
    warning:   '#F59E0B', // golden orange — HSL(38,92%,50%)
    error:     '#DC2626', // vibrant red — HSL(0,72%,51%)
    info:      '#3B82F6', // medium blue
  },

  dirty: {
    light:     '#2E8B57', // green
    medium:    '#F59E0B', // orange
    heavy:     '#EF4444', // red
    critical:  '#991B1B', // dark red
  },

  map: {
    worker:    '#3B82F6', // blue pulsing dot
    task:      '#2E8B57', // green task pin
    trail:     '#2E8B57', // GPS breadcrumb line
    zone:      '#F59E0B', // zone overlay
  },

  neutral: {
    50:    '#FAF8F4', // warm cream — the background
    100:   '#F2EDE6', // secondary background / cards
    200:   '#E5E0D8', // borders / dividers — HSL(40,15%,89%)
    300:   '#CCC5BA',
    400:   '#9E968A',
    500:   '#6B7280', // muted text — HSL(220,10%,46%)
    600:   '#4B5563',
    700:   '#374151',
    800:   '#1F2937',
    900:   '#1C2333', // primary text — HSL(220,20%,14%)
  },

  // Semantic surface colors
  surface:    '#FFFFFF',
  background: '#FAF8F4',
  border:     '#E5E0D8',
  shadow:     'rgba(28, 35, 51, 0.06)',
} as const

// Legacy alias for backward compatibility with old code
export const Colors = COLORS
