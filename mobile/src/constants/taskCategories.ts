export const TASK_CATEGORIES = {
  STREET_CLEANING:    { label: 'Street',    icon: 'road',         color: '#3E92CC' },
  PARK_MAINTENANCE:   { label: 'Park',      icon: 'trees',        color: '#2ECC71' },
  DRAIN_CLEANING:     { label: 'Drain',     icon: 'droplets',     color: '#3498DB' },
  GARBAGE_COLLECTION: { label: 'Garbage',   icon: 'trash-2',      color: '#E67E22' },
  GRAFFITI_REMOVAL:   { label: 'Graffiti',  icon: 'spray-can',    color: '#9B59B6' },
  OTHER:              { label: 'Other',     icon: 'more-horizontal', color: '#95A5A6' },
} as const

export const DIRTY_LEVELS = {
  LIGHT:    { label: 'Light',    color: '#2ECC71', priceCents: 3000 },
  MEDIUM:   { label: 'Medium',   color: '#F39C12', priceCents: 6000 },
  HEAVY:    { label: 'Heavy',    color: '#E67E22', priceCents: 12000 },
  CRITICAL: { label: 'Critical', color: '#E74C3C', priceCents: 18000 },
} as const

export const URGENCY_LEVELS = {
  LOW:    { label: 'Low',    color: '#2ECC71' },
  MEDIUM: { label: 'Medium', color: '#F39C12' },
  HIGH:   { label: 'High',   color: '#E67E22' },
  URGENT: { label: 'Urgent', color: '#E74C3C' },
} as const
