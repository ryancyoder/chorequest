/**
 * 🏅 Personal Records — self-chosen habits, tracked as streaks.
 *
 * Two framings over one primitive:
 *   virtue — something you want to START. A day counts when you did it.
 *   vice   — something you want to STOP.  A day counts when you stayed clean.
 *
 * Everything on this board is opt-in: a vice only exists here because the person
 * chose to tell the family about it. Nothing is tracked on anyone's behalf.
 *
 * Design rules that the rest of the code follows:
 *   • A PR is beating YOURSELF, not out-scoring a sibling.
 *   • Records are permanent. A broken streak never erases what you once did.
 *   • Slips are visible but never announced — the feed celebrates PRs and
 *     comebacks only. Falling down is not a notification.
 *   • These earn XP but never coins. Coins buy prizes, so coins would create a
 *     reason to lie about a streak. Rank and recognition can't be spent, which
 *     makes inflating them pointless.
 */

import { todayISO, addDays } from './date.js'

export const MILESTONES = [3, 7, 14, 30, 60, 100, 365]

export const XP_PER_DAY = 3        // showing up
export const XP_COMEBACK = 5       // restarting right after a slip
export const XP_PER_CHEER = 1      // for the cheerer, not the cheered
export const CHEERS_PER_DAY = 5    // so cheering stays meaningful

/**
 * Consecutive days, walking back from today (or yesterday if today isn't logged
 * yet — the day isn't over, so an unlogged today hasn't broken anything).
 *
 * A gap ends a streak just like a slip does. That's what the one-day backfill is
 * for: forgetting to check in shouldn't cost you, but you can't retroactively
 * invent a week.
 */
export function streakOf(track, today = todayISO()) {
  const log = track.log || {}
  const anchor = log[today] ? today : addDays(today, -1)
  if (log[anchor] !== 'hit') return 0

  let count = 0
  let cursor = anchor
  while (log[cursor] === 'hit') {
    count += 1
    cursor = addDays(cursor, -1)
  }
  return count
}

/** Did they slip yesterday and show up today? That's a comeback. */
export function isComeback(track, today = todayISO()) {
  const log = track.log || {}
  return log[today] === 'hit' && log[addDays(today, -1)] === 'slip'
}

export function nextMilestone(current) {
  return MILESTONES.find((m) => m > current) ?? null
}

export function lastMilestoneHit(current) {
  let hit = null
  for (const m of MILESTONES) if (current >= m) hit = m
  return hit
}

/** Only today and yesterday can be logged — see the backfill rule above. */
export function loggableDays(today = todayISO()) {
  return [today, addDays(today, -1)]
}

export function canLog(dateISO, today = todayISO()) {
  return loggableDays(today).includes(dateISO)
}

export const VIRTUE_IDEAS = [
  { emoji: '📖', title: 'Read for 20 minutes' },
  { emoji: '🛏️', title: 'Bed made before school' },
  { emoji: '💧', title: 'Drink a full water bottle' },
  { emoji: '🎸', title: 'Practice my instrument' },
  { emoji: '🏃', title: 'Get outside and move' },
  { emoji: '💬', title: 'Say something kind to a sibling' },
  { emoji: '🙏', title: 'Write down one thing I\'m thankful for' },
  { emoji: '🧦', title: 'Clothes in the hamper, not the floor' },
]

export const VICE_IDEAS = [
  { emoji: '📱', title: 'No screens after 9pm' },
  { emoji: '😤', title: 'No snapping when I\'m frustrated' },
  { emoji: '🗣️', title: 'Stop interrupting people' },
  { emoji: '🍬', title: 'No sweets after dinner' },
  { emoji: '😾', title: 'No name-calling' },
  { emoji: '⏰', title: 'Stop hitting snooze' },
  { emoji: '🤥', title: 'No little white lies' },
  { emoji: '🧟', title: 'Out of bed on the first ask' },
]

export function kindCopy(kind) {
  return kind === 'vice'
    ? {
        label: 'Vice', verb: 'Stayed clean', short: 'clean',
        streakWord: 'days clean', prefix: 'Quitting',
        emptyHint: 'Something you want to stop doing.',
      }
    : {
        label: 'Virtue', verb: 'Did it', short: 'done',
        streakWord: 'day streak', prefix: 'Building',
        emptyHint: 'Something you want to start doing.',
      }
}

/** Everyone's live streaks added up — the number the whole house owns. */
export function familyStreakTotal(state, today = todayISO()) {
  return (state.tracks || [])
    .filter((t) => !t.archived)
    .reduce((sum, t) => sum + streakOf(t, today), 0)
}

export function tracksFor(state, memberId) {
  return (state.tracks || []).filter((t) => t.memberId === memberId && !t.archived)
}

export function trackById(state, id) {
  return (state.tracks || []).find((t) => t.id === id) || null
}

/** Tracks still needing an answer today — drives the check-in nudge. */
export function pendingToday(state, memberId, today = todayISO()) {
  return tracksFor(state, memberId).filter((t) => !(t.log || {})[today])
}

export function cheersGivenToday(state, memberId, today = todayISO()) {
  return (state.prs || []).reduce(
    (n, pr) => n + (pr.cheers || []).filter((c) => c.memberId === memberId && c.dateISO === today).length,
    0,
  )
}

export function hasCheered(pr, memberId) {
  return (pr.cheers || []).some((c) => c.memberId === memberId)
}

/** Trophy case: personal bests, longest-standing first. */
export function trophyCase(state, memberId) {
  return (state.tracks || [])
    .filter((t) => t.memberId === memberId && t.best > 0)
    .sort((a, b) => b.best - a.best)
}
