import { supabase } from '../lib/supabase.js'
import { loadState } from './storage.js'

/**
 * One-time lift of a device's localStorage into Supabase.
 *
 * The on-device model uses hand-rolled string ids ('m3', 'c_1', 'lm_demo');
 * Postgres uses uuids. So the import runs in dependency order and keeps a map
 * from every old id to the uuid it became — a chore that references 'm3' has to
 * land pointing at the same person the star from 'm3' does.
 *
 * Photos are deliberately NOT lifted. They live in IndexedDB as data URLs and
 * belong in Storage, which is its own job with its own failure modes; a chore's
 * reference photo simply arrives null and gets re-shot. Better than a half-hour
 * upload that dies at 80% and leaves ids pointing at nothing.
 */

const chunk = (rows, n = 200) => {
  const out = []
  for (let i = 0; i < rows.length; i += n) out.push(rows.slice(i, i + n))
  return out
}

/** Insert and return rows, throwing with a useful label rather than a code. */
async function put(table, rows, label = table) {
  if (!rows.length) return []
  const all = []
  for (const part of chunk(rows)) {
    const { data, error } = await supabase.from(table).insert(part).select()
    if (error) throw new Error(`${label}: ${error.message}`)
    all.push(...(data || []))
  }
  return all
}

const at = (v) => (v ? new Date(v).toISOString() : null)
const day = (v) => v || null
const time = (v) => (v ? `${v}:00` : null)

/**
 * @param householdId  where everything lands
 * @param state        a state object; defaults to this device's saved one
 * @param onProgress   called with a short human label per step
 */
export async function importLocalState(householdId, state = loadState(), onProgress = () => {}) {
  if (!state) throw new Error('There is no saved state on this device to import.')

  const H = householdId
  const idMap = new Map()          // old string id -> new uuid
  const map = (old) => (old == null ? null : idMap.get(old) ?? null)
  const counts = {}

  /* ── people first: everything else points at them ────────────────────── */
  onProgress('Family')
  // The trigger on people also creates quest_profiles and laundry_profiles, so
  // the economy is updated afterwards rather than inserted.
  const people = await put('people', state.members.map((m, i) => ({
    household_id: H,
    name: m.name,
    emoji: m.emoji,
    color: m.color,
    initials: m.name.slice(0, 1).toUpperCase(),
    role: m.role,
    born: m.born ?? null,
    sort_order: i,
  })), 'family')

  state.members.forEach((m, i) => idMap.set(m.id, people[i].id))
  counts.members = people.length

  for (const m of state.members) {
    const { error } = await supabase.from('quest_profiles').update({
      xp: Math.max(0, m.xp || 0),
      coins: Math.max(0, m.coins || 0),
      streak: m.streak || 0,
      last_done_date: day(m.lastDoneISO),
      badges: m.badges || [],
      total_approved: m.totalApproved || 0,
      jobs_done: m.jobsDone || 0,
      perfect_scores: m.perfectScores || 0,
      escrow_xp: Math.max(0, m.escrowXp || 0),
      escrow_coins: Math.max(0, m.escrowCoins || 0),
      stars_received: m.starsReceived || 0,
      stars_given: m.starsGiven || 0,
    }).eq('person_id', map(m.id))
    if (error) throw new Error(`economy for ${m.name}: ${error.message}`)
  }

  /* ── config ───────────────────────────────────────────────────────────── */
  onProgress('Chores and calendar')
  const chores = await put('chores', state.chores.map((c) => ({
    household_id: H,
    person_id: map(c.memberId),
    title: c.title, emoji: c.emoji,
    days: c.days || [],
    time_of_day: time(c.time),
    points: Math.max(0, c.points || 0),
    coins: Math.max(0, c.coins || 0),
    needs_photo: !!c.needsPhoto,
    checklist: c.checklist || [],
    room: c.room || '',
  })).filter((c) => c.person_id), 'chores')
  state.chores.filter((c) => map(c.memberId)).forEach((c, i) => idMap.set(c.id, chores[i].id))
  counts.chores = chores.length

  const events = await put('events', state.events.map((e) => ({
    household_id: H,
    kind: e.kind || 'repeat',
    title: e.title, emoji: e.emoji || '📅',
    category: e.category || 'other',
    person_ids: (e.memberIds || []).map(map).filter(Boolean),
    days: e.days || [],
    from_date: day(e.fromISO), until_date: day(e.untilISO),
    date: day(e.dateISO), end_date: day(e.endDateISO),
    start_time: time(e.start), end_time: time(e.end),
    all_day: !!e.allDay, away: !!e.away,
    notes: e.notes || '',
  })), 'calendar')
  state.events.forEach((e, i) => idMap.set(e.id, events[i].id))
  counts.events = events.length

  const duties = state.events.flatMap((e) =>
    (e.duties || []).map((d) => ({
      event_id: map(e.id), text: d.text, person_id: map(d.memberId),
    })))
  await put('event_duties', duties, 'duties')

  onProgress('Jobs and prizes')
  const jobs = await put('jobs', state.jobs.map((j) => ({
    household_id: H,
    title: j.title, notes: j.notes || '',
    points: Math.max(0, j.points || 0), coins: Math.max(0, j.coins || 0),
    created_by: map(j.createdBy), claimed_by: map(j.claimedBy),
    status: j.status || 'open', urgent: !!j.urgent,
    due_date: day(j.dueISO),
  })), 'jobs')
  state.jobs.forEach((j, i) => idMap.set(j.id, jobs[i].id))
  counts.jobs = jobs.length

  const prizes = await put('prizes', state.prizes.map((p) => ({
    household_id: H,
    title: p.title, emoji: p.emoji,
    cost: Math.max(0, p.cost || 0),
    person_id: map(p.memberId),
    note: p.note || '',
  })), 'prizes')
  state.prizes.forEach((p, i) => idMap.set(p.id, prizes[i].id))
  counts.prizes = prizes.length

  await put('prize_redemptions', state.prizes.flatMap((p) =>
    (p.redeemed || []).map((r) => ({
      household_id: H, prize_id: map(p.id), person_id: map(r.memberId),
      cost: r.cost ?? p.cost ?? 0, at: at(r.at),
    })).filter((r) => r.person_id)), 'redemptions')

  await put('family_goals', state.familyGoals.map((g) => ({
    household_id: H,
    title: g.title, emoji: g.emoji,
    target: Math.max(1, g.target || 1),
    progress: Math.max(0, g.progress || 0),
    reward: g.reward || '',
    achieved_at: at(g.achievedAt),
  })), 'family goals')
  counts.familyGoals = state.familyGoals.length

  /* ── live play ────────────────────────────────────────────────────────── */
  onProgress('Landmines, stars and records')
  const mines = await put('landmines', state.landmines.map((m) => ({
    household_id: H,
    title: m.title, notes: m.notes || '', location: m.location || '',
    owner_id: map(m.ownerId), reporter_id: map(m.reporterId),
    armed_at: at(m.armedAt),
    // Anything mid-escalation on an old device becomes 'armed' again; the stage
    // is derived from armed_at, so it picks up exactly where it left off.
    status: ['cleared', 'void'].includes(m.status) ? m.status : 'armed',
    pot: Math.max(0, m.pot || 0),
    applied_drain: Math.max(0, m.appliedDrain || 0),
    applied_fine: Math.max(0, m.appliedFine || 0),
    streak_burned: !!m.streakBurned,
    disputed: !!m.disputed,
    stage_at_dispute: m.stageAtDispute,
    confessed: !!m.confessed,
    cleared_by: map(m.clearedBy), cleared_at: at(m.clearedAt),
  })), 'landmines')
  state.landmines.forEach((m, i) => idMap.set(m.id, mines[i].id))
  counts.landmines = mines.length

  // A star is invalid if either end didn't survive the import.
  const stars = state.stars.filter((s) => map(s.toId) && map(s.fromId) && map(s.toId) !== map(s.fromId))
  await put('stars', stars.map((s) => ({
    household_id: H,
    to_person: map(s.toId), from_person: map(s.fromId),
    category: s.category, points: Math.max(0, s.points || 0),
    status: s.status === 'confirmed' ? 'confirmed' : s.status === 'declined' ? 'declined' : 'pending',
    text: s.text || '',
    date: day(s.dateISO), created_at: at(s.createdAt),
    decided_at: at(s.decidedAt), decided_by: map(s.decidedBy),
  })), 'gold stars')
  counts.stars = stars.length

  const tracks = await put('tracks', state.tracks.map((t) => ({
    household_id: H,
    person_id: map(t.memberId),
    kind: t.kind, title: t.title, emoji: t.emoji,
    best: Math.max(0, t.best || 0), best_at: at(t.bestAt),
    archived: !!t.archived, created_at: at(t.createdAt),
  })).filter((t) => t.person_id), 'records')
  state.tracks.filter((t) => map(t.memberId)).forEach((t, i) => idMap.set(t.id, tracks[i].id))
  counts.tracks = tracks.length

  await put('track_days', state.tracks.flatMap((t) =>
    Object.entries(t.log || {}).map(([date, result]) => ({
      track_id: map(t.id), date, result,
      paid: !!(t.paid || {})[date],
    })).filter((d) => d.track_id)), 'record history')

  const prs = await put('prs', state.prs.map((p) => ({
    household_id: H,
    person_id: map(p.memberId), track_id: map(p.trackId),
    title: p.title, emoji: p.emoji, kind: p.kind,
    value: p.value || 0, milestone: p.milestone ?? null,
    comeback: !!p.comeback, at: at(p.at),
  })).filter((p) => p.person_id), 'personal records')
  state.prs.filter((p) => map(p.memberId)).forEach((p, i) => idMap.set(p.id, prs[i].id))

  await put('pr_cheers', state.prs.flatMap((p) =>
    (p.cheers || []).map((c) => ({
      pr_id: map(p.id), person_id: map(c.memberId),
      date: day(c.dateISO), at: at(c.at),
    })).filter((c) => c.pr_id && c.person_id)), 'cheers')

  onProgress('Bosses and history')
  for (const b of state.bosses || []) {
    const [boss] = await put('bosses', [{
      household_id: H,
      name: b.name, emoji: b.emoji, blurb: b.blurb || '',
      pot: Math.max(0, b.pot || 0), healed: Math.max(0, b.healed || 0),
      enrage_heal: b.enrageHeal || 0,
      deadline_at: at(b.deadlineAt), status: b.status || 'live',
      created_by: map(b.createdBy), created_at: at(b.createdAt),
      ended_at: at(b.endedAt),
    }], 'bosses')
    idMap.set(b.id, boss.id)
    await put('boss_attacks', (b.attacks || []).map((a, i) => ({
      boss_id: boss.id, title: a.title, emoji: a.emoji,
      damage: Math.max(0, a.damage || 0), weak_point: !!a.weakPoint,
      status: a.status || 'open',
      claimed_by: map(a.claimedBy), landed_by: map(a.landedBy),
      landed_at: at(a.landedAt), sort_order: i,
    })), 'boss attacks')
  }
  counts.bosses = (state.bosses || []).length

  // Submissions come after their targets so target_id resolves. Photos aren't
  // carried, so an approved submission keeps its record but loses its picture.
  const subs = (state.submissions || []).filter((s) => map(s.memberId) && map(s.targetId))
  await put('submissions', subs.map((s) => ({
    household_id: H,
    kind: s.kind, target_id: map(s.targetId), person_id: map(s.memberId),
    date: day(s.dateISO), status: s.status,
    ai: s.ai ?? null, note: s.note || '',
    points: s.points || 0, coins: s.coins || 0,
    created_at: at(s.at), decided_at: at(s.decidedAt), decided_by: map(s.decidedBy),
  })), 'submissions')
  counts.submissions = subs.length

  await put('bingo_cards', (state.bingoCards || []).map((c) => ({
    household_id: H, person_id: map(c.memberId),
    week_start: day(c.weekStartISO), squares: c.squares || [],
  })).filter((c) => c.person_id && c.week_start), 'bingo')

  await put('activity', (state.activity || []).map((a) => ({
    household_id: H, person_id: map(a.memberId),
    text: a.text, emoji: a.emoji, at: at(a.at),
  })), 'activity')

  /* ── settings ─────────────────────────────────────────────────────────── */
  onProgress('Settings')
  const s = state.settings || {}
  const rows = [
    ['requirePin', s.requirePin ?? true],
    ['soundOn', s.soundOn ?? true],
    ['aiSensitivity', s.aiSensitivity || 'normal'],
    ['photoCheckUrl', s.photoCheckUrl || ''],
    ['landmineRates', s.landmineRates || {}],
    ['familyRecord', state.familyRecord || { best: 0, bestAt: null }],
  ].map(([key, value]) => ({ household_id: H, key, value }))

  const { error } = await supabase.from('settings').upsert(rows, { onConflict: 'household_id,key' })
  if (error) throw new Error(`settings: ${error.message}`)

  // layoutMode and currentMemberId stay on the device on purpose: which member
  // is holding THIS phone, and whether THIS screen is a tablet, are not facts
  // about the household.

  return { counts, idMap }
}
