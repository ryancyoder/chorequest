import { useState } from 'react'
import { Sheet } from './ui.jsx'
import CameraCapture from './CameraCapture.jsx'
import DictationField from './DictationField.jsx'
import { putPhoto } from '../lib/photos.js'
import { ratesOf, formatDuration } from '../lib/landmines.js'

const ROOMS = ['Kitchen', 'Living room', 'Bathroom', 'Bedroom', 'Playroom', 'Garage', 'Yard', 'Car']

/** Snap the crime scene, describe it, and decide whether to name a name. */
export default function ReportMineSheet({ open, onClose, app, me }) {
  const [photo, setPhoto] = useState(null)
  const [spoken, setSpoken] = useState('')
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [ownerId, setOwnerId] = useState(null)
  const [saving, setSaving] = useState(false)

  const rates = ratesOf(app.state)

  function reset() {
    setPhoto(null); setSpoken(''); setTitle(''); setLocation(''); setOwnerId(null)
  }
  function close() { reset(); onClose() }

  async function arm() {
    setSaving(true)
    const photoId = photo ? await putPhoto(photo) : null
    app.reportLandmine({
      title: title.trim() || spoken.trim().slice(0, 60) || 'Unidentified disaster',
      notes: spoken.trim(),
      photoId,
      location,
      ownerId,
      reporterId: me.id,
    })
    setSaving(false)
    close()
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title="💣 Arm a landmine"
      lede="Someone left a disaster. Document it. The clock starts the moment you arm it."
    >
      <CameraCapture value={photo} onChange={setPhoto} hint="Get the whole crime scene in frame" />

      <label className="field" style={{ marginTop: 16 }}>
        <span>What are we looking at?</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Towel mountain in the bathroom"
        />
      </label>

      <label className="field">
        <span>Say more (optional)</span>
        <DictationField
          value={spoken}
          onChange={setSpoken}
          rows={3}
          placeholder="Tap the mic and describe the scene…"
        />
      </label>

      <label className="field">
        <span>Where</span>
        <div className="chipgroup">
          {ROOMS.map((r) => (
            <button key={r} className={`chip ${location === r ? 'on' : ''}`} onClick={() => setLocation(r)}>{r}</button>
          ))}
        </div>
      </label>

      <div className="divider" />

      <div className="tiny" style={{ marginBottom: 8 }}>WHO DID THIS?</div>
      <div className="chipgroup" style={{ marginBottom: 10 }}>
        <button
          className={`chip ${ownerId === null ? 'on' : ''}`}
          onClick={() => setOwnerId(null)}
        >
          🤷 Nobody knows
        </button>
        {app.state.members.map((m) => (
          <button
            key={m.id}
            className={`chip ${ownerId === m.id ? 'on' : ''}`}
            style={ownerId === m.id ? { '--member': m.color } : undefined}
            onClick={() => setOwnerId(m.id)}
          >
            {m.emoji} {m.name}
          </button>
        ))}
      </div>

      <div className={ownerId ? 'warnbox' : 'card'} style={{ marginBottom: 14 }}>
        {ownerId ? (
          <>
            🫵 <b>{app.state.members.find((m) => m.id === ownerId)?.name}</b> gets named. They can't cash out
            any points until it's cleaned — but they can dispute it, and everything pauses until a parent rules.
          </>
        ) : (
          <>
            🤷 Left unclaimed, the <b>whole family</b> starts losing points once the grace period ends —
            and it drains faster than a named mine. Somebody usually remembers pretty quickly.
          </>
        )}
      </div>

      <p className="tiny" style={{ marginBottom: 12 }}>
        Grace period: <b>{formatDuration(rates.graceMins * 60000)}</b> · streaks burn at{' '}
        <b>{formatDuration(rates.smokingMins * 60000)}</b> · fines start at{' '}
        <b>{formatDuration(rates.detonatedMins * 60000)}</b>
      </p>

      <button className="btn no xl wide" onClick={arm} disabled={saving || (!title.trim() && !spoken.trim())}>
        {saving ? 'Arming…' : '💣 Arm it'}
      </button>
      <button className="btn ghost wide" style={{ marginTop: 8 }} onClick={close}>
        Actually, I'll just clean it
      </button>
    </Sheet>
  )
}
