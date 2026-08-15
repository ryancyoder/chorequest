import { useEffect, useRef, useState } from 'react'
import { downscale, fileToDataUrl, grabFrame, hasLiveCamera } from '../lib/camera.js'

/**
 * Photo capture that works everywhere:
 *  • live viewfinder via getUserMedia when the browser allows it
 *  • otherwise the native camera through <input capture>, which is what iOS
 *    Safari in a non-installed web app tends to give you anyway.
 *
 * Pass `ghost` (a data URL) to overlay a previous photo on the viewfinder so the
 * shot can be lined up exactly. This matters more than it sounds: the photo
 * check in lib/ai.js compares a 16×16 structural grid, so a shot taken from a
 * different corner of the room scores badly even when the room is spotless.
 * Aligning the two photos is the single biggest thing a person can do to make
 * the AI verdict trustworthy.
 */
export default function CameraCapture({
  value,
  onChange,
  hint = 'Line it up and shoot',
  compact = false,
  ghost = null,
  ghostLabel = 'the original shot',
}) {
  const videoRef = useRef(null)
  const fileRef = useRef(null)
  const streamRef = useRef(null)
  const [live, setLive] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Overlay controls
  const [overlay, setOverlay] = useState(ghost ? 'ghost' : 'off') // off | ghost | diff
  const [opacity, setOpacity] = useState(45)
  const [grid, setGrid] = useState(false)

  // The reference photo often arrives after this component mounts (a parent
  // shoots the standard, then opens the camera). A useState initializer only
  // runs once, so without this the overlay would stay stuck off.
  useEffect(() => {
    setOverlay(ghost ? 'ghost' : 'off')
  }, [ghost])

  useEffect(() => () => stopStream(), [])

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setLive(false)
  }

  async function startStream() {
    setError('')
    if (!hasLiveCamera()) {
      fileRef.current?.click()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: false,
      })
      streamRef.current = stream
      setLive(true)
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
      })
    } catch {
      setError('Camera blocked — using the photo picker instead.')
      fileRef.current?.click()
    }
  }

  function shoot() {
    if (!videoRef.current) return
    const data = grabFrame(videoRef.current)
    stopStream()
    onChange(data)
  }

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const raw = await fileToDataUrl(file)
      onChange(await downscale(raw))
    } catch {
      setError('Could not read that photo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFile}
        style={{ display: 'none' }}
      />

      {value ? (
        <>
          <div className="camwrap">
            <img src={value} alt="Captured" />
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn sm grow" onClick={() => { onChange(null); startStream() }}>🔄 Retake</button>
            <button className="btn sm grow" onClick={() => fileRef.current?.click()}>🖼️ Choose another</button>
          </div>
        </>
      ) : live ? (
        <>
          <div className={`camwrap ${overlay === 'diff' ? 'diffmode' : ''}`}>
            <video ref={videoRef} playsInline muted />

            {ghost && overlay !== 'off' && (
              <img
                src={ghost}
                alt=""
                className={`ghost ${overlay}`}
                style={{ opacity: overlay === 'diff' ? 1 : opacity / 100 }}
              />
            )}

            {grid && (
              <div className="camgrid" aria-hidden>
                <i /><i /><i /><i />
              </div>
            )}

            <div className="hint">
              {ghost && overlay !== 'off'
                ? overlay === 'diff'
                  ? 'Move until the ghosting disappears'
                  : `Line the room up with ${ghostLabel}`
                : hint}
            </div>
          </div>

          {ghost && (
            <div className="ghostbar">
              <div className="chipgroup">
                <button className={`chip ${overlay === 'ghost' ? 'on' : ''}`} onClick={() => setOverlay('ghost')}>
                  👻 Ghost
                </button>
                <button className={`chip ${overlay === 'diff' ? 'on' : ''}`} onClick={() => setOverlay('diff')}>
                  🔍 Difference
                </button>
                <button className={`chip ${overlay === 'off' ? 'on' : ''}`} onClick={() => setOverlay('off')}>
                  🚫 Off
                </button>
                <button className={`chip ${grid ? 'on' : ''}`} onClick={() => setGrid((g) => !g)}>
                  # Grid
                </button>
              </div>
              {overlay === 'ghost' && (
                <label className="ghostslider">
                  <span className="tiny">Fade</span>
                  <input
                    type="range"
                    min="10"
                    max="85"
                    value={opacity}
                    onChange={(e) => setOpacity(Number(e.target.value))}
                  />
                </label>
              )}
            </div>
          )}

          <button className="shutter" onClick={shoot} aria-label="Take photo"><i /></button>
          <button className="btn ghost sm wide" style={{ marginTop: 8 }} onClick={stopStream}>Cancel</button>
        </>
      ) : (
        <div className={compact ? 'row' : 'stack'}>
          <button className="btn primary xl grow" onClick={startStream} disabled={busy}>
            📸 {busy ? 'Working…' : ghost ? 'Line up the shot' : 'Take a photo'}
          </button>
          <button className="btn grow" onClick={() => fileRef.current?.click()} disabled={busy}>
            🖼️ Pick from library
          </button>
        </div>
      )}

      {ghost && !live && !value && (
        <p className="tiny" style={{ marginTop: 8 }}>
          👻 The camera will show a faded version of {ghostLabel} so you can match the angle exactly.
          The closer the match, the more the AI check can tell.
        </p>
      )}

      {error && <p className="tiny" style={{ marginTop: 8, color: 'var(--warn)' }}>{error}</p>}
    </div>
  )
}
