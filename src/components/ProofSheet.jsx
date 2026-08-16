import { useState } from 'react'
import { Sheet, Confetti } from './ui.jsx'
import CameraCapture from './CameraCapture.jsx'
import { useApp } from '../store/AppContext.jsx'
import { checkCompletionPhoto } from '../lib/ai.js'
import { putPhoto, photoUrl } from '../lib/photos.js'

/**
 * The kid-side "I finished it" flow:
 *   photo → AI compares it to the parent's finished-standard → pass parks it in
 *   the parent review queue, fail bounces it back with a reason.
 */
export default function ProofSheet({ open, onClose, kind, target, member, dateISO }) {
  const app = useApp()
  const [photo, setPhoto] = useState(null)
  const [step, setStep] = useState('shoot') // shoot | checking | result
  const [verdict, setVerdict] = useState(null)
  const [note, setNote] = useState('')
  const reference = target ? photoUrl(target.referencePhotoId) : null

  function reset() {
    setPhoto(null)
    setVerdict(null)
    setNote('')
    setStep('shoot')
  }

  function close() {
    reset()
    onClose()
  }

  async function runCheck() {
    setStep('checking')
    let result
    try {
      result = await checkCompletionPhoto({
        referencePhoto: reference,
        submittedPhoto: photo,
        title: target.title,
        checklist: target.checklist || [],
        sensitivity: app.state.settings.aiSensitivity || 'normal',
        endpoint: app.state.settings.photoCheckUrl || null,
      })
    } catch (err) {
      result = {
        pass: true, score: null, headline: 'Could not run the photo check',
        detail: `${err.message}. Sending it to a parent to look at directly.`,
        regions: [], signals: [], checklist: target.checklist || [], errored: true,
      }
    }
    // Small beat so the scanner animation reads as "thinking" rather than a flash.
    await new Promise((r) => setTimeout(r, 900))
    setVerdict(result)
    setStep('result')

    if (result.pass) {
      const photoId = await putPhoto(photo)
      app.submitProof({ kind, targetId: target.id, memberId: member.id, dateISO, photoId, ai: result, note })
    } else {
      app.submitProof({ kind, targetId: target.id, memberId: member.id, dateISO, photoId: null, ai: result, note })
    }
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title={step === 'result' ? '' : `${target?.emoji || '🎯'} ${target?.title || ''}`}
      lede={step === 'shoot' ? 'Take a photo of the finished job so the AI can check it.' : ''}
    >
      {step === 'shoot' && (
        <>
          {target?.checklist?.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="tiny" style={{ marginBottom: 6 }}>WHAT COUNTS AS DONE</div>
              {target.checklist.map((c, i) => (
                <div key={i} className="row" style={{ fontSize: 13, fontWeight: 700, padding: '3px 0' }}>
                  <span>✓</span><span>{c}</span>
                </div>
              ))}
            </div>
          )}

          {reference ? (
            <div className="photo-pair" style={{ marginBottom: 14 }}>
              <figure>
                <figcaption>The standard</figcaption>
                <img src={reference} alt="Finished standard" />
              </figure>
              <figure>
                <figcaption>Your photo</figcaption>
                {photo ? <img src={photo} alt="Your proof" /> : <div className="emptyphoto">Shoot from the same angle</div>}
              </figure>
            </div>
          ) : (
            <div className="warnbox" style={{ marginBottom: 12 }}>
              No “finished” photo saved for this one yet, so a parent will review your photo directly.
            </div>
          )}

          <CameraCapture
            value={photo}
            onChange={setPhoto}
            hint="Match the angle of the example photo"
            ghost={reference}
            ghostLabel="the finished photo"
          />

          <label className="field" style={{ marginTop: 14 }}>
            <span>Anything to add? (optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. the vacuum bag was full" />
          </label>

          <button className="btn go xl wide" disabled={!photo} onClick={runCheck}>
            🤖 Run the AI check
          </button>
        </>
      )}

      {step === 'checking' && (
        <div className="thinking">
          <div className="scanner">🔍</div>
          <h3 style={{ marginTop: 16 }}>Comparing your photo…</h3>
          <p className="muted center" style={{ maxWidth: 280 }}>
            {app.state.settings.photoCheckUrl
              ? 'Looking at both photos against what counts as done.'
              : 'Checking it against the finished standard on this device.'}
          </p>
        </div>
      )}

      {step === 'result' && verdict && (
        <>
          {verdict.pass && <Confetti count={44} />}
          <div className={`verdict ${verdict.pass ? 'pass' : 'fail'}`}>
            <div className="big">{verdict.pass ? '✅' : '🔁'}</div>
            <h3>{verdict.headline}</h3>
            {verdict.findings?.length > 0 && (
              <div className="scoredial" style={{ color: verdict.pass ? 'var(--good)' : 'var(--warn)' }}>
                {verdict.findings.length}<small> {verdict.findings.length === 1 ? 'thing' : 'things'} found</small>
              </div>
            )}
            <p>{verdict.detail}</p>
          </div>

          {/* The point of the service: your checklist, answered item by item. */}
          {verdict.checklistResults?.length > 0 && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="tiny" style={{ marginBottom: 8 }}>YOUR CHECKLIST</div>
              {verdict.checklistResults.map((c, i) => (
                <div key={i} className="row" style={{ alignItems: 'flex-start', padding: '5px 0' }}>
                  <span style={{ fontSize: 15 }}>{c.ok ? '✅' : '❌'}</span>
                  <div className="grow">
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{c.item}</div>
                    {c.why && <div className="tiny" style={{ marginTop: 2 }}>{c.why}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Anything not stamped by the service was judged on the device —
              safer to test for the positive case than to rely on every local
              return path remembering to label itself. */}
          {verdict.engine !== 'claude' && app.state.settings.photoCheckUrl && (
            <div className="warnbox" style={{ marginTop: 12 }}>
              Couldn't reach the checking service, so this was judged on the device instead — less
              reliable. A parent will have the final say either way.
            </div>
          )}

          {verdict.signals?.length > 0 && (
            <div className="signals">
              {verdict.signals.map((s) => (
                <div className="signal" key={s.label}>
                  <span style={{ color: 'var(--ink-dim)' }}>{s.label}</span>
                  <span className="track"><i style={{ width: `${s.value}%` }} /></span>
                  <span style={{ textAlign: 'right' }}>{s.value}%</span>
                </div>
              ))}
            </div>
          )}

          <div className="stack" style={{ marginTop: 18 }}>
            {verdict.pass ? (
              <>
                <div className="card center" style={{ background: 'var(--card-2)' }}>
                  <b style={{ fontSize: 14 }}>⏳ Sent to a parent for final approval</b>
                  <p className="muted" style={{ margin: '4px 0 0' }}>
                    You'll get your {target.points} points as soon as they say yes.
                  </p>
                </div>
                <button className="btn primary xl wide" onClick={close}>Sweet — done</button>
              </>
            ) : (
              <>
                <button className="btn primary xl wide" onClick={reset}>📸 Fix it and re-shoot</button>
                <button className="btn ghost wide" onClick={close}>I'll come back to it</button>
              </>
            )}
          </div>
        </>
      )}
    </Sheet>
  )
}
