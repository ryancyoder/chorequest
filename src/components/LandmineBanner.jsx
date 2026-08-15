import { useEffect, useState } from 'react'
import { useApp } from '../store/AppContext.jsx'
import { liveLandmines, freezingMine, totalPot } from '../store/selectors.js'
import { STAGES, stageOf, ratesOf, msToNextStage, formatDuration } from '../lib/landmines.js'

/**
 * The house-wide alarm. Sits above every screen while anything is live, because
 * a landmine you can't see isn't applying any pressure.
 */
export default function LandmineBanner({ onOpen }) {
  const app = useApp()
  const [, bump] = useState(0)
  const live = liveLandmines(app.state)

  useEffect(() => {
    if (!live.length) return
    const id = setInterval(() => bump((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [live.length])

  if (!live.length) return null

  const now = Date.now()
  const rates = ratesOf(app.state)
  const me = app.currentMember
  const mine = freezingMine(app.state, me.id)
  const pot = totalPot(app.state)

  // Lead with whatever is furthest along.
  const worst = live
    .filter((m) => m.status === 'armed')
    .sort((a, b) => a.armedAt - b.armedAt)[0] || live[0]
  const stage = STAGES[stageOf(worst, rates, now)]
  const next = msToNextStage(worst, rates, now)

  return (
    <button className={`minebanner ${stage.key}`} onClick={onOpen}>
      <span className="siren">{stage.emoji}</span>
      <span className="grow">
        <b>
          {mine
            ? `${me.name}, your points are frozen`
            : live.length === 1
              ? worst.title
              : `${live.length} landmines are live`}
        </b>
        <span className="sub">
          {mine
            ? `Clean up "${mine.title}" and everything you've banked lands at once`
            : next != null
              ? `${stage.short} · next stage in ${formatDuration(next)}`
              : stage.short}
          {pot > 0 && ` · 💰 ${pot} in the pot`}
        </span>
      </span>
      <span className="chev">›</span>
    </button>
  )
}
