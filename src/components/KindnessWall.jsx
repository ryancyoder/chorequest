import { useState } from 'react'
import { useApp } from '../store/AppContext.jsx'
import { timeAgo } from './ui.jsx'
import StarSheet from './StarSheet.jsx'
import { photoUrl } from '../lib/photos.js'
import { byId } from '../store/selectors.js'
import { confirmedStars, kindnessBoard, categoryOf, pendingStars } from '../lib/kindness.js'

/**
 * The wall. The one screen in the app that's about who these kids are rather
 * than what they produced — so nothing here ever expires or gets spent.
 */
export default function KindnessWall() {
  const app = useApp()
  const me = app.currentMember
  const [giving, setGiving] = useState(false)

  const wall = confirmedStars(app.state)
  const board = kindnessBoard(app.state).filter((b) => b.received > 0 || b.given > 0)
  const waiting = pendingStars(app.state)
  const mineWaiting = waiting.filter((s) => s.fromId === me.id).length

  return (
    <>
      <div className="section-title">⭐ The wall</div>

      <button className="btn go xl wide starcta" onClick={() => setGiving(true)}>
        ⭐ Catch someone being good
      </button>

      {mineWaiting > 0 && (
        <p className="tiny" style={{ margin: '8px 2px 0' }}>
          {mineWaiting} of yours {mineWaiting === 1 ? 'is' : 'are'} waiting on a parent.
        </p>
      )}

      {board.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="tiny" style={{ marginBottom: 8 }}>NOTICED · AND NOTICING</div>
          {board.map(({ member, received, given }) => (
            <div className="spread starrow" key={member.id}>
              <span className="row" style={{ gap: 8 }}>
                <span style={{ fontSize: 18 }}>{member.emoji}</span>
                <b style={{ fontSize: 13.5 }}>{member.name}</b>
              </span>
              <span className="row" style={{ gap: 6 }}>
                <span className="reward-chip">⭐ {received}</span>
                <span className="tiny">gave {given}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="stack cards" style={{ marginTop: 12 }}>
        {wall.length === 0 && (
          <div className="card center">
            <p className="muted" style={{ margin: 0 }}>
              Nothing on the wall yet. Somebody in this house did something decent today —
              go be the one who noticed.
            </p>
          </div>
        )}

        {wall.slice(0, 14).map((s) => {
          const to = byId(app.state.members, s.toId)
          const from = byId(app.state.members, s.fromId)
          const cat = categoryOf(s.category)
          const pic = photoUrl(s.photoId)
          return (
            <div key={s.id} className={`card star ${s.category}`}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                {pic
                  ? <img src={pic} alt="" className="starpic" />
                  : <div className="starpic placeholder">{cat.emoji}</div>}
                <div className="grow">
                  <div className="row wrap" style={{ gap: 6 }}>
                    <span className="badge-status good">{cat.emoji} {cat.label}</span>
                    <span className="tiny">{timeAgo(s.createdAt)}</span>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 14.5, marginTop: 4 }}>
                    {to?.emoji} {to?.name}
                  </div>
                  {s.text && <p className="muted" style={{ margin: '3px 0 0' }}>“{s.text}”</p>}
                  <div className="tiny" style={{ marginTop: 5 }}>
                    noticed by {from?.emoji} {from?.name} · +{s.points}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <StarSheet open={giving} onClose={() => setGiving(false)} app={app} me={me} />
    </>
  )
}

/** Parent-side confirmation queue — lives on the Review screen. */
export function StarQueue() {
  const app = useApp()
  const me = app.currentMember
  const waiting = pendingStars(app.state)
  if (!waiting.length) return null

  return (
    <>
      <div className="section-title">⭐ Kindness to confirm <span className="count">{waiting.length}</span></div>
      <div className="stack">
        {waiting.map((s) => {
          const to = byId(app.state.members, s.toId)
          const from = byId(app.state.members, s.fromId)
          const cat = categoryOf(s.category)
          const pic = photoUrl(s.photoId)
          return (
            <div key={s.id} className={`card star ${s.category}`}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                {pic
                  ? <img src={pic} alt="" className="starpic" />
                  : <div className="starpic placeholder">{cat.emoji}</div>}
                <div className="grow">
                  <span className="badge-status good">{cat.emoji} {cat.label}</span>
                  <div style={{ fontWeight: 800, fontSize: 14.5, marginTop: 4 }}>
                    {from?.name} says {to?.name} {s.text ? '—' : 'deserves one'}
                  </div>
                  {s.text && <p className="muted" style={{ margin: '3px 0 0' }}>“{s.text}”</p>}
                  <div className="tiny" style={{ marginTop: 4 }}>Worth +{s.points} to {to?.name}</div>
                </div>
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn go sm grow" onClick={() => app.confirmStar(s.id, me.id)}>
                  ⭐ Put it on the wall
                </button>
                <button className="btn sm ghost" onClick={() => app.declineStar(s.id, me.id)}>
                  Not this one
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
