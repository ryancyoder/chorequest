import { useEffect, useMemo, useState } from 'react'

/* ─────────────────────────── bottom sheet ─────────────────────────── */

export function Sheet({ open, onClose, title, lede, children }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grabber" />
        {title && <h2>{title}</h2>}
        {lede && <p className="lede">{lede}</p>}
        {children}
      </div>
    </div>
  )
}

/* ─────────────────────────── progress ring ─────────────────────────── */

export function Ring({ pct = 0, size = 62, stroke = 7, color = 'var(--member)', label, sub }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const off = circ * (1 - Math.max(0, Math.min(1, pct / 100)))
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,0,0,.4)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off}
          style={{ transition: 'stroke-dashoffset .9s cubic-bezier(.2,.9,.2,1)', filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div className="inner">
        <b>{label ?? `${Math.round(pct)}%`}</b>
        {sub && <small>{sub}</small>}
      </div>
    </div>
  )
}

/* ─────────────────────────── confetti ─────────────────────────── */

const CONFETTI_COLORS = ['#ffd60a', '#ff4fd8', '#4cc9f0', '#63e6a5', '#ff8a00', '#a06cff']

export function Confetti({ count = 70 }) {
  const bits = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.9,
        dur: 1.9 + Math.random() * 1.7,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rot: Math.random() * 360,
        w: 6 + Math.random() * 7,
      })),
    [count],
  )
  return (
    <div className="confetti" aria-hidden>
      {bits.map((b) => (
        <i
          key={b.id}
          style={{
            left: `${b.left}%`,
            width: b.w,
            height: b.w * 1.6,
            background: b.color,
            transform: `rotate(${b.rot}deg)`,
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.dur}s`,
          }}
        />
      ))}
    </div>
  )
}

/* ─────────────────────────── empty state ─────────────────────────── */

export function Empty({ emoji = '🌈', title, children }) {
  return (
    <div className="empty">
      <div className="e">{emoji}</div>
      <b>{title}</b>
      {children && <p>{children}</p>}
    </div>
  )
}

/* ─────────────────────────── day picker ─────────────────────────── */

const D = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function DayPicker({ value = [], onChange }) {
  const toggle = (i) => onChange(value.includes(i) ? value.filter((d) => d !== i) : [...value, i].sort())
  return (
    <div className="daypick">
      {D.map((d, i) => (
        <button key={i} type="button" className={value.includes(i) ? 'on' : ''} onClick={() => toggle(i)}>
          {d}
        </button>
      ))}
    </div>
  )
}

/* ─────────────────────────── emoji picker ─────────────────────────── */

const EMOJI_SETS = {
  chore: ['🧹', '🧽', '🛏️', '🍽️', '🗑️', '🧺', '🧸', '📚', '🐕', '🚿', '🪣', '🧴', '🌿', '🚗', '🍳', '📦', '🪟', '👕', '🦷', '🎒'],
  face: ['🦄', '🦖', '🐬', '🐢', '🐝', '🦊', '🐼', '🦁', '🐙', '🐧', '🦋', '🐸', '🧔', '👩', '👨', '👧', '👦', '🧒', '👶', '🐰'],
  prize: ['🎁', '🍿', '🌙', '🏕️', '👟', '🧱', '🌊', '🎮', '🍦', '🎟️', '🛴', '📱', '🎨', '⚽', '🎸', '💰', '🍕', '🎪', '🏊', '🚴'],
  event: ['🏫', '⚽', '🎹', '🥋', '💼', '🎨', '🏊', '📖', '🎭', '🩺', '✈️', '🎂', '🙌', '🚌', '🎯', '🏀', '🎤', '🧑‍🏫', '🍽️', '📌'],
}

export function EmojiPicker({ value, onChange, set = 'chore' }) {
  const list = EMOJI_SETS[set] || EMOJI_SETS.chore
  return (
    <div className="chipgroup">
      {list.map((e) => (
        <button
          key={e}
          type="button"
          className={`chip ${value === e ? 'on' : ''}`}
          style={{ fontSize: 18, padding: '6px 10px' }}
          onClick={() => onChange(e)}
        >
          {e}
        </button>
      ))}
    </div>
  )
}

/* ─────────────────────────── confirm button ─────────────────────────── */

export function DangerButton({ children, onConfirm, confirmLabel = 'Tap again to confirm', className = 'btn no sm' }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button
      type="button"
      className={className}
      onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}
    >
      {armed ? confirmLabel : children}
    </button>
  )
}

export function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
