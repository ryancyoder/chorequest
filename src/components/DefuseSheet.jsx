import { useState } from 'react'
import { Sheet, Confetti } from './ui.jsx'
import CameraCapture from './CameraCapture.jsx'
import { useApp } from '../store/AppContext.jsx'
import { checkDefusePhoto } from '../lib/ai.js'
import { putPhoto, photoUrl } from '../lib/photos.js'
import { ratesOf } from '../lib/landmines.js'

/**
 * Cleaning it up. The AI compares the "after" shot to the original mess photo —
 * if nothing changed, it never reaches a parent.
 */
export default function DefuseSheet({ open, onClose, mine, member }) {
  const app = useApp()
  const [photo, setPhoto] = useState(null)
  const [step, setStep] = useState('shoot')
  const [verdict, setVerdict] = useState(null)

  if (!mine) return null

  const before = photoUrl(mine.photoId)
  const rates = ratesOf(app.state)
  const selfClean = mine.ownerId === member.id
  const pot = mine.pot || 0

  function reset() { setPhoto(null); setVerdict(null); setStep('shoot') }
  function close() { reset(); onClose() }

  async function run() {
    setStep('checking')
    let result
    try {
      result = await checkDefusePhoto({ messPhoto: before, defusePhoto: photo, title: mine.title })
    } catch (err) {
      result = {
        pass: true, score: null, errored: true,
        headline: 'Could not run the check',
        detail: `${err.message}. Sending it straight to a parent.`,
        signals: [], regions: [],
      }
    }
    await new Promise((r) => setTimeout(r, 900))
    setVerdict(result)
    setStep('result')

    const photoId = result.pass ? await putPhoto(photo) : null
    app.submitProof({
      kind: 'landmine',
      targetId: mine.id,
      memberId: member.id,
      photoId,
      ai: result,
      note: selfClean ? 'Cleaning up after myself' : 'Defusing someone else’s mess',
    })
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title={step === 'result' ? '' : `🧤 Defuse: ${mine.title}`}
      lede={step === 'shoot' ? 'Clean it up, then photograph the same spot.' : ''}
    >
      {step === 'shoot' && (
        <>
          <div className="photo-pair" style={{ marginBottom: 14 }}>
            <figure>
              <figcaption>The crime scene</figcaption>
              {before ? <img src={before} alt="The mess" /> : <div className="emptyphoto">No photo was taken</div>}
            </figure>
            <figure>
              <figcaption>After you</figcaption>
              {photo ? <img src={photo} alt="Cleaned" /> : <div className="emptyphoto">Same spot, same angle</div>}
            </figure>
          </div>

          {pot > 0 && (
            <div className="card" style={{ marginBottom: 12, textAlign: 'center' }}>
              {selfClean ? (
                <>
                  <b style={{ fontSize: 15 }}>🧤 This one's yours</b>
                  <p className="muted" style={{ margin: '4px 0 0' }}>
                    The {pot}-point pot goes back to the family goal, not to you. Cleaning up after
                    yourself is not a business model.
                  </p>
                </>
              ) : (
                <>
                  <b style={{ fontSize: 17, color: 'var(--gold)' }}>💰 {pot} coins in the pot</b>
                  <p className="muted" style={{ margin: '4px 0 0' }}>
                    Clean up someone else's disaster and the whole pot is yours.
                  </p>
                </>
              )}
            </div>
          )}

          <CameraCapture
            value={photo}
            onChange={setPhoto}
            hint="Same spot as the original photo"
            ghost={before}
            ghostLabel="the crime scene"
          />

          <button className="btn go xl wide" style={{ marginTop: 14 }} disabled={!photo} onClick={run}>
            🤖 Check my work
          </button>
        </>
      )}

      {step === 'checking' && (
        <div className="thinking">
          <div className="scanner">🧤</div>
          <h3 style={{ marginTop: 16 }}>Comparing to the crime scene…</h3>
          <p className="muted center" style={{ maxWidth: 300 }}>
            Making sure something actually changed.
          </p>
        </div>
      )}

      {step === 'result' && verdict && (
        <>
          {verdict.pass && <Confetti count={50} />}
          <div className={`verdict ${verdict.pass ? 'pass' : 'fail'}`}>
            <div className="big">{verdict.pass ? '🧤' : '🙃'}</div>
            <h3>{verdict.headline}</h3>
            {verdict.score != null && (
              <div className="scoredial" style={{ color: verdict.pass ? 'var(--good)' : 'var(--warn)' }}>
                {verdict.score}<small>% changed</small>
              </div>
            )}
            <p>{verdict.detail}</p>
          </div>

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
                <div className="card center">
                  <b style={{ fontSize: 14 }}>⏳ A parent has to sign off</b>
                  <p className="muted" style={{ margin: '4px 0 0' }}>
                    The clock is stopped while they look. Once approved
                    {pot > 0 && !selfClean ? `, the ${pot}-coin pot is yours` : ', the mine is gone'} — plus{' '}
                    {rates.defuseReward} points.
                  </p>
                </div>
                <button className="btn primary xl wide" onClick={close}>Done</button>
              </>
            ) : (
              <>
                <button className="btn primary xl wide" onClick={reset}>📸 Fine. Actually clean it.</button>
                <button className="btn ghost wide" onClick={close}>Later</button>
              </>
            )}
          </div>
        </>
      )}
    </Sheet>
  )
}
