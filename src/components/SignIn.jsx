import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

/**
 * The household login. Deliberately one account for the whole house — see
 * SessionContext for why. This screen is shown once per device, roughly ever,
 * so it optimises for "a parent sets this up on a kid's phone" rather than for
 * repeat visits.
 */
export default function SignIn() {
  const [mode, setMode] = useState('in')   // 'in' | 'up'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)

  async function go(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const fn = mode === 'up' ? 'signUp' : 'signInWithPassword'
    const { data, error: err } = await supabase.auth[fn]({ email, password })
    setBusy(false)

    if (err) { setError(err.message); return }
    // A project with email confirmation on returns a user but no session.
    if (mode === 'up' && !data.session) setSent(true)
  }

  if (sent) {
    return (
      <div className="signin">
        <div className="card center">
          <div style={{ fontSize: 44 }}>📬</div>
          <h2>Check your email</h2>
          <p className="muted">
            There's a confirmation link waiting at <b>{email}</b>. Open it on this
            device and you'll land back here signed in.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="signin">
      <div className="signin-brand">
        <div style={{ fontSize: 52 }}>🏰</div>
        <h1>ChoreQuest</h1>
        <p className="muted">
          {mode === 'up'
            ? 'Set up the household. You only do this once — every phone in the house signs in with these same details.'
            : 'Sign in with the household account.'}
        </p>
      </div>

      <form className="card" onSubmit={go}>
        <label className="field">
          <span>Email</span>
          <input
            type="email" value={email} required autoComplete="email"
            onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password" value={password} required minLength={8}
            autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'up' ? 'At least 8 characters' : ''}
          />
        </label>

        {error && <div className="warnbox" style={{ marginBottom: 12 }}>{error}</div>}

        <button className="btn primary xl wide" disabled={busy}>
          {busy ? 'One moment…' : mode === 'up' ? 'Create the household' : 'Sign in'}
        </button>
      </form>

      <button
        className="btn ghost wide"
        style={{ marginTop: 12 }}
        onClick={() => { setMode(mode === 'up' ? 'in' : 'up'); setError(null) }}
      >
        {mode === 'up' ? 'We already have an account' : 'Set up a new household'}
      </button>

      <p className="tiny center" style={{ marginTop: 18, opacity: .7 }}>
        One account for the whole house. Who's actually holding the phone is still
        a PIN, same as always.
      </p>
    </div>
  )
}
