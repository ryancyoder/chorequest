import { useState } from 'react'
import { useApp } from '../store/AppContext.jsx'
import { Ring, Empty, Sheet } from '../components/ui.jsx'
import ProofSheet from '../components/ProofSheet.jsx'
import {
  choresOn, choreSubmission, eventsOn, dayStats, memberProgress,
  STATUS_META, jobsFor, jobSubmission, pendingApprovals,
} from '../store/selectors.js'
import { todayISO, pretty12, relativeDay, timeOfDayBucket } from '../lib/date.js'
import { streakMultiplier } from '../lib/gamify.js'

const BUCKETS = [
  { key: 'morning', label: 'Morning', emoji: '🌅' },
  { key: 'afternoon', label: 'Afternoon', emoji: '☀️' },
  { key: 'evening', label: 'Evening', emoji: '🌙' },
  { key: 'anytime', label: 'Anytime', emoji: '✨' },
]

export default function Today({ go }) {
  const app = useApp()
  const { state } = app
  const me = app.currentMember
  const date = todayISO()
  const [proof, setProof] = useState(null) // {kind, target}
  const [confirmTask, setConfirmTask] = useState(null)

  const prog = memberProgress(me)
  const stats = dayStats(state, me.id, date)
  const chores = choresOn(state, me.id, date)
  const events = eventsOn(state, me.id, date)
  const myJobs = jobsFor(state, me.id)
  const mult = streakMultiplier(me.streak)
  const queue = pendingApprovals(state)

  function markDone(chore) {
    app.submitProof({ kind: 'chore', targetId: chore.id, memberId: me.id, dateISO: date })
    app.notify(`Sent to a parent for approval`, '⏳')
    setConfirmTask(null)
  }

  const grouped = BUCKETS.map((b) => ({
    ...b,
    items: chores.filter((c) => timeOfDayBucket(c.time) === b.key),
  })).filter((g) => g.items.length)

  const sections = buildSections({
    app, state, me, date, stats, chores, grouped, events, myJobs, queue, go, setProof, setConfirmTask,
  })

  return (
    <div className="screen" style={{ '--member': me.color }}>
      {/* ── hero ── */}
      <div className="hero">
        <div className="spread">
          <div className="row">
            <div className="bigface">{me.emoji}</div>
            <div>
              <div className="who">Hey {me.name}!</div>
              <div className="rank">
                {prog.rank.emoji} {prog.rank.name} · Level {prog.level}
              </div>
            </div>
          </div>
          <Ring pct={stats.pct} size={70} stroke={8} label={`${stats.done}/${stats.total}`} sub="TODAY" />
        </div>

        <div className="xpbar"><i style={{ width: `${prog.pct}%` }} /></div>
        <div className="xpmeta">
          <span>{prog.into} / {prog.need} XP</span>
          <span>{prog.need - prog.into} to level {prog.level + 1}</span>
        </div>

        <div className="pills">
          <span className="pill fire">🔥 {me.streak} <small>day streak</small></span>
          <span className="pill coin">🪙 {me.coins} <small>coins</small></span>
          {mult > 1 && <span className="pill" style={{ borderColor: 'var(--good)', color: 'var(--good)' }}>⚡ {mult}× <small>bonus</small></span>}
          <span className="pill">🏅 {me.badges.length} <small>badges</small></span>
        </div>
      </div>

      {sections.nudge}

      {/* Phone keeps its original top-to-bottom order; tablet splits the same
          blocks into two panes so the wide screen isn't one tall column. */}
      {app.layout === 'tablet' ? (
        <div className="cols">
          <div className="col">{sections.chores}</div>
          <div className="col">{sections.schedule}{sections.jobs}</div>
        </div>
      ) : (
        <>
          {sections.schedule}
          {sections.chores}
          {sections.jobs}
        </>
      )}

      {/* ── sheets ── */}
      {proof && (
        <ProofSheet
          open
          onClose={() => setProof(null)}
          kind={proof.kind}
          target={proof.target}
          member={me}
          dateISO={date}
        />
      )}

      <Sheet
        open={!!confirmTask}
        onClose={() => setConfirmTask(null)}
        title={confirmTask ? `${confirmTask.emoji} ${confirmTask.title}` : ''}
        lede="Mark this done and send it for a parent's OK?"
      >
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="spread">
            <span className="muted">Reward when approved</span>
            <span className="row">
              <span className="reward-chip">+{confirmTask?.points} pts</span>
              {confirmTask?.coins > 0 && <span className="reward-chip">🪙 {confirmTask.coins}</span>}
            </span>
          </div>
        </div>
        <button className="btn go xl wide" onClick={() => markDone(confirmTask)}>✅ Yep, it's done</button>
        <button className="btn ghost wide" style={{ marginTop: 8 }} onClick={() => setConfirmTask(null)}>Not yet</button>
      </Sheet>
    </div>
  )
}

/** The stackable pieces of the Today screen, so each layout can order them. */
function buildSections({ app, state, me, date, stats, chores, grouped, events, myJobs, queue, go, setProof, setConfirmTask }) {
  return {
    nudge: app.isParentMode && queue.length > 0 && (
        <div className="card tap glow" style={{ marginTop: 12 }} onClick={() => go('review')}>
          <div className="spread">
            <div className="row">
              <div className="task-ico" style={{ fontSize: 26 }}>📋</div>
              <div>
                <b>{queue.length} {queue.length === 1 ? 'job is' : 'jobs are'} waiting on you</b>
                <div className="tiny">AI checked them — you make the call</div>
              </div>
            </div>
            <span style={{ fontSize: 20 }}>›</span>
          </div>
        </div>
      ),

    chores: (
      <>
        <div className="section-title">
          🧹 Routine chores <span className="count">{stats.done}/{stats.total} done</span>
        </div>
        {chores.length === 0 ? (
          <Empty emoji="🎈" title="Nothing on the list today">Enjoy the day off.</Empty>
        ) : (
          grouped.map((g) => (
            <div key={g.key} style={{ marginBottom: 14 }}>
              <div className="tiny" style={{ margin: '10px 2px 7px' }}>{g.emoji} {g.label.toUpperCase()}</div>
              <div className="stack">
                {g.items.map((c) => (
                  <ChoreRow
                    key={c.id}
                    chore={c}
                    sub={choreSubmission(state, c.id, date)}
                    color={me.color}
                    onPhoto={() => setProof({ kind: 'chore', target: c })}
                    onQuick={() => setConfirmTask(c)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </>
    ),

    schedule: events.length > 0 && (
      <>
        <div className="section-title">📅 {relativeDay(date)}'s schedule</div>
        <div className="stack">
          {events.map((e) => (
            <div key={e.id} className={`task evt ${e.category}`} style={{ borderLeftColor: 'var(--c)' }}>
              <div className="ico">{e.emoji}</div>
              <div className="grow">
                <div className="ttl">{e.title}</div>
                <div className="sub">{pretty12(e.start)}{e.end ? ` – ${pretty12(e.end)}` : ''}</div>
              </div>
            </div>
          ))}
        </div>
      </>
    ),

    jobs: myJobs.length > 0 && (
      <>
        <div className="section-title">🎯 Add-on jobs you claimed <span className="count">{myJobs.length}</span></div>
        <div className="stack">
          {myJobs.map((j) => {
            const sub = jobSubmission(state, j.id)
            const meta = sub ? STATUS_META[sub.status] : null
            return (
              <div key={j.id} className="task" style={{ borderLeftColor: 'var(--gold)' }}>
                <div className="ico">🎯</div>
                <div className="grow">
                  <div className="ttl">{j.title}</div>
                  <div className="sub">
                    <span className="reward-chip">+{j.points} pts</span>
                    {j.coins > 0 && <span className="reward-chip">🪙 {j.coins}</span>}
                    {meta && <span className={`badge-status ${meta.tone}`}>{meta.emoji} {meta.label}</span>}
                  </div>
                </div>
                {(!sub || sub.status === 'ai_rejected' || sub.status === 'rejected') && (
                  <button className="btn primary sm" onClick={() => setProof({ kind: 'job', target: j })}>
                    {sub ? 'Retry' : 'Finish'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </>
    ),
  }
}

function ChoreRow({ chore, sub, color, onPhoto, onQuick }) {
  const status = sub?.status
  const meta = status ? STATUS_META[status] : null
  const done = status === 'approved'
  const locked = status === 'pending' || status === 'ai_checking'

  return (
    <div className={`task ${done ? 'done' : ''}`} style={{ borderLeftColor: color }}>
      <div className="ico">{chore.emoji}</div>
      <div className="grow">
        <div className="ttl">{chore.title}</div>
        <div className="sub">
          {chore.time && <span>⏰ {pretty12(chore.time)}</span>}
          {chore.room && <span>📍 {chore.room}</span>}
          <span className="reward-chip">+{chore.points}</span>
          {chore.needsPhoto && <span>📸</span>}
          {meta && <span className={`badge-status ${meta.tone}`}>{meta.emoji} {meta.label}</span>}
        </div>
        {status === 'rejected' && sub.reviewNote && (
          <div className="tiny" style={{ color: 'var(--bad)', marginTop: 5 }}>“{sub.reviewNote}”</div>
        )}
        {status === 'ai_rejected' && sub.ai?.detail && (
          <div className="tiny" style={{ color: 'var(--warn)', marginTop: 5 }}>{sub.ai.detail}</div>
        )}
      </div>

      {done ? (
        <span style={{ fontSize: 22 }}>🎉</span>
      ) : locked ? (
        <span style={{ fontSize: 20, opacity: .6 }}>⏳</span>
      ) : chore.needsPhoto ? (
        <button className="btn primary sm" onClick={onPhoto}>
          {status ? '🔁' : '📸'}
        </button>
      ) : (
        <button className="btn go sm" onClick={onQuick}>Done</button>
      )}
    </div>
  )
}
