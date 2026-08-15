import { useEffect, useState } from 'react'

/**
 * Layout modes.
 *
 * 'phone'  — the single-column app with the floating bottom nav.
 * 'tablet' — sidebar rail + multi-column panes, built for an iPad in landscape
 *            sitting on a counter as the family's command center.
 *
 * The preference is 'auto' by default (switch on viewport width) but a parent can
 * pin either layout — useful on an iPad that lives in landscape, or when someone
 * wants the simpler phone view on a big screen.
 */

export const TABLET_MIN_WIDTH = 900

export function useWideViewport() {
  const query = `(min-width: ${TABLET_MIN_WIDTH}px)`
  const [wide, setWide] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )

  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = (e) => setWide(e.matches)
    mq.addEventListener('change', onChange)
    setWide(mq.matches)
    return () => mq.removeEventListener('change', onChange)
  }, [query])

  return wide
}

export function resolveLayout(pref, wide) {
  if (pref === 'phone' || pref === 'tablet') return pref
  return wide ? 'tablet' : 'phone'
}
