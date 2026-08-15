import { useState } from 'react'
import { useApp } from '../store/AppContext.jsx'
import { Sheet, DangerButton } from './ui.jsx'
import {
  streakOf, tracksFor, kindCopy, nextMilestone,
  VIRTUE_IDEAS, VICE_IDEAS, canLog,
} from '../lib/records.js'
import { todayISO, addDays } from '../lib/date.js'

/**
 * The daily ritual. This has to be a ten-second interaction or it won't happen,
 * so it's one tap per track and nothing else.
 */
export default function CheckInCard({ member }) {
  const app = useApp()
  const [adding, setAdding] = useState(false)
  const [detail, setDetail] = useState(null)

  const today = todayISO()
  const tracks = tracksFor(app.state, member.id)
  const answered = tracks.filter((t) => (t.log || {})[today]).length

  if (!tracks.length) {
    return (
      <>
        <div className="card tap prcard-empty" onClick={() => setAdding(true)}>
          <div className="row">
            <span style={{ fontSize: 26 }}>🏅</span>
            <div className="grow">
              <b>Set a personal record</b>
              <div className="tiny">
                Pick something to start doing — or something to quit. You choose it, the family cheers it.
              </div>
            </div>
            <span style={{ fontSize: 20, opacity: .5 }}>＋</span>
          </div>
        </div>
        <AddTrackSheet open={adding} onClose={() => setAdding(false)} member={member} app={app} />
      </>
    )
  }

  return (
    <>
      <div className="section-title">
        🏅 Personal records <span className="count">{answered}/{tracks.length} checked in</span>
      </div>

      <div className="stack">
        {tracks.map((t) => (
          <TrackRow key={t.id} track={t} member={member} app={app} onOpen={() => setDetail(t)} />
        ))}

        <button className="btn ghost wide sm" onClick={() => setAdding(true)}>
          ＋ Add something to work on
        </button>
      </div>

      <AddTrackSheet open={adding} onClose={() => setAdding(false)} member={member} app={app} />
      <TrackSheet track={detail} member={member} onClose={() => setDetail(null)} />
    </>
  )
}

function TrackRow({ track, member, app, onOpen }) {
  const today = todayISO()
  const copy = kindCopy(track.kind)
  const logged = (track.log || {})[today]
  const streak = streakOf(track, today)
  const next = nextMilestone(streak)
  const isMe = app.currentMember.id === member.id

  return (
    <div className={`task track ${track.kind} ${logged === 'hit' ? 'hit' : logged === 'slip' ? 'slipped' : ''}`}>
      <div className="ico" onClick={onOpen}>{track.emoji}</div>

      <div className="grow" onClick={onOpen}>
        <div className="ttl">{track.title}</div>
        <div className="sub">
          <span className={`badge-status ${track.kind === 'vice' ? 'warn' : 'info'}`}>{copy.label}</span>
          <span>{streak > 0 ? `🔥 ${streak} ${copy.streakWord}` : 'day one'}</span>
          {track.best > 0 && <span>🏅 best {track.best}</span>}
          {next && streak > 0 && <span className="tiny">{next - streak} to {next}</span>}
        </div>
      </div>

      {isMe && (
        logged ? (
          <button
            className={`btn sm ${logged === 'hit' ? 'go' : 'no'}`}
            onClick={() => app.logTrackDay(track.id, today, null)}
            title="Tap to undo"
          >
            {logged === 'hit' ? '✅' : '↩︎'}
          </button>
        ) : (
          <div className="row" style={{ gap: 6 }}>
            <button className="btn go sm" onClick={() => app.logTrackDay(track.id, today, 'hit')}>
              {copy.verb}
            </button>
            <button
              className="btn sm ghost"
              style={{ opacity: .65 }}
              onClick={() => app.logTrackDay(track.id, today, 'slip')}
              title="Be honest — the record still stands"
            >
              ✕
            </button>
          </div>
        )
      )}
    </div>
  )
}

/* ─────────────────────── track detail + history ─────────────────────── */

function TrackSheet({ track, member, onClose }) {
  const app = useApp()
  if (!track) return null

  const today = todayISO()
  const copy = kindCopy(track.kind)
  const streak = streakOf(track, today)
  const next = nextMilestone(streak)
  const isMe = app.currentMember.id === member.id
  const yesterday = addDays(today, -1)
  const yLog = (track.log || {})[yesterday]

  // Last 21 days, oldest first.
  const days = Array.from({ length: 21 }, (_, i) => addDays(today, -(20 - i)))

  return (
    <Sheet open onClose={onClose} title={`${track.emoji} ${track.title}`} lede={`${copy.prefix} · ${copy.label.toLowerCase()}`}>
      <div className="row" style={{ gap: 8, marginBottom: 14 }}>
        <div className="card grow center">
          <b style={{ fontSize: 24, fontFamily: 'Baloo 2' }}>{streak}</b>
          <div className="tiny">CURRENT</div>
        </div>
        <div className="card grow center" style={{ borderColor: '#ffd60a55' }}>
          <b style={{ fontSize: 24, fontFamily: 'Baloo 2', color: 'var(--gold)' }}>{track.best}</b>
          <div className="tiny">PERSONAL BEST</div>
        </div>
        {next && (
          <div className="card grow center">
            <b style={{ fontSize: 24, fontFamily: 'Baloo 2' }}>{next}</b>
            <div className="tiny">NEXT MILESTONE</div>
          </div>
        )}
      </div>

      <div className="tiny" style={{ marginBottom: 8 }}>LAST THREE WEEKS</div>
      <div className="dotgrid">
        {days.map((iso) => {
          const v = (track.log || {})[iso]
          return (
            <span
              key={iso}
              className={`dotday ${v || 'none'} ${iso === today ? 'today' : ''}`}
              title={`${iso}${v ? ` — ${v}` : ''}`}
            />
          )
        })}
      </div>
      <p className="tiny" style={{ marginTop: 8 }}>
        A slip resets the streak but never the record. Your best stands at {track.best}.
      </p>

      {isMe && canLog(yesterday) && !yLog && (
        <>
          <div className="divider" />
          <div className="tiny" style={{ marginBottom: 8 }}>FORGOT YESTERDAY?</div>
          <p className="muted" style={{ marginTop: 0 }}>
            You can fill in yesterday and only yesterday — enough for real life, not enough to invent a week.
          </p>
          <div className="row">
            <button className="btn go sm grow" onClick={() => app.logTrackDay(track.id, yesterday, 'hit')}>
              {copy.verb} yesterday
            </button>
            <button className="btn sm" onClick={() => app.logTrackDay(track.id, yesterday, 'slip')}>
              I slipped
            </button>
          </div>
        </>
      )}

      {isMe && (
        <>
          <div className="divider" />
          <DangerButton
            className="btn no wide sm"
            confirmLabel="Tap again to retire it"
            onConfirm={() => { app.archiveTrack(track.id); onClose() }}
          >
            Retire this one (the record is kept)
          </DangerButton>
        </>
      )}
    </Sheet>
  )
}

/* ─────────────────────── adding a track ─────────────────────── */

function AddTrackSheet({ open, onClose, member, app }) {
  const [kind, setKind] = useState('virtue')
  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState('⭐')

  if (!open) return null
  const ideas = kind === 'vice' ? VICE_IDEAS : VIRTUE_IDEAS
  const copy = kindCopy(kind)

  function save() {
    app.addTrack({ memberId: member.id, kind, title, emoji })
    setTitle(''); setEmoji('⭐'); setKind('virtue')
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="🏅 What are you working on?"
      lede="You pick it. Nobody assigns these."
    >
      <div className="tabbar" style={{ marginBottom: 14 }}>
        <button className={kind === 'virtue' ? 'on' : ''} onClick={() => { setKind('virtue'); setEmoji('⭐') }}>
          🌱 Start doing
        </button>
        <button className={kind === 'vice' ? 'on' : ''} onClick={() => { setKind('vice'); setEmoji('🚫') }}>
          🚭 Stop doing
        </button>
      </div>

      <p className="muted" style={{ marginTop: 0 }}>{copy.emptyHint}</p>

      {kind === 'vice' && (
        <div className="warnbox" style={{ marginBottom: 14 }}>
          Only put something here you're happy for the whole family to see. This board is for the
          things you want them cheering you on for.
        </div>
      )}

      <div className="tiny" style={{ marginBottom: 8 }}>PICK ONE, OR WRITE YOUR OWN</div>
      <div className="stack" style={{ marginBottom: 14 }}>
        {ideas.map((i) => (
          <button
            key={i.title}
            className={`chip ${title === i.title ? 'on' : ''}`}
            style={{ textAlign: 'left', padding: '10px 12px' }}
            onClick={() => { setTitle(i.title); setEmoji(i.emoji) }}
          >
            {i.emoji}  {i.title}
          </button>
        ))}
      </div>

      <label className="field">
        <span>Your own words</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={ideas[0].title} />
      </label>

      <button className="btn primary xl wide" disabled={!title.trim()} onClick={save}>
        {kind === 'vice' ? '🚭 Put it on the board' : '🌱 Start day one'}
      </button>
    </Sheet>
  )
}
