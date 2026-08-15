/**
 * ⭐ Gold Stars — the mirror of landmines.
 *
 * A landmine records that someone was careless. Nothing in the app recorded
 * that someone was *good*, only that they were productive. This does.
 *
 * The rule that makes the whole thing work: you can never award yourself one.
 * Landmines flow downward as accusation; stars only flow sideways as
 * generosity. Everything else here exists to stop it becoming a currency —
 * a daily cap, no awarding the same person twice running, and a parent
 * confirming what the kids nominate.
 *
 * Parents can award directly; theirs land confirmed, since the confirmation
 * step exists to keep siblings honest, not to check the person holding it.
 */

import { todayISO } from './date.js'

export const CATEGORIES = [
  {
    key: 'kindness', emoji: '💛', label: 'Kindness', points: 15,
    blurb: 'Did something good for someone, unprompted.',
    prompts: [
      'Helped without being asked',
      'Shared something they didn’t have to',
      'Cheered someone up',
      'Did somebody else’s job for them',
      'Noticed someone was left out',
    ],
  },
  {
    key: 'chivalry', emoji: '🛡️', label: 'Chivalry', points: 20,
    blurb: 'Went out of their way. Took the harder half.',
    prompts: [
      'Carried the heavy thing',
      'Let someone else go first',
      'Stood up for someone',
      'Gave up the good seat',
      'Waited so nobody was walking alone',
    ],
  },
  {
    key: 'respect', emoji: '🙏', label: 'Respect', points: 20,
    blurb: 'The hardest one. Handled themselves well.',
    prompts: [
      'Admitted they were wrong',
      'Took a no without arguing',
      'Spoke kindly while annoyed',
      'Listened all the way through',
      'Apologised without being told to',
    ],
  },
]

export const categoryOf = (key) => CATEGORIES.find((c) => c.key === key) || CATEGORIES[0]

/** Kids get three a day, parents six. Scarcity is what keeps one meaningful. */
export const DAILY_CAP = { child: 3, parent: 6 }

/** Noticing generosity is itself worth something — that's how you build a
 *  household that goes looking for it. Small, so it can't be farmed. */
export const SPOTTER_XP = 3

export function starsGivenToday(state, memberId, today = todayISO()) {
  return (state.stars || []).filter((s) => s.fromId === memberId && s.dateISO === today).length
}

export function lastRecipient(state, memberId) {
  const mine = (state.stars || [])
    .filter((s) => s.fromId === memberId)
    .sort((a, b) => b.createdAt - a.createdAt)
  return mine[0]?.toId || null
}

/**
 * Can this person give this person a star right now?
 * @returns {{ok:boolean, why?:string}}
 */
export function canAward(state, from, toId) {
  if (!from || !toId) return { ok: false, why: 'Pick who you noticed.' }
  if (from.id === toId) {
    return { ok: false, why: 'Stars are for other people. That’s rather the point.' }
  }

  const cap = DAILY_CAP[from.role] ?? DAILY_CAP.child
  if (starsGivenToday(state, from.id) >= cap) {
    return { ok: false, why: `That’s ${cap} stars today. Save some for tomorrow.` }
  }

  // Siblings could otherwise just pump each other back and forth.
  if (from.role !== 'parent' && lastRecipient(state, from.id) === toId) {
    return { ok: false, why: 'Your last star went to them too — spread it around.' }
  }

  return { ok: true }
}

export function pendingStars(state) {
  return (state.stars || [])
    .filter((s) => s.status === 'pending')
    .sort((a, b) => a.createdAt - b.createdAt)
}

export function confirmedStars(state) {
  return (state.stars || [])
    .filter((s) => s.status === 'confirmed')
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function starsFor(state, memberId) {
  return confirmedStars(state).filter((s) => s.toId === memberId)
}

export function starsGiven(state, memberId) {
  return confirmedStars(state).filter((s) => s.fromId === memberId)
}

/** Who's been noticed, and who's been doing the noticing. */
export function kindnessBoard(state) {
  return state.members
    .map((m) => ({
      member: m,
      received: starsFor(state, m.id).length,
      given: starsGiven(state, m.id).length,
    }))
    .sort((a, b) => b.received - a.received)
}
