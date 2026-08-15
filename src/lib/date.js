export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function todayISO() {
  return toISO(new Date())
}

export function toISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function dowOf(iso) {
  return fromISO(iso).getDay()
}

export function addDays(iso, n) {
  const d = fromISO(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

/** Sunday-start week containing `iso`, as 7 ISO date strings. */
export function weekOf(iso) {
  const start = addDays(iso, -dowOf(iso))
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function prettyDate(iso) {
  const d = fromISO(iso)
  return `${DAY_LONG[d.getDay()]}, ${d.toLocaleString('en-US', { month: 'long' })} ${d.getDate()}`
}

export function shortDate(iso) {
  const d = fromISO(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function relativeDay(iso) {
  const t = todayISO()
  if (iso === t) return 'Today'
  if (iso === addDays(t, 1)) return 'Tomorrow'
  if (iso === addDays(t, -1)) return 'Yesterday'
  return prettyDate(iso)
}

/** "14:30" -> "2:30 PM" */
export function pretty12(hhmm) {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

export function timeOfDayBucket(hhmm) {
  if (!hhmm) return 'anytime'
  const h = Number(hhmm.split(':')[0])
  if (h < 11) return 'morning'
  if (h < 16) return 'afternoon'
  return 'evening'
}

/** Compact due-date label: Today / Tomorrow / Sat / 8/24 */
export function dueLabel(iso) {
  const t = todayISO()
  const delta = daysBetween(t, iso)
  if (delta === 0) return 'Today'
  if (delta === 1) return 'Tomorrow'
  if (delta === -1) return 'Yesterday'
  if (delta > 1 && delta < 7) return DAY_LONG[dowOf(iso)]
  return shortDate(iso)
}

export function daysBetween(a, b) {
  return Math.round((fromISO(b) - fromISO(a)) / 86400000)
}
