import { DEFAULT_RATES } from '../lib/landmines.js'

const KEY = 'chorequest.state.v1'

/**
 * Fill in anything a state saved by an older build won't have. Families already
 * have data on their devices, so a new feature must never land as a white screen.
 */
function migrate(state) {
  const s = { ...state }

  s.landmines = Array.isArray(s.landmines) ? s.landmines : []
  s.tracks = Array.isArray(s.tracks) ? s.tracks : []
  s.prs = Array.isArray(s.prs) ? s.prs : []
  s.familyRecord = s.familyRecord || { best: 0, bestAt: null }
  s.submissions = Array.isArray(s.submissions) ? s.submissions : []
  s.activity = Array.isArray(s.activity) ? s.activity : []
  s.familyGoals = Array.isArray(s.familyGoals) ? s.familyGoals : []
  s.prizes = Array.isArray(s.prizes) ? s.prizes : []
  s.jobs = Array.isArray(s.jobs) ? s.jobs : []
  s.events = Array.isArray(s.events) ? s.events : []
  s.chores = Array.isArray(s.chores) ? s.chores : []

  s.settings = {
    currentMemberId: s.members?.[0]?.id,
    parentUnlocked: false,
    requirePin: true,
    soundOn: true,
    layoutMode: 'auto',
    ...(s.settings || {}),
  }
  s.settings.landmineRates = { ...DEFAULT_RATES, ...(s.settings.landmineRates || {}) }

  s.members = (s.members || []).map((m) => ({
    badges: [], totalApproved: 0, jobsDone: 0, perfectScores: 0,
    escrowXp: 0, escrowCoins: 0,
    ...m,
  }))

  // Landmines written by an in-between build might miss the bookkeeping fields.
  s.landmines = s.landmines.map((m) => ({
    pot: 0, appliedDrain: 0, appliedFine: 0,
    streakBurned: false, disputed: false, stageAtDispute: null, confessed: false,
    ...m,
  }))

  s.tracks = s.tracks.map((t) => ({ log: {}, paid: {}, best: 0, bestAt: null, archived: false, ...t }))
  s.prs = s.prs.map((p) => ({ cheers: [], ...p }))

  return s
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.members)) return null
    return migrate(parsed)
  } catch {
    return null
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
    return true
  } catch (err) {
    // Quota blown (usually an inline seed image) — the app keeps working from
    // memory for this session rather than dying on a write.
    console.warn('ChoreQuest: could not save state —', err?.name || err)
    return false
  }
}

export function clearState() {
  try {
    localStorage.removeItem(KEY)
  } catch { /* ignore */ }
}
