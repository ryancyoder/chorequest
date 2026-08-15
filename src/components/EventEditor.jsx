import { useState } from 'react'
import { Sheet, DayPicker, EmojiPicker, DangerButton } from './ui.jsx'
import { CATEGORIES, normalizeMemberIds, choreConflictDays } from '../lib/schedule.js'
import { todayISO, addDays, DAY_NAMES, pretty12 } from '../lib/date.js'

/**
 * One editor for everything on the calendar: weekly commitments, one-off
 * appointments, multi-day trips, and things the whole family shares.
 */
export default function EventEditor({ open, draft, members, state, onClose, onSave, onDelete }) {
  const [d, setD] = useState({})
  const [seed, setSeed] = useState(null)
  const key = draft?.id || (draft ? `new:${draft.dateISO || ''}:${(draft.memberIds || []).join()}` : null)

  if (open && seed !== key) {
    setSeed(key)
    setD({
      kind: 'repeat',
      title: '', emoji: '📌', category: 'other',
      memberIds: [],
      days: [1], start: '16:00', end: '17:00',
      fromISO: null, untilISO: null,
      dateISO: todayISO(), endDateISO: null,
      allDay: false, away: false, notes: '', duties: [],
      ...draft,
      memberIds: normalizeMemberIds(draft || {}),
    })
  }
  if (!open) return null

  const set = (patch) => setD((x) => ({ ...x, ...patch }))
  const once = d.kind === 'once'
  const everyone = !d.memberIds?.length

  function toggleMember(id) {
    const has = d.memberIds.includes(id)
    set({ memberIds: has ? d.memberIds.filter((x) => x !== id) : [...d.memberIds, id] })
  }

  // Warn about chores that this event would sit on top of.
  const affected = (d.memberIds.length ? d.memberIds : members.map((m) => m.id))
  const clashes = []
  if (!d.allDay && d.start && state) {
    for (const mid of affected) {
      for (const chore of state.chores.filter((c) => c.memberId === mid)) {
        const hits = choreConflictDays({ ...state, events: [{ ...d, id: '__draft' }] }, chore)
        if (hits.length) {
          clashes.push({ chore, member: members.find((m) => m.id === mid), dows: hits.map((h) => h.dow) })
        }
      }
    }
  }

  return (
    <Sheet open onClose={onClose} title={d.id ? 'Edit event' : 'Add to the calendar'}>
      <div className="tabbar" style={{ marginBottom: 14 }}>
        <button className={!once ? 'on' : ''} onClick={() => set({ kind: 'repeat' })}>🔁 Every week</button>
        <button className={once ? 'on' : ''} onClick={() => set({ kind: 'once' })}>📆 One-off</button>
      </div>

      <label className="field">
        <span>What is it?</span>
        <input value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="Soccer practice" />
      </label>

      <label className="field">
        <span>Icon</span>
        <EmojiPicker value={d.emoji} onChange={(emoji) => set({ emoji })} set="event" />
      </label>

      {/* who */}
      <label className="field">
        <span>Who's involved</span>
        <div className="chipgroup">
          <button className={`chip ${everyone ? 'on' : ''}`} onClick={() => set({ memberIds: [] })}>
            👨‍👩‍👧‍👦 Whole family
          </button>
          {members.map((m) => (
            <button
              key={m.id}
              className={`chip ${d.memberIds.includes(m.id) ? 'on' : ''}`}
              style={d.memberIds.includes(m.id) ? { '--member': m.color } : undefined}
              onClick={() => toggleMember(m.id)}
            >
              {m.emoji} {m.name}
            </button>
          ))}
        </div>
        <span className="tiny">Pick more than one for a carpool, a shared lesson, or a sibling drop-off.</span>
      </label>

      {/* when */}
      {once ? (
        <div className="row">
          <label className="field grow">
            <span>Date</span>
            <input type="date" value={d.dateISO || ''} onChange={(e) => set({ dateISO: e.target.value })} />
          </label>
          <label className="field grow">
            <span>Ends (optional)</span>
            <input
              type="date"
              value={d.endDateISO || ''}
              min={d.dateISO || undefined}
              onChange={(e) => set({ endDateISO: e.target.value || null })}
            />
            <span className="tiny">For a trip or a whole week away</span>
          </label>
        </div>
      ) : (
        <>
          <label className="field">
            <span>Repeats on</span>
            <DayPicker value={d.days || []} onChange={(days) => set({ days })} />
          </label>
          <div className="row">
            <label className="field grow">
              <span>Starts (optional)</span>
              <input type="date" value={d.fromISO || ''} onChange={(e) => set({ fromISO: e.target.value || null })} />
            </label>
            <label className="field grow">
              <span>Until (optional)</span>
              <input type="date" value={d.untilISO || ''} onChange={(e) => set({ untilISO: e.target.value || null })} />
              <span className="tiny">End of the season or term</span>
            </label>
          </div>
        </>
      )}

      <button
        className={`chip ${d.allDay ? 'on' : ''}`}
        style={{ marginBottom: 12 }}
        onClick={() => set({ allDay: !d.allDay })}
      >
        🌞 All day
      </button>

      {!d.allDay && (
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
      )}

      <label className="field">
        <span>Category</span>
        <div className="chipgroup">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              className={`chip ${d.category === c.key ? 'on' : ''}`}
              onClick={() => set({ category: c.key, emoji: d.emoji === '📌' ? c.emoji : d.emoji })}
            >
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
      </label>

      {/* away */}
      <div className={`card ${d.away ? 'glow' : ''}`} style={{ marginBottom: 14 }}>
        <button className={`chip ${d.away ? 'on' : ''}`} onClick={() => set({ away: !d.away })}>
          🧳 They're away for this
        </button>
        <p className="muted" style={{ margin: '8px 0 0' }}>
          Pauses their chores for these days, so a week at camp doesn't come home looking like a
          week of missed responsibilities. Streaks aren't punished for it either.
        </p>
      </div>

      {/* who's doing what */}
      <div className="tiny" style={{ marginBottom: 6 }}>RESPONSIBILITIES (OPTIONAL)</div>
      <p className="muted" style={{ marginTop: 0 }}>
        Who's driving, who's bringing the snacks. These show up on their Today screen.
      </p>
      <DutyEditor duties={d.duties || []} members={members} onChange={(duties) => set({ duties })} />

      <label className="field" style={{ marginTop: 14 }}>
        <span>Notes</span>
        <input value={d.notes || ''} onChange={(e) => set({ notes: e.target.value })} placeholder="Field 3, bring shin guards" />
      </label>

      {clashes.length > 0 && (
        <div className="warnbox" style={{ marginBottom: 14 }}>
          ⚠️ This lands on top of{' '}
          {clashes.slice(0, 3).map((c, i) => (
            <span key={i}>
              {i > 0 && ', '}
              <b>{c.member?.name}'s {c.chore.title}</b> ({c.dows.map((x) => DAY_NAMES[x]).join(', ')} at {pretty12(c.chore.time)})
            </span>
          ))}
          . Worth moving one of them.
        </div>
      )}

      <div className="row">
        <button className="btn primary grow" disabled={!d.title.trim()} onClick={() => onSave(d)}>
          Save
        </button>
        {d.id && <DangerButton onConfirm={() => onDelete(d.id)}>Delete</DangerButton>}
      </div>
    </Sheet>
  )
}

function DutyEditor({ duties, members, onChange }) {
  const [text, setText] = useState('')
  const [who, setWho] = useState(members[0]?.id)

  function add() {
    if (!text.trim()) return
    onChange([...duties, { id: `duty_${Date.now()}`, text: text.trim(), memberId: who }])
    setText('')
  }

  return (
    <>
      <div className="stack" style={{ marginBottom: 8 }}>
        {duties.map((duty) => {
          const m = members.find((x) => x.id === duty.memberId)
          return (
            <div className="row" key={duty.id}>
              <span className="grow card" style={{ padding: '8px 12px', fontSize: 13 }}>
                {m?.emoji} <b>{m?.name}</b> — {duty.text}
              </span>
              <button className="btn sm no" onClick={() => onChange(duties.filter((x) => x.id !== duty.id))}>✕</button>
            </div>
          )
        })}
      </div>
      <div className="row">
        <select value={who} onChange={(e) => setWho(e.target.value)} style={{ maxWidth: 130 }}>
          {members.map((m) => <option key={m.id} value={m.id}>{m.emoji} {m.name}</option>)}
        </select>
        <input
          className="grow"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Bring the orange slices"
        />
        <button className="btn sm" onClick={add}>Add</button>
      </div>
    </>
  )
}
