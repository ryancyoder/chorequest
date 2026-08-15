/**
 * 💣 Family Sabotage — landmines.
 *
 * Someone leaves a disaster behind and walks away. Anyone can photograph it and
 * arm a landmine. From there a timer runs and the consequences escalate:
 *
 *   1. ARMED      grace period. Nothing bad has happened yet — go clean it up.
 *                 (The accused already can't cash out: earnings go to escrow.)
 *   2. TICKING    the whole family starts bleeding points from the shared goal.
 *   3. SMOKING    the offender's streak burns down and their bonuses stop.
 *   4. DETONATED  fines start stacking out of the offender's points into a pot.
 *
 * Anyone who defuses it (photo proof, parent approves) walks away with the pot.
 * Clean up your own mess and the pot becomes restitution to the family goal
 * instead — you stop the bleeding but you don't profit from it.
 *
 * Accrual is computed from `armedAt` every tick rather than incremented, so it's
 * idempotent: closing the app, reopening, or double-firing a timer can't
 * double-charge anyone.
 */

export const DEFAULT_RATES = {
  graceMins: 120,        // 2h  — clean it up, no harm done
  smokingMins: 360,      // 6h  — streak burns
  detonatedMins: 720,    // 12h — fines begin
  familyDrainPerHour: 8, // points off the family goal, once ticking
  finePerHour: 20,       // points off the offender, once detonated
  defuseReward: 40,      // points for whoever cleans it up
}

/** Nobody owns up? The family bleeds faster. Someone say something. */
const UNCLAIMED_MULTIPLIER = 1.5

/** Hard stop on accrual so a week away doesn't return a five-figure fine. */
const MAX_ACCRUAL_HOURS = 72

export const STAGES = {
  armed: {
    key: 'armed', label: 'Armed', emoji: '💣', tone: 'warn',
    short: 'Grace period',
    blurb: 'Nothing bad has happened yet. Clean it up now and we all pretend this never occurred.',
  },
  ticking: {
    key: 'ticking', label: 'Ticking', emoji: '⏱️', tone: 'warn',
    short: 'Family losing points',
    blurb: 'The family goal is bleeding points. Every minute this sits there, the beach weekend gets further away.',
  },
  smoking: {
    key: 'smoking', label: 'Smoking', emoji: '🔥', tone: 'bad',
    short: 'Streaks burning',
    blurb: 'Streak gone. Bonuses suspended. This is what we call a consequence.',
  },
  detonated: {
    key: 'detonated', label: 'Detonated', emoji: '💥', tone: 'bad',
    short: 'Fines stacking up',
    blurb: 'Points are being fined straight out of the offender and into the pot. Someone is going to get paid to clean this.',
  },
}

export const STAGE_ORDER = ['armed', 'ticking', 'smoking', 'detonated']

export function ratesOf(state) {
  return { ...DEFAULT_RATES, ...(state.settings?.landmineRates || {}) }
}

export function stageOf(mine, rates, now = Date.now()) {
  // A disputed mine is frozen in place until a parent sorts it out — it would be
  // rotten to keep fining someone who says it wasn't them.
  if (mine.disputed) return mine.stageAtDispute || 'armed'
  const mins = (now - mine.armedAt) / 60000
  if (mins < rates.graceMins) return 'armed'
  if (mins < rates.smokingMins) return 'ticking'
  if (mins < rates.detonatedMins) return 'smoking'
  return 'detonated'
}

export function stageIndex(stage) {
  return STAGE_ORDER.indexOf(stage)
}

/** ms until the next stage, or null once fully detonated. */
export function msToNextStage(mine, rates, now = Date.now()) {
  if (mine.disputed) return null
  const elapsed = now - mine.armedAt
  const marks = [rates.graceMins, rates.smokingMins, rates.detonatedMins].map((m) => m * 60000)
  for (const mark of marks) if (elapsed < mark) return mark - elapsed
  return null
}

/**
 * Total damage this mine should have done between arming and `now`.
 * Compare against what's already been applied to get the delta to charge.
 */
export function cumulativeDamage(mine, rates, now = Date.now()) {
  if (mine.disputed) {
    return { familyDrain: mine.appliedDrain || 0, fine: mine.appliedFine || 0 }
  }

  const capped = Math.min(now, mine.armedAt + MAX_ACCRUAL_HOURS * 3600000)
  const graceEnd = mine.armedAt + rates.graceMins * 60000
  const detonateEnd = mine.armedAt + rates.detonatedMins * 60000
  const mult = mine.ownerId ? 1 : UNCLAIMED_MULTIPLIER

  const drainHours = Math.max(0, capped - graceEnd) / 3600000
  const fineHours = Math.max(0, capped - detonateEnd) / 3600000

  return {
    familyDrain: drainHours * rates.familyDrainPerHour * mult,
    fine: fineHours * rates.finePerHour * mult,
  }
}

/** Human countdown: "1h 12m" */
export function formatDuration(ms) {
  if (ms == null || ms <= 0) return '—'
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

export function elapsedLabel(mine, now = Date.now()) {
  return formatDuration(now - mine.armedAt)
}

/** Rotating nag copy so the same mine doesn't read identically all day. */
const NAGS = [
  'This is not going to clean itself. It has had every opportunity.',
  'The mess remains undefeated.',
  'Somebody walked past this. Possibly several somebodies.',
  'It is still there. We checked.',
  'Nobody has claimed this. Suspicious.',
  'The pot grows. The mess grows. Everybody loses.',
]

export function nagFor(mine) {
  // Stable per mine so it doesn't flicker on every render.
  let h = 0
  for (const ch of mine.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return NAGS[h % NAGS.length]
}

/** Preset for parents who want to watch the whole ladder run in a few minutes. */
export const DEMO_RATES = {
  graceMins: 1,
  smokingMins: 2,
  detonatedMins: 3,
  familyDrainPerHour: 240,
  finePerHour: 600,
  defuseReward: 40,
}
