import { useEffect, useState } from 'react'
import { useApp } from './store/AppContext.jsx'
import { Confetti } from './components/ui.jsx'
import { BADGES } from './lib/gamify.js'
import { dayStats, pendingApprovals, memberProgress } from './store/selectors.js'
import { todayISO, prettyDate } from './lib/date.js'

import Today from './screens/Today.jsx'
import Schedule from './screens/Schedule.jsx'
import Jobs from './screens/Jobs.jsx'
import Rewards from './screens/Rewards.jsx'
import Family from './screens/Family.jsx'
import Review from './screens/Review.jsx'
import Manage from './screens/Manage.jsx'
import Landmines from './screens/Landmines.jsx'
import LandmineBanner from './components/LandmineBanner.jsx'
import { liveLandmines } from './store/selectors.js'

const TABS = [
  { key: 'today', icon: '🏠', label: 'Today' },
  { key: 'schedule', icon: '📅', label: 'Schedule' },
  { key: 'jobs', icon: '🎯', label: 'Jobs' },
  { key: 'mines', icon: '💣', label: 'Mines' },
  { key: 'rewards', icon: '🎁', label: 'Rewards' },
  { key: 'family', icon: '🏆', label: 'Family' },
]

export default function App() {
  const app = useApp()
  const [tab, setTab] = useState('today')
  const me = app.currentMember
  const queue = pendingApprovals(app.state)
  const tablet = app.layout === 'tablet'

  // Keep the accent color in sync with whoever is holding the device.
  useEffect(() => {
    document.documentElement.style.setProperty('--member', me.color)
  }, [me.color])

  if (!app.ready) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 52 }}>🧹</div>
          <p className="muted">Waking up ChoreQuest…</p>
        </div>
      </div>
    )
  }

  const screens = {
    today: <Today go={setTab} />,
    schedule: <Schedule />,
    jobs: <Jobs />,
    mines: <Landmines />,
    rewards: <Rewards />,
    family: <Family go={setTab} />,
    review: <Review />,
    manage: <Manage />,
  }

  const mineCount = liveLandmines(app.state).length

  return (
    <div className={`app ${tablet ? 'tablet' : 'phone'}`} style={{ '--member': me.color }}>
      {tablet ? (
        <Rail tab={tab} setTab={setTab} queue={queue} app={app} me={me} />
      ) : (
        <PhoneBar tab={tab} setTab={setTab} queue={queue} app={app} me={me} />
      )}

      <main className="content">
        {tablet && <TabletHeader tab={tab} me={me} app={app} queue={queue} setTab={setTab} />}
        {tab !== 'mines' && <LandmineBanner onOpen={() => setTab('mines')} />}
        {screens[tab]}
      </main>

      {!tablet && (
        <nav className="nav">
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
              <i>{t.icon}</i>
              {t.label}
              {t.key === 'family' && app.isParentMode && queue.length > 0 && (
                <span className="dotbadge">{queue.length}</span>
              )}
              {t.key === 'mines' && mineCount > 0 && <span className="dotbadge">{mineCount}</span>}
            </button>
          ))}
        </nav>
      )}

      {app.toast && (
        <div className="toast" key={app.toast.at}>
          <span style={{ fontSize: 18 }}>{app.toast.emoji}</span>
          {app.toast.text}
        </div>
      )}

      {app.celebration && <Celebration data={app.celebration} onClose={app.dismissCelebration} />}
    </div>
  )
}

/* ─────────────────────────── phone chrome ─────────────────────────── */

function PhoneBar({ tab, setTab, queue, app, me }) {
  return (
    <header className="topbar">
      <div className="spread">
        <div className="brand"><span className="dot" /> ChoreQuest</div>
        <div className="row">
          {app.isParentMode && (
            <button className="btn sm" onClick={() => setTab('review')}>
              📋 Review{queue.length > 0 && ` · ${queue.length}`}
            </button>
          )}
          {me.role === 'parent' && !app.isParentMode && (
            <button className="btn sm ghost" onClick={() => setTab('review')}>🔐 Parent mode</button>
          )}
        </div>
      </div>

      <div className="memberstrip">
        {app.state.members.map((m) => {
          const st = dayStats(app.state, m.id, todayISO())
          const prog = memberProgress(m)
          return (
            <button
              key={m.id}
              className={`chipmember ${m.id === me.id ? 'on' : ''}`}
              style={{ '--c': m.color }}
              onClick={() => app.switchMember(m.id)}
            >
              <span className="face">{m.emoji}</span>
              <span className="nm">{m.name}</span>
              <span className="mini">
                {m.role === 'child' ? `Lv${prog.level} · ${st.done}/${st.total}` : '👑'}
              </span>
            </button>
          )
        })}
      </div>
    </header>
  )
}

/* ─────────────────────────── tablet chrome ─────────────────────────── */

function Rail({ tab, setTab, queue, app, me }) {
  const mineCount = liveLandmines(app.state).length
  const items = TABS.map((t) => (t.key === 'mines' ? { ...t, label: 'Landmines', badge: mineCount } : t))
  if (app.isParentMode) items.push({ key: 'review', icon: '📋', label: 'Review', badge: queue.length })

  return (
    <aside className="rail">
      <div className="brand" style={{ padding: '6px 8px 2px' }}>
        <span className="dot" /> ChoreQuest
      </div>

      <nav className="railnav">
        {items.map((t) => (
          <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
            <i>{t.icon}</i>
            <span className="grow">{t.label}</span>
            {t.badge > 0 && <span className="railbadge">{t.badge}</span>}
          </button>
        ))}
      </nav>

      <div className="railsection">Who's using it</div>
      <div className="railmembers">
        {app.state.members.map((m) => {
          const st = dayStats(app.state, m.id, todayISO())
          const prog = memberProgress(m)
          return (
            <button
              key={m.id}
              className={`railmember ${m.id === me.id ? 'on' : ''}`}
              style={{ '--c': m.color }}
              onClick={() => app.switchMember(m.id)}
            >
              <span className="face">{m.emoji}</span>
              <span className="grow" style={{ textAlign: 'left' }}>
                <span className="nm">{m.name}</span>
                <span className="mini">
                  {m.role === 'parent' ? '👑 Parent' : `Lv ${prog.level} · 🔥 ${m.streak}`}
                </span>
                {m.role === 'child' && (
                  <span className="railbar"><i style={{ width: `${st.pct}%` }} /></span>
                )}
              </span>
              {m.role === 'child' && <span className="tally">{st.done}/{st.total}</span>}
            </button>
          )
        })}
      </div>

      <div className="railfoot">
        {me.role === 'parent' && !app.isParentMode && (
          <button className="btn sm wide ghost" onClick={() => setTab('review')}>🔐 Parent mode</button>
        )}
        {app.isParentMode && (
          <>
            <button className="btn sm wide ghost" onClick={() => setTab('manage')}>⚙️ Manage</button>
            <button className="btn sm wide ghost" onClick={app.lockParent}>🔒 Lock</button>
          </>
        )}
        <button
          className="btn sm wide ghost"
          onClick={() => app.setLayoutPref(app.layoutPref === 'phone' ? 'auto' : 'phone')}
          title="Switch to the phone layout"
        >
          📱 Phone layout
        </button>
      </div>
    </aside>
  )
}

function TabletHeader({ tab, me, app, queue, setTab }) {
  const st = dayStats(app.state, me.id, todayISO())
  return (
    <div className="tablethead">
      <div>
        <div className="tiny">{prettyDate(todayISO())}</div>
        <h1 style={{ fontSize: 27, marginTop: 2 }}>
          {tab === 'today' ? `${me.emoji} ${me.name}'s day` : TITLES[tab] || 'ChoreQuest'}
        </h1>
      </div>
      <div className="row">
        {me.role === 'child' && (
          <>
            <span className="pill fire">🔥 {me.streak} <small>streak</small></span>
            <span className="pill coin">🪙 {me.coins}</span>
            <span className="pill">✅ {st.done}/{st.total} <small>today</small></span>
          </>
        )}
        {app.isParentMode && queue.length > 0 && tab !== 'review' && (
          <button className="btn sm primary" onClick={() => setTab('review')}>
            📋 {queue.length} to review
          </button>
        )}
      </div>
    </div>
  )
}

const TITLES = {
  schedule: 'Family schedule',
  jobs: 'Job board',
  rewards: 'Rewards',
  family: 'Family',
  review: 'Review queue',
  manage: 'Manage',
}

/* ─────────────────────────── celebration ─────────────────────────── */

function Celebration({ data, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5200)
    return () => clearTimeout(t)
  }, [onClose])

  const badges = (data.badges || []).map((id) => BADGES.find((b) => b.id === id)).filter(Boolean)

  return (
    <>
      <Confetti count={90} />
      <div className="celebrate" onClick={onClose}>
        <div className="box" style={data.color ? { '--member': data.color } : undefined}>
          <div className="big">{data.emoji}</div>
          <h2>{data.title}</h2>
          <p>{data.subtitle}</p>

          {badges.length > 0 && (
            <>
              <div className="divider" />
              <div className="tiny" style={{ marginBottom: 8 }}>NEW BADGE{badges.length > 1 ? 'S' : ''}</div>
              <div className="row" style={{ justifyContent: 'center', gap: 12 }}>
                {badges.map((b) => (
                  <div key={b.id} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 34 }}>{b.emoji}</div>
                    <div className="tiny">{b.name}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {data.goal && (
            <>
              <div className="divider" />
              <p style={{ color: 'var(--gold)', fontWeight: 800 }}>
                {data.goal.emoji} Family goal unlocked — {data.goal.title}!
              </p>
            </>
          )}

          <button className="btn primary wide" style={{ marginTop: 16 }} onClick={onClose}>Nice</button>
        </div>
      </div>
    </>
  )
}
