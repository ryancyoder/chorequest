import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { buildSeed } from './seed.js'
import { loadState, saveState, clearState } from './storage.js'
import { hydratePhotos, clearPhotos } from '../lib/photos.js'
import { todayISO, addDays } from '../lib/date.js'
import { earnedBadges, streakMultiplier, levelFromXp } from '../lib/gamify.js'
import { useWideViewport, resolveLayout } from '../lib/layout.js'

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
        const target = kind === 'chore'
          ? d.chores.find((c) => c.id === targetId)
          : d.jobs.find((j) => j.id === targetId)

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

      const t = todayISO()
      const mult = streakMultiplier(m.streak)
      const gained = Math.round((s.points + bonus) * mult)

      // Streak: consecutive days with at least one approval.
      const nextStreak = m.lastDoneISO === t
        ? m.streak
        : m.lastDoneISO === addDays(t, -1) ? m.streak + 1 : 1

      const nextXp = m.xp + gained
      const nextCoins = m.coins + s.coins
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

      const goalHit = state.familyGoals.find(
        (g) => !g.achievedAt && g.progress < g.target && g.progress + gained >= g.target,
      )
      const title = s.kind === 'chore'
        ? state.chores.find((c) => c.id === s.targetId)?.title
        : state.jobs.find((j) => j.id === s.targetId)?.title

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

        sub.status = 'approved'
        sub.reviewedBy = byMemberId
        sub.decidedAt = Date.now()

        if (sub.kind === 'job') {
          const j = d.jobs.find((x) => x.id === sub.targetId)
          if (j) j.status = 'done'
        }

        // Family goals move on every approval — that's the shared pot.
        d.familyGoals.forEach((g) => {
          if (g.achievedAt) return
          g.progress = Math.min(g.target, g.progress + gained)
          if (g.progress >= g.target) g.achievedAt = Date.now()
        })

        logActivity(d, mem.id, `earned ${gained} pts for ${title || 'a task'}`, '⭐')
      })

      const payload = {
        name: m.name, emoji: m.emoji, color: m.color, gained, coins: s.coins,
        leveledUp: afterLevel > beforeLevel, level: afterLevel, mult,
        newBadges: fresh, goalHit,
      }

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
