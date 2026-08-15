import { useState } from 'react'
import { useApp } from '../store/AppContext.jsx'
import { Sheet, Ring, timeAgo } from '../components/ui.jsx'
import RecordsPanel from '../components/RecordsPanel.jsx'
import KindnessWall from '../components/KindnessWall.jsx'
import { leaderboard, byId, dayStats, memberProgress } from '../store/selectors.js'
import { BADGES } from '../lib/gamify.js'
import { todayISO } from '../lib/date.js'

export default function Family({ go }) {
  const app = useApp()
  const { state } = app
  const me = app.currentMember
  const board = leaderboard(state)
  const [open, setOpen] = useState(null)

  const podium = board.slice(0, 3)
  const rest = board.slice(3)
  const totalToday = state.members.reduce((n, m) => n + dayStats(state, m.id, todayISO()).done, 0)
  const totalXp = state.members.reduce((n, m) => n + m.xp, 0)

  return (
    <div className="screen" style={{ '--member': me.color }}>
      <div className="spread" style={{ margin: '4px 0 12px' }}>
        <h1 style={{ fontSize: 26 }}>Family</h1>
        {app.isParentMode ? (
          <button className="btn sm" onClick={() => go('manage')}>⚙️ Manage</button>
        ) : (
          <button className="btn sm ghost" onClick={() => go('manage')}>🔐 Parents</button>
        )}
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 6 }}>
        <div className="card grow center">
          <b style={{ fontSize: 22, fontFamily: 'Baloo 2' }}>{totalToday}</b>
          <div className="tiny">DONE TODAY</div>
        </div>
        <div className="card grow center">
          <b style={{ fontSize: 22, fontFamily: 'Baloo 2' }}>{totalXp.toLocaleString()}</b>
          <div className="tiny">FAMILY XP</div>
        </div>
        <div className="card grow center">
          <b style={{ fontSize: 22, fontFamily: 'Baloo 2' }}>{Math.max(0, ...state.members.map((m) => m.streak))}</b>
          <div className="tiny">BEST STREAK</div>
        </div>
      </div>

      <div className="cols">
      <div className="col">

      <div className="section-title">🏆 Leaderboard</div>

      {podium.length === 3 && (
        <div className="podium">
          {[podium[1], podium[0], podium[2]].map((p, i) => (
            <div
              key={p.member.id}
              className={`pod ${i === 1 ? 'first' : ''}`}
              style={{ '--c': p.member.color }}
              onClick={() => setOpen(p.member)}
            >
              <div style={{ fontSize: 13 }}>{i === 1 ? '🥇' : i === 0 ? '🥈' : '🥉'}</div>
              <div className="face">{p.member.emoji}</div>
              <div className="nm">{p.member.name}</div>
              <div className="sc">{p.member.xp.toLocaleString()} XP</div>
            </div>
          ))}
        </div>
      )}

      <div className="lb">
        {(podium.length === 3 ? rest : board).map((p, i) => {
          const place = (podium.length === 3 ? 4 : 1) + i
          return (
            <div key={p.member.id} className={`lbrow p${place}`} onClick={() => setOpen(p.member)}>
              <div className="place">{place}</div>
              <div className="face">{p.member.emoji}</div>
              <div>
                <b>{p.member.name}</b>
                <div className="tiny">{p.rank.emoji} {p.rank.name} · Lv {p.level}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <b>{p.member.xp.toLocaleString()}</b>
                <div className="tiny">🔥 {p.member.streak} · 🪙 {p.member.coins}</div>
              </div>
            </div>
          )
        })}
      </div>

      <a
        className="card tap sagalink"
        href="./saga.html"
        target="_blank"
        rel="noopener"
        style={{ display: 'block', textDecoration: 'none', color: 'inherit', marginTop: 12 }}
      >
        <div className="row">
          <span style={{ fontSize: 26 }}>⚔️</span>
          <div className="grow">
            <b>Watch the Saga</b>
            <div className="tiny">
              A three-minute cartoon of how all of this works — starring your actual family.
            </div>
          </div>
          <span style={{ fontSize: 20, opacity: .5 }}>›</span>
        </div>
      </a>

      <KindnessWall />

      <RecordsPanel />

      </div>
      <div className="col">

      <div className="section-title">📣 What's been happening</div>
      <div className="card">
        <div className="feed">
          {state.activity.slice(0, 12).map((a) => {
            const m = byId(state.members, a.memberId)
            return (
              <div className="feeditem" key={a.id}>
                <span className="e">{a.emoji}</span>
                <span className="grow"><b>{m?.name || 'Someone'}</b> {a.text}</span>
                <span className="t">{timeAgo(a.at)}</span>
              </div>
            )
          })}
          {state.activity.length === 0 && <p className="muted center" style={{ padding: 12 }}>Nothing yet — get a chore approved to start the feed.</p>}
        </div>
      </div>

      </div>
      </div>

      <MemberSheet member={open} onClose={() => setOpen(null)} />
    </div>
  )
}

function MemberSheet({ member, onClose }) {
  const app = useApp()
  if (!member) return null
  const prog = memberProgress(member)
  const stats = dayStats(app.state, member.id, todayISO())

  return (
    <Sheet open onClose={onClose} title={`${member.emoji} ${member.name}`} lede={`${prog.rank.emoji} ${prog.rank.name} · Level ${prog.level}`}>
      <div style={{ '--member': member.color }}>
        <div className="hero" style={{ marginBottom: 14 }}>
          <div className="spread">
            <div>
              <div className="who" style={{ fontSize: 20 }}>{member.xp.toLocaleString()} XP</div>
              <div className="rank">{member.totalApproved} tasks approved all-time</div>
            </div>
            <Ring pct={stats.pct} size={62} label={`${stats.done}/${stats.total}`} sub="TODAY" />
          </div>
          <div className="xpbar"><i style={{ width: `${prog.pct}%` }} /></div>
          <div className="pills">
            <span className="pill fire">🔥 {member.streak}</span>
            <span className="pill coin">🪙 {member.coins}</span>
            <span className="pill">🎯 {member.jobsDone} <small>jobs</small></span>
          </div>
        </div>

        <div className="section-title" style={{ marginTop: 4 }}>🏅 Badges <span className="count">{member.badges.length}/{BADGES.length}</span></div>
        <div className="badgegrid">
          {BADGES.map((b) => {
            const got = member.badges.includes(b.id)
            return (
              <div key={b.id} className={`badgeitem ${got ? 'got' : ''}`} title={b.desc}>
                <div className="b">{b.emoji}</div>
                <div className="n">{b.name}</div>
              </div>
            )
          })}
        </div>
        <p className="tiny center" style={{ marginTop: 10 }}>Tap and hold a badge to see how to earn it.</p>
      </div>
    </Sheet>
  )
}
