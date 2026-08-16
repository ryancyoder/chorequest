import { supabase } from '../lib/supabase.js'
import { DEFAULT_RATES } from '../lib/landmines.js'

/**
 * Postgres ⇄ the shape the app already speaks.
 *
 * The nine screens read one plain object with camelCase keys, and there is no
 * reason to rewrite them to read snake_case rows. So this module owns the whole
 * translation: `loadHousehold()` returns exactly what `buildSeed()` used to,
 * and the screens can't tell the difference.
 *
 * Two conventions the mapping depends on:
 *   - a Postgres `date` arrives as 'YYYY-MM-DD', which is already the app's ISO
 *     date format, so date columns pass straight through
 *   - a `timestamptz` arrives as a string, but the app compares instants as
 *     epoch millis, so every *_at becomes a number here and nowhere else
 */

const ms = (ts) => (ts ? Date.parse(ts) : null)
const iso = (ts) => ts || null

/* ─────────────────────────── row → app object ─────────────────────────── */

const toMember = (r) => ({
  id: r.id,
  name: r.name,
  emoji: r.emoji,
  color: r.color,
  initials: r.initials,
  role: r.role,
  born: r.born,
  sortOrder: r.sort_order,
  active: r.active,
  // The hash is unreachable by design; the app only ever asked "is one set?"
  // to decide whether to prompt. Checking one is verifyPin(), an RPC.
  hasPin: r.has_pin,
  xp: r.xp,
  coins: r.coins,
  streak: r.streak,
  lastDoneISO: iso(r.last_done_date),
  badges: r.badges || [],
  totalApproved: r.total_approved,
  jobsDone: r.jobs_done,
  perfectScores: r.perfect_scores,
  escrowXp: r.escrow_xp,
  escrowCoins: r.escrow_coins,
  starsReceived: r.stars_received,
  starsGiven: r.stars_given,
})

const toChore = (r) => ({
  id: r.id,
  memberId: r.person_id,
  title: r.title,
  emoji: r.emoji,
  days: r.days || [],
  time: r.time_of_day ? r.time_of_day.slice(0, 5) : '',
  points: r.points,
  coins: r.coins,
  needsPhoto: r.needs_photo,
  referencePhotoId: r.reference_photo_id,
  checklist: r.checklist || [],
  room: r.room || '',
})

const toEvent = (r) => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  emoji: r.emoji,
  category: r.category,
  memberIds: r.person_ids || [],
  days: r.days || [],
  fromISO: iso(r.from_date),
  untilISO: iso(r.until_date),
  dateISO: iso(r.date),
  endDateISO: iso(r.end_date),
  start: r.start_time ? r.start_time.slice(0, 5) : '',
  end: r.end_time ? r.end_time.slice(0, 5) : '',
  allDay: r.all_day,
  away: r.away,
  notes: r.notes || '',
  duties: (r.event_duties || []).map((d) => ({
    id: d.id, text: d.text, memberId: d.person_id,
  })),
})

const toJob = (r) => ({
  id: r.id,
  title: r.title,
  notes: r.notes || '',
  photoId: r.photo_id,
  referencePhotoId: r.reference_photo_id,
  points: r.points,
  coins: r.coins,
  createdBy: r.created_by,
  createdAt: iso(r.created_at),
  dueISO: iso(r.due_date),
  claimedBy: r.claimed_by,
  status: r.status,
  urgent: r.urgent,
})

const toSubmission = (r) => ({
  id: r.id,
  kind: r.kind,
  targetId: r.target_id,
  memberId: r.person_id,
  dateISO: iso(r.date),
  photoId: r.photo_id,
  status: r.status,
  ai: r.ai,
  note: r.note || '',
  points: r.points,
  coins: r.coins,
  at: ms(r.created_at),
  decidedAt: ms(r.decided_at),
  decidedBy: r.decided_by,
})

const toLandmine = (r) => ({
  id: r.id,
  title: r.title,
  notes: r.notes || '',
  photoId: r.photo_id,
  location: r.location || '',
  ownerId: r.owner_id,
  reporterId: r.reporter_id,
  armedAt: ms(r.armed_at),
  status: r.status,
  pot: r.pot,
  appliedDrain: r.applied_drain,
  appliedFine: r.applied_fine,
  streakBurned: r.streak_burned,
  disputed: r.disputed,
  stageAtDispute: r.stage_at_dispute,
  confessed: r.confessed,
  clearedBy: r.cleared_by,
  clearedAt: ms(r.cleared_at),
})

const toBoss = (r) => {
  const attacks = (r.boss_attacks || [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((a) => ({
      id: a.id, title: a.title, emoji: a.emoji, damage: a.damage,
      weakPoint: a.weak_point, status: a.status,
      claimedBy: a.claimed_by, landedBy: a.landed_by,
      landedAt: ms(a.landed_at), photoId: a.photo_id,
    }))
  return {
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    blurb: r.blurb || '',
    attacks,
    // Derived, never stored — a reversed hit must not leave the bar
    // disagreeing with the list of attacks underneath it.
    maxHp: attacks.reduce((n, a) => n + a.damage, 0),
    pot: r.pot,
    healed: r.healed,
    enrageHeal: r.enrage_heal,
    deadlineAt: ms(r.deadline_at),
    status: r.status,
    createdBy: r.created_by,
    createdAt: ms(r.created_at),
    endedAt: ms(r.ended_at),
  }
}

const toStar = (r) => ({
  id: r.id,
  toId: r.to_person,
  fromId: r.from_person,
  category: r.category,
  points: r.points,
  status: r.status,
  text: r.text || '',
  photoId: r.photo_id,
  dateISO: iso(r.date),
  createdAt: ms(r.created_at),
  decidedAt: ms(r.decided_at),
  decidedBy: r.decided_by,
})

const toTrack = (r) => {
  // The app reads two parallel maps keyed by date; the table stores one row per
  // day. `paid` is the latch that stops a re-log paying twice.
  const log = {}
  const paid = {}
  for (const d of r.track_days || []) {
    log[d.date] = d.result
    if (d.paid) paid[d.date] = true
  }
  return {
    id: r.id,
    memberId: r.person_id,
    kind: r.kind,
    title: r.title,
    emoji: r.emoji,
    log,
    paid,
    best: r.best,
    bestAt: ms(r.best_at),
    createdAt: ms(r.created_at),
    archived: r.archived,
  }
}

const toPr = (r) => ({
  id: r.id,
  memberId: r.person_id,
  trackId: r.track_id,
  title: r.title,
  emoji: r.emoji,
  kind: r.kind,
  value: r.value,
  milestone: r.milestone,
  comeback: r.comeback,
  at: ms(r.at),
  cheers: (r.pr_cheers || []).map((c) => ({
    memberId: c.person_id, at: ms(c.at), dateISO: iso(c.date),
  })),
})

const toBingoCard = (r) => ({
  id: r.id,
  memberId: r.person_id,
  weekStartISO: iso(r.week_start),
  squares: r.squares || [],
})

const toPrize = (r, redemptions) => ({
  id: r.id,
  title: r.title,
  emoji: r.emoji,
  cost: r.cost,
  memberId: r.person_id,
  note: r.note || '',
  redeemed: redemptions
    .filter((x) => x.prize_id === r.id)
    .map((x) => ({ memberId: x.person_id, at: ms(x.at), cost: x.cost })),
})

const toGoal = (r) => ({
  id: r.id,
  title: r.title,
  emoji: r.emoji,
  target: r.target,
  progress: r.progress,
  reward: r.reward || '',
  createdAt: ms(r.created_at),
  achievedAt: ms(r.achieved_at),
})

const toActivity = (r) => ({
  id: r.id,
  memberId: r.person_id,
  text: r.text,
  emoji: r.emoji,
  at: ms(r.at),
})

/* ─────────────────────────── the load ─────────────────────────── */

/** Throw on the first failure rather than assembling a half-empty household. */
function unwrap(label, { data, error }) {
  if (error) throw new Error(`${label}: ${error.message}`)
  return data || []
}

/**
 * Read the whole household in one round of parallel queries.
 *
 * Deliberately a full read rather than incremental: the entire dataset for a
 * family of seven is a few hundred rows, one boot costs well under a second,
 * and it removes any chance of the client assembling a state that never existed
 * on the server. Realtime patches individual rows after this.
 */
export async function loadHousehold(householdId) {
  const q = supabase
  const [
    members, chores, events, jobs, submissions, landmines, bosses, stars,
    tracks, prs, bingoCards, prizes, redemptions, familyGoals, activity, settingRows,
  ] = await Promise.all([
    q.from('member_rows').select('*').eq('household_id', householdId).order('sort_order').then((r) => unwrap('members', r)),
    q.from('chores').select('*').eq('household_id', householdId).eq('active', true).then((r) => unwrap('chores', r)),
    q.from('events').select('*, event_duties(*)').eq('household_id', householdId).then((r) => unwrap('events', r)),
    q.from('jobs').select('*').eq('household_id', householdId).then((r) => unwrap('jobs', r)),
    q.from('submissions').select('*').eq('household_id', householdId).order('created_at', { ascending: false }).limit(400).then((r) => unwrap('submissions', r)),
    q.from('landmines').select('*').eq('household_id', householdId).then((r) => unwrap('landmines', r)),
    q.from('bosses').select('*, boss_attacks(*)').eq('household_id', householdId).then((r) => unwrap('bosses', r)),
    q.from('stars').select('*').eq('household_id', householdId).order('created_at', { ascending: false }).limit(300).then((r) => unwrap('stars', r)),
    q.from('tracks').select('*, track_days(*)').eq('household_id', householdId).then((r) => unwrap('tracks', r)),
    q.from('prs').select('*, pr_cheers(*)').eq('household_id', householdId).order('at', { ascending: false }).limit(100).then((r) => unwrap('prs', r)),
    q.from('bingo_cards').select('*').eq('household_id', householdId).order('week_start', { ascending: false }).limit(28).then((r) => unwrap('bingo', r)),
    q.from('prizes').select('*').eq('household_id', householdId).eq('active', true).then((r) => unwrap('prizes', r)),
    q.from('prize_redemptions').select('*').eq('household_id', householdId).then((r) => unwrap('redemptions', r)),
    q.from('family_goals').select('*').eq('household_id', householdId).then((r) => unwrap('goals', r)),
    q.from('activity').select('*').eq('household_id', householdId).order('at', { ascending: false }).limit(60).then((r) => unwrap('activity', r)),
    q.from('settings').select('key, value').eq('household_id', householdId).then((r) => unwrap('settings', r)),
  ])

  const settings = Object.fromEntries(settingRows.map((s) => [s.key, s.value]))

  return {
    version: 2,
    householdId,
    members: members.map(toMember),
    chores: chores.map(toChore),
    events: events.map(toEvent),
    jobs: jobs.map(toJob),
    submissions: submissions.map(toSubmission),
    landmines: landmines.map(toLandmine),
    bosses: bosses.map(toBoss),
    stars: stars.map(toStar),
    tracks: tracks.map(toTrack),
    prs: prs.map(toPr),
    bingoCards: bingoCards.map(toBingoCard),
    prizes: prizes.map((p) => toPrize(p, redemptions)),
    familyGoals: familyGoals.map(toGoal),
    activity: activity.map(toActivity),
    familyRecord: settings.familyRecord || { best: 0, bestAt: null },
    settings: {
      currentMemberId: null,   // per-device, never synced — see AppContext
      parentUnlocked: false,
      requirePin: true,
      soundOn: true,
      layoutMode: 'auto',
      aiSensitivity: 'normal',
      photoCheckUrl: '',
      ...settings,
      landmineRates: { ...DEFAULT_RATES, ...(settings.landmineRates || {}) },
    },
  }
}

/* ─────────────────────────── session ─────────────────────────── */

/** The household this login belongs to, creating one on first run. */
export async function resolveHousehold(name = 'Our house') {
  const { data, error } = await supabase.rpc('bootstrap_household', { p_name: name })
  if (error) throw new Error(`household: ${error.message}`)
  return data
}

/** Ask the server whether a PIN is right. The hash never leaves the database. */
export async function verifyPin(personId, pin) {
  const { data, error } = await supabase.rpc('verify_person_pin', {
    p_person_id: personId, p_pin: pin,
  })
  if (error) return false
  return data === true
}

/** Household-level settings are one JSONB row per key. */
export async function saveSetting(householdId, key, value) {
  const { error } = await supabase
    .from('settings')
    .upsert({ household_id: householdId, key, value }, { onConflict: 'household_id,key' })
  if (error) throw new Error(`setting ${key}: ${error.message}`)
}

/**
 * Subscribe to the tables another phone can change while you're looking at one.
 * Any event triggers a reload rather than a surgical patch: a full read is
 * cheap here, and patching by hand is how two devices end up believing
 * different things about the same boss fight.
 */
export function watchHousehold(householdId, onChange) {
  const channel = supabase
    .channel(`household:${householdId}`)
    .on('postgres_changes', { event: '*', schema: 'public' }, onChange)
    .subscribe()
  return () => supabase.removeChannel(channel)
}
