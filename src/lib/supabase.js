import { createClient } from '@supabase/supabase-js'

/**
 * The Supabase client.
 *
 * The publishable key is *meant* to be in the bundle — it identifies the
 * project and nothing more. Every row this app can reach is gated by RLS on
 * `household_id = current_household_id()`, so a stolen key with no session
 * reaches exactly nothing. This is the opposite of the Anthropic key in
 * server/worker.js, which must never be shipped. Don't let the two blur.
 */
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/**
 * Missing config is a normal state, not a crash: the app still runs fully
 * on-device, and a build without env vars should degrade to that rather than
 * white-screen. `isConfigured` is what the UI branches on.
 */
export const isConfigured = Boolean(url && key)

export const supabase = isConfigured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // The app is installed to the home screen, so there is no URL bar and
        // no redirect fragment to read back.
        detectSessionInUrl: false,
      },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null

/** Postgres error 42501 is "insufficient privilege" — i.e. RLS said no. */
export const isDenied = (err) => err?.code === '42501' || err?.code === 'PGRST301'
