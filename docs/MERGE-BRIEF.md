# Merge brief — folding ChoreQuest into a combined household app

You're being asked to merge this app with two others into one. Read `CLAUDE.md`
first for how this codebase works and why. This document covers only what
matters **because it's a merge**.

---

## Before you write any code

Ask the user for these. Guessing at them will cost more than asking:

1. **What are the other two apps?** Purpose, stack, and whether they're React.
   If they're a different framework, that decides the whole shape of the merge.
2. **Which app is the host?** The combined app should grow out of one codebase,
   not be assembled in a new empty one. Whichever has the most complex state and
   UI is usually the right host — for this app, that's the state machine around
   approvals, escrow and time-driven accrual.
3. **Is the merge cosmetic or actual?** Three tabs that never talk to each other
   is a very different job from one shared family, one economy and one login.
4. **Does the combined app get a backend?** See "The sync question" below — it
   changes almost every other decision.
5. **What must not break?** This household is actively using this app with real
   data on real devices. Losing streaks, coin balances or the gold-star wall
   would be a real loss, not a test-data inconvenience.

---

## The three things most likely to go wrong

### 1. localStorage key collisions and data loss

This app owns exactly two storage locations:

- `localStorage['chorequest.state.v1']` — one JSON object, the whole app
- IndexedDB database `chorequest-photos` — one object store, `dataUrl` by id

If another app writes to a generic key (`state`, `app`, `settings`, `data`),
**check for a collision before the first run**, and namespace everything.

**Never ship a merge that reads old state and writes a new shape without a
migration.** `src/store/storage.js` already does versioned normalisation on
load; extend that rather than inventing a second mechanism. If you restructure
the state, write a one-way migration that reads `chorequest.state.v1`, converts
it, and writes the new key — and keep the old key until you've confirmed the
conversion on the user's actual device.

Before doing anything destructive, have the user export a backup. There's no
export UI today; adding one is a sensible first task of the merge.

### 2. One family, three member lists

Every app in this space will have its own notion of a person. The merge is only
worth doing if **there is one member list**, and that is the hardest part.

Points to settle explicitly:

- Identity: this app uses opaque string ids (`m1`…`m7`) with name, emoji,
  colour, `role: 'parent'|'child'` and a per-parent PIN. Match by name at merge
  time, then keep one id space forever.
- Colour and emoji drive the whole visual identity here (`--member` CSS
  variable). Preserve them.
- `role` gates every parent-only capability. If another app has a different
  permission model, unify on one and audit each gate.

### 3. Three economies do not simply add up

This app's numbers are balanced against each other. Chores pay 8–30 points, jobs
25–60, boss attacks 40–80, gold stars 15–20, records 3 per day plus the record
length. Coins are deliberately scarcer than points and are the only currency
that buys prizes.

If another app also awards points or coins, **do not merge the currencies
without re-balancing**. Two specific traps:

- **Never let records or gold stars pay coins.** Both are self- or
  sibling-reported. They pay XP precisely because rank can't be spent, so
  inflating it is pointless. Paying coins creates a reason to lie.
- **Keep `awardXp()` as the single entry point.** It enforces the landmine
  freeze and feeds family goals. A second app writing `member.xp +=` directly
  will silently break escrow.

---

## The sync question

**This app has no backend.** All three apps are presumably local-only, which
means the merged app inherits the problem in triplicate.

It is the single biggest limitation. Boss battles and gold stars are designed
around several people seeing the same thing, and today they can't. If the merge
is the moment to add a backend, the state here is already suited to it: one
serializable object, photos referenced by id rather than inlined, and every
mutation funnelled through a small set of actions in `AppContext`.

If you do add sync, the ordering that matters:

1. Photos first (they're the bulk and the slowest)
2. Then append-only logs (activity, stars, submissions) — these merge cleanly
3. Balances and streaks **last**, and carefully. Two devices approving the same
   chore must not pay twice. The idempotence discipline in `landmines`/`boss`
   (recompute from a timestamp, diff against applied) is the pattern to copy.

If you're *not* adding a backend, say so plainly to the user rather than
implying the merged app will share data between phones.

---

## What to preserve from this codebase

These aren't preferences; each encodes a decision that took a while to reach.

| Keep | Why |
|---|---|
| `update()` draft-mutation contract | Returning instead of mutating nulled the entire state once |
| Compute-before-`update()` pattern | React updaters aren't synchronous and double-invoke in StrictMode |
| Idempotent time accrual | Backgrounding an app must not double-charge a child |
| `storage.js` migration on load | Real devices hold old state; a missing key is a white screen |
| Parent approval as payment gate | The AI never pays; a human does |
| Escrow instead of forfeiting | A frozen kid still has a reason to work |
| No self-awarded gold stars | The rule the whole feature rests on |
| Records pay XP, never coins | Removes the incentive to lie |
| Two file inputs for iOS camera | `capture` skips the Photos/Files sheet |
| Portals for full-screen overlays | Transformed ancestors break `position: fixed` |
| The photo check's blob clustering | Averaging is what made the original blind to a sock |

## What's safely negotiable

- Tab structure and navigation — six tabs is already crowded; the merged app
  will need a rethink, and nothing depends on the current arrangement.
- The saga (`public/saga.html`) is a standalone animated explainer. It reads
  members from localStorage and falls back gracefully. It can be dropped,
  re-skinned, or extended with the other apps' features; nothing imports it.
- Visual design. The token system at the top of `styles.css` is the only thing
  worth keeping wholesale; individual component styling is not precious.
- Seed data in `src/store/seed.js` is demo content, not real. The family's real
  data lives only in their browsers.

---

## Deployment

GitHub Actions builds and publishes to GitHub Pages on every push to `main`
(`.github/workflows/deploy.yml`, ~40s). `vite.config.js` sets `base: './'` for
the project subpath — a merged app on a different path still works, an absolute
base won't.

`public/saga.html` has a fixed filename, so returning devices can be served a
cached copy. `SagaViewer` appends a version parameter to defeat that; bump it if
the saga changes.

---

## Suggested order of work

1. Read `CLAUDE.md` and skim `src/store/AppContext.jsx` — it's the spine.
2. Get the user's answers to the five questions at the top.
3. Have them **back up real data** from each app before anything runs.
4. Write the unified member model first and migrate all three onto it. Nothing
   else can be settled until identity is.
5. Merge state shapes with an explicit versioned migration; keep old keys until
   verified on-device.
6. Then unify the economy, deliberately, with the balance table above in view.
7. Navigation and visual merge last — it's the most visible and least risky.

Verify by driving the real app in a browser, in both layouts and both
parent/child modes, and check `localStorage` after each action. There is no test
suite to lean on.
