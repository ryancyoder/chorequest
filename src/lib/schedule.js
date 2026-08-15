/**
 * The family planner.
 *
 * An event is either:
 *   kind 'repeat' — weekly on given weekdays, optionally bounded by a start and
 *                   end date (soccer season, term time, "until the cast is off")
 *   kind 'once'   — a specific date, optionally spanning to an end date
 *                   (an appointment, a birthday, a week at camp)
 *
 * Events belong to one or more people. An empty member list means the whole
 * household — family dinner, grandma visiting, the trip to the coast.
 *
 * Two hooks tie the calendar back to chores:
 *   • away events suppress that person's chores for those days, so being at camp
 *     doesn't read as a pile of missed responsibilities.
 *   • conflicts surface when a chore is scheduled on top of something else, which
 *     is usually why it never gets done.
 */

import { dowOf, todayISO, addDays, toISO, fromISO } from './date.js'

export const CATEGORIES = [
  { key: 'school', label: 'School', emoji: '🏫' },
  { key: 'sport', label: 'Sport', emoji: '⚽' },
  { key: 'music', label: 'Music', emoji: '🎹' },
  { key: 'work', label: 'Work', emoji: '💼' },
  { key: 'appointment', label: 'Appointment', emoji: '🩺' },
  { key: 'family', label: 'Family', emoji: '🏡' },
  { key: 'trip', label: 'Trip', emoji: '✈️' },
  { key: 'other', label: 'Other', emoji: '📌' },
]

/** A chore with no duration still occupies a slot; assume half an hour. */
const CHORE_BLOCK_MINS = 30

export function eventMembers(event, allMembers) {
  const ids = normalizeMemberIds(event)
  if (!ids.length) return allMembers // whole family
  return allMembers.filter((m) => ids.includes(m.id))
}

/** Older events stored a single `memberId`; treat both shapes the same. */
export function normalizeMemberIds(event) {
  if (Array.isArray(event.memberIds)) return event.memberIds
  return event.memberId ? [event.memberId] : []
}

/** Actually attending: named on the event, or it belongs to the whole family. */
export function isParticipant(event, memberId) {
  const ids = normalizeMemberIds(event)
  return ids.length === 0 || ids.includes(memberId)
}

/**
 * Shows on this person's calendar. That includes events they're not attending
 * but are responsible for — whoever is driving the carpool needs it on their day
 * even though they aren't the one swimming.
 */
export function isForMember(event, memberId) {
  if (isParticipant(event, memberId)) return true
  return (event.duties || []).some((d) => d.memberId === memberId)
}

export function occursOn(event, iso) {
  if (event.kind === 'once' || (!event.kind && event.dateISO)) {
    const start = event.dateISO
    const end = event.endDateISO || event.dateISO
    return !!start && iso >= start && iso <= end
  }
  // repeating
  if (!event.days?.includes(dowOf(iso))) return false
  if (event.fromISO && iso < event.fromISO) return false
  if (event.untilISO && iso > event.untilISO) return false
  return true
}

export function isMultiDay(event) {
  return event.kind === 'once' && event.endDateISO && event.endDateISO !== event.dateISO
}

/** Is this person away (camp, trip, grandma's) on this date? */
export function awayOn(state, memberId, iso) {
  return (state.events || []).some(
    // Strictly participants — driving someone to camp doesn't mean you're away.
    (e) => e.away && isParticipant(e, memberId) && occursOn(e, iso),
  )
}

export function awayEventOn(state, memberId, iso) {
  return (state.events || []).find(
    // Strictly participants — driving someone to camp doesn't mean you're away.
    (e) => e.away && isParticipant(e, memberId) && occursOn(e, iso),
  ) || null
}

/* ─────────────────────────── time math ─────────────────────────── */

function toMins(hhmm) {
  if (!hhmm) return null
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function overlaps(aStart, aEnd, bStart, bEnd) {
  if (aStart == null || bStart == null) return false
  return aStart < (bEnd ?? bStart + 1) && bStart < (aEnd ?? aStart + 1)
}

/**
 * Chores that collide with something else on the calendar for this person/date.
 * Returns [{ chore, event }].
 */
export function conflictsOn(state, memberId, iso, chores) {
  const events = (state.events || []).filter(
    (e) => isForMember(e, memberId) && occursOn(e, iso) && !e.allDay && e.start,
  )
  const out = []
  for (const chore of chores) {
    if (!chore.time) continue
    const cStart = toMins(chore.time)
    const cEnd = cStart + CHORE_BLOCK_MINS
    for (const e of events) {
      if (overlaps(cStart, cEnd, toMins(e.start), toMins(e.end))) {
        out.push({ chore, event: e })
        break
      }
    }
  }
  return out
}

/**
 * Does this chore collide with anything on a typical week? Used by the chore
 * editor so a parent finds out before they save it, not three weeks later.
 */
export function choreConflictDays(state, chore) {
  if (!chore.time || !chore.memberId || !chore.days?.length) return []
  const today = todayISO()
  const hits = []
  for (const dow of chore.days) {
    // Next occurrence of this weekday.
    let iso = today
    for (let i = 0; i < 7; i++) {
      if (dowOf(iso) === dow) break
      iso = addDays(iso, 1)
    }
    const found = conflictsOn(state, chore.memberId, iso, [chore])
    if (found.length) hits.push({ dow, event: found[0].event })
  }
  return hits
}

/* ─────────────────────────── month grid ─────────────────────────── */

/** Six weeks of ISO dates covering the month containing `iso`, Sunday-first. */
export function monthGrid(iso) {
  const d = fromISO(iso)
  const first = new Date(d.getFullYear(), d.getMonth(), 1)
  const start = addDays(toISO(first), -first.getDay())
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

export function monthLabel(iso) {
  const d = fromISO(iso)
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

export function sameMonth(a, b) {
  return a.slice(0, 7) === b.slice(0, 7)
}

export function addMonths(iso, n) {
  const d = fromISO(iso)
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1)
  return toISO(target)
}

/** Sort key so all-day and timed events interleave sensibly. */
export function eventSortKey(e) {
  if (e.allDay) return '00:00'
  return e.start || '99:99'
}
