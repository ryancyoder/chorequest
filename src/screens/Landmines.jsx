import { useEffect, useState } from 'react'
import { useApp } from '../store/AppContext.jsx'
import { Sheet, Empty, DangerButton, timeAgo } from '../components/ui.jsx'
import ReportMineSheet from '../components/ReportMineSheet.jsx'
import DefuseSheet from '../components/DefuseSheet.jsx'
import { photoUrl } from '../lib/photos.js'
import { byId, liveLandmines, landmineSubmission, totalPot, STATUS_META } from '../store/selectors.js'
import {
  STAGES, stageOf, ratesOf, msToNextStage, formatDuration, elapsedLabel, nagFor,
} from '../lib/landmines.js'

/** Re-render once a second so the countdowns actually count down. */
function useNow(active) {
  const [, setN] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setN((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [active])
  return Date.now()
}

export default function Landmines() {
  const app = useApp()
  const { state } = app
  const me = app.currentMember
  const [reporting, setReporting] = useState(false)
  const [open, setOpen] = useState(null)
  const [defusing, setDefusing] = useState(null)

  const live = liveLandmines(state)
  const now = useNow(live.length > 0)
  const rates = ratesOf(state)
  const pot = totalPot(state)
  const history = (state.landmines || [])
    .filter((m) => m.status === 'cleared' || m.status === 'void')
    .sort((a, b) => (b.clearedAt || 0) - (a.clearedAt || 0))
    .slice(0, 8)

  return (
    <div className="screen">
      <div className="spread" style={{ margin: '4px 0 10px' }}>
        <div>
          <h1 style={{ fontSize: 26 }}>Landmines</h1>
          <p className="muted" style={{ margin: 0 }}>
            Messes nobody owned up to. They get more expensive the longer they sit.
          </p>
        </div>
        {pot > 0 && (
          <span className="pill coin" style={{ fontSize: 15 }}>💰 {pot} <small>in the pot</small></span>
        )}
      </div>

      <button className="btn no xl wide" style={{ margin: '12px 0 6px' }} onClick={() => setReporting(true)}>
        💣 Someone left a mess — arm a landmine
      </button>

      <div className="section-title">
        Live right now <span className="count">{live.length}</span>
      </div>

      {live.length === 0 ? (
        <Empty emoji="🕊️" title="The house is at peace">
          No active landmines. Somebody is actually cleaning up after themselves.
        </Empty>
      ) : (
        <div className="stack cards">
          {live.map((mine) => (
            <MineCard
              key={mine.id}
              mine={mine}
              state={state}
              rates={rates}
              now={now}
              onOpen={() => setOpen(mine)}
            />
          ))}
        </div>
      )}

      {history.length > 0 && (
        <>
          <div className="section-title">🕓 Settled</div>
          <div className="card">
            <div className="feed">
              {history.map((m) => {
                const who = byId(state.members, m.clearedBy)
                return (
                  <div className="feeditem" key={m.id}>
                    <span className="e">{m.status === 'void' ? '🕊️' : '🧤'}</span>
                    <span className="grow">
                      <b>{m.title}</b>
                      <div className="tiny">
                        {m.status === 'void'
                          ? `Called off${who ? ` by ${who.name}` : ''}`
                          : `Defused by ${who?.name || 'someone'}`}
                      </div>
                    </span>
                    <span className="t">{m.clearedAt ? timeAgo(m.clearedAt) : ''}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      <ReportMineSheet open={reporting} onClose={() => setReporting(false)} app={app} me={me} />

      <MineSheet
        mine={open}
        onClose={() => setOpen(null)}
        onDefuse={(m) => { setOpen(null); setDefusing(m) }}
      />

      <DefuseSheet
        open={!!defusing}
        mine={defusing}
        member={me}
        onClose={() => setDefusing(null)}
      />
    </div>
  )
}

function MineCard({ mine, state, rates, now, onOpen }) {
  const stage = STAGES[stageOf(mine, rates, now)]
  const owner = byId(state.members, mine.ownerId)
  const pic = photoUrl(mine.photoId)
  const next = msToNextStage(mine, rates, now)
  const defusing = mine.status === 'defusing'

  return (
    <div
      className={`card tap mine ${stage.key} ${defusing ? 'settling' : ''}`}
      onClick={onOpen}
    >
      <div className="row" style={{ alignItems: 'flex-start' }}>
        {pic ? (
          <img src={pic} alt="" className="minepic" />
        ) : (
          <div className="minepic placeholder">💣</div>
        )}
        <div className="grow">
          <div className="row wrap" style={{ gap: 6 }}>
            <span className={`badge-status ${stage.tone}`}>{stage.emoji} {stage.label}</span>
            {mine.disputed && <span className="badge-status info">🙅 Disputed</span>}
            {defusing && <span className="badge-status info">⏳ Being reviewed</span>}
            {mine.confessed && <span className="badge-status good">🙋 Owned up</span>}
          </div>

          <div style={{ fontWeight: 800, fontSize: 15.5, marginTop: 5 }}>{mine.title}</div>

          <div className="tiny" style={{ marginTop: 5, display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            {mine.location && <span>📍 {mine.location}</span>}
            <span>⏱️ {elapsedLabel(mine, now)} old</span>
            {owner ? <span>🫵 {owner.emoji} {owner.name}</span> : <span>🤷 Unclaimed</span>}
          </div>

          <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
            {mine.pot > 0 && <span className="reward-chip">💰 {mine.pot} in the pot</span>}
            {mine.appliedDrain > 0 && (
              <span className="badge-status bad">📉 −{Math.round(mine.appliedDrain)} family pts</span>
            )}
          </div>

          {!defusing && !mine.disputed && next != null && (
            <div className="fuse">
              <div className="fusebar"><i style={{ width: `${fusePct(mine, rates, now)}%` }} /></div>
              <div className="tiny" style={{ marginTop: 4 }}>
                {nextLabel(mine, rates, now)} in {formatDuration(next)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function fusePct(mine, rates, now) {
  const elapsed = now - mine.armedAt
  const marks = [0, rates.graceMins, rates.smokingMins, rates.detonatedMins].map((m) => m * 60000)
  for (let i = 1; i < marks.length; i++) {
    if (elapsed < marks[i]) {
      return Math.round(((elapsed - marks[i - 1]) / (marks[i] - marks[i - 1])) * 100)
    }
  }
  return 100
}

function nextLabel(mine, rates, now) {
  const mins = (now - mine.armedAt) / 60000
  if (mins < rates.graceMins) return 'Family starts losing points'
  if (mins < rates.smokingMins) return 'Streak burns'
  return 'Fines start'
}

/* ─────────────────────────── detail ─────────────────────────── */

function MineSheet({ mine, onClose, onDefuse }) {
  const app = useApp()
  const { state } = app
  const me = app.currentMember
  const [assigning, setAssigning] = useState(false)
  const now = useNow(!!mine)

  if (!mine) return null

  const rates = ratesOf(state)
  const stage = STAGES[stageOf(mine, rates, now)]
  const owner = byId(state.members, mine.ownerId)
  const reporter = byId(state.members, mine.reporterId)
  const pic = photoUrl(mine.photoId)
  const sub = landmineSubmission(state, mine.id)
  const subMeta = sub && mine.status === 'defusing' ? STATUS_META[sub.status] : null
  const isOwner = mine.ownerId === me.id
  const canDefuse = mine.status === 'armed'

  return (
    <Sheet open onClose={onClose} title={`${stage.emoji} ${mine.title}`} lede={`${stage.label} · ${elapsedLabel(mine, now)} old`}>
      {pic && (
        <div className="camwrap" style={{ marginBottom: 14 }}>
          <img src={pic} alt="The mess" />
        </div>
      )}

      <div className={`verdict ${stage.tone === 'bad' ? 'fail' : 'pass'}`} style={{ marginBottom: 14 }}>
        <div className="big">{stage.emoji}</div>
        <h3>{stage.label}</h3>
        <p>{stage.blurb}</p>
      </div>

      {mine.notes && <p className="muted" style={{ marginTop: 0 }}>“{mine.notes}”</p>}

      <div className="row wrap" style={{ margin: '12px 0' }}>
        {mine.location && <span className="pill">📍 <small>{mine.location}</small></span>}
        <span className="pill">📸 <small>reported by {reporter?.name || 'someone'}</small></span>
        {owner ? (
          <span className="pill" style={{ borderColor: owner.color }}>{owner.emoji} <small>{owner.name}</small></span>
        ) : (
          <span className="pill">🤷 <small>unclaimed</small></span>
        )}
        {mine.pot > 0 && <span className="pill coin">💰 {mine.pot} <small>pot</small></span>}
      </div>

      {mine.status === 'defusing' ? (
        <div className="card center" style={{ marginBottom: 14 }}>
          <b>{subMeta?.emoji || '⏳'} Cleanup submitted by {byId(state.members, sub?.memberId)?.name}</b>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            The clock is stopped until a parent approves it.
          </p>
        </div>
      ) : (
        <p className="muted" style={{ marginBottom: 14 }}>{nagFor(mine)}</p>
      )}

      {mine.disputed && (
        <div className="warnbox" style={{ marginBottom: 14 }}>
          🙅 Disputed — everything is paused until a parent rules on it.
        </div>
      )}

      {owner && mine.status === 'armed' && !mine.disputed && (
        <div className="warnbox" style={{ marginBottom: 14 }}>
          🧊 {owner.name} isn't losing anything they earn — it's held in escrow and lands the second
          this is cleared. {(owner.escrowXp || 0) > 0 && <b>{owner.escrowXp} points waiting.</b>}
        </div>
      )}

      <div className="stack">
        {canDefuse && (
          <button className="btn go xl wide" onClick={() => onDefuse(mine)}>
            🧤 {isOwner ? 'Clean up my mess' : mine.pot > 0 ? `Defuse it and take ${mine.pot} coins` : 'Defuse it'}
          </button>
        )}

        {canDefuse && !mine.ownerId && (
          <button className="btn wide" onClick={() => app.confessLandmine(mine.id, me.id)}>
            🙋 It was me — own up (half the pot back, clock resets)
          </button>
        )}

        {canDefuse && isOwner && !mine.disputed && !mine.confessed && (
          <button className="btn wide ghost" onClick={() => app.disputeLandmine(mine.id, me.id)}>
            🙅 Wasn't me — dispute it
          </button>
        )}

        {canDefuse && !isOwner && (
          <button className="btn wide ghost" onClick={() => setAssigning(true)}>
            🫵 {mine.ownerId ? 'Change who owns it' : 'Name a name'}
          </button>
        )}

        {app.isParentMode && (
          <>
            {mine.disputed && (
              <button className="btn wide" onClick={() => app.upholdLandmine(mine.id, me.id)}>
                ⚖️ Uphold it — restart the clock
              </button>
            )}
            <DangerButton
              className="btn no wide"
              confirmLabel="Tap again to call it off"
              onConfirm={() => { app.voidLandmine(mine.id, me.id); onClose() }}
            >
              🕊️ Call it off (false alarm)
            </DangerButton>
          </>
        )}
      </div>

      <Sheet open={assigning} onClose={() => setAssigning(false)} title="Who left this?">
        <div className="chipgroup">
          {state.members.map((m) => (
            <button
              key={m.id}
              className="chip"
              style={{ '--member': m.color }}
              onClick={() => { app.assignLandmine(mine.id, m.id, me.id); setAssigning(false) }}
            >
              {m.emoji} {m.name}
            </button>
          ))}
        </div>
        <p className="tiny" style={{ marginTop: 12 }}>
          They'll be able to dispute it, which pauses everything until a parent rules. Choose wisely.
        </p>
      </Sheet>
    </Sheet>
  )
}
