import { useState } from 'react'
import { useApp } from '../store/AppContext.jsx'
import { parents } from '../store/selectors.js'

/** Shown wherever a parent-only screen is reached without unlocking. */
export default function ParentGate() {
  const app = useApp()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const me = app.currentMember
  const isParent = me.role === 'parent'
  const parentList = parents(app.state)

  // Awaited: when the household is synced the PIN is checked by the database,
  // because the hash is deliberately unreadable from the client.
  async function tryUnlock() {
    if (await app.unlockParent(pin)) {
      setPin(''); setError('')
    } else {
      setError('That PIN did not match.')
      setPin('')
    }
  }

  return (
    <div className="screen">
      <div className="card" style={{ marginTop: 30, textAlign: 'center', padding: 26 }}>
        <div style={{ fontSize: 44 }}>🔐</div>
        <h2 style={{ marginTop: 8 }}>Parents only</h2>

        {!isParent ? (
          <>
            <p className="muted" style={{ marginTop: 6 }}>
              Switch to a parent up top, then enter the PIN.
            </p>
            <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}>
              {parentList.map((p) => (
                <button key={p.id} className="btn" onClick={() => app.switchMember(p.id)}>
                  {p.emoji} {p.name}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 6 }}>Enter your PIN to approve work and change settings.</p>
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && tryUnlock()}
              placeholder="••••"
              style={{ textAlign: 'center', fontSize: 26, letterSpacing: '0.4em', maxWidth: 200, margin: '16px auto 0' }}
            />
            {error && <p className="tiny" style={{ color: 'var(--bad)', marginTop: 8 }}>{error}</p>}
            <button className="btn primary xl wide" style={{ marginTop: 14 }} onClick={tryUnlock}>Unlock</button>
            <p className="tiny" style={{ marginTop: 12 }}>Starter PIN is 1234 — change it in Manage → Family.</p>
          </>
        )}
      </div>
    </div>
  )
}
