/**
 * ⚔️ Boss Battles — a big job with a health bar.
 *
 * A family goal is a savings account: a number that slowly rises. A boss is an
 * *event*. It has a face, a deadline, and it dies at a specific moment with
 * everyone watching. That difference is the whole point — it's what gets a
 * household into the garage on a Saturday.
 *
 * The boss is broken into attacks. Anyone claims one, does it, and lands the
 * hit. Damage is dealt immediately rather than waiting on approval, because a
 * raid is a synchronous thing happening in one house with a parent standing
 * right there — a review queue would kill the momentum. Parents can undo any
 * hit afterwards.
 *
 * HP is always derived from the attacks that have landed, never incremented, so
 * undoing a hit or reloading mid-battle can't corrupt the bar.
 */

export const DEFAULT_ENRAGE_HEAL = 40 // HP per hour once the deadline passes
export const LAST_HIT_BONUS = 25      // coins for the killing blow

export function damageDealt(boss) {
  return boss.attacks
    .filter((a) => a.status === 'landed')
    .reduce((n, a) => n + a.damage, 0)
}

export function bossHp(boss) {
  const dealt = damageDealt(boss)
  return Math.max(0, Math.min(boss.maxHp, boss.maxHp + (boss.healed || 0) - dealt))
}

export function hpPct(boss) {
  return Math.round((bossHp(boss) / boss.maxHp) * 100)
}

export function isSlain(boss) {
  return bossHp(boss) <= 0
}

/**
 * How much the boss should have healed by now. Derived from the deadline rather
 * than accumulated, so it survives reloads and double-fired timers.
 * Capped at max HP — the boss can recover, but never beyond full.
 */
export function cumulativeHeal(boss, now = Date.now()) {
  if (!boss.deadlineAt || now < boss.deadlineAt || boss.status !== 'alive') return boss.healed || 0
  const hours = (now - boss.deadlineAt) / 3600000
  const rate = boss.enrageHeal ?? DEFAULT_ENRAGE_HEAL
  return Math.min(boss.maxHp, Math.floor(hours * rate))
}

export function isEnraged(boss, now = Date.now()) {
  return boss.status === 'alive' && !!boss.deadlineAt && now >= boss.deadlineAt
}

export function msToEnrage(boss, now = Date.now()) {
  if (!boss.deadlineAt) return null
  return boss.deadlineAt - now
}

/** Damage per person, biggest first. Drives loot split and the MVP. */
export function damageBoard(boss) {
  const tally = {}
  for (const a of boss.attacks) {
    if (a.status !== 'landed' || !a.landedBy) continue
    tally[a.landedBy] = (tally[a.landedBy] || 0) + a.damage
  }
  return Object.entries(tally)
    .map(([memberId, damage]) => ({ memberId, damage }))
    .sort((a, b) => b.damage - a.damage)
}

/** Loot splits by contribution, so the seven-year-old still gets paid. */
export function lootSplit(boss) {
  const board = damageBoard(boss)
  const total = board.reduce((n, b) => n + b.damage, 0)
  if (!total || !boss.pot) return []
  return board.map((b) => ({
    memberId: b.memberId,
    damage: b.damage,
    coins: Math.max(1, Math.round((b.damage / total) * boss.pot)),
  }))
}

export function openAttacks(boss) {
  return boss.attacks.filter((a) => a.status === 'open')
}

export function attacksFor(boss, memberId) {
  return boss.attacks.filter((a) => a.claimedBy === memberId && a.status === 'claimed')
}

export function liveBoss(state) {
  return (state.bosses || []).find((b) => b.status === 'alive') || null
}

/* ─────────────────────────── templates ─────────────────────────── */

const atk = (emoji, title, damage, weakPoint = false) => ({ emoji, title, damage, weakPoint })

export const BOSS_TEMPLATES = [
  {
    key: 'garage',
    name: 'The Garage',
    emoji: '🗄️',
    blurb: 'It has been accumulating since spring. It knows what it did.',
    attacks: [
      atk('🧹', 'Sweep the whole floor', 70),
      atk('📦', 'Break down every box', 60),
      atk('🎨', 'Rehome the paint cans', 50, true),
      atk('🚲', 'Hang the bikes properly', 60),
      atk('🔧', 'Tools back on the pegboard', 50),
      atk('🕸️', 'Corners and cobwebs', 40, true),
      atk('🗑️', 'Fill one bin bag with actual rubbish', 45),
      atk('🪑', 'Clear the workbench completely', 65),
    ],
  },
  {
    key: 'closet',
    name: 'The Closet Purge',
    emoji: '👕',
    blurb: 'If it does not fit, it is not staying.',
    attacks: [
      atk('👚', 'Try on and sort the outgrown pile', 80, true),
      atk('🧺', 'Bag up the donations', 60),
      atk('🪝', 'Everything on hangers, facing one way', 55),
      atk('👟', 'Pair and line up every shoe', 50),
      atk('📚', 'Clear the closet floor entirely', 65),
      atk('🧦', 'The odd sock reckoning', 40, true),
    ],
  },
  {
    key: 'yard',
    name: 'The Yard',
    emoji: '🌳',
    blurb: 'Company is coming and it currently looks like this.',
    attacks: [
      atk('🍂', 'Rake the front', 70),
      atk('🌿', 'Weed along the fence', 60, true),
      atk('🧸', 'Collect every toy off the grass', 45),
      atk('🪣', 'Coil the hose and put it away', 35),
      atk('🪟', 'Sweep the porch and steps', 50),
      atk('🗑️', 'Bag the garden waste', 55),
    ],
  },
  {
    key: 'playroom',
    name: 'The Playroom',
    emoji: '🧸',
    blurb: 'Somewhere under there is a carpet.',
    attacks: [
      atk('🧱', 'All the Lego into one bin', 60, true),
      atk('🎨', 'Craft supplies back in the drawers', 50),
      atk('📚', 'Books on the shelf, spines out', 45),
      atk('🧩', 'Reunite the puzzles with their boxes', 55, true),
      atk('🧹', 'Vacuum the whole floor', 65),
      atk('🪆', 'Soft toys in the basket', 40),
    ],
  },
]

export function templateHp(template) {
  return template.attacks.reduce((n, a) => n + a.damage, 0)
}

/* ─────────────────────────── flavour ─────────────────────────── */

export function tauntFor(boss) {
  const pct = hpPct(boss)
  if (pct > 90) return 'It has not even noticed you yet.'
  if (pct > 70) return 'It is starting to look concerned.'
  if (pct > 45) return 'You are actually doing this.'
  if (pct > 20) return "It's wobbling. Keep going."
  if (pct > 0) return 'ONE MORE HIT. SOMEBODY FINISH IT.'
  return 'Defeated.'
}

export function hitFlavour(damage) {
  if (damage >= 70) return 'CRITICAL HIT'
  if (damage >= 50) return 'Massive hit'
  if (damage >= 30) return 'Solid hit'
  return 'Hit'
}
