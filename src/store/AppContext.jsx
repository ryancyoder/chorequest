import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { buildSeed } from './seed.js'
import { loadState, saveState, clearState } from './storage.js'
import { hydratePhotos, clearPhotos } from '../lib/photos.js'
import { todayISO, addDays } from '../lib/date.js'
import { earnedBadges, streakMultiplier, levelFromXp } from '../lib/gamify.js'
import { useWideViewport, resolveLayout } from '../lib/layout.js'
import { ratesOf, stageOf, cumulativeDamage, stageIndex } from '../lib/landmines.js'
import {
  streakOf, isComeback, lastMilestoneHit, familyStreakTotal,
  XP_PER_DAY, XP_COMEBACK, XP_PER_CHEER, CHEERS_PER_DAY, cheersGivenToday, hasCheered,
} from '../lib/records.js'
import {
  buildCard, cardFor, weekStartOf, completedLines, isBlackout, REWARDS,
} from '../lib/bingo.js'
import {
  bossHp, isSlain, cumulativeHeal, lootSplit, damageBoard, hitFlavour,
  LAST_HIT_BONUS, DEFAULT_ENRAGE_HEAL,
} from '../lib/boss.js'

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
  tickRef.current = () => {
    api.tickLandmines()
    api.tickBoss()
    api.ensureBingoCards()
  }

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

  /**
   * Hand out XP inside an update draft, honouring the landmine freeze: a frozen
   * member's points go to escrow instead of vanishing. Personal-development
   * recognition always lands — only the points wait.
   */
  function awardXp(draft, memberId, amount, coins = 0) {
    if ((!amount || amount <= 0) && !coins) return
    const member = draft.members.find((m) => m.id === memberId)
    if (!member) return

    const frozen = draft.landmines.some(
      (lm) => lm.status === 'armed' && lm.ownerId === memberId && !lm.disputed,
    )
    if (frozen) {
      member.escrowXp = (member.escrowXp || 0) + Math.max(0, amount)
      member.escrowCoins = (member.escrowCoins || 0) + coins
      return
    }

    member.xp += Math.max(0, amount)
    member.coins += coins
    draft.familyGoals.forEach((g) => {
      if (g.achievedAt) return
      g.progress = Math.min(g.target, g.progress + Math.max(0, amount))
      if (g.progress >= g.target) g.achievedAt = Date.now()
    })
  }

  /**
   * Pay out any bingo lines this card has just completed.
   * `linesAwarded` is permanent, so unmarking a square can't re-sell a line.
   */
  function settleBingo(draft, card, memberId) {
    const fresh = completedLines(card).filter((l) => !card.linesAwarded.includes(l.key))
    let result = null

    if (fresh.length) {
      card.linesAwarded.push(...fresh.map((l) => l.key))
      const pts = REWARDS.linePoints * fresh.length
      const coins = REWARDS.lineCoins * fresh.length
      awardXp(draft, memberId, pts, coins)
      logActivity(draft, memberId, `got bingo — ${fresh.length} line${fresh.length > 1 ? 's' : ''}`, '🎱')
      result = { lines: fresh.length, pts, coins, blackout: false }
    }

    if (isBlackout(card) && !card.blackoutAwarded) {
      card.blackoutAwarded = true
      awardXp(draft, memberId, REWARDS.blackoutPoints, REWARDS.blackoutCoins)
      logActivity(draft, memberId, 'blacked out the whole bingo card', '🏆')
      result = {
        lines: result?.lines || 0,
        pts: (result?.pts || 0) + REWARDS.blackoutPoints,
        coins: (result?.coins || 0) + REWARDS.blackoutCoins,
        blackout: true,
      }
    }

    return result
  }

  /**
   * Tick off any square matching `matcher` on this week's card. Called from the
   * rest of the app so ordinary progress fills the board on its own.
   */
  function markBingo(draft, memberId, matcher) {
    const week = weekStartOf()
    const card = (draft.bingoCards || []).find(
      (c) => c.memberId === memberId && c.weekStartISO === week,
    )
    if (!card) return null

    let changed = false
    card.squares.forEach((sq) => {
      if (!sq.marked && matcher(sq)) {
        sq.marked = true
        sq.markedAt = Date.now()
        changed = true
      }
    })
    if (!changed) return null
    return settleBingo(draft, card, memberId)
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
          id: uid('e'),
          kind: 'repeat',           // 'repeat' | 'once'
          memberIds: [],            // empty = the whole family
          title: 'New event', emoji: '📌', category: 'other',
          days: [1], start: '16:00', end: '17:00',
          fromISO: null, untilISO: null,   // repeat bounds
          dateISO: null, endDateISO: null, // one-off span
          allDay: false, away: false, notes: '', duties: [],
          ...data,
        })
      })
      notify('Added to the calendar', '📅')
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

      let bingoResult = null

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

        // Ordinary progress fills the bingo card without anyone tapping anything.
        bingoResult = markBingo(d, mem.id, (sq) =>
          (sq.kind === 'chore' && sub.kind === 'chore' && sq.choreId === sub.targetId) ||
          (sq.kind === 'job' && sub.kind === 'job') ||
          (sq.kind === 'landmine' && sub.kind === 'landmine'),
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
      // The approval celebration owns the screen, so bingo speaks up via a toast.
      if (bingoResult) {
        setTimeout(() => {
          notify(
            bingoResult.blackout
              ? `BLACKOUT! +${bingoResult.pts} pts, ${bingoResult.coins} 🪙`
              : `BINGO — ${bingoResult.lines} line${bingoResult.lines > 1 ? 's' : ''}! +${bingoResult.pts} pts`,
            bingoResult.blackout ? '🏆' : '🎱',
          )
        }, 1200)
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

    /* ───────────────────────── ⚔️ boss battles ───────────────────────── */

    summonBoss({ name, emoji, blurb = '', attacks, pot = 0, deadlineAt = null, enrageHeal = DEFAULT_ENRAGE_HEAL, createdBy }) {
      let bossId = null
      update((d) => {
        bossId = uid('boss')
        d.bosses.unshift({
          id: bossId,
          name, emoji, blurb,
          maxHp: attacks.reduce((n, a) => n + a.damage, 0),
          attacks: attacks.map((a, i) => ({
            id: `atk_${i}_${Math.random().toString(36).slice(2, 7)}`,
            title: a.title, emoji: a.emoji, damage: a.damage, weakPoint: !!a.weakPoint,
            status: 'open',            // open | claimed | landed
            claimedBy: null, landedBy: null, landedAt: null, photoId: null,
          })),
          pot: Number(pot) || 0,
          healed: 0,
          enrageHeal,
          deadlineAt,
          status: 'alive',             // alive | slain | fled
          createdBy, createdAt: Date.now(),
          slainAt: null, slainBy: null,
        })
        logActivity(d, createdBy, `summoned ${name}`, '⚔️')
      })
      celebrate({
        emoji: emoji || '🐉',
        title: `${name} has appeared`,
        subtitle: 'Everyone to the garage. Attacks are on the board.',
      })
      return bossId
    },

    claimAttack(bossId, attackId, memberId) {
      const member = state.members.find((m) => m.id === memberId)
      update((d) => {
        const a = d.bosses.find((b) => b.id === bossId)?.attacks.find((x) => x.id === attackId)
        if (!a || a.status !== 'open') return
        a.status = 'claimed'
        a.claimedBy = memberId
      })
      notify(`${member?.name || 'You'} took it on`, '⚔️')
    },

    releaseAttack(bossId, attackId) {
      update((d) => {
        const a = d.bosses.find((b) => b.id === bossId)?.attacks.find((x) => x.id === attackId)
        if (!a || a.status !== 'claimed') return
        a.status = 'open'
        a.claimedBy = null
      })
    },

    /**
     * Land a hit. Damage applies straight away — a raid is a live event with a
     * parent in the room, and a review queue would kill it. Parents can undo.
     */
    landAttack(bossId, attackId, memberId, photoId = null) {
      const boss = state.bosses.find((b) => b.id === bossId)
      const attack = boss?.attacks.find((a) => a.id === attackId)
      const member = state.members.find((m) => m.id === memberId)
      if (!boss || !attack || attack.status === 'landed' || !member) return null

      // What the bar will read once this hit lands.
      const after = {
        ...boss,
        attacks: boss.attacks.map((a) => (a.id === attackId ? { ...a, status: 'landed', damage: attack.damage } : a)),
      }
      const newHp = bossHp(after)
      const slain = isSlain(after)
      const loot = slain ? lootSplit({ ...after, attacks: after.attacks.map((a) => a.id === attackId ? { ...a, landedBy: memberId } : a) }) : []
      const mvp = slain ? damageBoard({ ...after, attacks: after.attacks.map((a) => a.id === attackId ? { ...a, landedBy: memberId } : a) })[0] : null

      update((d) => {
        const b = d.bosses.find((x) => x.id === bossId)
        const a = b?.attacks.find((x) => x.id === attackId)
        if (!b || !a || a.status === 'landed') return

        a.status = 'landed'
        a.landedBy = memberId
        a.landedAt = Date.now()
        a.photoId = photoId
        a.claimedBy = memberId

        // Damage is the reward — a 70-damage job is worth 70 points.
        awardXp(d, memberId, a.damage)
        logActivity(d, memberId, `hit ${b.name} for ${a.damage}`, '⚔️')

        if (isSlain(b)) {
          b.status = 'slain'
          b.slainAt = Date.now()
          b.slainBy = memberId

          for (const share of loot) awardXp(d, share.memberId, 0, share.coins)
          if (b.pot > 0) awardXp(d, memberId, 0, LAST_HIT_BONUS)
          logActivity(d, memberId, `landed the killing blow on ${b.name}`, '🏆')
        }
      })

      if (slain) {
        celebrate({
          emoji: '🏆',
          title: `${boss.name} is DOWN`,
          subtitle: mvp
            ? `${member.name} landed the last hit. MVP: ${state.members.find((m) => m.id === mvp.memberId)?.name} with ${mvp.damage} damage.`
            : `${member.name} landed the last hit.`,
          color: member.color,
        })
      } else {
        notify(`${hitFlavour(attack.damage)} — ${attack.damage} damage! ${newHp} HP left`, '⚔️')
      }

      return { damage: attack.damage, hp: newHp, slain }
    },

    /** Parent undo — the hit never happened. */
    voidAttack(bossId, attackId, byMemberId) {
      update((d) => {
        const b = d.bosses.find((x) => x.id === bossId)
        const a = b?.attacks.find((x) => x.id === attackId)
        if (!b || !a || a.status !== 'landed') return
        const who = a.landedBy
        a.status = 'open'
        a.landedBy = null
        a.claimedBy = null
        a.landedAt = null
        // Take the points back off whoever claimed the hit.
        const m = d.members.find((x) => x.id === who)
        if (m) m.xp = Math.max(0, m.xp - a.damage)
        if (b.status === 'slain' && !isSlain(b)) {
          b.status = 'alive'
          b.slainAt = null
          b.slainBy = null
        }
        logActivity(d, byMemberId, `took back a hit on ${b.name}`, '↩️')
      })
      notify('Hit reversed', '↩️')
    },

    retreatBoss(bossId, byMemberId) {
      update((d) => {
        const b = d.bosses.find((x) => x.id === bossId)
        if (!b) return
        b.status = 'fled'
        b.slainAt = Date.now()
        logActivity(d, byMemberId, `called off ${b.name}`, '🏳️')
      })
      notify('Battle called off', '🏳️')
    },

    /** Past its deadline the boss heals — nothing motivates like losing ground. */
    tickBoss() {
      const live = (state.bosses || []).filter((b) => b.status === 'alive' && b.deadlineAt)
      if (!live.length) return
      const now = Date.now()
      const due = live.some((b) => cumulativeHeal(b, now) > (b.healed || 0))
      if (!due) return
      update((d) => {
        for (const b of d.bosses) {
          if (b.status !== 'alive' || !b.deadlineAt) continue
          const heal = cumulativeHeal(b, now)
          if (heal > (b.healed || 0)) b.healed = heal
        }
      })
    },

    /* ───────────────────────── 🎱 chore bingo ───────────────────────── */

    /**
     * Deal this week's cards. Done for everyone at boot rather than lazily on
     * first view — otherwise a chore approved before a kid opens their card has
     * nothing to mark, and the square silently never ticks.
     */
    ensureBingoCards() {
      const week = weekStartOf()
      const missing = state.members.filter((m) => !cardFor(state, m.id, week))
      if (!missing.length) return
      update((d) => {
        for (const m of d.members) {
          if (d.bingoCards.some((c) => c.memberId === m.id && c.weekStartISO === week)) continue
          d.bingoCards.push(buildCard(d, m.id, week))
        }
        // Keep a few weeks of history, not a year of it.
        d.bingoCards = d.bingoCards.slice(-28)
      })
    },

    /** Manual tick for the one-off squares. Tapping again unmarks it. */
    toggleBingoSquare(memberId, index) {
      const week = weekStartOf()
      let result = null
      update((d) => {
        const card = d.bingoCards.find((c) => c.memberId === memberId && c.weekStartISO === week)
        const sq = card?.squares[index]
        if (!card || !sq || sq.kind === 'free') return
        // Auto-marked squares are earned elsewhere — don't let a tap undo them.
        if (sq.marked && sq.kind !== 'task') return

        sq.marked = !sq.marked
        sq.markedAt = sq.marked ? Date.now() : null
        if (sq.marked) result = settleBingo(d, card, memberId)
      })

      if (result) {
        celebrate({
          emoji: result.blackout ? '🏆' : '🎱',
          title: result.blackout ? 'BLACKOUT!' : result.lines > 1 ? `${result.lines} lines at once!` : 'BINGO!',
          subtitle: result.blackout
            ? `The entire card. +${result.pts} points and ${result.coins} 🪙.`
            : `+${result.pts} points and ${result.coins} 🪙.`,
          color: state.members.find((m) => m.id === memberId)?.color,
        })
      }
      return result
    },

    newBingoCard(memberId) {
      const week = weekStartOf()
      update((d) => {
        d.bingoCards = d.bingoCards.filter((c) => !(c.memberId === memberId && c.weekStartISO === week))
        d.bingoCards.push(buildCard(d, memberId, week))
      })
      notify('Fresh card dealt', '🎱')
    },

    /* ───────────────────────── 🏅 personal records ───────────────────────── */

    addTrack({ memberId, kind, title, emoji }) {
      update((d) => {
        d.tracks.push({
          id: uid('tr'), memberId, kind, // 'virtue' | 'vice'
          title: title.trim(), emoji: emoji || (kind === 'vice' ? '🚫' : '⭐'),
          log: {},      // dateISO -> 'hit' | 'slip'
          paid: {},     // dateISO -> true, so undo/redo can't farm XP
          best: 0, bestAt: null,
          createdAt: Date.now(), archived: false,
        })
        logActivity(d, memberId, `started working on “${title.trim()}”`, kind === 'vice' ? '🚭' : '🌱')
      })
      notify(kind === 'vice' ? 'On the board. The family has your back.' : 'Track added — day one starts now.', '🏅')
    },

    updateTrack(id, patch) {
      update((d) => {
        const t = d.tracks.find((x) => x.id === id)
        if (t) Object.assign(t, patch)
      })
    },

    archiveTrack(id) {
      update((d) => {
        const t = d.tracks.find((x) => x.id === id)
        if (t) t.archived = true
      })
      notify('Retired — the record still stands', '🏅')
    },

    /**
     * Log a day on a track. `value` is 'hit', 'slip', or null to undo.
     * Everything downstream (streak, PR, comeback, family record) is derived
     * from the log rather than incremented, so undo/redo can't drift.
     */
    logTrackDay(trackId, dateISO, value) {
      const track = (state.tracks || []).find((t) => t.id === trackId)
      if (!track) return null

      const today = todayISO()
      const nextLog = { ...(track.log || {}) }
      if (value) nextLog[dateISO] = value
      else delete nextLog[dateISO]

      const nextStreak = streakOf({ ...track, log: nextLog }, today)
      const isPr = nextStreak > (track.best || 0)
      const comeback = value === 'hit' && isComeback({ ...track, log: nextLog }, dateISO)
      const milestone = isPr ? lastMilestoneHit(nextStreak) === nextStreak ? nextStreak : null : null
      const alreadyPaid = !!(track.paid || {})[dateISO]

      // Showing up pays a little; the PR itself pays the length of the record.
      let xp = 0
      if (value === 'hit' && !alreadyPaid) xp += XP_PER_DAY
      if (comeback && !alreadyPaid) xp += XP_COMEBACK
      if (isPr) xp += nextStreak

      const member = state.members.find((m) => m.id === track.memberId)
      const prevFamily = familyStreakTotal(state, today)

      update((d) => {
        const t = d.tracks.find((x) => x.id === trackId)
        const mem = d.members.find((x) => x.id === track.memberId)
        if (!t || !mem) return

        t.log = nextLog
        if (value === 'hit') t.paid = { ...(t.paid || {}), [dateISO]: true }
        if (isPr) {
          t.best = nextStreak
          t.bestAt = Date.now()
        }

        awardXp(d, mem.id, xp)

        if (isPr) {
          d.prs.unshift({
            id: uid('pr'),
            memberId: mem.id, trackId: t.id,
            title: t.title, emoji: t.emoji, kind: t.kind,
            value: nextStreak, milestone,
            at: Date.now(), cheers: [],
          })
          d.prs = d.prs.slice(0, 60)
          logActivity(d, mem.id, `set a personal record — ${nextStreak} on “${t.title}”`, '🏅')
        } else if (comeback) {
          // We announce getting back up. We never announce falling down.
          d.prs.unshift({
            id: uid('pr'),
            memberId: mem.id, trackId: t.id,
            title: t.title, emoji: t.emoji, kind: t.kind,
            value: nextStreak, comeback: true,
            at: Date.now(), cheers: [],
          })
          d.prs = d.prs.slice(0, 60)
          logActivity(d, mem.id, `got straight back on “${t.title}”`, '💪')
        }

        if (isPr) markBingo(d, mem.id, (sq) => sq.kind === 'record')

        // The household record — everyone's live streaks added together.
        const nowFamily = familyStreakTotal(d, today)
        d.familyRecord = d.familyRecord || { best: 0, bestAt: null }
        if (nowFamily > d.familyRecord.best) {
          d.familyRecord = { best: nowFamily, bestAt: Date.now() }
        }
      })

      const nowFamily = prevFamily - streakOf(track, today) + nextStreak
      const familyPr = nowFamily > (state.familyRecord?.best || 0)

      if (isPr) {
        celebrate({
          emoji: milestone ? '🏆' : '🏅',
          title: milestone ? `${milestone} days!` : `New personal record — ${nextStreak}`,
          subtitle: `${member?.name} just beat their own best on “${track.title}”.${familyPr ? ' And set a family record doing it.' : ''}`,
          color: member?.color,
        })
      } else if (comeback) {
        celebrate({
          emoji: '💪',
          title: 'Back on it',
          subtitle: `${member?.name} slipped yesterday and showed up anyway. That's the hard part.`,
          color: member?.color,
        })
      }

      return { streak: nextStreak, isPr, comeback, xp }
    },

    /** Anyone can cheer anyone. The cheerer gets the point — generosity pays. */
    cheerPr(prId, memberId) {
      const pr = (state.prs || []).find((p) => p.id === prId)
      if (!pr || hasCheered(pr, memberId)) return false
      if (cheersGivenToday(state, memberId) >= CHEERS_PER_DAY) {
        notify(`That's ${CHEERS_PER_DAY} cheers today — save some for tomorrow`, '📣')
        return false
      }
      update((d) => {
        const p = d.prs.find((x) => x.id === prId)
        if (!p || p.cheers.some((c) => c.memberId === memberId)) return
        p.cheers.push({ memberId, at: Date.now(), dateISO: todayISO() })
        awardXp(d, memberId, XP_PER_CHEER)
        markBingo(d, memberId, (sq) => sq.kind === 'cheer')
      })
      notify('Cheered 📣', '📣')
      return true
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
