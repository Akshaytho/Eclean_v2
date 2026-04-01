export function timeAgo(isoDate: string | null | undefined): string {
  if (!isoDate) return ''
  const time = new Date(isoDate).getTime()
  if (isNaN(time)) return ''
  const diff = Date.now() - time
  if (diff < 0) return 'just now' // future date — treat as now
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)  return `${days}d ago`
  return new Date(isoDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// Elapsed time in seconds from a startedAt ISO string
export function elapsedSeconds(startedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
}

// Format seconds as HH:MM:SS
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return h > 0
    ? `${pad(h)}:${pad(m)}:${pad(s)}`
    : `${pad(m)}:${pad(s)}`
}
