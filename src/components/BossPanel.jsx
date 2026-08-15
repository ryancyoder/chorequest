import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store/AppContext.jsx'
import { Sheet, DangerButton } from './ui.jsx'
import CameraCapture from './CameraCapture.jsx'
import { putPhoto } from '../lib/photos.js'
import { byId } from '../store/selectors.js'
import { formatDuration } from '../lib/landmines.js'
import {
  bossHp, hpPct, damageBoard, tauntFor, isEnraged, msToEnrage, damageDealt,
  BOSS_TEMPLATES,
} from '../lib/boss.js'

/** The live raid. Takes over the top of Today while a boss is standing. */
export default function BossPanel({ boss, member }) {
  const app = useApp()
  const [attacking, setAttacking] = useState(null)
  const [, bump] = useState(0)
  const prevHp = useRef(bossHp(boss))
  const [flash, setFlash] = useState(null)

  // Countdown to enrage.
  useEffect(() => {
    if (!boss.deadlineAt) return
    const id = setInterval(() => bump((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [boss.deadlineAt])

  // Float the damage number when the bar drops.
  const hp = bossHp(boss)
  useEffect(() => {
    if (hp < prevHp.current) {
      const dmg = prevHp.current - hp
      setFlash({ dmg, key: Date.now() })
      const t = setTimeout(() => setFlash(null), 1400)
      prevHp.current = hp
      return () => clearTimeout(t)
    }
    prevHp.current = hp
  }, [hp])

  const pct = hpPct(boss)
  const board = damageBoard(boss)
  const enraged = isEnraged(boss)
  const toEnrage = msToEnrage(boss)
  const open = boss.attacks.filter((a) => a.status === 'open')
  const mine = boss.attacks.filter((a) => a.claimedBy === member.id && a.status === 'claimed')
  const landed = boss.attacks.filter((a) => a.status === 'landed')

  return (
    <>
      <div className={`boss ${enraged ? 'enraged' : ''} ${pct <= 20 ? 'critical' : ''}`}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="bossface">{boss.emoji}</div>
          <div className="grow">
            <div className="row" style={{ gap: 6 }}>
              <b style={{ fontSize: 18, fontFamily: 'Baloo 2' }}>{boss.name}</b>
              {enraged && <span className="badge-status bad">😡 ENRAGED</span>}
            </div>
            <div className="tiny" style={{ marginTop: 2 }}>{tauntFor(boss)}</div>
          </div>
          {flash && (
            <span key={flash.key} className="dmgfloat">−{flash.dmg}</span>
          )}
        </div>

        <div className="hpbar">
          <i style={{ width: `${pct}%` }} />
          <span className="lbl">{hp} / {boss.maxHp} HP</span>
        </div>

        <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
          {boss.pot > 0 && <span className="reward-chip">💰 {boss.pot} coin loot</span>}
          <span className="reward-chip">⚔️ {landed.length}/{boss.attacks.length} down</span>
          {toEnrage != null && !enraged && (
            <span className="badge-status warn">⏳ enrages in {formatDuration(toEnrage)}</span>
          )}
          {enraged && <span className="badge-status bad">+{boss.enrageHeal}/hr healing</span>}
        </div>

        {board.length > 0 && (
          <div className="dmgboard">
            {board.map((b) => {
              const m = byId(app.state.members, b.memberId)
              const share = Math.round((b.damage / Math.max(1, damageDealt(boss))) * 100)
              return (
                <div className="dmgrow" key={b.memberId}>
                  <span>{m?.emoji}</span>
                  <span className="grow tiny" style={{ color: 'var(--ink)' }}>{m?.name}</span>
                  <span className="dmgtrack"><i style={{ width: `${share}%`, background: m?.color }} /></span>
                  <b className="tiny">{b.damage}</b>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {mine.length > 0 && (
        <>
          <div className="section-title">⚔️ You're on <span className="count">{mine.length}</span></div>
          <div className="stack">
            {mine.map((a) => (
              <AttackRow key={a.id} attack={a} boss={boss} app={app} member={member} onFinish={() => setAttacking(a)} mine />
            ))}
          </div>
        </>
      )}

      <div className="section-title">
        🗡️ Attacks <span className="count">{open.length} open</span>
      </div>
      <div className="stack">
        {open.length === 0 && landed.length < boss.attacks.length && (
          <p className="muted" style={{ margin: '0 2px' }}>Everything's claimed. Go help somebody.</p>
        )}
        {open.map((a) => (
          <AttackRow key={a.id} attack={a} boss={boss} app={app} member={member} />
        ))}
        {landed.map((a) => (
          <AttackRow key={a.id} attack={a} boss={boss} app={app} member={member} />
        ))}
      </div>

      <AttackSheet
        attack={attacking}
        boss={boss}
        member={member}
        onClose={() => setAttacking(null)}
      />
    </>
  )
}

function AttackRow({ attack, boss, app, member, onFinish, mine }) {
  const claimer = byId(app.state.members, attack.claimedBy)
  const lander = byId(app.state.members, attack.landedBy)
  const done = attack.status === 'landed'

  return (
    <div className={`task attack ${done ? 'down' : ''} ${attack.weakPoint ? 'weak' : ''}`}>
      <div className="ico">{attack.emoji}</div>
      <div className="grow">
        <div className="ttl">{attack.title}</div>
        <div className="sub">
          <span className="reward-chip">💥 {attack.damage}</span>
          {attack.weakPoint && <span className="badge-status warn">🎯 weak point</span>}
          {done
            ? <span className="badge-status good">✅ {lander?.emoji} {lander?.name}</span>
            : claimer && <span className="badge-status info">{claimer.emoji} {claimer.name} is on it</span>}
        </div>
      </div>

      {done ? (
        app.isParentMode ? (
          <button className="btn sm ghost" onClick={() => app.voidAttack(boss.id, attack.id, member.id)}>↩︎</button>
        ) : <span style={{ fontSize: 18 }}>💥</span>
      ) : mine ? (
        <div className="row" style={{ gap: 6 }}>
          <button className="btn go sm" onClick={onFinish}>Land it</button>
          <button className="btn sm ghost" onClick={() => app.releaseAttack(boss.id, attack.id)}>✕</button>
        </div>
      ) : attack.status === 'open' ? (
        <button className="btn primary sm" onClick={() => app.claimAttack(boss.id, attack.id, member.id)}>
          Take it
        </button>
      ) : null}
    </div>
  )
}

function AttackSheet({ attack, boss, member, onClose }) {
  const app = useApp()
  const [photo, setPhoto] = useState(null)
  const [saving, setSaving] = useState(false)
  if (!attack) return null

  async function land() {
    setSaving(true)
    const photoId = photo ? await putPhoto(photo) : null
    app.landAttack(boss.id, attack.id, member.id, photoId)
    setSaving(false)
    setPhoto(null)
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={`${attack.emoji} ${attack.title}`} lede={`Worth ${attack.damage} damage`}>
      <p className="muted" style={{ marginTop: 0 }}>
        Photo's optional here — a parent is right there watching. It just makes the kill screenshot better.
      </p>
      <CameraCapture value={photo} onChange={setPhoto} hint="Show the damage" compact />
      <button className="btn go xl wide" style={{ marginTop: 14 }} onClick={land} disabled={saving}>
        {saving ? 'Swinging…' : `💥 Land it — ${attack.damage} damage`}
      </button>
      <button className="btn ghost wide" style={{ marginTop: 8 }} onClick={onClose}>Not yet</button>
    </Sheet>
  )
}

/* ─────────────────────── summoning (parents) ─────────────────────── */

export function SummonSheet({ open, onClose, app, me }) {
  const [tpl, setTpl] = useState(null)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🐉')
  const [attacks, setAttacks] = useState([])
  const [pot, setPot] = useState(60)
  const [hours, setHours] = useState(4)
  const [newTitle, setNewTitle] = useState('')
  const [newDmg, setNewDmg] = useState(50)

  function pick(t) {
    setTpl(t.key)
    setName(t.name)
    setEmoji(t.emoji)
    setAttacks(t.attacks.map((a) => ({ ...a })))
  }

  function summon() {
    app.summonBoss({
      name: name.trim() || 'The Boss',
      emoji, blurb: '',
      attacks,
      pot: Number(pot) || 0,
      deadlineAt: hours > 0 ? Date.now() + hours * 3600000 : null,
      createdBy: me.id,
    })
    setTpl(null); setName(''); setAttacks([]); setPot(60); setHours(4)
    onClose()
  }

  if (!open) return null
  const totalHp = attacks.reduce((n, a) => n + Number(a.damage || 0), 0)

  return (
    <Sheet open onClose={onClose} title="⚔️ Summon a boss" lede="A big job with a health bar. Everyone attacks at once.">
      <div className="tiny" style={{ marginBottom: 8 }}>PICK A FIGHT</div>
      <div className="stack" style={{ marginBottom: 14 }}>
        {BOSS_TEMPLATES.map((t) => (
          <button
            key={t.key}
            className={`card tap ${tpl === t.key ? 'glow' : ''}`}
            style={{ textAlign: 'left' }}
            onClick={() => pick(t)}
          >
            <div className="row">
              <span style={{ fontSize: 26 }}>{t.emoji}</span>
              <div className="grow">
                <b>{t.name}</b>
                <div className="tiny">{t.blurb}</div>
              </div>
              <span className="reward-chip">
                {t.attacks.reduce((n, a) => n + a.damage, 0)} HP
              </span>
            </div>
          </button>
        ))}
      </div>

      {attacks.length > 0 && (
        <>
          <div className="row">
            <label className="field grow">
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field" style={{ maxWidth: 90 }}>
              <span>Icon</span>
              <input value={emoji} onChange={(e) => setEmoji(e.target.value)} />
            </label>
          </div>

          <div className="tiny" style={{ margin: '4px 0 8px' }}>
            ATTACKS · {totalHp} TOTAL HP
          </div>
          <div className="stack" style={{ marginBottom: 10 }}>
            {attacks.map((a, i) => (
              <div className="row" key={i}>
                <span className="grow card" style={{ padding: '8px 12px', fontSize: 13 }}>
                  {a.emoji} {a.title} {a.weakPoint && '🎯'}
                </span>
                <input
                  type="number"
                  value={a.damage}
                  onChange={(e) => setAttacks(attacks.map((x, j) => j === i ? { ...x, damage: Number(e.target.value) } : x))}
                  style={{ width: 74 }}
                />
                <button className="btn sm no" onClick={() => setAttacks(attacks.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
          </div>

          <div className="row" style={{ marginBottom: 14 }}>
            <input
              className="grow"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Add your own attack"
            />
            <input type="number" value={newDmg} onChange={(e) => setNewDmg(Number(e.target.value))} style={{ width: 74 }} />
            <button
              className="btn sm"
              onClick={() => {
                if (!newTitle.trim()) return
                setAttacks([...attacks, { emoji: '🗡️', title: newTitle.trim(), damage: newDmg, weakPoint: false }])
                setNewTitle('')
              }}
            >Add</button>
          </div>

          <div className="row">
            <label className="field grow">
              <span>Loot pot (coins)</span>
              <input type="number" min="0" value={pot} onChange={(e) => setPot(e.target.value)} />
              <span className="tiny">Split by damage dealt</span>
            </label>
            <label className="field grow">
              <span>Enrages after (hrs)</span>
              <input type="number" min="0" value={hours} onChange={(e) => setHours(Number(e.target.value))} />
              <span className="tiny">0 = no timer</span>
            </label>
          </div>

          <button className="btn no xl wide" onClick={summon} disabled={!attacks.length}>
            ⚔️ Summon it — {totalHp} HP
          </button>
        </>
      )}
    </Sheet>
  )
}
