import { useEffect, useRef, useState } from 'react'
import { dictationSupported, startDictation } from '../lib/dictation.js'

/**
 * A textarea/input with a mic button. Speech streams straight into the field,
 * so the parent component just reads `value` like any controlled input.
 */
export default function DictationField({
  value,
  onChange,
  placeholder = 'Say it or type it…',
  rows = 3,
  onFinalTranscript,
}) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')
  const sessionRef = useRef(null)
  const baseRef = useRef('')

  useEffect(() => () => sessionRef.current?.stop(), [])

  function toggle() {
    if (listening) {
      sessionRef.current?.stop()
      return
    }
    setError('')
    baseRef.current = value ? `${value.trim()} ` : ''
    setListening(true)
    sessionRef.current = startDictation({
      onText: (text, isFinal) => {
        onChange(baseRef.current + text)
        if (isFinal && text) onFinalTranscript?.(text)
      },
      onError: (msg) => setError(msg),
      onEnd: () => setListening(false),
    })
  }

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <textarea
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={{ paddingRight: 54, resize: 'vertical' }}
        />
        <button
          type="button"
          onClick={toggle}
          title={dictationSupported ? 'Dictate' : 'Voice input not supported in this browser'}
          className={listening ? 'miclive' : ''}
          style={{
            position: 'absolute', right: 8, top: 8,
            width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center',
            fontSize: 18,
            background: listening ? 'linear-gradient(135deg,#ff5c6c,#ff2e93)' : 'var(--card-2)',
            border: '1px solid var(--line)',
            opacity: dictationSupported ? 1 : 0.4,
          }}
        >
          {listening ? '⏹️' : '🎙️'}
        </button>
      </div>
      {listening && <p className="tiny" style={{ marginTop: 6, color: 'var(--bad)' }}>● Listening — tap the square when you're done</p>}
      {error && <p className="tiny" style={{ marginTop: 6, color: 'var(--warn)' }}>{error}</p>}
      {!dictationSupported && !error && (
        <p className="tiny" style={{ marginTop: 6 }}>Voice input needs Chrome, Edge or Safari — typing works everywhere.</p>
      )}
    </div>
  )
}
