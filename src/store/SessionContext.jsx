import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, isConfigured } from '../lib/supabase.js'
import { resolveHousehold } from './remote.js'

/**
 * Who is logged in, and which household that means.
 *
 * One login per household, not per person — five kids aged 7 to 15 are not
 * going to keep five sets of credentials alive, and the app has always used a
 * PIN to say who is holding the device. That stays exactly as it was; this
 * layer only decides *whose data* the device is looking at.
 *
 * Consequence worth being honest about: every phone presents the same
 * auth.uid(), so RLS can enforce the household boundary and nothing finer. The
 * PIN is still the only thing between a kid and the parent controls.
 */
const Ctx = createContext(null)
export const useSession = () => useContext(Ctx)

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null)
  const [householdId, setHouseholdId] = useState(null)
  const [phase, setPhase] = useState(isConfigured ? 'loading' : 'offline')
  const [error, setError] = useState(null)

  // Restore an existing session, then follow it.
  useEffect(() => {
    if (!isConfigured) return
    let alive = true

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session)
      if (!data.session) setPhase('signed-out')
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_e, next) => {
      setSession(next)
      if (!next) {
        setHouseholdId(null)
        setPhase('signed-out')
      }
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  // A session is not enough — the app needs the household behind it.
  useEffect(() => {
    if (!session) return
    let alive = true
    setPhase('loading')
    resolveHousehold()
      .then((id) => {
        if (!alive) return
        setHouseholdId(id)
        setPhase('ready')
      })
      .catch((err) => {
        if (!alive) return
        setError(err.message)
        setPhase('error')
      })
    return () => { alive = false }
  }, [session])

  const value = {
    session, householdId, phase, error,
    isConfigured,
    email: session?.user?.email || null,
    signOut: () => supabase.auth.signOut(),
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
