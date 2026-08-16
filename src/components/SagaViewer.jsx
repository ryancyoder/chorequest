import { useEffect } from 'react'
import { createPortal } from 'react-dom'

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
      <div className="sagabar">
        <span className="row" style={{ gap: 8 }}>
          <span style={{ fontSize: 18 }}>⚔️</span>
          <b style={{ fontSize: 14 }}>The Saga of the Seven</b>
        </span>
        <button className="btn sm" onClick={onClose} autoFocus>✕ Close</button>
      </div>
      <iframe
        className="sagaframe"
        src="./saga.html?embed=1"
        title="ChoreQuest: The Saga of the Seven"
        allow="autoplay"
      />
    </div>,
    document.body,
  )
}
