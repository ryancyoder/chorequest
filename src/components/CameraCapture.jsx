import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { downscale, fileToDataUrl, grabFrame, hasLiveCamera } from '../lib/camera.js'
import { createAligner } from '../lib/vision.js'

/**
 * Photo capture.
 *
 * Two paths, chosen by whether there's something to line the shot up against:
 *
 *  • No ghost → hand off to the system camera. It's full screen, familiar,
 *    handles focus/flash/HDR properly, and gives a better image than anything
 *    a <video> preview can. There's no reason to reimplement it.
 *
 *  • Ghost → our own viewfinder, because iOS can't overlay a reference photo on
 *    its camera. That runs FULL SCREEN rather than in a box inside a sheet:
 *    lining up a shot in a 200px window is the whole reason people give up on
 *    matching the angle.
 *
 * Either way there's a Photos/Files route that opens the standard iOS sheet.
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
  // Two inputs, because a single one can't do both jobs on iOS: the presence of
  // `capture` sends you straight to the camera and skips the system sheet
  // entirely. Without it, iOS offers Photo Library / Take Photo / Choose File.
  const camRef = useRef(null)
  const libRef = useRef(null)
  const streamRef = useRef(null)
  const [live, setLive] = useState(false)
  const [ready, setReady] = useState(false)     // the video is actually playing
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Auto-snap: watch the frame and fire the shutter once it's held steady.
  const [autoSnap, setAutoSnap] = useState(true)
  const [align, setAlign] = useState(null)
  const [holdPct, setHoldPct] = useState(0)
  const alignerRef = useRef(null)
  const holdRef = useRef(0)
  const firedRef = useRef(false)
  const timerRef = useRef(null)

  // Overlay controls (ghost mode only)
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

  // Escape closes the full-screen viewfinder.
  useEffect(() => {
    if (!live) return
    const onKey = (e) => e.key === 'Escape' && stopStream()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [live])

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setLive(false)
  }

  /** The shoot button. Native camera unless we need to draw a ghost. */
  function takePhoto() {
    setError('')
    if (!ghost || !hasLiveCamera()) {
      camRef.current?.click()
      return
    }
    startStream()
  }

  async function startStream() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
        audio: false,
      })
      streamRef.current = stream
      setReady(false)
      setLive(true)   // the <video> is created by the render this triggers
    } catch {
      setError('Camera blocked — using the system camera instead.')
      camRef.current?.click()
    }
  }

  /*
   * Attaching the stream belongs in an effect, not in a callback after
   * setLive(). The <video> only exists once React has committed the render that
   * `live` triggers, and a requestAnimationFrame is not guaranteed to land
   * after that commit — it won the race sometimes and lost it others, which is
   * precisely what made the viewfinder load unpredictably. Effects run after
   * commit with refs attached, every time.
   */
  useEffect(() => {
    if (!live) return
    const video = videoRef.current
    const stream = streamRef.current
    if (!video || !stream) return

    video.srcObject = stream
    const onReady = () => setReady(true)
    video.addEventListener('loadedmetadata', onReady)
    video.addEventListener('canplay', onReady)
    video.play().catch(() => {})
    // Safari occasionally has metadata before the listener is attached.
    if (video.videoWidth) setReady(true)

    return () => {
      video.removeEventListener('loadedmetadata', onReady)
      video.removeEventListener('canplay', onReady)
    }
  }, [live])

  function shoot() {
    if (!videoRef.current) return
    const data = grabFrame(videoRef.current, 1080)
    stopStream()
    onChange(data)
  }

  /*
   * The auto-snap loop, modelled on the iOS document scanner: sample the frame
   * a few times a second, report how close the shot is, and once it has been
   * lined up for HOLD_MS without wobbling, take it. Holding steady matters —
   * firing the instant it crosses the line catches the frame mid-swing.
   */
  useEffect(() => {
    if (!live || !ready || !ghost || !autoSnap) return

    const HOLD_MS = 700
    const TICK = 110
    let cancelled = false
    holdRef.current = 0
    firedRef.current = false

    ;(async () => {
      try {
        alignerRef.current = await createAligner(ghost)
      } catch {
        return   // fall back to the manual shutter
      }
      if (cancelled) return

      const id = setInterval(() => {
        if (cancelled || firedRef.current) return
        const res = alignerRef.current?.track(videoRef.current)
        if (!res) return
        setAlign(res)

        if (res.locked) {
          holdRef.current += TICK
          setHoldPct(Math.min(100, (holdRef.current / HOLD_MS) * 100))
          if (holdRef.current >= HOLD_MS) {
            firedRef.current = true
            clearInterval(id)
            shoot()
          }
        } else {
          holdRef.current = 0
          setHoldPct(0)
        }
      }, TICK)

      timerRef.current = id
    })()

    return () => {
      cancelled = true
      clearInterval(timerRef.current)
      setAlign(null)
      setHoldPct(0)
    }
  }, [live, ready, ghost, autoSnap])

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
      {/* Straight to the camera — the system UI, full screen. */}
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFile}
        style={{ display: 'none' }}
      />
      {/* No `capture`, so iOS shows its standard Photos / Camera / Files sheet. */}
      <input
        ref={libRef}
        type="file"
        accept="image/*"
        onChange={onFile}
        style={{ display: 'none' }}
      />

      {value ? (
        <>
          <div className="camwrap">
            <img src={value} alt="Captured" />
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn sm grow" onClick={() => { onChange(null); takePhoto() }}>🔄 Retake</button>
            <button className="btn sm grow" onClick={() => libRef.current?.click()}>🖼️ Photos or files</button>
          </div>
        </>
      ) : (
        <div className={compact ? 'row' : 'stack'}>
          <button className="btn primary xl grow" onClick={takePhoto} disabled={busy}>
            📸 {busy ? 'Working…' : ghost ? 'Line up the shot' : 'Take a photo'}
          </button>
          <button className="btn grow" onClick={() => libRef.current?.click()} disabled={busy}>
            🖼️ Photos or files
          </button>
        </div>
      )}

      {ghost && !live && !value && (
        <p className="tiny" style={{ marginTop: 8 }}>
          👻 The camera fills the screen and fades {ghostLabel} over it, so you can match the angle
          exactly. The closer the match, the more the AI check can tell.
        </p>
      )}

      {error && <p className="tiny" style={{ marginTop: 8, color: 'var(--warn)' }}>{error}</p>}

      {live && createPortal(
        <div className="camfull">
          <video ref={videoRef} playsInline muted />

          {ghost && overlay !== 'off' && (
            <img
              src={ghost}
              alt=""
              className={`ghost ${overlay}`}
              style={{ opacity: overlay === 'diff' ? 1 : opacity / 100 }}
            />
          )}

          {grid && <div className="camgrid" aria-hidden><i /><i /><i /><i /></div>}

          {!ready && (
            <div className="camloading">
              <div className="scanner">📷</div>
              <p className="muted" style={{ marginTop: 12 }}>Waking the camera…</p>
            </div>
          )}

          <div className="camtop">
            <button className="btn sm" onClick={stopStream}>✕ Cancel</button>
            <span className="camhint">
              {align
                ? align.locked
                  ? 'Hold it there…'
                  : align.nudge.x || align.nudge.y
                    ? `Move ${[align.nudge.y, align.nudge.x].filter(Boolean).join(' and ')}`
                    : 'Nearly — steady now'
                : overlay === 'diff'
                  ? 'Move until the ghosting disappears'
                  : overlay === 'ghost'
                    ? `Line it up with ${ghostLabel}`
                    : hint}
            </span>
          </div>

          {/* Alignment target, in the spirit of the iOS document scanner. */}
          {ghost && autoSnap && ready && (
            <div className={`camlock ${align?.locked ? 'locked' : ''}`}>
              <svg viewBox="0 0 100 100" aria-hidden>
                <circle className="ring-bg" cx="50" cy="50" r="46" />
                <circle
                  className="ring-fill" cx="50" cy="50" r="46"
                  style={{ strokeDashoffset: 289 - (289 * holdPct) / 100 }}
                />
              </svg>
              <span className="lockicon">{align?.locked ? '🎯' : '⌖'}</span>
            </div>
          )}

          <div className="cambottom">
            {ghost && (
              <>
                <div className="chipgroup" style={{ justifyContent: 'center' }}>
                  <button className={`chip ${overlay === 'ghost' ? 'on' : ''}`} onClick={() => setOverlay('ghost')}>👻 Ghost</button>
                  <button className={`chip ${overlay === 'diff' ? 'on' : ''}`} onClick={() => setOverlay('diff')}>🔍 Difference</button>
                  <button className={`chip ${overlay === 'off' ? 'on' : ''}`} onClick={() => setOverlay('off')}>🚫 Off</button>
                  <button className={`chip ${grid ? 'on' : ''}`} onClick={() => setGrid((g) => !g)}># Grid</button>
                </div>
                {overlay === 'ghost' && (
                  <label className="ghostslider" style={{ maxWidth: 320, margin: '10px auto 0' }}>
                    <span className="tiny">Fade</span>
                    <input type="range" min="10" max="85" value={opacity}
                      onChange={(e) => setOpacity(Number(e.target.value))} />
                  </label>
                )}

                <div className="chipgroup" style={{ justifyContent: 'center', marginTop: 8 }}>
                  <button className={`chip ${autoSnap ? 'on' : ''}`} onClick={() => setAutoSnap((a) => !a)}>
                    {autoSnap ? '🎯 Auto-snap on' : '🎯 Auto-snap off'}
                  </button>
                  {align && (
                    <span className="chip" style={{ pointerEvents: 'none' }}>
                      {align.locked ? 'Lined up' : `${Math.max(0, 100 - Math.round(align.distance * 9))}% there`}
                    </span>
                  )}
                </div>
              </>
            )}
            {/* The manual shutter never goes away — auto-snap assists, it doesn't trap. */}
            <button className="shutter" onClick={shoot} aria-label="Take photo"><i /></button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
