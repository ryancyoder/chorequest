/**
 * 🎱 Chore Bingo — a 5×5 card per person, refreshed every week.
 *
 * The trick that makes it work: most squares mark themselves. Your routine
 * chores are on the card, so getting a chore approved fills a square without
 * anyone tapping anything. The rest are small one-off tasks that add variety —
 * things nobody would otherwise assign, which is the whole point of a bingo card
 * rather than a second view of the chore list.
 *
 * Lines pay out as they complete. A full card is a blackout.
 */

import { weekOf, todayISO } from './date.js'

export const SIZE = 5
export const FREE_INDEX = 12 // dead centre

export const REWARDS = {
  linePoints: 20,
  lineCoins: 10,
  blackoutPoints: 120,
  blackoutCoins: 60,
}

/** Squares that mark themselves off the back of something else in the app. */
export const DYNAMIC_SQUARES = [
  { kind: 'job', emoji: '🎯', text: 'Finish an add-on job' },
  { kind: 'record', emoji: '🏅', text: 'Set a personal record' },
  { kind: 'cheer', emoji: '📣', text: 'Cheer someone on' },
  { kind: 'landmine', emoji: '🧤', text: 'Defuse a landmine' },
]

/** Small extras — the variety a chore list never gives you. */
export const TASK_POOL = [
  { emoji: '💬', text: 'Say something kind to a sibling' },
  { emoji: '🤸', text: '10 jumping jacks' },
  { emoji: '📖', text: 'Read for 15 minutes' },
  { emoji: '😂', text: 'Make someone laugh' },
  { emoji: '🧺', text: "Put away 10 things that aren't yours" },
  { emoji: '🍳', text: 'Help make a meal' },
  { emoji: '🪞', text: 'Wipe a mirror until it squeaks' },
  { emoji: '🪴', text: 'Water a plant' },
  { emoji: '👕', text: 'Fold your own laundry' },
  { emoji: '☎️', text: 'Tell a grandparent hello' },
  { emoji: '🛏️', text: 'Tidy under your bed' },
  { emoji: '✏️', text: 'Sharpen every pencil you can find' },
  { emoji: '🧦', text: 'Match five pairs of socks' },
  { emoji: '🍽️', text: 'Clear the table without being asked' },
  { emoji: '🥰', text: 'Compliment a parent' },
  { emoji: '📬', text: 'Bring in the mail' },
  { emoji: '🚪', text: 'Wipe down the door handles' },
  { emoji: '🌳', text: 'Pick up five bits of rubbish outside' },
  { emoji: '⏰', text: 'Bed made before 8am' },
  { emoji: '🥦', text: 'Try a food you claim not to like' },
  { emoji: '🤝', text: "Do one of someone else's chores" },
  { emoji: '🎨', text: 'Draw something for the fridge' },
  { emoji: '🧹', text: 'Sweep one whole room' },
  { emoji: '👟', text: "Line up everyone's shoes" },
  { emoji: '🎤', text: 'Sing the entire time you clean' },
  { emoji: '🗑️', text: 'Empty one bin' },
  { emoji: '🚰', text: 'Scrub a sink' },
  { emoji: '🙏', text: 'Thank someone who did something for you' },
  { emoji: '🧸', text: 'Put every toy where it belongs' },
  { emoji: '📚', text: 'Read to someone younger than you' },
  { emoji: '🪟', text: 'Clean the fingerprints off one window' },
  { emoji: '🧽', text: 'Wipe a table nobody asked you to wipe' },
  { emoji: '🚲', text: 'Put the bikes away properly' },
  { emoji: '💡', text: 'Turn off every light nobody is using' },
  { emoji: '🐕', text: 'Give the dog some proper attention' },
  { emoji: '🧊', text: 'Refill the ice tray' },
]

export function weekStartOf(iso = todayISO()) {
  return weekOf(iso)[0]
}

function shuffle(list) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Build a fresh card. Their own chores go on it so ordinary life fills squares;
 * everything else is drawn from the extras pool.
 */
export function buildCard(state, memberId, weekStartISO) {
  const chores = state.chores.filter((c) => c.memberId === memberId)

  const choreSquares = shuffle(chores)
    .slice(0, 8)
    .map((c) => ({ kind: 'chore', choreId: c.id, emoji: c.emoji, text: c.title }))

  const dynamic = shuffle(DYNAMIC_SQUARES).slice(0, 4)
  const wanted = SIZE * SIZE - 1 - choreSquares.length - dynamic.length
  const tasks = shuffle(TASK_POOL).slice(0, Math.max(0, wanted))
    .map((t) => ({ kind: 'task', ...t }))

  // Top up from the pool if this person has very few chores (parents, usually).
  const filled = [...choreSquares, ...dynamic, ...tasks]
  while (filled.length < SIZE * SIZE - 1) {
    const extra = TASK_POOL[Math.floor(Math.random() * TASK_POOL.length)]
    if (!filled.some((s) => s.text === extra.text)) filled.push({ kind: 'task', ...extra })
  }

  const shuffled = shuffle(filled).slice(0, SIZE * SIZE - 1)
  const squares = []
  let cursor = 0
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (i === FREE_INDEX) {
      squares.push({ id: `sq_${i}`, kind: 'free', emoji: '⭐', text: 'FREE', marked: true, markedAt: Date.now() })
    } else {
      squares.push({ id: `sq_${i}`, ...shuffled[cursor++], marked: false, markedAt: null })
    }
  }

  return {
    id: `bingo_${memberId}_${weekStartISO}`,
    memberId,
    weekStartISO,
    squares,
    linesAwarded: [],
    blackoutAwarded: false,
    createdAt: Date.now(),
  }
}

/** All 12 possible lines on a 5×5 card, as index arrays keyed by name. */
export function allLines() {
  const lines = []
  for (let r = 0; r < SIZE; r++) {
    lines.push({ key: `row-${r}`, idx: Array.from({ length: SIZE }, (_, c) => r * SIZE + c) })
  }
  for (let c = 0; c < SIZE; c++) {
    lines.push({ key: `col-${c}`, idx: Array.from({ length: SIZE }, (_, r) => r * SIZE + c) })
  }
  lines.push({ key: 'diag-0', idx: [0, 6, 12, 18, 24] })
  lines.push({ key: 'diag-1', idx: [4, 8, 12, 16, 20] })
  return lines
}

export function completedLines(card) {
  return allLines().filter((l) => l.idx.every((i) => card.squares[i]?.marked))
}

export function markedCount(card) {
  return card.squares.filter((s) => s.marked).length
}

export function isBlackout(card) {
  return card.squares.every((s) => s.marked)
}

/** Which line keys does this square sit on? Used to highlight near-misses. */
export function linesThrough(index) {
  return allLines().filter((l) => l.idx.includes(index)).map((l) => l.key)
}

/** One square away from a line — worth shouting about on the card. */
export function nearMisses(card) {
  return allLines().filter((l) => {
    const marked = l.idx.filter((i) => card.squares[i]?.marked).length
    return marked === SIZE - 1
  })
}

export function cardFor(state, memberId, weekStartISO = weekStartOf()) {
  return (state.bingoCards || []).find(
    (c) => c.memberId === memberId && c.weekStartISO === weekStartISO,
  ) || null
}
