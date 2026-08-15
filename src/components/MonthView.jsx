import { allEventsOn, choresOn } from '../store/selectors.js'
import { monthGrid, sameMonth, isForMember, normalizeMemberIds } from '../lib/schedule.js'
import { fromISO, todayISO, DAY_NAMES } from '../lib/date.js'

/** A month at a glance — the view a family planner is actually judged on. */
export default function MonthView({ state, cursor, who, onPick, members }) {
  const grid = monthGrid(cursor)
  const today = todayISO()

  return (
    <div className="month">
      <div className="monthhead">
        {DAY_NAMES.map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="monthgrid">
        {grid.map((iso) => {
          const inMonth = sameMonth(iso, cursor)
          const events = allEventsOn(state, iso).filter((e) => who === 'all' || isForMember(e, who))
          const choreCount = who === 'all'
            ? 0
            : choresOn(state, who, iso).length

          return (
            <button
              key={iso}
              className={`monthcell ${inMonth ? '' : 'dim'} ${iso === today ? 'today' : ''}`}
              onClick={() => onPick(iso)}
            >
              <span className="num">{fromISO(iso).getDate()}</span>

              <span className="bits">
                {events.slice(0, 3).map((e) => {
                  const ids = normalizeMemberIds(e)
                  const owner = ids.length === 1 ? members.find((m) => m.id === ids[0]) : null
                  return (
                    <span
                      key={e.id}
                      className={`mbit ${e.away ? 'away' : ''}`}
                      style={{ '--c': owner?.color || 'var(--accent-2)' }}
                      title={e.title}
                    >
                      {e.emoji} {e.title}
                    </span>
                  )
                })}
                {events.length > 3 && <span className="mmore">+{events.length - 3}</span>}
              </span>

              {choreCount > 0 && <span className="chorepip">{choreCount}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
