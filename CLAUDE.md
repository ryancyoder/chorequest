# ChoreQuest — project brief

A gamified chore, schedule and behaviour app for a seven-person household
(2 parents, 5 kids aged roughly 7–15). Runs as a web app, installed to the home
screen on iOS. Live at `https://ryancyoder.github.io/chorequest/`.

**Read this before changing anything.** Most of what follows is not style
preference — it's the record of specific bugs that shipped, were caught, and
must not be reintroduced.

---

## 1. Stack and shape

| | |
|---|---|
| Build | Vite 6 + React 18, plain JS (no TypeScript) |
| Routing | None. `App.jsx` holds a `tab` string and renders one of nine screens |
| State | One plain object in `localStorage` under `chorequest.state.v1` |
| Photos | IndexedDB (`chorequest-photos`), never localStorage |
| Styling | One hand-written `src/styles.css`, CSS custom properties, no framework |
| Backend | **None.** Everything is on-device |
| Tests | **None.** Verification is done by driving the real app in a browser |
| Deploy | Push to `main` → GitHub Actions → GitHub Pages, ~40s |

`vite.config.js` sets `base: './'` so the build works under the `/chorequest/`
subpath. Don't change that to an absolute base.

### Layout

Two layouts, chosen by viewport width (`src/lib/layout.js`, breakpoint 900px)
with a per-device override in settings (`auto` | `phone` | `tablet`):

- **phone** — single column, floating bottom nav
- **tablet** — sidebar rail, two-pane content, week-matrix schedule

`app.layout` (resolved) and `app.layoutPref` (chosen) both come from context.

---

## 2. The invariants — every one of these is a bug that shipped

### 2.1 `update()` mutates a draft; its return value is ignored

```js
const update = (fn) => setState((prev) => { const d = structuredClone(prev); fn(d); return d })
```

The original returned `fn(structuredClone(prev))`. Every action used a
block-bodied arrow, so every action returned `undefined` and **nulled the entire
state** on first use. If you add an action, mutate the draft — never return.

### 2.2 Never read a result out of a React state updater

`setState` updaters are not guaranteed to run synchronously, and React 18
StrictMode double-invokes them. `approveSubmission` originally computed a
celebration payload inside the updater and read it afterwards — it was always
null.

**Pattern:** compute everything from the current `state` snapshot *before*
calling `update()`, then apply pre-computed values inside. See
`approveSubmission`, `redeemPrize`, `claimJob` for the shape.

### 2.3 Time-driven state must be idempotent

Landmine damage and boss enrage-healing are recomputed from a stored timestamp
and diffed against what's already been applied — never incremented. This is why
closing the app, reopening it, backgrounding, or a double-fired timer cannot
double-charge anyone. Accrual is also capped (72h for landmines) so a week away
doesn't return a five-figure fine.

If you add anything that accrues over time, follow this. Do not `+= rate`.

### 2.4 `storage.js` migration is mandatory

Real devices hold state written by older builds. `migrate()` in
`src/store/storage.js` fills in every array and field added since. **Every new
top-level key or member field must be added there**, or returning users get a
white screen. This has been exercised repeatedly on live data.

### 2.5 Full-screen overlays must portal to `document.body`

`.screen` carries a transform during its entrance animation, and a transformed
ancestor becomes the containing block for `position: fixed`. An overlay rendered
in place sized itself to the 4,154px scrolling page instead of the viewport.
`SagaViewer` and the full-screen camera both use `createPortal`.

### 2.6 iOS camera: two file inputs, not one

The presence of the `capture` attribute sends iOS **straight to the camera** and
skips the Photos/Files sheet entirely. `CameraCapture` therefore has two hidden
inputs:

- `capture="environment"` → the system camera (full screen)
- no `capture` → the standard iOS sheet (Photo Library / Take Photo / Choose File)

One input cannot do both jobs. This was a reported bug.

### 2.7 Viewport changes: listen to more than `matchMedia`

`useWideViewport` listens to `matchMedia` change **plus** `resize` **plus**
`orientationchange`, because the `change` event alone isn't reliable for iPad
rotation on every platform.

### 2.8 CSS grid: `minmax(0, 1fr)`, not `1fr`

Plain `1fr` won't shrink below its content, which blew the month view's columns
far past the viewport. Any grid holding text needs `minmax(0, 1fr)`.

### 2.9 Delta-time clocks need clamping

`requestAnimationFrame` stops when a tab is hidden. Without clamping, the first
frame back carries a delta as long as the user was away and jumps the clock.
See the saga's `frame()`.

---

## 3. The data model

One object. Top-level keys:

```
members[]      id, name, emoji, color, role: 'parent'|'child', pin, xp, coins,
               streak, lastDoneISO, badges[], totalApproved, jobsDone,
               perfectScores, escrowXp, escrowCoins, starsReceived, starsGiven
chores[]       routine, recurring: memberId, days[0-6], time, points, coins,
               needsPhoto, referencePhotoId, checklist[], room
events[]       calendar: kind 'repeat'|'once', memberIds[] (empty = whole
               family), days[], fromISO/untilISO, dateISO/endDateISO, allDay,
               away, duties[{id,text,memberId}]
jobs[]         one-off bounties: claimedBy, status open|claimed|submitted|done
submissions[]  proof of work: kind 'chore'|'job'|'landmine', status
               ai_rejected|pending|approved|rejected, ai verdict, photoId
landmines[]    armed messes: ownerId, armedAt, status, pot, appliedDrain,
               appliedFine, disputed, streakBurned
bosses[]       group projects: maxHp, attacks[], pot, healed, deadlineAt, status
tracks[]       personal records: kind 'virtue'|'vice', log{dateISO->hit|slip},
               paid{}, best
prs[]          record-breaking events + cheers
stars[]        gold stars: toId, fromId, category, status pending|confirmed
bingoCards[]   weekly 5x5 per member
prizes[] familyGoals[] activity[] familyRecord settings
```

`settings` holds `currentMemberId`, `parentUnlocked`, `requirePin`,
`layoutMode`, `landmineRates`, `aiSensitivity`.

**Photos are never stored inline.** `putPhoto(dataUrl)` returns an id; the app
stores the id. `photoUrl(id)` reads synchronously from an in-memory map that
`hydratePhotos()` fills at boot.

---

## 4. Feature logic worth understanding before touching

### The economy, and one rule that holds it together

`awardXp(draft, memberId, xp, coins)` in `AppContext.jsx` is the **single point**
where anyone gains anything. It handles the landmine freeze and feeds family
goals. Never write `member.xp +=` anywhere else.

**Parent approval is the payment gate.** The AI check never pays anyone; it only
decides whether something reaches the review queue. Approval is what moves XP,
coins, streaks, badges and goals.

### Landmines (family sabotage)

Escalating consequences for a mess left behind: ARMED (grace) → TICKING (family
goal bleeds) → SMOKING (offender's streak burns) → DETONATED (fines accrue into
a pot). Whoever cleans it takes the pot; if the offender cleans their own, the
pot goes to the family goal instead.

**The offender's earnings go to escrow, not the void.** They keep doing chores
and everything lands the moment it's cleared. This was deliberate: destroying
earnings removes any reason to work in the meantime.

Fairness valves that must survive: **own up** halves the fine and resets the
clock; **dispute** freezes all escalation until a parent rules; parents can
**void**. Unclaimed mines drain 1.5× faster to pressure a confession.

### Gold stars (kindness / chivalry / respect)

The mirror of landmines. Guards are the design:

- **Nobody can award themselves one.** Stars flow sideways, never down.
- 3/day for kids, 6 for parents — scarcity keeps one meaningful
- Kids can't award the same person twice running (stops sibling pumping)
- Kids nominate → parent confirms; parents award directly
- The spotter earns a small amount, so the app rewards *looking* for generosity

### Personal records (virtues / vices)

Self-chosen habits. **They pay XP but never coins.** Coins buy prizes, so paying
coins would create a reason to lie about a streak; rank can't be spent, so
inflating it is pointless. Everything on the board is opt-in, so slips are
visible — but **the feed only ever carries PRs and comebacks, never slips**.
Falling down is not a notification.

Streaks derive from the log rather than incrementing, and a per-day `paid` map
means re-logging can't pay twice.

### Boss battles

A big job as a health bar. Hits land **immediately** rather than queueing for
approval — a raid is synchronous, in one house, with a parent present, and a
review queue would kill it. Parents can reverse any hit. HP is always derived
from landed attacks; loot splits by damage dealt so the youngest still gets paid.

### The photo check — read `src/lib/vision.js` before touching

This was rewritten once because the first version answered the wrong question.

**It does not judge cleanliness.** It detects *things left out on surfaces* by
comparing a submission against the parent's "finished" reference:

1. Centre-crop both to 96×96
2. Normalise brightness globally, measure colour as chromaticity with the average
   cast removed, scale texture by the frame's own average — exposure and colour
   temperature stop mattering
3. Search translations for the offset where the scenes agree (this is what makes
   alignment forgiving — a foot to the left is a *shift*, and shifts undo)
4. Morphologically **open** the leftover differences and cluster into blobs.
   Objects are thick and compact; alignment residue is thin and hugs edges.
   **Averaging destroys this distinction** — that was the original flaw

Measured: 4% camera drift and a two-stop lighting change give zero false
findings; a mug, a grey box and a white box are each found and located. ~15ms.

Two things it must never do again:

- **Guess added-vs-removed from brightness/texture.** A grey box is brighter
  than the counter and flatter than the surface it covers, so it was filed as
  "removed" and vanished. Direction can't be known from pixels and isn't claimed.
- **Accuse an honest kid.** The anti-spoof once fired on a genuinely tidy
  retake. A photo that *looks* like "done" is someone who did the job well.
  Only an exact byte match counts as a re-upload.

There is **no AI model and no API key**. Tier two ("Ask for extra help") posts to
a server route that isn't connected yet; see `docs/photo-check-server.md`. **An
API key must never enter this bundle** — everything shipped to the browser is
readable by anyone who loads the page.

---

## 5. Known weaknesses — real, and not yet fixed

1. **No sync. Everything is per-device.** This is the biggest limitation. A star
   Ava gives on her phone never appears on Dad's. Boss battles, which are meant
   to be watched live by the whole family, only work gathered around one screen.
2. **The leaderboard is all-time cumulative,** so a 7-year-old with 160 XP can
   never catch a 15-year-old with 1,500. A weekly season with per-member
   handicaps was proposed and not built. Worth doing.
3. **`settings.parentUnlocked` persists across reloads.** A kid picking up an
   unlocked iPad has full parent access until someone taps Lock.
4. **The photo check is validated only against synthetic scenes.** The bench
   caught three real bugs, but a canvas has no shadows, reflections or depth.
5. **No automated tests.** Verification has been done by driving the live app.
6. Checklists on chores are collected and shown to the reviewing parent, but
   nothing machine-checks them. That's what tier two is for.

---

## 6. Conventions

- Comments explain **why**, not what. Several exist purely to stop a fixed bug
  being reintroduced — keep them.
- Copy is written from the user's side and is deliberately warm and a bit funny
  ("Stars are for other people. That's rather the point."). Match the voice.
- Prefer deriving state over storing it (streaks, HP, bingo lines).
- Sheets/modals use the `Sheet` component; destructive actions use
  `DangerButton` (tap-twice-to-confirm).
- Emoji carry meaning consistently: 💣 landmine, ⚔️ boss, ⭐ gold star,
  🏅 record, 🎱 bingo, 🎯 job, 🧹 chore.
- Member colour drives the accent via the `--member` CSS variable.

## 7. Verifying changes

There is no test suite, so **drive the real app**. The established method:

- Run `npm run dev`, open it, and script interactions in the browser console
  (click real buttons, then read `localStorage` to confirm the state changed).
- For anything numeric — accrual, scoring, splits — build a small synthetic
  bench and check the numbers, rather than eyeballing. The vision rewrite and
  the landmine ladder were both validated this way and both had bugs that only
  a bench would surface.
- Check both layouts (375×812 and 1180×820) and both parent/child modes.
