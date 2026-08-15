import { useEffect, useRef, useState } from 'react'
import { downscale, fileToDataUrl, grabFrame, hasLiveCamera } from '../lib/camera.js'

/**
 * Photo capture that works everywhere:
 *  • live viewfinder via getUserMedia when the browser allows it
 *  • otherwise the native camera through <input capture>, which is what iOS
 *    Safari in a non-installed web app tends to give you anyway.
 */
export default function CameraCapture({ value, onChange, hint = 'Line it up and shoot', compact = false }) {
  const videoRef = useRef(null)
  const fileRef = useRef(null)
  const streamRef = useRef(null)
  const [live, setLive] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

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
          <div className="camwrap">
            <video ref={videoRef} playsInline muted />
            <div className="hint">{hint}</div>
          </div>
          <button className="shutter" onClick={shoot} aria-label="Take photo"><i /></button>
          <button className="btn ghost sm wide" style={{ marginTop: 8 }} onClick={stopStream}>Cancel</button>
        </>
      ) : (
        <div className={compact ? 'row' : 'stack'}>
          <button className="btn primary xl grow" onClick={startStream} disabled={busy}>
            📸 {busy ? 'Working…' : 'Take a photo'}
          </button>
          <button className="btn grow" onClick={() => fileRef.current?.click()} disabled={busy}>
            🖼️ Pick from library
          </button>
        </div>
      )}

      {error && <p className="tiny" style={{ marginTop: 8, color: 'var(--warn)' }}>{error}</p>}
    </div>
  )
}
