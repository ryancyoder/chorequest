import { useApp } from '../store/AppContext.jsx'
import { timeAgo } from './ui.jsx'
import { byId } from '../store/selectors.js'
import {
  familyStreakTotal, streakOf, tracksFor, hasCheered, kindCopy, trophyCase,
} from '../lib/records.js'
import { todayISO } from '../lib/date.js'

/** The family-facing half of Personal Records: the record, the feed, the case. */
export default function RecordsPanel() {
  const app = useApp()
  const { state } = app
  const me = app.currentMember
  const today = todayISO()

  const total = familyStreakTotal(state, today)
  const record = state.familyRecord?.best || 0
  const pct = record ? Math.min(100, Math.round((total / record) * 100)) : 100
  const atRecord = total >= record && total > 0

  const feed = (state.prs || []).slice(0, 12)

  const withStreaks = state.members
    .map((m) => ({
      member: m,
      streak: tracksFor(state, m.id).reduce((n, t) => n + streakOf(t, today), 0),
      tracks: tracksFor(state, m.id),
    }))
    .filter((r) => r.tracks.length)
    .sort((a, b) => b.streak - a.streak)

  return (
    <>
      <div className="section-title">🏅 Personal records</div>

      {/* the household number */}
      <div className="goal" style={{ marginBottom: 12 }}>
        <div className="spread">
          <div>
            <b style={{ fontSize: 17 }}>Family streak total</b>
            <div className="tiny">Everyone's live streaks, added together</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <b style={{ fontSize: 26, fontFamily: 'Baloo 2', color: atRecord ? 'var(--gold)' : undefined }}>
              {total}
            </b>
            <div className="tiny">best {record}</div>
          </div>
        </div>
        <div className="goalbar">
          <i style={{ width: `${pct}%` }} />
          <span className="lbl">
            {atRecord ? '🏆 All-time high — right now' : `${record - total} day${record - total === 1 ? '' : 's'} off the record`}
          </span>
        </div>
      </div>

      {/* who's carrying it */}
      {withStreaks.length > 0 && (
        <div className="stack" style={{ marginBottom: 4 }}>
          {withStreaks.map(({ member, streak, tracks }) => (
            <div key={member.id} className="card" style={{ borderLeft: `4px solid ${member.color}`, padding: '10px 12px' }}>
              <div className="spread">
                <div className="row">
                  <span style={{ fontSize: 20 }}>{member.emoji}</span>
                  <div>
                    <b style={{ fontSize: 14 }}>{member.name}</b>
                    <div className="tiny">
                      {tracks.map((t) => `${t.emoji} ${streakOf(t, today)}`).join('   ')}
                    </div>
                  </div>
                </div>
                <span className="pill fire">🔥 {streak}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* the feed — PRs and comebacks only. Never slips. */}
      <div className="section-title">📣 Worth celebrating</div>
      {feed.length === 0 ? (
        <div className="card center">
          <p className="muted" style={{ margin: 0 }}>
            No records set yet. The first one is the easiest — day one beats a best of zero.
          </p>
        </div>
      ) : (
        <div className="stack">
          {feed.map((pr) => {
            const who = byId(state.members, pr.memberId)
            const cheered = hasCheered(pr, me.id)
            const mine = pr.memberId === me.id
            const copy = kindCopy(pr.kind)
            return (
              <div key={pr.id} className={`card prfeed ${pr.comeback ? 'comeback' : ''}`}>
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 26 }}>{pr.comeback ? '💪' : pr.milestone ? '🏆' : '🏅'}</span>
                  <div className="grow">
                    <b style={{ fontSize: 14.5 }}>
                      {who?.emoji} {who?.name}{' '}
                      {pr.comeback
                        ? 'got straight back on it'
                        : pr.milestone
                          ? `hit ${pr.milestone} days`
                          : `set a new record — ${pr.value}`}
                    </b>
                    <div className="tiny" style={{ marginTop: 2 }}>
                      {pr.emoji} {pr.title} · {copy.label.toLowerCase()} · {timeAgo(pr.at)}
                    </div>

                    {pr.cheers.length > 0 && (
                      <div className="cheerrow">
                        {pr.cheers.map((c, i) => {
                          const cheerer = byId(state.members, c.memberId)
                          return <span key={i} title={cheerer?.name}>{cheerer?.emoji}</span>
                        })}
                        <span className="tiny">
                          {pr.cheers.length} cheer{pr.cheers.length === 1 ? '' : 's'}
                        </span>
                      </div>
                    )}
                  </div>

                  {!mine && (
                    <button
                      className={`btn sm ${cheered ? '' : 'primary'}`}
                      disabled={cheered}
                      onClick={() => app.cheerPr(pr.id, me.id)}
                    >
                      {cheered ? '📣 Cheered' : '📣 Cheer'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* permanent records */}
      <div className="section-title">🏆 Trophy case</div>
      <div className="stack cards">
        {state.members.map((m) => {
          const trophies = trophyCase(state, m.id)
          if (!trophies.length) return null
          return (
            <div className="card" key={m.id}>
              <div className="row" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 20 }}>{m.emoji}</span>
                <b style={{ fontSize: 14 }}>{m.name}</b>
              </div>
              {trophies.map((t) => (
                <div className="spread trophyrow" key={t.id}>
                  <span className="grow tiny" style={{ color: 'var(--ink)' }}>{t.emoji} {t.title}</span>
                  <span className="reward-chip">🏅 {t.best}</span>
                </div>
              ))}
            </div>
          )
        })}
        {state.members.every((m) => !trophyCase(state, m.id).length) && (
          <div className="card center">
            <p className="muted" style={{ margin: 0 }}>Records show up here once somebody sets one.</p>
          </div>
        )}
      </div>
    </>
  )
}
