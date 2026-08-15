import { useState } from 'react'
import { useApp } from '../store/AppContext.jsx'
import { Sheet, Empty, EmojiPicker, DangerButton } from '../components/ui.jsx'
import { byId } from '../store/selectors.js'

export default function Rewards() {
  const app = useApp()
  const { state } = app
  const me = app.currentMember
  const [tab, setTab] = useState('prizes')
  const [editPrize, setEditPrize] = useState(null)
  const [editGoal, setEditGoal] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const forMe = state.prizes.filter((p) => !p.memberId || p.memberId === me.id)
  const others = state.prizes.filter((p) => p.memberId && p.memberId !== me.id)

  return (
    <div className="screen" style={{ '--member': me.color }}>
      <div className="spread" style={{ margin: '4px 0 12px' }}>
        <h1 style={{ fontSize: 26 }}>Rewards</h1>
        <span className="pill coin">🪙 {me.coins} <small>coins</small></span>
      </div>

      <div className="tabbar">
        <button className={tab === 'prizes' ? 'on' : ''} onClick={() => setTab('prizes')}>🎁 Prizes</button>
        <button className={tab === 'goals' ? 'on' : ''} onClick={() => setTab('goals')}>🏆 Family goals</button>
      </div>

      {tab === 'prizes' && (
        <>
          <div className="section-title">Yours to earn <span className="count">{forMe.length}</span></div>
          <div className="stack">
            {forMe.length === 0 && <Empty emoji="🎁" title="No prizes set yet">A parent can add long-term prizes.</Empty>}
            {forMe
              .slice()
              .sort((a, b) => a.cost - b.cost)
              .map((p) => {
                const can = me.coins >= p.cost
                const pct = Math.min(100, Math.round((me.coins / p.cost) * 100))
                return (
                  <div key={p.id} className={`card ${can ? 'glow' : 'locked'}`} onClick={() => app.isParentMode && setEditPrize(p)}>
                    <div className="prize">
                      <div className="pic">{p.emoji}</div>
                      <div className="grow">
                        <b style={{ fontSize: 15 }}>{p.title}</b>
                        {p.memberId && <span className="badge-status info" style={{ marginLeft: 6 }}>just for you</span>}
                        {p.note && <div className="tiny" style={{ marginTop: 3 }}>{p.note}</div>}
                        <div className="goalbar" style={{ height: 10, marginTop: 8 }}>
                          <i style={{ width: `${pct}%` }} />
                        </div>
                        <div className="tiny" style={{ marginTop: 5 }}>
                          {can ? '✨ You can claim this now!' : `${me.coins} / ${p.cost} coins · ${p.cost - me.coins} to go`}
                        </div>
                      </div>
                      {me.role === 'child' && (
                        <button
                          className={`btn sm ${can ? 'go' : ''}`}
                          disabled={!can}
                          onClick={(e) => { e.stopPropagation(); setConfirm(p) }}
                        >
                          {can ? 'Claim' : `🔒 ${p.cost}`}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
          </div>

          {others.length > 0 && (
            <>
              <div className="section-title">Everyone else's goals</div>
              <div className="stack">
                {others.map((p) => {
                  const owner = byId(state.members, p.memberId)
                  return (
                    <div key={p.id} className="card locked" style={{ opacity: .7 }} onClick={() => app.isParentMode && setEditPrize(p)}>
                      <div className="prize">
                        <div className="pic">{p.emoji}</div>
                        <div className="grow">
                          <b style={{ fontSize: 14 }}>{p.title}</b>
                          <div className="tiny">{owner?.emoji} {owner?.name} · {p.cost} coins
                            {owner && ` · ${Math.min(100, Math.round((owner.coins / p.cost) * 100))}% there`}</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {app.isParentMode && (
            <button className="btn wide" style={{ marginTop: 16 }} onClick={() => setEditPrize({})}>＋ Add a prize</button>
          )}
        </>
      )}

      {tab === 'goals' && (
        <>
          <div className="section-title">Everyone pulls together</div>
          <p className="muted" style={{ margin: '0 2px 12px' }}>
            Every point anyone earns pushes these bars forward.
          </p>

          <div className="stack">
            {state.familyGoals.length === 0 && <Empty emoji="🏆" title="No family goals yet">Set one everyone can chase.</Empty>}
            {state.familyGoals.map((g) => {
              const pct = Math.min(100, Math.round((g.progress / g.target) * 100))
              const hit = !!g.achievedAt || g.progress >= g.target
              return (
                <div key={g.id} className="goal" onClick={() => app.isParentMode && setEditGoal(g)}>
                  <div className="spread">
                    <div className="row">
                      <span style={{ fontSize: 30 }}>{g.emoji}</span>
                      <div>
                        <b style={{ fontSize: 17 }}>{g.title}</b>
                        {hit && <div className="badge-status good" style={{ marginTop: 3 }}>🎉 Unlocked!</div>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <b style={{ fontSize: 20, fontFamily: 'Baloo 2' }}>{pct}%</b>
                      <div className="tiny">{g.progress.toLocaleString()} / {g.target.toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="goalbar">
                    <i style={{ width: `${pct}%` }} />
                    <span className="lbl">{g.target - g.progress > 0 ? `${(g.target - g.progress).toLocaleString()} points to go` : 'Earned it!'}</span>
                  </div>
                  {g.reward && <p className="muted" style={{ margin: '10px 0 0' }}>🎁 {g.reward}</p>}
                </div>
              )
            })}
          </div>

          {app.isParentMode && (
            <button className="btn wide" style={{ marginTop: 16 }} onClick={() => setEditGoal({})}>＋ Add a family goal</button>
          )}
        </>
      )}

      {/* redeem confirm */}
      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title={confirm ? `${confirm.emoji} ${confirm.title}` : ''}>
        <p className="muted">
          This spends <b>{confirm?.cost} coins</b>. You'll have {me.coins - (confirm?.cost || 0)} left.
        </p>
        {confirm?.note && <div className="card" style={{ margin: '12px 0' }}>{confirm.note}</div>}
        <button
          className="btn go xl wide"
          onClick={() => { app.redeemPrize(confirm.id, me.id); setConfirm(null) }}
        >
          🎉 Claim it
        </button>
        <button className="btn ghost wide" style={{ marginTop: 8 }} onClick={() => setConfirm(null)}>Keep saving</button>
      </Sheet>

      <PrizeEditor
        open={!!editPrize}
        draft={editPrize}
        members={state.members}
        onClose={() => setEditPrize(null)}
        onSave={(d) => { d.id ? app.updatePrize(d.id, d) : app.addPrize(d); setEditPrize(null) }}
        onDelete={(id) => { app.removePrize(id); setEditPrize(null) }}
      />

      <GoalEditor
        open={!!editGoal}
        draft={editGoal}
        onClose={() => setEditGoal(null)}
        onSave={(d) => { d.id ? app.updateFamilyGoal(d.id, d) : app.addFamilyGoal(d); setEditGoal(null) }}
        onDelete={(id) => { app.removeFamilyGoal(id); setEditGoal(null) }}
      />
    </div>
  )
}

function PrizeEditor({ open, draft, members, onClose, onSave, onDelete }) {
  const [d, setD] = useState({})
  const [seed, setSeed] = useState(null)
  const key = draft?.id || (draft ? 'new' : null)
  if (open && seed !== key) {
    setSeed(key)
    setD({ title: '', emoji: '🎁', cost: 300, memberId: null, note: '', redeemed: [], ...draft })
  }
  if (!open) return null
  const set = (p) => setD((x) => ({ ...x, ...p }))

  return (
    <Sheet open={open} onClose={onClose} title={d.id ? 'Edit prize' : 'New prize'} lede="Long-term rewards kids save their coins for.">
      <label className="field">
        <span>Prize</span>
        <input value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="New soccer cleats" />
      </label>
      <label className="field">
        <span>Icon</span>
        <EmojiPicker value={d.emoji} onChange={(emoji) => set({ emoji })} set="prize" />
      </label>
      <label className="field">
        <span>Cost in coins</span>
        <input type="number" min="1" value={d.cost} onChange={(e) => set({ cost: Number(e.target.value) })} />
      </label>
      <label className="field">
        <span>Who's it for?</span>
        <select value={d.memberId || ''} onChange={(e) => set({ memberId: e.target.value || null })}>
          <option value="">Anyone in the family</option>
          {members.filter((m) => m.role === 'child').map((m) => (
            <option key={m.id} value={m.id}>{m.emoji} {m.name}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Fine print (optional)</span>
        <input value={d.note} onChange={(e) => set({ note: e.target.value })} placeholder="Weekend only" />
      </label>
      <div className="row">
        <button className="btn primary grow" disabled={!d.title} onClick={() => onSave(d)}>Save prize</button>
        {d.id && <DangerButton onConfirm={() => onDelete(d.id)}>Delete</DangerButton>}
      </div>
    </Sheet>
  )
}

function GoalEditor({ open, draft, onClose, onSave, onDelete }) {
  const [d, setD] = useState({})
  const [seed, setSeed] = useState(null)
  const key = draft?.id || (draft ? 'new' : null)
  if (open && seed !== key) {
    setSeed(key)
    setD({ title: '', emoji: '🏆', target: 2000, progress: 0, reward: '', ...draft })
  }
  if (!open) return null
  const set = (p) => setD((x) => ({ ...x, ...p }))

  return (
    <Sheet open={open} onClose={onClose} title={d.id ? 'Edit family goal' : 'New family goal'} lede="Everyone's points count toward this.">
      <label className="field">
        <span>Goal</span>
        <input value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="Family beach weekend" />
      </label>
      <label className="field">
        <span>Icon</span>
        <EmojiPicker value={d.emoji} onChange={(emoji) => set({ emoji })} set="prize" />
      </label>
      <label className="field">
        <span>Points needed</span>
        <input type="number" min="1" step="100" value={d.target} onChange={(e) => set({ target: Number(e.target.value) })} />
      </label>
      <label className="field">
        <span>What the family gets</span>
        <input value={d.reward} onChange={(e) => set({ reward: e.target.value })} placeholder="Two nights at the coast" />
      </label>
      {d.id && (
        <label className="field">
          <span>Progress so far</span>
          <input type="number" min="0" value={d.progress} onChange={(e) => set({ progress: Number(e.target.value) })} />
        </label>
      )}
      <div className="row">
        <button className="btn primary grow" disabled={!d.title} onClick={() => onSave(d)}>Save goal</button>
        {d.id && <DangerButton onConfirm={() => onDelete(d.id)}>Delete</DangerButton>}
      </div>
    </Sheet>
  )
}
