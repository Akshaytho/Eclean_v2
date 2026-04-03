/** Format elapsed seconds as HH:MM:SS or MM:SS */
export function formatElapsed(secs: number): string {
  const safe = Math.max(0, Math.floor(secs || 0))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/** Format an ISO date string to a short time like "9:00 AM" */
export function formatTimeShort(iso: string): string {
  try {
    const d = new Date(iso)
    const h = d.getHours()
    const m = d.getMinutes()
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 || 12
    return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, '0')} ${ampm}`
  } catch {
    return iso // fallback to raw string if parsing fails
  }
}
