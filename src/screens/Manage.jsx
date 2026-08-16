import { useState } from 'react'
import { useApp } from '../store/AppContext.jsx'
import { Sheet, EmojiPicker, DayPicker, DangerButton, timeAgo } from '../components/ui.jsx'
import { SummonSheet } from '../components/BossPanel.jsx'
import { liveBoss, bossHp, hpPct, damageBoard } from '../lib/boss.js'
import CameraCapture from '../components/CameraCapture.jsx'
import ParentGate from '../components/ParentGate.jsx'
import { putPhoto, photoUrl } from '../lib/photos.js'
import { MEMBER_COLORS } from '../lib/gamify.js'
import { checkCompletionPhoto, PASS_THRESHOLD, AI_BACKEND } from '../lib/ai.js'
import { DAY_NAMES, pretty12 } from '../lib/date.js'
import { ratesOf, DEFAULT_RATES, DEMO_RATES } from '../lib/landmines.js'

export default function Manage() {
  const app = useApp()
  const [tab, setTab] = useState('chores')

  if (!app.isParentMode) return <ParentGate />

  return (
    <div className="screen">
      <div className="spread" style={{ margin: '4px 0 12px' }}>
        <h1 style={{ fontSize: 26 }}>Manage</h1>
        <button className="btn sm ghost" onClick={app.lockParent}>🔒 Lock</button>
      </div>

      <div className="tabbar">
        <button className={tab === 'chores' ? 'on' : ''} onClick={() => setTab('chores')}>🧹 Chores</button>
        <button className={tab === 'family' ? 'on' : ''} onClick={() => setTab('family')}>👨‍👩‍👧‍👦 Family</button>
        <button className={tab === 'boss' ? 'on' : ''} onClick={() => setTab('boss')}>⚔️ Boss</button>
        <button className={tab === 'ai' ? 'on' : ''} onClick={() => setTab('ai')}>🤖 AI check</button>
        <button className={tab === 'settings' ? 'on' : ''} onClick={() => setTab('settings')}>⚙️ Settings</button>
      </div>

      {tab === 'chores' && <ChoresTab app={app} />}
      {tab === 'family' && <FamilyTab app={app} />}
      {tab === 'boss' && <BossAdmin app={app} />}
      {tab === 'ai' && <AiTab />}
      {tab === 'settings' && <SettingsTab app={app} />}
    </div>
  )
}

/* ─────────────────────────── chores ─────────────────────────── */

function ChoresTab({ app }) {
  const { state } = app
  const [edit, setEdit] = useState(null)

  return (
    <>
      {state.members.map((m) => {
        const list = state.chores.filter((c) => c.memberId === m.id)
        return (
          <div key={m.id} style={{ '--member': m.color }}>
            <div className="section-title">{m.emoji} {m.name} <span className="count">{list.length}</span></div>
            <div className="stack">
              {list.length === 0 && <p className="muted" style={{ margin: '0 2px' }}>No routine chores yet.</p>}
              {list.map((c) => (
                <div key={c.id} className="task tap" style={{ borderLeftColor: m.color }} onClick={() => setEdit(c)}>
                  <div className="ico">{c.emoji}</div>
                  <div className="grow">
                    <div className="ttl">{c.title}</div>
                    <div className="sub">
                      <span>{c.days.length === 7 ? 'every day' : c.days.map((d) => DAY_NAMES[d]).join(' ')}</span>
                      {c.time && <span>{pretty12(c.time)}</span>}
                      <span className="reward-chip">+{c.points}</span>
                      {c.needsPhoto && <span className={`badge-status ${c.referencePhotoId ? 'good' : 'warn'}`}>
                        {c.referencePhotoId ? '🤖 AI on' : '📸 no standard'}
                      </span>}
                    </div>
                  </div>
                  <span style={{ opacity: .5 }}>✏️</span>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      <button className="btn primary wide" style={{ marginTop: 18 }} onClick={() => setEdit({})}>＋ Add a routine chore</button>

      <ChoreEditor
        draft={edit}
        members={state.members}
        onClose={() => setEdit(null)}
        onSave={(d) => { d.id ? app.updateChore(d.id, d) : app.addChore(d); setEdit(null) }}
        onDelete={(id) => { app.removeChore(id); setEdit(null) }}
      />
    </>
  )
}

function ChoreEditor({ draft, members, onClose, onSave, onDelete }) {
  const [d, setD] = useState({})
  const [seed, setSeed] = useState(null)
  const [standard, setStandard] = useState(null)
  const [checkItem, setCheckItem] = useState('')
  const open = !!draft
  const key = draft?.id || (draft ? 'new' : null)

  if (open && seed !== key) {
    setSeed(key)
    setStandard(photoUrl(draft?.referencePhotoId) || null)
    setCheckItem('')
    setD({
      title: '', emoji: '🧹', memberId: members[0]?.id, days: [1, 2, 3, 4, 5], time: '',
      points: 10, coins: 2, needsPhoto: false, referencePhotoId: null, checklist: [], room: '', ...draft,
    })
  }
  if (!open) return null
  const set = (p) => setD((x) => ({ ...x, ...p }))

  async function save() {
    let referencePhotoId = d.referencePhotoId
    const existing = photoUrl(d.referencePhotoId)
    if (standard && standard !== existing) referencePhotoId = await putPhoto(standard)
    if (!standard) referencePhotoId = null
    onSave({ ...d, referencePhotoId, points: Number(d.points) || 0, coins: Number(d.coins) || 0 })
  }

  return (
    <Sheet open onClose={onClose} title={d.id ? 'Edit chore' : 'New routine chore'}>
      <label className="field">
        <span>Chore</span>
        <input value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="Make your bed" />
      </label>

      <label className="field">
        <span>Icon</span>
        <EmojiPicker value={d.emoji} onChange={(emoji) => set({ emoji })} set="chore" />
      </label>

      <div className="row">
        <label className="field grow">
          <span>Who</span>
          <select value={d.memberId} onChange={(e) => set({ memberId: e.target.value })}>
            {members.map((m) => <option key={m.id} value={m.id}>{m.emoji} {m.name}</option>)}
          </select>
        </label>
        <label className="field grow">
          <span>Where</span>
          <input value={d.room} onChange={(e) => set({ room: e.target.value })} placeholder="Bedroom" />
        </label>
      </div>

      <label className="field">
        <span>Repeats on</span>
        <DayPicker value={d.days} onChange={(days) => set({ days })} />
      </label>

      <div className="row">
        <label className="field grow">
          <span>Time (optional)</span>
          <input type="time" value={d.time} onChange={(e) => set({ time: e.target.value })} />
        </label>
        <label className="field grow">
          <span>Points</span>
          <input type="number" min="0" value={d.points} onChange={(e) => set({ points: e.target.value })} />
        </label>
        <label className="field grow">
          <span>Coins</span>
          <input type="number" min="0" value={d.coins} onChange={(e) => set({ coins: e.target.value })} />
        </label>
      </div>

      <div className="divider" />

      <button className={`chip ${d.needsPhoto ? 'on' : ''}`} onClick={() => set({ needsPhoto: !d.needsPhoto })}>
        📸 Require a proof photo
      </button>

      {d.needsPhoto && (
        <div style={{ marginTop: 14 }}>
          <div className="tiny" style={{ marginBottom: 6 }}>THE “FINISHED” STANDARD</div>
          <p className="muted" style={{ marginTop: 0 }}>
            Photograph this chore done right, from the angle you want them to shoot. The AI compares every
            submission against it. Without one, photos go straight to you unscored.
          </p>
          <CameraCapture value={standard} onChange={setStandard} hint="This is what done looks like" compact />

          <div className="tiny" style={{ margin: '16px 0 6px' }}>WHAT COUNTS AS DONE</div>
          <div className="stack">
            {(d.checklist || []).map((c, i) => (
              <div className="row" key={i}>
                <span className="grow card" style={{ padding: '8px 12px', fontSize: 13 }}>{c}</span>
                <button className="btn sm no" onClick={() => set({ checklist: d.checklist.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <input
              className="grow"
              value={checkItem}
              onChange={(e) => setCheckItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && checkItem.trim()) {
                  set({ checklist: [...(d.checklist || []), checkItem.trim()] })
                  setCheckItem('')
                }
              }}
              placeholder="Pillows at the head"
            />
            <button
              className="btn sm"
              onClick={() => {
                if (!checkItem.trim()) return
                set({ checklist: [...(d.checklist || []), checkItem.trim()] })
                setCheckItem('')
              }}
            >Add</button>
          </div>
        </div>
      )}

      <div className="row" style={{ marginTop: 18 }}>
        <button className="btn primary grow" disabled={!d.title} onClick={save}>Save chore</button>
        {d.id && <DangerButton onConfirm={() => onDelete(d.id)}>Delete</DangerButton>}
      </div>
    </Sheet>
  )
}

/* ─────────────────────────── family ─────────────────────────── */

function FamilyTab({ app }) {
  const { state } = app
  const [edit, setEdit] = useState(null)

  return (
    <>
      <div className="section-title">Members <span className="count">{state.members.length}</span></div>
      <div className="stack">
        {state.members.map((m) => (
          <div key={m.id} className="task tap" style={{ borderLeftColor: m.color }} onClick={() => setEdit(m)}>
            <div className="ico">{m.emoji}</div>
            <div className="grow">
              <div className="ttl">{m.name}</div>
              <div className="sub">
                <span>{m.role === 'parent' ? '👑 parent' : '⭐ kid'}</span>
                <span>{m.xp.toLocaleString()} XP</span>
                <span>🪙 {m.coins}</span>
                <span>🔥 {m.streak}</span>
              </div>
            </div>
            <span style={{ opacity: .5 }}>✏️</span>
          </div>
        ))}
      </div>
      <button className="btn primary wide" style={{ marginTop: 16 }} onClick={() => setEdit({})}>＋ Add a family member</button>

      <MemberEditor
        draft={edit}
        onClose={() => setEdit(null)}
        onSave={(d) => { d.id ? app.updateMember(d.id, d) : app.addMember(d); setEdit(null) }}
        onDelete={(id) => { app.removeMember(id); setEdit(null) }}
        count={state.members.length}
      />
    </>
  )
}

function MemberEditor({ draft, onClose, onSave, onDelete, count }) {
  const [d, setD] = useState({})
  const [seed, setSeed] = useState(null)
  const open = !!draft
  const key = draft?.id || (draft ? 'new' : null)
  if (open && seed !== key) {
    setSeed(key)
    setD({ name: '', emoji: '🙂', color: MEMBER_COLORS[0].hex, role: 'child', pin: null, ...draft })
  }
  if (!open) return null
  const set = (p) => setD((x) => ({ ...x, ...p }))

  return (
    <Sheet open onClose={onClose} title={d.id ? `Edit ${d.name}` : 'Add a family member'}>
      <div style={{ '--member': d.color }}>
        <label className="field">
          <span>Name</span>
          <input value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ava" />
        </label>

        <label className="field">
          <span>Avatar</span>
          <EmojiPicker value={d.emoji} onChange={(emoji) => set({ emoji })} set="face" />
        </label>

        <label className="field">
          <span>Color</span>
          <div className="chipgroup">
            {MEMBER_COLORS.map((c) => (
              <button
                key={c.hex}
                className="chip"
                onClick={() => set({ color: c.hex })}
                style={{
                  background: c.hex + (d.color === c.hex ? 'ee' : '33'),
                  borderColor: c.hex,
                  color: d.color === c.hex ? '#11091f' : 'var(--ink)',
                }}
              >{c.name}</button>
            ))}
          </div>
        </label>

        <label className="field">
          <span>Role</span>
          <div className="chipgroup">
            <button className={`chip ${d.role === 'child' ? 'on' : ''}`} onClick={() => set({ role: 'child' })}>⭐ Kid</button>
            <button className={`chip ${d.role === 'parent' ? 'on' : ''}`} onClick={() => set({ role: 'parent', pin: d.pin || '1234' })}>👑 Parent</button>
          </div>
        </label>

        {d.role === 'parent' && (
          <label className="field">
            <span>Approval PIN</span>
            <input
              inputMode="numeric"
              value={d.pin || ''}
              onChange={(e) => set({ pin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
              placeholder="1234"
            />
          </label>
        )}

        {d.id && (
          <div className="row">
            <label className="field grow">
              <span>XP</span>
              <input type="number" value={d.xp ?? 0} onChange={(e) => set({ xp: Number(e.target.value) })} />
            </label>
            <label className="field grow">
              <span>Coins</span>
              <input type="number" value={d.coins ?? 0} onChange={(e) => set({ coins: Number(e.target.value) })} />
            </label>
            <label className="field grow">
              <span>Streak</span>
              <input type="number" value={d.streak ?? 0} onChange={(e) => set({ streak: Number(e.target.value) })} />
            </label>
          </div>
        )}

        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn primary grow" disabled={!d.name} onClick={() => onSave(d)}>Save</button>
          {d.id && count > 1 && <DangerButton onConfirm={() => onDelete(d.id)}>Remove</DangerButton>}
        </div>
      </div>
    </Sheet>
  )
}

/* ─────────────────────────── AI playground ─────────────────────────── */

function AiTab() {
  const [ref, setRef] = useState(null)
  const [shot, setShot] = useState(null)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    setResult(null)
    try {
      setResult(await checkCompletionPhoto({ referencePhoto: ref, submittedPhoto: shot, title: 'test', checklist: [] }))
    } catch (e) {
      setResult({ pass: false, score: 0, headline: 'Error', detail: e.message, signals: [], regions: [] })
    }
    setBusy(false)
  }

  return (
    <>
      <div className="section-title">Try the photo check</div>
      <p className="muted" style={{ margin: '0 2px 14px' }}>
        Shoot a “finished” standard, then a second photo, and see exactly what the kids will see.
        Good way to find out whether a chore is a fair candidate for auto-checking before you turn it on.
      </p>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="tiny" style={{ marginBottom: 8 }}>1 · THE STANDARD</div>
        <CameraCapture value={ref} onChange={setRef} compact hint="What done looks like" />
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="tiny" style={{ marginBottom: 8 }}>2 · THE SUBMISSION</div>
        <CameraCapture
          value={shot}
          onChange={setShot}
          compact
          hint="What they'd send in"
          ghost={ref}
          ghostLabel="the standard"
        />
      </div>

      <button className="btn go xl wide" disabled={!ref || !shot || busy} onClick={run}>
        {busy ? 'Comparing…' : '🤖 Compare them'}
      </button>

      {result && (
        <div style={{ marginTop: 16 }}>
          <div className={`verdict ${result.pass ? 'pass' : 'fail'}`}>
            <div className="big">{result.pass ? '✅' : '🔁'}</div>
            <h3>{result.headline}</h3>
            {result.score != null && (
              <div className="scoredial" style={{ color: result.pass ? 'var(--good)' : 'var(--warn)' }}>
                {result.score}<small>/100</small>
              </div>
            )}
            <p>{result.detail}</p>
          </div>

          {result.signals?.length > 0 && (
            <div className="signals">
              {result.signals.map((s) => (
                <div className="signal" key={s.label}>
                  <span style={{ color: 'var(--ink-dim)' }}>{s.label}</span>
                  <span className="track"><i style={{ width: `${s.value}%` }} /></span>
                  <span style={{ textAlign: 'right' }}>{s.value}%</span>
                </div>
              ))}
            </div>
          )}

          {result.regions?.length > 0 && (
            <>
              <div className="tiny" style={{ margin: '16px 0 8px' }}>REGION BREAKDOWN</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4 }}>
                {result.regions.map((r) => (
                  <div
                    key={r.name}
                    style={{
                      borderRadius: 10, padding: '10px 4px', textAlign: 'center', fontSize: 11, fontWeight: 800,
                      background: `color-mix(in srgb, ${r.score >= 70 ? 'var(--good)' : r.score >= 45 ? 'var(--warn)' : 'var(--bad)'} 28%, transparent)`,
                      border: '1px solid var(--line)',
                    }}
                  >
                    {r.score}%
                    <div style={{ fontSize: 8.5, opacity: .7 }}>{r.name}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: 20 }}>
        <div className="tiny" style={{ marginBottom: 6 }}>HOW IT'S SET UP</div>
        <p className="muted" style={{ margin: 0 }}>
          Engine: <b>{AI_BACKEND === 'local-cv' ? 'on-device computer vision' : 'Claude vision'}</b> ·
          pass mark <b>{PASS_THRESHOLD}/100</b>. Nothing leaves the device. To swap in a real
          multimodal model, see the notes at the top of <code>src/lib/ai.js</code>.
        </p>
      </div>
    </>
  )
}

/* ─────────────────────── boss battles ─────────────────────── */

function BossAdmin({ app }) {
  const [summoning, setSummoning] = useState(false)
  const live = liveBoss(app.state)
  const past = (app.state.bosses || []).filter((b) => b.status !== 'alive').slice(0, 6)

  return (
    <>
      <div className="card">
        {live ? (
          <>
            <div className="spread">
              <div className="row">
                <span style={{ fontSize: 26 }}>{live.emoji}</span>
                <div>
                  <b>{live.name}</b>
                  <div className="tiny">{bossHp(live)} / {live.maxHp} HP · {hpPct(live)}%</div>
                </div>
              </div>
              <DangerButton
                className="btn no sm"
                confirmLabel="Tap again to call it off"
                onConfirm={() => app.retreatBoss(live.id, app.currentMember.id)}
              >
                🏳️ Call it off
              </DangerButton>
            </div>
            <p className="muted" style={{ margin: '10px 0 0' }}>
              A battle is live. It's showing at the top of everyone's Today screen.
            </p>
          </>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Turn a big job into a monster with a health bar. Pick a fight, everyone attacks at once,
              and whoever lands the last hit gets the bonus. Loot splits by damage dealt, so the
              youngest still gets paid for what they actually did.
            </p>
            <button className="btn no wide" onClick={() => setSummoning(true)}>⚔️ Summon a boss</button>
          </>
        )}
      </div>

      {past.length > 0 && (
        <>
          <div className="tiny" style={{ margin: '14px 2px 8px' }}>BATTLE LOG</div>
          <div className="card">
            <div className="feed">
              {past.map((b) => {
                const mvp = damageBoard(b)[0]
                const who = mvp && app.state.members.find((m) => m.id === mvp.memberId)
                return (
                  <div className="feeditem" key={b.id}>
                    <span className="e">{b.status === 'slain' ? '🏆' : '🏳️'}</span>
                    <span className="grow">
                      <b>{b.name}</b>
                      <div className="tiny">
                        {b.status === 'slain'
                          ? `Slain${who ? ` · MVP ${who.name} with ${mvp.damage}` : ''}`
                          : 'Called off'}
                      </div>
                    </span>
                    <span className="t">{b.slainAt ? timeAgo(b.slainAt) : ''}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      <SummonSheet open={summoning} onClose={() => setSummoning(false)} app={app} me={app.currentMember} />
    </>
  )
}

/* ─────────────────────── landmine tuning ─────────────────────── */

function LandmineSettings({ app }) {
  const rates = ratesOf(app.state)
  const set = (patch) => app.setSetting('landmineRates', { ...rates, ...patch })

  const FIELDS = [
    { key: 'graceMins', label: 'Grace period', unit: 'min', hint: 'Nothing happens yet' },
    { key: 'smokingMins', label: 'Streak burns at', unit: 'min', hint: 'From arming' },
    { key: 'detonatedMins', label: 'Fines start at', unit: 'min', hint: 'From arming' },
    { key: 'familyDrainPerHour', label: 'Family drain', unit: 'pts/hr', hint: 'Off the family goal' },
    { key: 'finePerHour', label: 'Offender fine', unit: 'pts/hr', hint: 'Into the pot' },
    { key: 'defuseReward', label: 'Defuse reward', unit: 'pts', hint: 'For cleaning it up' },
  ]

  return (
    <div className="card">
      <p className="muted" style={{ marginTop: 0 }}>
        How fast a mess turns expensive. An unclaimed landmine drains the family 1.5× faster than
        one somebody has owned up to — that's the nudge to confess.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        {FIELDS.map((f) => (
          <label className="field" key={f.key} style={{ marginBottom: 0 }}>
            <span>{f.label} ({f.unit})</span>
            <input
              type="number"
              min="1"
              value={rates[f.key]}
              onChange={(e) => set({ [f.key]: Math.max(1, Number(e.target.value) || 1) })}
            />
            <span className="tiny">{f.hint}</span>
          </label>
        ))}
      </div>

      <div className="divider" />

      <div className="row wrap">
        <button className="btn sm" onClick={() => set({ ...DEFAULT_RATES })}>↩️ Back to defaults</button>
        <button
          className="btn sm no"
          onClick={() => {
            set({ ...DEMO_RATES })
            app.notify('Speed run on — the whole ladder in 3 minutes', '⏩')
          }}
        >
          ⏩ Speed run (for testing)
        </button>
      </div>
      <p className="tiny" style={{ marginTop: 8 }}>
        Speed run compresses grace → streak burn → fines into about three minutes so you can watch the
        whole thing escalate. Put it back on defaults before the kids use it for real.
      </p>
    </div>
  )
}

/* ─────────────────────────── settings ─────────────────────────── */

function SettingsTab({ app }) {
  const { state } = app
  const pending = state.submissions.filter((s) => s.status === 'pending').length

  return (
    <>
      <div className="section-title">House rules</div>
      <div className="card">
        <div className="spread">
          <div>
            <b>Require a PIN for parent mode</b>
            <div className="tiny">Keeps approvals out of little hands.</div>
          </div>
          <button
            className={`chip ${state.settings.requirePin ? 'on' : ''}`}
            onClick={() => {
              const next = !state.settings.requirePin
              app.setSetting('requirePin', next)
              app.notify(next ? 'PIN required for parent mode' : 'PIN turned off', '🔐')
            }}
          >
            {state.settings.requirePin ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      <div className="section-title">Display</div>
      <div className="card">
        <b>Layout</b>
        <p className="muted" style={{ margin: '4px 0 10px' }}>
          Auto uses the wide layout on an iPad in landscape and the phone layout everywhere else.
          Pin one if you'd rather it never change. Currently showing: <b>{app.layout}</b>.
        </p>
        <div className="chipgroup">
          {[
            { key: 'auto', label: '✨ Auto' },
            { key: 'phone', label: '📱 Always phone' },
            { key: 'tablet', label: '🖥️ Always iPad' },
          ].map((o) => (
            <button
              key={o.key}
              className={`chip ${app.layoutPref === o.key ? 'on' : ''}`}
              onClick={() => app.setLayoutPref(o.key)}
            >
              {o.label}
            </button>
          ))}
        </div>
        {app.layoutPref === 'tablet' && app.layout === 'tablet' && window.innerWidth < 900 && (
          <p className="tiny" style={{ marginTop: 8, color: 'var(--warn)' }}>
            The iPad layout is cramped on a screen this narrow.
          </p>
        )}
      </div>

      <div className="section-title">💣 Family sabotage</div>
      <LandmineSettings app={app} />

      <div className="section-title">Snapshot</div>
      <div className="row" style={{ gap: 8 }}>
        <div className="card grow center">
          <b style={{ fontSize: 20, fontFamily: 'Baloo 2' }}>{state.chores.length}</b>
          <div className="tiny">CHORES</div>
        </div>
        <div className="card grow center">
          <b style={{ fontSize: 20, fontFamily: 'Baloo 2' }}>{state.jobs.length}</b>
          <div className="tiny">JOBS</div>
        </div>
        <div className="card grow center">
          <b style={{ fontSize: 20, fontFamily: 'Baloo 2' }}>{pending}</b>
          <div className="tiny">IN REVIEW</div>
        </div>
      </div>

      <div className="section-title">Data</div>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Everything lives on this device — chore data in local storage, photos in IndexedDB. Nothing is
          uploaded anywhere. Clearing your browser data clears the family.
        </p>
        <DangerButton
          className="btn no wide"
          confirmLabel="Tap again — this wipes everything"
          onConfirm={() => app.resetEverything()}
        >
          ♻️ Reset to the starter family
        </DangerButton>
      </div>
    </>
  )
}
