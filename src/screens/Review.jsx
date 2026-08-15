import { useState } from 'react'
import { useApp } from '../store/AppContext.jsx'
import { Empty, Sheet } from '../components/ui.jsx'
import { photoUrl } from '../lib/photos.js'
import { byId, pendingApprovals, submissionTitle, submissionEmoji } from '../store/selectors.js'
import { relativeDay } from '../lib/date.js'
import { timeAgo } from '../components/ui.jsx'
import ParentGate from '../components/ParentGate.jsx'
import { StarQueue } from '../components/KindnessWall.jsx'

export default function Review() {
  const app = useApp()
  const { state } = app
  const [open, setOpen] = useState(null)

  if (!app.isParentMode) return <ParentGate />

  const queue = pendingApprovals(state)
  const recent = state.submissions
    .filter((s) => s.status === 'approved' || s.status === 'rejected')
    .sort((a, b) => (b.decidedAt || 0) - (a.decidedAt || 0))
    .slice(0, 8)

  return (
    <div className="screen">
      <div className="spread" style={{ margin: '4px 0 4px' }}>
        <div>
          <h1 style={{ fontSize: 26 }}>Review</h1>
          <p className="muted" style={{ margin: 0 }}>AI passed these. Final call is yours.</p>
        </div>
        {queue.length > 0 && <span className="pill" style={{ borderColor: 'var(--bad)' }}>{queue.length} waiting</span>}
      </div>

      <div className="cols">
      <div className="col">

      <div className="section-title">⏳ Needs your OK <span className="count">{queue.length}</span></div>

      {queue.length === 0 ? (
        <Empty emoji="🛋️" title="Inbox zero">Nothing to review right now.</Empty>
      ) : (
        <div className="stack">
          {queue.map((s) => {
            const kid = byId(state.members, s.memberId)
            const photo = photoUrl(s.photoId)
            return (
              <div key={s.id} className="card tap" style={{ '--member': kid?.color, borderLeft: `4px solid ${kid?.color}` }} onClick={() => setOpen(s)}>
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  {photo ? (
                    <img src={photo} alt="" style={{ width: 68, height: 68, borderRadius: 14, objectFit: 'cover', flex: '0 0 auto' }} />
                  ) : (
                    <div style={{ width: 68, height: 68, borderRadius: 14, display: 'grid', placeItems: 'center', fontSize: 28, background: 'rgba(0,0,0,.3)', border: '1px solid var(--line)', flex: '0 0 auto' }}>
                      {submissionEmoji(state, s)}
                    </div>
                  )}
                  <div className="grow">
                    <div className="row" style={{ gap: 6 }}>
                      <span style={{ fontSize: 17 }}>{kid?.emoji}</span>
                      <b>{kid?.name}</b>
                      <span className="tiny">{timeAgo(s.createdAt)}</span>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 15, marginTop: 3 }}>{submissionTitle(state, s)}</div>
                    <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                      <span className="reward-chip">+{s.points} pts</span>
                      {s.coins > 0 && <span className="reward-chip">🪙 {s.coins}</span>}
                      {s.ai?.score != null ? (
                        <span className={`badge-status ${s.ai.score >= 85 ? 'good' : 'info'}`}>🤖 {s.ai.score}% match</span>
                      ) : s.ai ? (
                        <span className="badge-status warn">🤖 no standard photo set</span>
                      ) : (
                        <span className="badge-status info">✋ marked done</span>
                      )}
                      {s.attempts > 1 && <span className="badge-status warn">attempt {s.attempts}</span>}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      </div>
      <div className="col">

      <StarQueue />

      {recent.length > 0 && (
        <>
          <div className="section-title">🕓 Recently decided</div>
          <div className="card">
            <div className="feed">
              {recent.map((s) => {
                const kid = byId(state.members, s.memberId)
                return (
                  <div className="feeditem" key={s.id}>
                    <span className="e">{s.status === 'approved' ? '✅' : '↩️'}</span>
                    <span className="grow">
                      <b>{kid?.name}</b> · {submissionTitle(state, s)}
                    </span>
                    <span className="t">{s.decidedAt ? timeAgo(s.decidedAt) : ''}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      </div>
      </div>

      <ReviewSheet sub={open} onClose={() => setOpen(null)} />
    </div>
  )
}

function ReviewSheet({ sub, onClose }) {
  const app = useApp()
  const { state } = app
  const [note, setNote] = useState('')
  const [bonus, setBonus] = useState(0)

  if (!sub) return null
  const kid = byId(state.members, sub.memberId)
  const target = sub.kind === 'chore'
    ? byId(state.chores, sub.targetId)
    : byId(state.jobs, sub.targetId)
  const proof = photoUrl(sub.photoId)
  const reference = photoUrl(target?.referencePhotoId)

  function approve() {
    app.approveSubmission(sub.id, app.currentMember.id, bonus)
    setNote(''); setBonus(0)
    onClose()
  }

  function reject() {
    app.rejectSubmission(sub.id, app.currentMember.id, note.trim() || 'Needs another pass')
    setNote(''); setBonus(0)
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={`${submissionEmoji(state, sub)} ${submissionTitle(state, sub)}`}
      lede={`${kid?.name} · submitted ${timeAgo(sub.createdAt)}${sub.attempts > 1 ? ` · attempt ${sub.attempts}` : ''}`}>

      {(proof || reference) && (
        <div className="photo-pair" style={{ marginBottom: 14 }}>
          <figure>
            <figcaption>The standard</figcaption>
            {reference ? <img src={reference} alt="Standard" /> : <div className="emptyphoto">None set</div>}
          </figure>
          <figure>
            <figcaption>{kid?.name}'s photo</figcaption>
            {proof ? <img src={proof} alt="Proof" /> : <div className="emptyphoto">No photo required</div>}
          </figure>
        </div>
      )}

      {sub.ai ? (
        <div className={`verdict ${sub.ai.pass ? 'pass' : 'fail'}`} style={{ marginBottom: 12 }}>
          <div className="row" style={{ justifyContent: 'center', gap: 12 }}>
            <span style={{ fontSize: 30 }}>🤖</span>
            {sub.ai.score != null && (
              <span className="scoredial" style={{ color: sub.ai.pass ? 'var(--good)' : 'var(--warn)' }}>
                {sub.ai.score}<small>/100</small>
              </span>
            )}
          </div>
          <p style={{ marginTop: 8 }}>{sub.ai.detail}</p>
        </div>
      ) : (
        <div className="warnbox" style={{ marginBottom: 12 }}>
          No photo needed for this one — {kid?.name} marked it done.
        </div>
      )}

      {sub.ai?.signals?.length > 0 && (
        <div className="signals" style={{ marginBottom: 14 }}>
          {sub.ai.signals.map((s) => (
            <div className="signal" key={s.label}>
              <span style={{ color: 'var(--ink-dim)' }}>{s.label}</span>
              <span className="track"><i style={{ width: `${s.value}%` }} /></span>
              <span style={{ textAlign: 'right' }}>{s.value}%</span>
            </div>
          ))}
        </div>
      )}

      {target?.checklist?.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="tiny" style={{ marginBottom: 6 }}>YOUR CHECKLIST</div>
          {target.checklist.map((c, i) => (
            <div key={i} className="row" style={{ fontSize: 13, fontWeight: 700, padding: '3px 0' }}>
              <span>☐</span><span>{c}</span>
            </div>
          ))}
        </div>
      )}

      {sub.note && <div className="card" style={{ marginBottom: 14 }}>💬 “{sub.note}”</div>}

      <div className="spread" style={{ marginBottom: 12 }}>
        <span className="muted">Bonus points for going above and beyond</span>
        <div className="chipgroup">
          {[0, 5, 10, 25].map((b) => (
            <button key={b} className={`chip ${bonus === b ? 'on' : ''}`} onClick={() => setBonus(b)}>
              {b === 0 ? 'none' : `+${b}`}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span>Note if you're sending it back</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Under the bed still needs a pass" />
      </label>

      <div className="row">
        <button className="btn go xl grow" onClick={approve}>
          ✅ Approve · +{sub.points + bonus}
        </button>
        <button className="btn no xl" onClick={reject}>↩️ Send back</button>
      </div>
    </Sheet>
  )
}
