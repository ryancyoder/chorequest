import { useEffect, useState } from 'react'
import { useApp } from './store/AppContext.jsx'
import { Confetti } from './components/ui.jsx'
import { BADGES } from './lib/gamify.js'
import { dayStats, pendingApprovals, memberProgress } from './store/selectors.js'
import { todayISO } from './lib/date.js'

import Today from './screens/Today.jsx'
import Schedule from './screens/Schedule.jsx'
import Jobs from './screens/Jobs.jsx'
import Rewards from './screens/Rewards.jsx'
import Family from './screens/Family.jsx'
import Review from './screens/Review.jsx'
import Manage from './screens/Manage.jsx'

const TABS = [
  { key: 'today', icon: '🏠', label: 'Today' },
  { key: 'schedule', icon: '📅', label: 'Schedule' },
  { key: 'jobs', icon: '🎯', label: 'Jobs' },
  { key: 'rewards', icon: '🎁', label: 'Rewards' },
  { key: 'family', icon: '🏆', label: 'Family' },
]

export default function App() {
  const app = useApp()
  const [tab, setTab] = useState('today')
  const me = app.currentMember
  const queue = pendingApprovals(app.state)

  // Keep the accent color in sync with whoever is holding the phone.
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
    rewards: <Rewards />,
    family: <Family go={setTab} />,
    review: <Review />,
    manage: <Manage />,
  }

  return (
    <div className="app" style={{ '--member': me.color }}>
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

      {screens[tab]}

      <nav className="nav">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
            <i>{t.icon}</i>
            {t.label}
            {t.key === 'family' && app.isParentMode && queue.length > 0 && (
              <span className="dotbadge">{queue.length}</span>
            )}
          </button>
        ))}
      </nav>

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
