import { Fragment, useState } from 'react'
import { useApp } from '../store/AppContext.jsx'
import { Empty, Sheet, DayPicker, EmojiPicker, DangerButton } from '../components/ui.jsx'
import { choresOn, eventsOn, choreSubmission, dayStats, memberProgress } from '../store/selectors.js'
import { todayISO, weekOf, fromISO, DAY_NAMES, pretty12, relativeDay, addDays } from '../lib/date.js'

export default function Schedule() {
  const app = useApp()
  const { state } = app
  const me = app.currentMember
  const [date, setDate] = useState(todayISO())
  const [who, setWho] = useState('all') // 'all' | memberId
  const [weekOffset, setWeekOffset] = useState(0)
  const [editing, setEditing] = useState(null)

  const week = weekOf(addDays(todayISO(), weekOffset * 7))
  const focusColor = who === 'all' ? me.color : state.members.find((m) => m.id === who)?.color || me.color

  return (
    <div className="screen" style={{ '--member': focusColor }}>
      <div className="spread" style={{ margin: '4px 0 10px' }}>
        <h1 style={{ fontSize: 26 }}>Schedule</h1>
        <div className="row">
          <button className="btn sm ghost" onClick={() => setWeekOffset((w) => w - 1)}>‹</button>
          <span className="tiny">{weekOffset === 0 ? 'This week' : weekOffset === 1 ? 'Next week' : weekOffset === -1 ? 'Last week' : `${weekOffset > 0 ? '+' : ''}${weekOffset} wks`}</span>
          <button className="btn sm ghost" onClick={() => setWeekOffset((w) => w + 1)}>›</button>
        </div>
      </div>

      {/* week strip — the tablet grids show the whole week already */}
      <div className="weekstrip" style={{ display: app.layout === 'tablet' ? 'none' : undefined }}>
        {week.map((iso) => {
          const d = fromISO(iso)
          const load = who === 'all'
            ? state.members.reduce((n, m) => n + choresOn(state, m.id, iso).length + eventsOn(state, m.id, iso).length, 0)
            : choresOn(state, who, iso).length + eventsOn(state, who, iso).length
          return (
            <button
              key={iso}
              className={`daycell ${date === iso ? 'on' : ''} ${iso === todayISO() ? 'today' : ''}`}
              onClick={() => setDate(iso)}
            >
              <div className="w">{DAY_NAMES[d.getDay()]}</div>
              <div className="d">{d.getDate()}</div>
              <div className="dots">
                {Array.from({ length: Math.min(3, Math.ceil(load / 3)) }, (_, i) => <i key={i} />)}
              </div>
            </button>
          )
        })}
      </div>

      {/* who */}
      <div className="chipgroup" style={{ margin: '10px 0 4px' }}>
        <button className={`chip ${who === 'all' ? 'on' : ''}`} onClick={() => setWho('all')}>👨‍👩‍👧‍👦 Everyone</button>
        {state.members.map((m) => (
          <button
            key={m.id}
            className={`chip ${who === m.id ? 'on' : ''}`}
            style={who === m.id ? { '--member': m.color } : undefined}
            onClick={() => setWho(m.id)}
          >
            {m.emoji} {m.name}
          </button>
        ))}
      </div>

      <div className="section-title">
        {app.layout === 'tablet'
          ? (who === 'all' ? 'The whole week' : `${state.members.find((m) => m.id === who)?.name}'s week`)
          : relativeDay(date)}
      </div>

      {app.layout === 'tablet' ? (
        who === 'all' ? (
          <WeekMatrix
            state={state}
            week={week}
            onPick={(memberId, iso) => { setWho(memberId); setDate(iso) }}
          />
        ) : (
          <>
            <MemberWeek state={state} memberId={who} week={week} onPick={setDate} />
            <div className="section-title">{relativeDay(date)} in detail</div>
            <MemberDay state={state} memberId={who} date={date} onEdit={setEditing} canEdit={app.isParentMode} />
          </>
        )
      ) : who === 'all' ? (
        <div className="stack">
          {state.members.map((m) => {
            const evts = eventsOn(state, m.id, date)
            const chs = choresOn(state, m.id, date)
            const st = dayStats(state, m.id, date)
            if (!evts.length && !chs.length) return null
            return (
              <div className="card" key={m.id} style={{ '--member': m.color, borderLeft: `4px solid ${m.color}` }}>
                <div className="spread" style={{ marginBottom: 8 }}>
                  <div className="row">
                    <span style={{ fontSize: 22 }}>{m.emoji}</span>
                    <b>{m.name}</b>
                  </div>
                  <span className="tiny">{st.done}/{st.total} chores done</span>
                </div>
                <div className="row wrap" style={{ gap: 6 }}>
                  {evts.map((e) => (
                    <span key={e.id} className="chip" style={{ fontSize: 11.5 }}>
                      {e.emoji} {e.title} · {pretty12(e.start)}
                    </span>
                  ))}
                  {chs.map((c) => {
                    const s = choreSubmission(state, c.id, date)
                    return (
                      <span
                        key={c.id}
                        className="chip"
                        style={{
                          fontSize: 11.5,
                          opacity: s?.status === 'approved' ? .5 : 1,
                          textDecoration: s?.status === 'approved' ? 'line-through' : 'none',
                        }}
                      >
                        {c.emoji} {c.title}
                      </span>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {state.members.every((m) => !eventsOn(state, m.id, date).length && !choresOn(state, m.id, date).length) && (
            <Empty emoji="🌤️" title="Wide open">Nothing scheduled for anyone.</Empty>
          )}
        </div>
      ) : (
        <MemberDay state={state} memberId={who} date={date} onEdit={setEditing} canEdit={app.isParentMode} />
      )}

      {app.isParentMode && (
        <button className="fab" onClick={() => setEditing({ memberId: who === 'all' ? me.id : who, days: [fromISO(date).getDay()] })}>＋</button>
      )}

      <EventEditor
        open={!!editing}
        draft={editing}
        onClose={() => setEditing(null)}
        onSave={(d) => {
          if (d.id) app.updateEvent(d.id, d)
          else app.addEvent(d)
          setEditing(null)
        }}
        onDelete={(id) => { app.removeEvent(id); setEditing(null) }}
        members={state.members}
      />
    </div>
  )
}

/**
 * The whole household's week in one grid — members down the side, days across.
 * This is the view that makes a landscape iPad on the kitchen counter worth it.
 */
function WeekMatrix({ state, week, onPick }) {
  const today = todayISO()

  return (
    <div className="matrix">
      <div className="matrixgrid">
        <div className="matrixhead" />
        {week.map((iso) => {
          const d = fromISO(iso)
          return (
            <div key={iso} className={`matrixhead ${iso === today ? 'today' : ''}`}>
              <div className="w">{DAY_NAMES[d.getDay()]}</div>
              <div className="d">{d.getDate()}</div>
            </div>
          )
        })}

        {state.members.map((m) => (
          <Fragment key={m.id}>
            <div className="matrixname" style={{ '--c': m.color }}>
              <span className="face">{m.emoji}</span>
              <span>
                <div className="nm">{m.name}</div>
                <div className="mini">
                  {m.role === 'parent' ? '👑 Parent' : `Lv ${memberProgress(m).level} · 🔥 ${m.streak}`}
                </div>
              </span>
            </div>

            {week.map((iso) => {
              const evts = eventsOn(state, m.id, iso)
              const chs = choresOn(state, m.id, iso)
              const bits = [
                ...evts.map((e) => ({ key: e.id, cls: 'evt', label: `${e.emoji} ${e.title}`, done: false })),
                ...chs.map((c) => ({
                  key: c.id,
                  cls: '',
                  label: `${c.emoji} ${c.title}`,
                  done: choreSubmission(state, c.id, iso)?.status === 'approved',
                })),
              ]
              const shown = bits.slice(0, 3)
              return (
                <div
                  key={iso}
                  className={`matrixcell ${iso === today ? 'today' : ''}`}
                  style={{ '--c': m.color }}
                  onClick={() => onPick(m.id, iso)}
                >
                  {shown.map((b) => (
                    <span key={b.key} className={`bit ${b.cls} ${b.done ? 'done' : ''}`}>{b.label}</span>
                  ))}
                  {bits.length > shown.length && <span className="more">+{bits.length - shown.length} more</span>}
                </div>
              )
            })}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

/** One person's week, seven columns across. */
function MemberWeek({ state, memberId, week, onPick }) {
  const today = todayISO()
  const member = state.members.find((m) => m.id === memberId)

  return (
    <div className="weekcols">
      {week.map((iso) => {
        const d = fromISO(iso)
        const evts = eventsOn(state, memberId, iso)
        const chs = choresOn(state, memberId, iso)
        const st = dayStats(state, memberId, iso)
        return (
          <div
            key={iso}
            className={`weekcol ${iso === today ? 'today' : ''}`}
            style={{ '--c': member?.color }}
            onClick={() => onPick(iso)}
          >
            <div className="hd">
              <div className="w">{DAY_NAMES[d.getDay()]}</div>
              <div className="d">{d.getDate()}</div>
              {st.total > 0 && <div className="tiny">{st.done}/{st.total}</div>}
            </div>
            <div className="matrixcell" style={{ minHeight: 0, padding: 0 }}>
              {evts.map((e) => (
                <span key={e.id} className="bit evt" title={e.title}>{e.emoji} {e.title}</span>
              ))}
              {chs.map((c) => (
                <span
                  key={c.id}
                  className={`bit ${choreSubmission(state, c.id, iso)?.status === 'approved' ? 'done' : ''}`}
                  title={c.title}
                >
                  {c.emoji} {c.title}
                </span>
              ))}
              {!evts.length && !chs.length && <span className="more">—</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MemberDay({ state, memberId, date, onEdit, canEdit }) {
  const evts = eventsOn(state, memberId, date)
  const chs = choresOn(state, memberId, date)

  const items = [
    ...evts.map((e) => ({ type: 'event', at: e.start, data: e })),
    ...chs.map((c) => ({ type: 'chore', at: c.time || '23:59', data: c })),
  ].sort((a, b) => (a.at || '99:99').localeCompare(b.at || '99:99'))

  if (!items.length) return <Empty emoji="🌤️" title="Nothing scheduled">A free day.</Empty>

  return (
    <div className="timeline">
      {items.map((it, i) => (
        <div className="slot" key={i}>
          <div className="when">{it.at && it.at !== '23:59' ? pretty12(it.at) : 'any time'}</div>
          {it.type === 'event' ? (
            <div
              className={`task evt ${it.data.category}`}
              style={{ borderLeftColor: 'var(--c)' }}
              onClick={() => canEdit && onEdit(it.data)}
            >
              <div className="ico">{it.data.emoji}</div>
              <div className="grow">
                <div className="ttl">{it.data.title}</div>
                <div className="sub">{pretty12(it.data.start)}{it.data.end ? ` – ${pretty12(it.data.end)}` : ''}</div>
              </div>
            </div>
          ) : (
            <div className="task" style={{ opacity: choreSubmission(state, it.data.id, date)?.status === 'approved' ? .55 : 1 }}>
              <div className="ico">{it.data.emoji}</div>
              <div className="grow">
                <div className="ttl">{it.data.title}</div>
                <div className="sub">
                  <span>chore</span>
                  <span className="reward-chip">+{it.data.points}</span>
                  {it.data.room && <span>📍 {it.data.room}</span>}
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

const CATEGORIES = ['school', 'sport', 'music', 'work', 'other']

function EventEditor({ open, draft, onClose, onSave, onDelete, members }) {
  const [d, setD] = useState(draft || {})
  const key = draft?.id || draft?.memberId || 'new'
  // Re-seed the form whenever a different event is opened.
  const [seed, setSeed] = useState(key)
  if (open && seed !== key) {
    setSeed(key)
    setD({
      title: '', emoji: '📌', start: '16:00', end: '17:00', category: 'other',
      days: [1], memberId: members[0]?.id, ...draft,
    })
  }

  if (!open) return null
  const set = (patch) => setD((x) => ({ ...x, ...patch }))

  return (
    <Sheet open={open} onClose={onClose} title={d.id ? 'Edit event' : 'Add to the schedule'}>
      <label className="field">
        <span>What is it?</span>
        <input value={d.title || ''} onChange={(e) => set({ title: e.target.value })} placeholder="Soccer practice" />
      </label>

      <label className="field">
        <span>Icon</span>
        <EmojiPicker value={d.emoji} onChange={(emoji) => set({ emoji })} set="event" />
      </label>

      <label className="field">
        <span>Who</span>
        <select value={d.memberId} onChange={(e) => set({ memberId: e.target.value })}>
          {members.map((m) => <option key={m.id} value={m.id}>{m.emoji} {m.name}</option>)}
        </select>
      </label>

      <label className="field">
        <span>Repeats on</span>
        <DayPicker value={d.days || []} onChange={(days) => set({ days })} />
      </label>

      <div className="row">
        <label className="field grow">
          <span>Starts</span>
          <input type="time" value={d.start || ''} onChange={(e) => set({ start: e.target.value })} />
        </label>
        <label className="field grow">
          <span>Ends</span>
          <input type="time" value={d.end || ''} onChange={(e) => set({ end: e.target.value })} />
        </label>
      </div>

      <label className="field">
        <span>Category</span>
        <div className="chipgroup">
          {CATEGORIES.map((c) => (
            <button key={c} className={`chip ${d.category === c ? 'on' : ''}`} onClick={() => set({ category: c })}>{c}</button>
          ))}
        </div>
      </label>

      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn primary grow" disabled={!d.title} onClick={() => onSave(d)}>Save</button>
        {d.id && <DangerButton onConfirm={() => onDelete(d.id)}>Delete</DangerButton>}
      </div>
    </Sheet>
  )
}
