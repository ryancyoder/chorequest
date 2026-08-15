import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { buildSeed } from './seed.js'
import { loadState, saveState, clearState } from './storage.js'
import { hydratePhotos, clearPhotos } from '../lib/photos.js'
import { todayISO, addDays } from '../lib/date.js'
import { earnedBadges, streakMultiplier, levelFromXp } from '../lib/gamify.js'
import { useWideViewport, resolveLayout } from '../lib/layout.js'
import { ratesOf, stageOf, cumulativeDamage, stageIndex } from '../lib/landmines.js'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

let seq = 0
const uid = (p) => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}`

export function AppProvider({ children }) {
  const [state, setState] = useState(() => loadState() || buildSeed())
  const [ready, setReady] = useState(false)
  const [toast, setToast] = useState(null)
  const [celebration, setCelebration] = useState(null) // {title, subtitle, emoji}
  const toastTimer = useRef(null)

  // Layout resolves from the saved preference plus the live viewport, so an iPad
  // rotating into landscape switches over on its own.
  const wideViewport = useWideViewport()
  const layoutPref = state.settings.layoutMode ?? 'auto'
  const layout = resolveLayout(layoutPref, wideViewport)

  useEffect(() => {
    hydratePhotos().finally(() => setReady(true))
  }, [])

  useEffect(() => {
    saveState(state)
  }, [state])

  // Landmines keep escalating while the app is closed, so catch up on mount and
  // whenever the tab comes back into focus, then keep ticking once a minute.
  const tickRef = useRef(null)
  tickRef.current = () => api.tickLandmines()

  useEffect(() => {
    if (!ready) return
    const run = () => tickRef.current?.()
    run()
    const id = setInterval(run, 60000)
    const onVisible = () => document.visibilityState === 'visible' && run()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [ready])

  function notify(text, emoji = '✨') {
    clearTimeout(toastTimer.current)
    setToast({ text, emoji, at: Date.now() })
    toastTimer.current = setTimeout(() => setToast(null), 3200)
  }

  function celebrate(payload) {
    setCelebration(payload)
  }

  /** Mutate a cloned draft of state; the mutator's return value is ignored. */
  const update = (fn) =>
    setState((prev) => {
      const draft = structuredClone(prev)
      fn(draft)
      return draft
    })

  function logActivity(draft, memberId, text, emoji) {
    draft.activity.unshift({ id: uid('a'), at: Date.now(), memberId, text, emoji })
    draft.activity = draft.activity.slice(0, 60)
  }

  /* ───────────────────────── members / session ───────────────────────── */

  const api = {
    state,
    ready,
    toast,
    notify,
    celebration,
    dismissCelebration: () => setCelebration(null),

    /** 'phone' | 'tablet' — what's actually on screen right now. */
    layout,
    /** 'auto' | 'phone' | 'tablet' — what the family chose. */
    layoutPref,
    setLayoutPref(pref) {
      update((d) => { d.settings.layoutMode = pref })
    },

    get currentMember() {
      return state.members.find((m) => m.id === state.settings.currentMemberId) || state.members[0]
    },

    switchMember(memberId) {
      update((d) => {
        d.settings.currentMemberId = memberId
        const m = d.members.find((x) => x.id === memberId)
        if (!m || m.role !== 'parent') d.settings.parentUnlocked = false
      })
    },

    unlockParent(pin) {
      const m = state.members.find((x) => x.id === state.settings.currentMemberId)
      const ok = !state.settings.requirePin || m?.pin === pin
      if (ok) update((d) => { d.settings.parentUnlocked = true })
      return ok
    },

    lockParent() {
      update((d) => { d.settings.parentUnlocked = false })
    },

    setSetting(key, value) {
      update((d) => { d.settings[key] = value })
    },

    get isParentMode() {
      const m = state.members.find((x) => x.id === state.settings.currentMemberId)
      return m?.role === 'parent' && state.settings.parentUnlocked
    },

    addMember(data) {
      update((d) => {
        d.members.push({
          id: uid('m'), name: 'New member', emoji: '🙂', color: '#4cc9f0', role: 'child', pin: null,
          xp: 0, coins: 0, streak: 0, lastDoneISO: null, badges: [], totalApproved: 0, jobsDone: 0,
          perfectScores: 0, born: null, ...data,
        })
      })
      notify('Family member added', '👋')
    },

    updateMember(id, patch) {
      update((d) => {
        const m = d.members.find((x) => x.id === id)
        if (m) Object.assign(m, patch)
      })
    },

    removeMember(id) {
      update((d) => {
        d.members = d.members.filter((m) => m.id !== id)
        d.chores = d.chores.filter((c) => c.memberId !== id)
        d.events = d.events.filter((e) => e.memberId !== id)
        d.submissions = d.submissions.filter((s) => s.memberId !== id)
        d.jobs.forEach((j) => { if (j.claimedBy === id) { j.claimedBy = null; j.status = 'open' } })
        if (d.settings.currentMemberId === id) d.settings.currentMemberId = d.members[0]?.id
      })
      notify('Member removed', '👋')
    },

    /* ───────────────────────── chores ───────────────────────── */

    addChore(data) {
      update((d) => {
        d.chores.push({
          id: uid('c'), title: 'New chore', emoji: '🧹', memberId: d.members[0].id, days: [1, 2, 3, 4, 5],
          time: '', points: 10, coins: 2, needsPhoto: false, referencePhotoId: null, checklist: [], room: '', ...data,
        })
      })
      notify('Chore added', '🧹')
    },

    updateChore(id, patch) {
      update((d) => {
        const c = d.chores.find((x) => x.id === id)
        if (c) Object.assign(c, patch)
      })
    },

    removeChore(id) {
      update((d) => {
        d.chores = d.chores.filter((c) => c.id !== id)
        d.submissions = d.submissions.filter((s) => !(s.kind === 'chore' && s.targetId === id))
      })
      notify('Chore removed', '🗑️')
    },

    /* ───────────────────────── schedule ───────────────────────── */

    addEvent(data) {
      update((d) => {
        d.events.push({
          id: uid('e'), memberId: d.members[0].id, title: 'New event', emoji: '📌',
          days: [1], start: '16:00', end: '17:00', category: 'other', ...data,
        })
      })
      notify('Added to the schedule', '📅')
    },

    updateEvent(id, patch) {
      update((d) => {
        const e = d.events.find((x) => x.id === id)
        if (e) Object.assign(e, patch)
      })
    },

    removeEvent(id) {
      update((d) => { d.events = d.events.filter((e) => e.id !== id) })
    },

    /* ───────────────────────── add-on jobs ───────────────────────── */

    addJob(data) {
      update((d) => {
        d.jobs.unshift({
          id: uid('j'), title: 'New job', notes: '', photoId: null, referencePhotoId: null,
          points: 25, coins: 5, createdBy: d.settings.currentMemberId, createdAt: todayISO(),
          dueISO: addDays(todayISO(), 2), claimedBy: null, status: 'open', urgent: false, ...data,
        })
      })
      notify('Job posted to the board', '🎯')
    },

    updateJob(id, patch) {
      update((d) => {
        const j = d.jobs.find((x) => x.id === id)
        if (j) Object.assign(j, patch)
      })
    },

    claimJob(jobId, memberId) {
      const job = state.jobs.find((x) => x.id === jobId)
      const member = state.members.find((x) => x.id === memberId)
      if (!job || job.status !== 'open') return
      update((d) => {
        const j = d.jobs.find((x) => x.id === jobId)
        if (!j || j.status !== 'open') return
        j.claimedBy = memberId
        j.status = 'claimed'
        logActivity(d, memberId, `claimed “${j.title}”`, '🎯')
      })
      notify(`${member?.name || 'You'} claimed it!`, '🎯')
    },

    releaseJob(jobId) {
      update((d) => {
        const j = d.jobs.find((x) => x.id === jobId)
        if (j) { j.claimedBy = null; j.status = 'open' }
        d.submissions = d.submissions.filter((s) => !(s.kind === 'job' && s.targetId === jobId && s.status !== 'approved'))
      })
      notify('Back on the board', '↩️')
    },

    removeJob(id) {
      update((d) => {
        d.jobs = d.jobs.filter((j) => j.id !== id)
        d.submissions = d.submissions.filter((s) => !(s.kind === 'job' && s.targetId === id))
      })
      notify('Job removed', '🗑️')
    },

    /* ───────────────────────── submissions ───────────────────────── */

    /**
     * Record a proof submission. `ai` is the verdict from lib/ai.js (or null when
     * the task needs no photo). A failed AI check never reaches a parent — the kid
     * gets it back to redo. A pass parks it in the review queue.
     */
    submitProof({ kind, targetId, memberId, dateISO = todayISO(), photoId = null, ai = null, note = '' }) {
      const passed = !ai || ai.pass
      const status = passed ? 'pending' : 'ai_rejected'
      update((d) => {
        const existingIdx = d.submissions.findIndex(
          (s) => s.kind === kind && s.targetId === targetId && s.dateISO === dateISO && s.status !== 'approved',
        )
        // Chores and jobs carry their own reward; a landmine pays the defuse
        // bounty from settings (the pot is handled separately on approval).
        const target = kind === 'chore'
          ? d.chores.find((c) => c.id === targetId)
          : kind === 'job'
            ? d.jobs.find((j) => j.id === targetId)
            : { points: ratesOf(d).defuseReward, coins: 0 }

        const record = {
          id: existingIdx >= 0 ? d.submissions[existingIdx].id : uid('s'),
          kind, targetId, memberId, dateISO, photoId, ai, note, status,
          points: target?.points ?? 10,
          coins: target?.coins ?? 0,
          createdAt: Date.now(),
          attempts: existingIdx >= 0 ? (d.submissions[existingIdx].attempts || 1) + 1 : 1,
          reviewedBy: null, reviewNote: '', decidedAt: null,
        }
        if (existingIdx >= 0) d.submissions[existingIdx] = record
        else d.submissions.push(record)

        if (kind === 'job' && passed) {
          const j = d.jobs.find((x) => x.id === targetId)
          if (j) j.status = 'submitted'
        }

        // A defuse under review stops the clock — nobody should keep bleeding
        // points while a parent takes their time looking at the photo.
        if (kind === 'landmine' && passed) {
          const lm = d.landmines.find((x) => x.id === targetId)
          if (lm) lm.status = 'defusing'
        }
      })
      return { status, passed }
    },

    /**
     * The payoff moment. Everything is computed up front from the current
     * snapshot so the state mutator stays pure and the celebration can fire
     * immediately with real numbers.
     */
    approveSubmission(subId, byMemberId, bonus = 0) {
      const s = state.submissions.find((x) => x.id === subId)
      if (!s || s.status === 'approved') return null
      const m = state.members.find((x) => x.id === s.memberId)
      if (!m) return null

      // Someone with a live landmine against them can't cash out. Their earnings
      // aren't destroyed though — they're held in escrow and released the moment
      // they clean up their mess. "Until the problem is addressed."
      const mine = state.landmines.find(
        (lm) => lm.status === 'armed' && lm.ownerId === s.memberId && !lm.disputed,
      )
      const frozen = !!mine && s.kind !== 'landmine'

      const t = todayISO()
      // Smoking or worse means bonuses are suspended on top of the freeze.
      const bonusesSuspended = !!mine && stageIndex(stageOf(mine, ratesOf(state))) >= stageIndex('smoking')
      const mult = bonusesSuspended ? 1 : streakMultiplier(m.streak)
      const gained = Math.round((s.points + bonus) * mult)

      // Streak: consecutive days with at least one approval.
      const nextStreak = m.lastDoneISO === t
        ? m.streak
        : m.lastDoneISO === addDays(t, -1) ? m.streak + 1 : 1

      // Frozen earnings go to escrow instead of the balance.
      const paidXp = frozen ? 0 : gained
      const paidCoins = frozen ? 0 : s.coins

      const nextXp = m.xp + paidXp
      const nextCoins = m.coins + paidCoins
      const nextApproved = (m.totalApproved || 0) + 1
      const nextJobs = (m.jobsDone || 0) + (s.kind === 'job' ? 1 : 0)
      const nextPerfect = (m.perfectScores || 0) + (s.ai?.score >= 95 ? 1 : 0)
      const beforeLevel = levelFromXp(m.xp).level
      const afterLevel = levelFromXp(nextXp).level

      const nextBadges = earnedBadges({
        approved: nextApproved, streak: nextStreak, jobsDone: nextJobs,
        perfectScores: nextPerfect, coins: nextCoins, level: afterLevel,
      })
      const fresh = nextBadges.filter((b) => !m.badges.includes(b))

      const goalHit = !frozen && state.familyGoals.find(
        (g) => !g.achievedAt && g.progress < g.target && g.progress + gained >= g.target,
      )
      const title = s.kind === 'chore'
        ? state.chores.find((c) => c.id === s.targetId)?.title
        : s.kind === 'job'
          ? state.jobs.find((j) => j.id === s.targetId)?.title
          : state.landmines.find((l) => l.id === s.targetId)?.title

      update((d) => {
        const sub = d.submissions.find((x) => x.id === subId)
        const mem = d.members.find((x) => x.id === s.memberId)
        if (!sub || !mem) return

        mem.streak = nextStreak
        mem.lastDoneISO = t
        mem.xp = nextXp
        mem.coins = nextCoins
        mem.totalApproved = nextApproved
        mem.jobsDone = nextJobs
        mem.perfectScores = nextPerfect
        mem.badges = nextBadges

        if (frozen) {
          mem.escrowXp = (mem.escrowXp || 0) + gained
          mem.escrowCoins = (mem.escrowCoins || 0) + s.coins
        }

        sub.status = 'approved'
        sub.reviewedBy = byMemberId
        sub.decidedAt = Date.now()

        if (sub.kind === 'job') {
          const j = d.jobs.find((x) => x.id === sub.targetId)
          if (j) j.status = 'done'
        }

        // Defusing a landmine clears it, pays the pot out, and thaws the offender.
        if (sub.kind === 'landmine') {
          const lm = d.landmines.find((x) => x.id === sub.targetId)
          if (lm) {
            lm.status = 'cleared'
            lm.clearedBy = sub.memberId
            lm.clearedAt = Date.now()

            const pot = lm.pot || 0
            if (pot > 0) {
              if (lm.ownerId === sub.memberId) {
                // Cleaned up after yourself: the pot becomes restitution, not profit.
                for (const g of d.familyGoals) {
                  if (!g.achievedAt) { g.progress = Math.min(g.target, g.progress + pot); break }
                }
                logActivity(d, sub.memberId, `cleaned up their own mess — ${pot} pts back to the family`, '🧤')
              } else {
                mem.coins += pot
                logActivity(d, sub.memberId, `defused a landmine and took the ${pot} coin pot`, '💰')
              }
            }
            lm.pot = 0

            // Thaw the offender and hand over everything they earned while frozen.
            const owner = lm.ownerId && d.members.find((x) => x.id === lm.ownerId)
            const stillStuck = owner && d.landmines.some(
              (o) => o.id !== lm.id && o.status === 'armed' && o.ownerId === owner.id && !o.disputed,
            )
            if (owner && !stillStuck && ((owner.escrowXp || 0) > 0 || (owner.escrowCoins || 0) > 0)) {
              owner.xp += owner.escrowXp || 0
              owner.coins += owner.escrowCoins || 0
              logActivity(d, owner.id, `unfroze and collected ${owner.escrowXp || 0} held points`, '🔓')
              owner.escrowXp = 0
              owner.escrowCoins = 0
            }
          }
        }

        // Family goals move on every approval — that's the shared pot.
        if (!frozen) {
          d.familyGoals.forEach((g) => {
            if (g.achievedAt) return
            g.progress = Math.min(g.target, g.progress + gained)
            if (g.progress >= g.target) g.achievedAt = Date.now()
          })
        }

        logActivity(
          d, mem.id,
          frozen ? `banked ${gained} pts for ${title || 'a task'} (frozen)` : `earned ${gained} pts for ${title || 'a task'}`,
          frozen ? '🧊' : '⭐',
        )
      })

      const payload = {
        name: m.name, emoji: m.emoji, color: m.color, gained, coins: s.coins,
        leveledUp: afterLevel > beforeLevel, level: afterLevel, mult,
        newBadges: fresh, goalHit, frozen,
      }

      if (s.kind === 'landmine') {
        const lm = state.landmines.find((x) => x.id === s.targetId)
        const selfClean = lm?.ownerId === s.memberId
        const pot = lm?.pot || 0
        celebrate({
          emoji: selfClean ? '🧤' : '💰',
          title: selfClean ? 'Mess erased' : pot > 0 ? `Pot claimed — ${pot} 🪙` : 'Landmine defused',
          subtitle: selfClean
            ? `${m.name} cleaned up after themselves. ${pot > 0 ? `The ${pot}-point pot goes back to the family.` : 'Slate wiped clean.'}`
            : `${m.name} cleaned up somebody else's disaster and got paid for it.`,
          color: m.color,
        })
      } else if (frozen) {
        celebrate({
          emoji: '🧊',
          title: `${gained} points on ice`,
          subtitle: `${m.name} has a live landmine, so this is held in escrow. Defuse it and every banked point lands at once.`,
          color: m.color,
        })
      } else {
        celebrate({
          emoji: payload.leveledUp ? '🎉' : payload.emoji,
          title: payload.leveledUp ? `Level ${payload.level}!` : `+${payload.gained} points`,
          subtitle: payload.leveledUp
            ? `${payload.name} leveled up`
            : `${payload.name}${payload.mult > 1 ? ` · ${payload.mult}× streak bonus` : ''}${payload.coins ? ` · +${payload.coins} 🪙` : ''}`,
          badges: payload.newBadges,
          color: payload.color,
          goal: payload.goalHit,
        })
      }
      return payload
    },

    rejectSubmission(subId, byMemberId, reviewNote = '') {
      update((d) => {
        const s = d.submissions.find((x) => x.id === subId)
        if (!s) return
        s.status = 'rejected'
        s.reviewedBy = byMemberId
        s.reviewNote = reviewNote
        s.decidedAt = Date.now()
        if (s.kind === 'job') {
          const j = d.jobs.find((x) => x.id === s.targetId)
          if (j) j.status = 'claimed'
        }
        // Rejected defuse: re-arm the mine and the clock picks up where it left off.
        if (s.kind === 'landmine') {
          const lm = d.landmines.find((x) => x.id === s.targetId)
          if (lm && lm.status === 'defusing') lm.status = 'armed'
        }
      })
      notify('Sent back with a note', '↩️')
    },

    /* ───────────────────────── prizes & goals ───────────────────────── */

    addPrize(data) {
      update((d) => {
        d.prizes.push({ id: uid('p'), title: 'New prize', emoji: '🎁', cost: 200, memberId: null, note: '', redeemed: [], ...data })
      })
      notify('Prize added', '🎁')
    },

    updatePrize(id, patch) {
      update((d) => {
        const p = d.prizes.find((x) => x.id === id)
        if (p) Object.assign(p, patch)
      })
    },

    removePrize(id) {
      update((d) => { d.prizes = d.prizes.filter((p) => p.id !== id) })
    },

    redeemPrize(prizeId, memberId) {
      const p = state.prizes.find((x) => x.id === prizeId)
      const m = state.members.find((x) => x.id === memberId)
      if (!p || !m || m.coins < p.cost) {
        notify('Not enough coins yet', '🪙')
        return false
      }
      update((d) => {
        const prize = d.prizes.find((x) => x.id === prizeId)
        const mem = d.members.find((x) => x.id === memberId)
        if (!prize || !mem) return
        mem.coins -= prize.cost
        prize.redeemed.push({ memberId, at: Date.now() })
        logActivity(d, memberId, `redeemed ${prize.title}`, prize.emoji)
      })
      celebrate({
        emoji: p.emoji || '🎁',
        title: 'Prize redeemed!',
        subtitle: `${p.title} — go tell a parent to make it happen.`,
        color: m.color,
      })
      return true
    },

    addFamilyGoal(data) {
      update((d) => {
        d.familyGoals.push({ id: uid('g'), title: 'New family goal', emoji: '🏆', target: 2000, progress: 0, reward: '', createdAt: todayISO(), achievedAt: null, ...data })
      })
      notify('Family goal set', '🏆')
    },

    updateFamilyGoal(id, patch) {
      update((d) => {
        const g = d.familyGoals.find((x) => x.id === id)
        if (g) Object.assign(g, patch)
      })
    },

    removeFamilyGoal(id) {
      update((d) => { d.familyGoals = d.familyGoals.filter((g) => g.id !== id) })
    },

    /* ───────────────────────── 💣 family sabotage ───────────────────────── */

    reportLandmine({ title, notes = '', photoId = null, ownerId = null, location = '', reporterId }) {
      let mineId = null
      update((d) => {
        mineId = uid('lm')
        d.landmines.unshift({
          id: mineId,
          title: title?.trim() || 'Unidentified disaster',
          notes: notes.trim(),
          photoId,
          location: location.trim(),
          ownerId,               // null = nobody has owned up yet
          reporterId,
          armedAt: Date.now(),
          status: 'armed',       // armed | defusing | cleared | void
          pot: 0,                // coins waiting for whoever cleans it
          appliedDrain: 0,       // what we've already charged the family goal
          appliedFine: 0,        // what we've already fined the offender
          streakBurned: false,
          disputed: false,
          stageAtDispute: null,
          confessed: false,
          clearedBy: null,
          clearedAt: null,
        })
        logActivity(d, reporterId, `armed a landmine: ${title}`, '💣')
      })
      notify(ownerId ? 'Landmine armed — the clock is running' : 'Landmine armed — nobody has owned up yet', '💣')
      return mineId
    },

    assignLandmine(mineId, ownerId, byMemberId) {
      const owner = state.members.find((m) => m.id === ownerId)
      update((d) => {
        const mine = d.landmines.find((x) => x.id === mineId)
        if (!mine || mine.status !== 'armed') return
        mine.ownerId = ownerId
        mine.disputed = false
        mine.stageAtDispute = null
        logActivity(d, byMemberId, `pinned a landmine on ${owner?.name || 'someone'}`, '🫵')
      })
      notify(`${owner?.name || 'They'} own${owner ? 's' : ''} it now`, '🫵')
    },

    /** Owning up early halves what you've been fined so far. Honesty discount. */
    confessLandmine(mineId, memberId) {
      let refund = 0
      const mine = state.landmines.find((x) => x.id === mineId)
      if (mine) refund = Math.floor((mine.pot || 0) / 2)

      update((d) => {
        const m = d.landmines.find((x) => x.id === mineId)
        const member = d.members.find((x) => x.id === memberId)
        if (!m || m.status !== 'armed' || !member) return
        m.ownerId = memberId
        m.confessed = true
        m.disputed = false
        m.stageAtDispute = null
        // Wind the clock back to the start of the grace period and hand back half
        // the pot as points — you still have to clean it, but you're not ruined.
        m.armedAt = Date.now()
        m.appliedDrain = 0
        m.appliedFine = 0
        m.streakBurned = false
        m.pot = Math.max(0, (m.pot || 0) - refund)
        member.xp += refund
        logActivity(d, memberId, `owned up to a landmine — ${refund} pts back`, '🙋')
      })
      celebrate({
        emoji: '🙋',
        title: 'Respect.',
        subtitle: refund > 0
          ? `Owning up got you ${refund} points back and reset the clock. Now go clean it.`
          : 'Clock reset. Now go clean it before anything starts burning.',
      })
    },

    /** "It wasn't me" — freezes escalation until a parent rules on it. */
    disputeLandmine(mineId, memberId) {
      update((d) => {
        const m = d.landmines.find((x) => x.id === mineId)
        if (!m || m.status !== 'armed') return
        m.disputed = true
        m.stageAtDispute = stageOf(m, ratesOf(d), Date.now())
        logActivity(d, memberId, 'disputed a landmine — parents to rule', '🙅')
      })
      notify('Disputed. Everything pauses until a parent rules.', '🙅')
    },

    /** Parent tools: throw it out, or un-dispute and let the clock run again. */
    voidLandmine(mineId, byMemberId, reason = '') {
      update((d) => {
        const m = d.landmines.find((x) => x.id === mineId)
        if (!m) return
        m.status = 'void'
        m.clearedBy = byMemberId
        m.clearedAt = Date.now()
        m.voidReason = reason
        logActivity(d, byMemberId, 'called off a landmine', '🕊️')
      })
      notify('Landmine called off', '🕊️')
    },

    upholdLandmine(mineId, byMemberId) {
      update((d) => {
        const m = d.landmines.find((x) => x.id === mineId)
        if (!m) return
        m.disputed = false
        m.stageAtDispute = null
        logActivity(d, byMemberId, 'upheld a landmine — clock is running again', '⚖️')
      })
      notify('Upheld. The clock is running again.', '⚖️')
    },

    /**
     * Advance every armed mine to where it should be right now.
     * Damage is recomputed from `armedAt` and diffed against what's already been
     * applied, so running this twice in the same second changes nothing.
     */
    tickLandmines() {
      const rates = ratesOf(state)
      const now = Date.now()
      const live = state.landmines.filter((m) => m.status === 'armed' && !m.disputed)
      if (!live.length) return

      // Cheap pre-check: skip the whole write if nothing has crossed a threshold.
      const somethingDue = live.some((m) => {
        const dmg = cumulativeDamage(m, rates, now)
        return Math.floor(dmg.familyDrain - (m.appliedDrain || 0)) >= 1 ||
          Math.floor(dmg.fine - (m.appliedFine || 0)) >= 1 ||
          (!m.streakBurned && stageIndex(stageOf(m, rates, now)) >= stageIndex('smoking') && m.ownerId)
      })
      if (!somethingDue) return

      update((d) => {
        const r = ratesOf(d)
        for (const mine of d.landmines) {
          if (mine.status !== 'armed' || mine.disputed) continue

          const dmg = cumulativeDamage(mine, r, now)
          const drainDue = Math.floor(dmg.familyDrain - (mine.appliedDrain || 0))
          const fineDue = Math.floor(dmg.fine - (mine.appliedFine || 0))

          // The family goal bleeds while the mess sits there.
          if (drainDue > 0) {
            mine.appliedDrain = (mine.appliedDrain || 0) + drainDue
            let left = drainDue
            for (const g of d.familyGoals) {
              if (left <= 0) break
              if (g.achievedAt) continue
              const take = Math.min(g.progress, left)
              g.progress -= take
              left -= take
            }
          }

          // Fines come out of the offender and land in the pot.
          if (fineDue > 0) {
            mine.appliedFine = (mine.appliedFine || 0) + fineDue
            mine.pot = (mine.pot || 0) + fineDue
            const owner = mine.ownerId && d.members.find((m) => m.id === mine.ownerId)
            if (owner) owner.xp = Math.max(0, owner.xp - fineDue)
          }

          // Streak burns exactly once, when it first starts smoking.
          const stage = stageOf(mine, r, now)
          if (!mine.streakBurned && stageIndex(stage) >= stageIndex('smoking') && mine.ownerId) {
            mine.streakBurned = true
            const owner = d.members.find((m) => m.id === mine.ownerId)
            if (owner && owner.streak > 0) {
              logActivity(d, owner.id, `lost a ${owner.streak}-day streak to a landmine`, '🔥')
              owner.streak = 0
            }
          }
        }
      })
    },

    /* ───────────────────────── danger zone ───────────────────────── */

    async resetEverything() {
      clearState()
      await clearPhotos()
      setState(buildSeed())
      notify('Reset to the starter family', '♻️')
    },
  }

  const value = useMemo(() => api, [state, ready, toast, celebration, layout, layoutPref])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
