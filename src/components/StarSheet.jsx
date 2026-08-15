import { useState } from 'react'
import { Sheet } from './ui.jsx'
import CameraCapture from './CameraCapture.jsx'
import DictationField from '../components/DictationField.jsx'
import { putPhoto } from '../lib/photos.js'
import { CATEGORIES, categoryOf, canAward, DAILY_CAP, starsGivenToday } from '../lib/kindness.js'

/**
 * Catching someone being good. Deliberately short — if it takes longer than
 * the moment of noticing, nobody does it.
 */
export default function StarSheet({ open, onClose, app, me }) {
  const [toId, setToId] = useState(null)
  const [category, setCategory] = useState('kindness')
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState(null)
  const [showCam, setShowCam] = useState(false)
  const [saving, setSaving] = useState(false)

  if (!open) return null

  const cat = categoryOf(category)
  const others = app.state.members.filter((m) => m.id !== me.id)
  const gate = toId ? canAward(app.state, me, toId) : { ok: false }
  const cap = DAILY_CAP[me.role] ?? DAILY_CAP.child
  const used = starsGivenToday(app.state, me.id)
  const isParent = me.role === 'parent'

  function reset() {
    setToId(null); setCategory('kindness'); setText(''); setPhoto(null); setShowCam(false)
  }
  function close() { reset(); onClose() }

  async function send() {
    setSaving(true)
    const photoId = photo ? await putPhoto(photo) : null
    const res = app.awardStar({ toId, fromId: me.id, category, text, photoId })
    setSaving(false)
    if (res.ok) close()
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title="⭐ Catch someone being good"
      lede={isParent
        ? 'Yours goes straight on the wall.'
        : 'A parent confirms it, then it’s on the wall for good.'}
    >
      <div className="tiny" style={{ marginBottom: 8 }}>WHO DID YOU NOTICE?</div>
      <div className="chipgroup" style={{ marginBottom: 6 }}>
        {others.map((m) => (
          <button
            key={m.id}
            className={`chip ${toId === m.id ? 'on' : ''}`}
            style={toId === m.id ? { '--member': m.color } : undefined}
            onClick={() => setToId(m.id)}
          >
            {m.emoji} {m.name}
          </button>
        ))}
      </div>
      <p className="tiny" style={{ margin: '0 0 14px' }}>
        You can’t give yourself one — {used}/{cap} given today.
      </p>

      {toId && !gate.ok && (
        <div className="warnbox" style={{ marginBottom: 14 }}>⭐ {gate.why}</div>
      )}

      <div className="tiny" style={{ marginBottom: 8 }}>WHAT KIND?</div>
      <div className="stack" style={{ marginBottom: 14 }}>
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            className={`card tap starcat ${category === c.key ? 'on' : ''}`}
            style={{ textAlign: 'left' }}
            onClick={() => setCategory(c.key)}
          >
            <div className="row">
              <span style={{ fontSize: 24 }}>{c.emoji}</span>
              <div className="grow">
                <b style={{ fontSize: 14.5 }}>{c.label}</b>
                <div className="tiny">{c.blurb}</div>
              </div>
              <span className="reward-chip">+{c.points}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="tiny" style={{ marginBottom: 8 }}>WHAT HAPPENED?</div>
      <div className="chipgroup" style={{ marginBottom: 10 }}>
        {cat.prompts.map((p) => (
          <button key={p} className={`chip ${text === p ? 'on' : ''}`} onClick={() => setText(p)}>
            {p}
          </button>
        ))}
      </div>
      <DictationField
        value={text}
        onChange={setText}
        rows={2}
        placeholder="Or say it in your own words…"
      />

      {showCam ? (
        <div style={{ marginTop: 14 }}>
          <CameraCapture value={photo} onChange={setPhoto} hint="Optional — a photo of the moment" compact />
        </div>
      ) : (
        <button className="btn ghost sm wide" style={{ marginTop: 12 }} onClick={() => setShowCam(true)}>
          📸 Add a photo (optional)
        </button>
      )}

      <button
        className="btn go xl wide"
        style={{ marginTop: 16 }}
        disabled={!toId || !gate.ok || saving}
        onClick={send}
      >
        {saving ? 'Sending…' : isParent ? `${cat.emoji} Give the star` : `${cat.emoji} Nominate them`}
      </button>
    </Sheet>
  )
}
