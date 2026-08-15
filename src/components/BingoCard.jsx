import { useEffect, useState } from 'react'
import { useApp } from '../store/AppContext.jsx'
import { Sheet } from './ui.jsx'
import {
  cardFor, weekStartOf, completedLines, markedCount, nearMisses,
  linesThrough, isBlackout, SIZE, REWARDS,
} from '../lib/bingo.js'
import { relativeDay, addDays } from '../lib/date.js'

export default function BingoCard({ member }) {
  const app = useApp()
  const [open, setOpen] = useState(false)

  // Cards are dealt for everyone at boot; this covers a member added since.
  useEffect(() => {
    app.ensureBingoCards()
  }, [member.id, app.state.members.length])

  const card = cardFor(app.state, member.id)
  if (!card) return null

  const lines = completedLines(card)
  const marked = markedCount(card)
  const close = nearMisses(card).length
  const blackout = isBlackout(card)

  return (
    <>
      <div className="card tap bingostrip" onClick={() => setOpen(true)}>
        <div className="row">
          <MiniGrid card={card} />
          <div className="grow">
            <b style={{ fontSize: 14.5 }}>
              🎱 Chore Bingo{blackout ? ' — blacked out!' : lines.length ? ` — ${lines.length} line${lines.length > 1 ? 's' : ''}` : ''}
            </b>
            <div className="tiny" style={{ marginTop: 3 }}>
              {marked}/{SIZE * SIZE} squares
              {close > 0 && !blackout && <span style={{ color: 'var(--gold)' }}> · {close} one square away</span>}
            </div>
          </div>
          <span style={{ fontSize: 20, opacity: .5 }}>›</span>
        </div>
      </div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="🎱 Chore Bingo"
        lede={`This week's card · new one ${relativeDay(addDays(weekStartOf(), 7))}`}
      >
        <FullCard card={card} member={member} app={app} />
      </Sheet>
    </>
  )
}

function MiniGrid({ card }) {
  return (
    <div className="minigrid">
      {card.squares.map((sq, i) => (
        <span key={i} className={sq.marked ? 'on' : ''} />
      ))}
    </div>
  )
}

function FullCard({ card, member, app }) {
  const lines = completedLines(card)
  const lineKeys = new Set(lines.map((l) => l.key))
  const near = new Set(nearMisses(card).map((l) => l.key))
  const isMe = app.currentMember.id === member.id
  const blackout = isBlackout(card)

  return (
    <>
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <div className="card grow center" style={{ padding: 10 }}>
          <b style={{ fontSize: 20, fontFamily: 'Baloo 2' }}>{markedCount(card)}/25</b>
          <div className="tiny">MARKED</div>
        </div>
        <div className="card grow center" style={{ padding: 10, borderColor: lines.length ? '#ffd60a55' : undefined }}>
          <b style={{ fontSize: 20, fontFamily: 'Baloo 2', color: lines.length ? 'var(--gold)' : undefined }}>{lines.length}</b>
          <div className="tiny">LINES</div>
        </div>
        <div className="card grow center" style={{ padding: 10 }}>
          <b style={{ fontSize: 20, fontFamily: 'Baloo 2' }}>{card.linesAwarded.length * REWARDS.lineCoins}</b>
          <div className="tiny">COINS WON</div>
        </div>
      </div>

      {blackout && (
        <div className="verdict pass" style={{ marginBottom: 12 }}>
          <div className="big">🏆</div>
          <h3>Blackout</h3>
          <p>Every single square. That is the whole card.</p>
        </div>
      )}

      <div className="bingogrid">
        {card.squares.map((sq, i) => {
          const onWinningLine = linesThrough(i).some((k) => lineKeys.has(k))
          const onNearLine = !onWinningLine && linesThrough(i).some((k) => near.has(k))
          const tappable = isMe && sq.kind === 'task'
          return (
            <button
              key={i}
              className={[
                'bsq',
                sq.marked ? 'marked' : '',
                sq.kind === 'free' ? 'free' : '',
                onWinningLine ? 'winline' : '',
                onNearLine && !sq.marked ? 'nearline' : '',
                tappable ? 'tappable' : '',
              ].join(' ')}
              onClick={() => tappable && app.toggleBingoSquare(member.id, i)}
              title={sq.kind === 'chore' ? 'Marks itself when this chore is approved' : sq.text}
            >
              <span className="e">{sq.emoji}</span>
              <span className="t">{sq.text}</span>
              {sq.marked && <span className="stamp">✓</span>}
            </button>
          )
        })}
      </div>

      <div className="row wrap" style={{ gap: 8, marginTop: 14 }}>
        <span className="tiny">🧹 chores &amp; 🎯 challenges tick themselves off</span>
        <span className="tiny">· tap the small tasks yourself</span>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="spread">
          <span className="muted">Each line pays</span>
          <span className="row">
            <span className="reward-chip">+{REWARDS.linePoints} pts</span>
            <span className="reward-chip">🪙 {REWARDS.lineCoins}</span>
          </span>
        </div>
        <div className="spread" style={{ marginTop: 6 }}>
          <span className="muted">Full card</span>
          <span className="row">
            <span className="reward-chip">+{REWARDS.blackoutPoints} pts</span>
            <span className="reward-chip">🪙 {REWARDS.blackoutCoins}</span>
          </span>
        </div>
      </div>

      {app.isParentMode && (
        <button className="btn ghost wide sm" style={{ marginTop: 12 }} onClick={() => app.newBingoCard(member.id)}>
          🔀 Deal a different card
        </button>
      )}
    </>
  )
}
