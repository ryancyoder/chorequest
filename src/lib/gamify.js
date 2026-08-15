/** XP curve: level N requires 100 * N XP to advance from N to N+1. */
export function levelFromXp(xp) {
  let level = 1
  let remaining = xp
  let need = 100
  while (remaining >= need) {
    remaining -= need
    level += 1
    need = 100 * level
  }
  return { level, into: remaining, need, pct: Math.round((remaining / need) * 100) }
}

export const RANKS = [
  { at: 1, name: 'Dust Bunny', emoji: '🐰' },
  { at: 3, name: 'Sock Sorter', emoji: '🧦' },
  { at: 5, name: 'Broom Squire', emoji: '🧹' },
  { at: 8, name: 'Suds Knight', emoji: '🫧' },
  { at: 12, name: 'Sparkle Baron', emoji: '✨' },
  { at: 16, name: 'Chore Champion', emoji: '🏆' },
  { at: 22, name: 'Legend of Tidy', emoji: '🐉' },
]

export function rankFor(level) {
  let r = RANKS[0]
  for (const x of RANKS) if (level >= x.at) r = x
  return r
}

export const BADGES = [
  { id: 'first-blood', name: 'First Job', emoji: '🥇', desc: 'Complete your very first task', test: (s) => s.approved >= 1 },
  { id: 'streak-3', name: 'On a Roll', emoji: '🔥', desc: '3-day streak', test: (s) => s.streak >= 3 },
  { id: 'streak-7', name: 'Week Warrior', emoji: '⚡', desc: '7-day streak', test: (s) => s.streak >= 7 },
  { id: 'streak-30', name: 'Unstoppable', emoji: '🌟', desc: '30-day streak', test: (s) => s.streak >= 30 },
  { id: 'ten-done', name: 'Double Digits', emoji: '🔟', desc: 'Approve 10 tasks', test: (s) => s.approved >= 10 },
  { id: 'fifty-done', name: 'Half Century', emoji: '💫', desc: 'Approve 50 tasks', test: (s) => s.approved >= 50 },
  { id: 'bounty-hunter', name: 'Bounty Hunter', emoji: '🎯', desc: 'Claim 5 add-on jobs', test: (s) => s.jobsDone >= 5 },
  { id: 'perfectionist', name: 'Perfectionist', emoji: '💎', desc: '5 photo checks scoring 95%+', test: (s) => s.perfectScores >= 5 },
  { id: 'coin-hoard', name: 'Coin Hoard', emoji: '🪙', desc: 'Hold 500 coins at once', test: (s) => s.coins >= 500 },
  { id: 'level-10', name: 'Double-Digit Level', emoji: '🚀', desc: 'Reach level 10', test: (s) => s.level >= 10 },
]

export function earnedBadges(stats) {
  return BADGES.filter((b) => b.test(stats)).map((b) => b.id)
}

/** Streak bonus multiplier on points — caps at 2x. */
export function streakMultiplier(streak) {
  if (streak >= 14) return 2
  if (streak >= 7) return 1.5
  if (streak >= 3) return 1.25
  return 1
}

export const MEMBER_COLORS = [
  { name: 'Sunburst', hex: '#ff9f1c', glow: '#ff9f1c66' },
  { name: 'Bubblegum', hex: '#ff5d8f', glow: '#ff5d8f66' },
  { name: 'Electric', hex: '#4cc9f0', glow: '#4cc9f066' },
  { name: 'Slime', hex: '#63e6a5', glow: '#63e6a566' },
  { name: 'Grape', hex: '#a06cff', glow: '#a06cff66' },
  { name: 'Lava', hex: '#ff5c5c', glow: '#ff5c5c66' },
  { name: 'Gold', hex: '#ffd60a', glow: '#ffd60a66' },
]
