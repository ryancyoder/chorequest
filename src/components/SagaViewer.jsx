import { useEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * saga.html keeps a fixed filename, so a device that has watched it once can be
 * served a stale copy after a deploy. Bump this whenever the saga changes and
 * everyone gets the new cut.
 */
const SAGA_VERSION = '13'

/**
 * Plays the saga inside the app.
 *
 * It used to open in a new tab, which is fine in a browser and bad once the app
 * is on the home screen — a _blank link there hands you to Safari and strands
 * you outside the app with no way back. An in-app frame keeps the shell, and
 * the frame is same-origin so the saga can still read the real family.
 */
export default function SagaViewer({ open, onClose }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  // Rendered into <body> rather than in place: the screen it's launched from
  // carries a transform during its entrance animation, and a transformed
  // ancestor becomes the containing block for position:fixed — which would
  // size this to the scrolling page instead of the viewport.
  return createPortal(
    <div className="sagaviewer">
      {/* Floats over the picture rather than stealing a strip of it. */}
      <button className="btn sm sagaclose" onClick={onClose} autoFocus>✕ Close</button>
      <iframe
        className="sagaframe"
        src={`./saga.html?embed=1&v=${SAGA_VERSION}`}
        title="ChoreQuest: The Saga of the Seven"
        allow="autoplay"
      />
    </div>,
    document.body,
  )
}
