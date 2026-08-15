import { dowOf, todayISO } from '../lib/date.js'
import { levelFromXp, rankFor } from '../lib/gamify.js'

export const byId = (list, id) => list.find((x) => x.id === id) || null

export const children = (state) => state.members.filter((m) => m.role === 'child')
export const parents = (state) => state.members.filter((m) => m.role === 'parent')

/** Routine chores scheduled for a member on a date. */
export function choresOn(state, memberId, dateISO) {
  const dow = dowOf(dateISO)
  return state.chores
    .filter((c) => c.memberId === memberId && c.days.includes(dow))
    .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'))
}

export function eventsOn(state, memberId, dateISO) {
  const dow = dowOf(dateISO)
  return state.events
    .filter((e) => e.memberId === memberId && (e.dateISO ? e.dateISO === dateISO : e.days?.includes(dow)))
    .sort((a, b) => (a.start || '99:99').localeCompare(b.start || '99:99'))
}

/** The live submission for a chore on a given day, if any. */
export function choreSubmission(state, choreId, dateISO) {
  return state.submissions.find((s) => s.kind === 'chore' && s.targetId === choreId && s.dateISO === dateISO) || null
}

export function jobSubmission(state, jobId) {
  return state.submissions
    .filter((s) => s.kind === 'job' && s.targetId === jobId)
    .sort((a, b) => b.createdAt - a.createdAt)[0] || null
}

export const STATUS_META = {
  ai_checking: { label: 'AI checking…', tone: 'info', emoji: '🤖' },
  ai_rejected: { label: 'Needs another pass', tone: 'warn', emoji: '🔁' },
  pending: { label: 'Waiting on a parent', tone: 'info', emoji: '⏳' },
  approved: { label: 'Approved', tone: 'good', emoji: '✅' },
  rejected: { label: 'Sent back', tone: 'bad', emoji: '↩️' },
}

/** Everything a parent needs to look at right now. */
export function pendingApprovals(state) {
  return state.submissions
    .filter((s) => s.status === 'pending')
    .sort((a, b) => a.createdAt - b.createdAt)
}

export function submissionTitle(state, sub) {
  if (sub.kind === 'chore') return byId(state.chores, sub.targetId)?.title || 'Chore'
  if (sub.kind === 'landmine') return byId(state.landmines, sub.targetId)?.title || 'Landmine'
  return byId(state.jobs, sub.targetId)?.title || 'Job'
}

export function submissionEmoji(state, sub) {
  if (sub.kind === 'chore') return byId(state.chores, sub.targetId)?.emoji || '🧹'
  if (sub.kind === 'landmine') return '💣'
  return '🎯'
}

/* ─────────────────────────── landmines ─────────────────────────── */

/** Mines still causing trouble — armed, or waiting on a defuse review. */
export function liveLandmines(state) {
  return (state.landmines || [])
    .filter((m) => m.status === 'armed' || m.status === 'defusing')
    .sort((a, b) => a.armedAt - b.armedAt)
}

export function armedLandmines(state) {
  return (state.landmines || []).filter((m) => m.status === 'armed')
}

/** The mine currently freezing this member's earnings, if any. */
export function freezingMine(state, memberId) {
  return (state.landmines || []).find(
    (m) => m.status === 'armed' && m.ownerId === memberId && !m.disputed,
  ) || null
}

export function isFrozen(state, memberId) {
  return !!freezingMine(state, memberId)
}

export function unclaimedLandmines(state) {
  return armedLandmines(state).filter((m) => !m.ownerId)
}

export function disputedLandmines(state) {
  return armedLandmines(state).filter((m) => m.disputed)
}

export function totalPot(state) {
  return liveLandmines(state).reduce((n, m) => n + (m.pot || 0), 0)
}

export function landmineSubmission(state, mineId) {
  return state.submissions
    .filter((s) => s.kind === 'landmine' && s.targetId === mineId)
    .sort((a, b) => b.createdAt - a.createdAt)[0] || null
}

/** Per-member day summary used all over the UI. */
export function dayStats(state, memberId, dateISO = todayISO()) {
  const chores = choresOn(state, memberId, dateISO)
  let done = 0, waiting = 0, redo = 0
  for (const c of chores) {
    const s = choreSubmission(state, c.id, dateISO)
    if (!s) continue
    if (s.status === 'approved') done++
    else if (s.status === 'pending' || s.status === 'ai_checking') waiting++
    else redo++
  }
  const total = chores.length
  return { total, done, waiting, redo, left: total - done - waiting, pct: total ? Math.round((done / total) * 100) : 0 }
}

export function memberProgress(member) {
  const lv = levelFromXp(member.xp)
  return { ...lv, rank: rankFor(lv.level) }
}

export function leaderboard(state) {
  return children(state)
    .map((m) => ({ member: m, ...memberProgress(m) }))
    .sort((a, b) => b.member.xp - a.member.xp)
}

export function openJobs(state) {
  return state.jobs.filter((j) => j.status === 'open')
}

export function jobsFor(state, memberId) {
  return state.jobs.filter((j) => j.claimedBy === memberId && j.status !== 'done')
}

export function affordablePrizes(state, member) {
  return state.prizes.filter((p) => (!p.memberId || p.memberId === member.id) && member.coins >= p.cost)
}
