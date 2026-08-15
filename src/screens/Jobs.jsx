import { useState } from 'react'
import { useApp } from '../store/AppContext.jsx'
import { Sheet, Empty, DangerButton } from '../components/ui.jsx'
import CameraCapture from '../components/CameraCapture.jsx'
import DictationField from '../components/DictationField.jsx'
import ProofSheet from '../components/ProofSheet.jsx'
import { jobSubmission, STATUS_META, byId } from '../store/selectors.js'
import { putPhoto, photoUrl } from '../lib/photos.js'
import { parseSpokenJob } from '../lib/dictation.js'
import { todayISO, addDays, relativeDay, dueLabel, daysBetween } from '../lib/date.js'

const FILTERS = [
  { key: 'open', label: '🟢 Up for grabs' },
  { key: 'mine', label: '🙋 Mine' },
  { key: 'all', label: '📋 All' },
]

export default function Jobs() {
  const app = useApp()
  const { state } = app
  const me = app.currentMember
  const [filter, setFilter] = useState('open')
  const [adding, setAdding] = useState(false)
  const [detail, setDetail] = useState(null)
  const [proof, setProof] = useState(null)

  const list = state.jobs.filter((j) => {
    if (filter === 'open') return j.status === 'open'
    if (filter === 'mine') return j.claimedBy === me.id
    return true
  })

  return (
    <div className="screen" style={{ '--member': me.color }}>
      <div className="spread" style={{ margin: '4px 0 4px' }}>
        <div>
          <h1 style={{ fontSize: 26 }}>Job Board</h1>
          <p className="muted" style={{ margin: 0 }}>Extra jobs, extra points. First to claim it owns it.</p>
        </div>
      </div>

      <div className="tabbar" style={{ marginTop: 12 }}>
        {FILTERS.map((f) => (
          <button key={f.key} className={filter === f.key ? 'on' : ''} onClick={() => setFilter(f.key)}>{f.label}</button>
        ))}
      </div>

      <div className="stack" style={{ marginTop: 14 }}>
        {list.length === 0 && (
          <Empty emoji="🗒️" title="No jobs here">
            {filter === 'open' ? 'Everything on the board has been claimed.' : 'Claim one from the board to get started.'}
          </Empty>
        )}

        {list.map((j) => {
          const claimer = byId(state.members, j.claimedBy)
          const sub = jobSubmission(state, j.id)
          const meta = sub ? STATUS_META[sub.status] : null
          const overdue = j.dueISO && daysBetween(todayISO(), j.dueISO) < 0 && j.status !== 'done'
          const pic = photoUrl(j.photoId)

          return (
            <div
              key={j.id}
              className="card tap"
              style={{ borderLeft: `4px solid ${j.urgent ? 'var(--bad)' : 'var(--gold)'}` }}
              onClick={() => setDetail(j)}
            >
              <div className="row" style={{ alignItems: 'flex-start' }}>
                {pic ? (
                  <img src={pic} alt="" style={{ width: 62, height: 62, borderRadius: 14, objectFit: 'cover', flex: '0 0 auto' }} />
                ) : (
                  <div className="ico" style={{ width: 62, height: 62, borderRadius: 14, display: 'grid', placeItems: 'center', fontSize: 26, background: 'rgba(0,0,0,.3)', border: '1px solid var(--line)', flex: '0 0 auto' }}>
                    {j.urgent ? '🚨' : '🎯'}
                  </div>
                )}
                <div className="grow">
                  <div className="row" style={{ gap: 6 }}>
                    {j.urgent && <span className="badge-status bad">🚨 Urgent</span>}
                    {j.status === 'done' && <span className="badge-status good">✅ Done</span>}
                    {meta && j.status !== 'done' && <span className={`badge-status ${meta.tone}`}>{meta.emoji} {meta.label}</span>}
                  </div>
                  <div className="ttl" style={{ fontWeight: 800, fontSize: 15.5, marginTop: 3 }}>{j.title}</div>
                  <div className="sub" style={{ fontSize: 11.5, color: 'var(--ink-faint)', fontWeight: 700, marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span className="reward-chip">+{j.points} pts</span>
                    {j.coins > 0 && <span className="reward-chip">🪙 {j.coins}</span>}
                    {j.dueISO && <span style={{ color: overdue ? 'var(--bad)' : undefined }}>📅 {overdue ? 'overdue' : dueLabel(j.dueISO)}</span>}
                    {claimer && <span>{claimer.emoji} {claimer.name}</span>}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {app.isParentMode && <button className="fab" onClick={() => setAdding(true)}>＋</button>}

      {/* ── job detail ── */}
      <Sheet open={!!detail} onClose={() => setDetail(null)} title={detail ? `🎯 ${detail.title}` : ''}>
        {detail && <JobDetail
          job={detail}
          me={me}
          app={app}
          onProof={() => { setProof(detail); setDetail(null) }}
          onClose={() => setDetail(null)}
        />}
      </Sheet>

      {/* ── quick add ── */}
      <QuickAddJob open={adding} onClose={() => setAdding(false)} app={app} />

      {proof && (
        <ProofSheet open onClose={() => setProof(null)} kind="job" target={proof} member={me} dateISO={todayISO()} />
      )}
    </div>
  )
}

function JobDetail({ job, me, app, onProof, onClose }) {
  const pic = photoUrl(job.photoId)
  const ref = photoUrl(job.referencePhotoId)
  const claimer = byId(app.state.members, job.claimedBy)
  const sub = jobSubmission(app.state, job.id)
  const mine = job.claimedBy === me.id

  return (
    <>
      {(pic || ref) && (
        <div className="photo-pair" style={{ marginBottom: 14 }}>
          {pic && <figure><figcaption>The job</figcaption><img src={pic} alt="Job" /></figure>}
          {ref && <figure><figcaption>Done looks like</figcaption><img src={ref} alt="Standard" /></figure>}
        </div>
      )}

      {job.notes && <p className="muted" style={{ marginTop: 0 }}>{job.notes}</p>}

      <div className="row wrap" style={{ margin: '12px 0' }}>
        <span className="pill">⭐ {job.points} <small>points</small></span>
        {job.coins > 0 && <span className="pill coin">🪙 {job.coins} <small>coins</small></span>}
        {job.dueISO && <span className="pill">📅 <small>{relativeDay(job.dueISO)}</small></span>}
        {claimer && <span className="pill">{claimer.emoji} <small>{claimer.name}</small></span>}
      </div>

      {sub?.status === 'ai_rejected' && (
        <div className="warnbox" style={{ marginBottom: 12 }}>🔁 {sub.ai?.detail}</div>
      )}
      {sub?.status === 'rejected' && sub.reviewNote && (
        <div className="warnbox" style={{ marginBottom: 12 }}>↩️ Sent back: “{sub.reviewNote}”</div>
      )}

      <div className="stack">
        {job.status === 'open' && me.role === 'child' && (
          <button className="btn go xl wide" onClick={() => { app.claimJob(job.id, me.id); onClose() }}>
            🙋 Claim this job
          </button>
        )}
        {job.status === 'open' && me.role === 'parent' && (
          <p className="muted center">Waiting for one of the kids to claim it.</p>
        )}
        {mine && job.status !== 'done' && sub?.status !== 'pending' && (
          <button className="btn primary xl wide" onClick={onProof}>📸 I finished it</button>
        )}
        {mine && sub?.status === 'pending' && (
          <div className="card center"><b>⏳ Waiting on a parent to approve it</b></div>
        )}
        {mine && job.status !== 'done' && (
          <button className="btn ghost wide" onClick={() => { app.releaseJob(job.id); onClose() }}>Put it back on the board</button>
        )}
        {app.isParentMode && (
          <DangerButton className="btn no wide" onConfirm={() => { app.removeJob(job.id); onClose() }}>
            Delete this job
          </DangerButton>
        )}
      </div>
    </>
  )
}

/* ─────────────────── quick add: snap + dictate ─────────────────── */

function QuickAddJob({ open, onClose, app }) {
  const [photo, setPhoto] = useState(null)
  const [standard, setStandard] = useState(null)
  const [spoken, setSpoken] = useState('')
  const [title, setTitle] = useState('')
  const [points, setPoints] = useState(25)
  const [coins, setCoins] = useState(5)
  const [due, setDue] = useState(addDays(todayISO(), 2))
  const [urgent, setUrgent] = useState(false)
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  function reset() {
    setPhoto(null); setStandard(null); setSpoken(''); setTitle('')
    setPoints(25); setCoins(5); setDue(addDays(todayISO(), 2)); setUrgent(false); setStep(0)
  }

  function close() { reset(); onClose() }

  /** Pull points / due date / urgency out of what was said. */
  function applySpoken(text) {
    const parsed = parseSpokenJob(text)
    if (parsed.title) setTitle(parsed.title)
    if (parsed.points) setPoints(parsed.points)
    if (parsed.coins) setCoins(parsed.coins)
    if (parsed.urgent) setUrgent(true)
    if (parsed.due === 'today') setDue(todayISO())
    else if (parsed.due === 'tomorrow') setDue(addDays(todayISO(), 1))
    else if (parsed.due) {
      const idx = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(parsed.due)
      if (idx >= 0) {
        let d = todayISO()
        for (let i = 1; i <= 7; i++) {
          const cand = addDays(d, i)
          if (new Date(cand + 'T00:00:00').getDay() === idx) { setDue(cand); break }
        }
      }
    }
  }

  async function save() {
    setSaving(true)
    const photoId = photo ? await putPhoto(photo) : null
    const referencePhotoId = standard ? await putPhoto(standard) : null
    app.addJob({
      title: title.trim() || 'New job',
      notes: spoken.trim() !== title.trim() ? spoken.trim() : '',
      photoId, referencePhotoId,
      points: Number(points) || 10,
      coins: Number(coins) || 0,
      dueISO: due,
      urgent,
    })
    setSaving(false)
    close()
  }

  return (
    <Sheet open={open} onClose={close} title="Post a job" lede="Snap it, say it, done.">
      <div className="tabbar" style={{ marginBottom: 14 }}>
        <button className={step === 0 ? 'on' : ''} onClick={() => setStep(0)}>1 · Snap</button>
        <button className={step === 1 ? 'on' : ''} onClick={() => setStep(1)}>2 · Say it</button>
        <button className={step === 2 ? 'on' : ''} onClick={() => setStep(2)}>3 · Reward</button>
      </div>

      {step === 0 && (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            Take a photo of what needs doing. Optional, but it saves a lot of “which shelf?”
          </p>
          <CameraCapture value={photo} onChange={setPhoto} hint="Snap the mess" />
          <div className="divider" />
          <div className="tiny" style={{ marginBottom: 8 }}>OPTIONAL · SET THE “FINISHED” STANDARD</div>
          <p className="muted" style={{ marginTop: 0 }}>
            Add a photo of what done should look like and the AI will check their proof against it.
          </p>
          {standard
            ? <div className="camwrap" style={{ marginBottom: 8 }}><img src={standard} alt="Standard" /></div>
            : null}
          <CameraCapture value={standard} onChange={setStandard} compact hint="What done looks like" />
          <button className="btn primary xl wide" style={{ marginTop: 14 }} onClick={() => setStep(1)}>Next</button>
        </>
      )}

      {step === 1 && (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            Tap the mic and describe it. Try: <i>“Sweep the garage, worth 60 points, due Saturday.”</i>
          </p>
          <DictationField
            value={spoken}
            onChange={setSpoken}
            onFinalTranscript={applySpoken}
            rows={4}
            placeholder="Hold the mic and talk, or just type…"
          />
          <button className="btn sm" style={{ marginTop: 8 }} onClick={() => applySpoken(spoken)} disabled={!spoken.trim()}>
            ✨ Pull out the details
          </button>

          <label className="field" style={{ marginTop: 16 }}>
            <span>Job title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sweep out the garage" />
          </label>

          <button className="btn primary xl wide" onClick={() => setStep(2)} disabled={!title.trim()}>Next</button>
        </>
      )}

      {step === 2 && (
        <>
          <div className="row">
            <label className="field grow">
              <span>Points</span>
              <input type="number" min="0" value={points} onChange={(e) => setPoints(e.target.value)} />
            </label>
            <label className="field grow">
              <span>Coins</span>
              <input type="number" min="0" value={coins} onChange={(e) => setCoins(e.target.value)} />
            </label>
          </div>

          <label className="field">
            <span>Due by</span>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>

          <button className={`chip ${urgent ? 'on' : ''}`} style={{ marginBottom: 16 }} onClick={() => setUrgent(!urgent)}>
            🚨 Mark urgent
          </button>

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="tiny" style={{ marginBottom: 6 }}>PREVIEW</div>
            <b>{title || 'Untitled job'}</b>
            <div className="row wrap" style={{ marginTop: 8, gap: 6 }}>
              <span className="reward-chip">+{points} pts</span>
              {coins > 0 && <span className="reward-chip">🪙 {coins}</span>}
              <span className="chip" style={{ fontSize: 11 }}>📅 {relativeDay(due)}</span>
              {photo && <span className="chip" style={{ fontSize: 11 }}>📸 photo</span>}
              {standard && <span className="chip" style={{ fontSize: 11 }}>🤖 AI check on</span>}
            </div>
          </div>

          <button className="btn go xl wide" onClick={save} disabled={!title.trim() || saving}>
            {saving ? 'Posting…' : '🎯 Post it to the board'}
          </button>
        </>
      )}
    </Sheet>
  )
}
