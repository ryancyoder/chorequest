import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import SignIn from './components/SignIn.jsx'
import { AppProvider } from './store/AppContext.jsx'
import { SessionProvider, useSession } from './store/SessionContext.jsx'
import './styles.css'

/**
 * Decide what the device is looking at before the app mounts.
 *
 * With no Supabase config the app runs exactly as it always has, entirely
 * on-device. That is not a degraded mode to apologise for — it's the fallback
 * that keeps a build without env vars from white-screening, and it's what the
 * GitHub Pages build still does today.
 */
function Root() {
  const { phase, householdId, error } = useSession()

  if (phase === 'offline') return <AppProvider><App /></AppProvider>

  if (phase === 'loading') {
    return (
      <div className="bootscreen">
        <div className="scanner">🏰</div>
        <p className="muted">Opening the house…</p>
      </div>
    )
  }

  if (phase === 'signed-out') return <SignIn />

  if (phase === 'error') {
    return (
      <div className="bootscreen">
        <div style={{ fontSize: 44 }}>🚧</div>
        <h2>Couldn't open the household</h2>
        <p className="muted center" style={{ maxWidth: 340 }}>{error}</p>
      </div>
    )
  }

  // Remounting on household change is intentional: everything below assumes a
  // single household for its whole life.
  return (
    <AppProvider key={householdId} householdId={householdId}>
      <App />
    </AppProvider>
  )
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SessionProvider>
      <Root />
    </SessionProvider>
  </React.StrictMode>,
)
