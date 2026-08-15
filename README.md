# 🧹 ChoreQuest

A gamified chore + schedule app for a seven-person household. Runs in any browser,
looks and behaves like a native app on a phone, and stores everything on the device.

```bash
npm install
npm run dev
```

Then open the URL it prints. On a phone, use the `Network:` address on the same Wi-Fi —
or add it to the home screen for a full-screen, app-like experience.

---

## What's in it

**Seven members, seven profiles.** Two parents and five kids out of the box, each with
their own avatar, color, level, XP curve, coin balance, streak and badge case. The whole
UI re-themes to whoever is holding the phone. Everything about the family is editable in
Manage → Family.

**Today.** Each person's hero card (level, rank, XP bar, streak multiplier, coins),
their schedule for the day, and their routine chores grouped into morning / afternoon /
evening. Chores that need photo proof open the camera flow; the rest are a one-tap "Done".

**Schedule.** A week strip you can page forward and back, an "Everyone" view that shows
all seven people's day side by side, and a per-member timeline that merges their events
(school, practice, lessons, work) with their chores. Parents add and edit events inline.

**Job Board.** Add-on jobs beyond the routine list, posted by parents, claimed by kids
first-come-first-served. Quick add is three steps: **snap** a photo of what needs doing
(and optionally a photo of what "finished" should look like), **say** what you want in
plain speech, then set the reward. Dictation parses the sentence — *"Sweep the garage,
worth 60 points, due Saturday, it's urgent"* fills in the title, points, due date and
urgency flag on its own.

**Rewards.** Long-term individual prizes (each with a savings bar showing how close that
kid is) and shared family goals that every approved point in the house pushes forward.
Parents set both.

**Review.** The parent approval queue — reference photo and the kid's photo side by side,
the AI's score and signal breakdown, the parent's own checklist, an optional bonus, and
approve / send-back-with-a-note. Approval is what actually pays out XP, coins, streak,
badges and family-goal progress, with a confetti moment on the kid's screen.

## How the photo check works

1. A parent photographs the chore **done right**, from the angle they want kids to shoot.
   That's the standard, saved per chore (Manage → Chores → *Require a proof photo*) or per
   job (step 1 of quick add).
2. The kid finishes, taps 📸, and shoots their own photo.
3. The photo is compared against the standard. **Fail → it never reaches a parent** — the
   kid gets a specific reason ("the bottom-left doesn't match yet") and re-shoots.
   **Pass → it lands in the parent's review queue**, scored, for the final human call.
4. Parent approves → points, coins, streak, badges, family goal, confetti.

The comparison today runs **on-device**, no API key and no network: contrast-normalized
structural similarity on a 16×16 luminance grid, a gradient/dHash pass that shrugs off
lighting differences, an RGB histogram intersection that catches "there's still a pile of
stuff in frame", and a 3×3 region breakdown so the feedback can name *where* it's off.
It also refuses a pixel-perfect match — a kid photographing the example photo itself.

Try it before you trust it: **Manage → AI check** lets you shoot two photos and see the
exact verdict, score and region map the kids would get. Chores with no standard photo set
skip scoring entirely and go straight to the parent, clearly labeled.

### Swapping in real Claude vision

Everything calls one function — `checkCompletionPhoto()` in [src/lib/ai.js](src/lib/ai.js).
Set `AI_BACKEND = 'claude'` and implement the `remoteCheck()` stub already there. It should
POST both images to a small server route that holds your Anthropic API key and returns the
same shape (`{ pass, score, headline, detail, signals, regions }`). Never put the API key
in the browser bundle — it ships to every device that loads the page.

## Where the data lives

| What | Where |
|---|---|
| Family, chores, schedule, jobs, prizes, submissions | `localStorage` |
| Every photo (reference standards + proof shots) | `IndexedDB` |

Nothing is uploaded anywhere. Photos are downscaled to 720px JPEG on capture, which is why
they go in IndexedDB rather than blowing the 5MB localStorage quota. Clearing browser data
clears the family; **Manage → Settings → Reset** does it deliberately.

Because storage is per-device, each phone currently keeps its own copy — this is a
single-device app until you add a backend. Everything is structured for that: state is one
serializable object, and photos are already referenced by id rather than inlined.

## Notes

- **Parent PIN** starts at `1234` for both parents — change it in Manage → Family. It gates
  approvals and all editing. Turn the requirement off in Manage → Settings.
- **Voice input** uses the browser's speech API (Chrome, Edge, Safari). Typing always works.
- **Live camera** needs `https` or `localhost`; elsewhere it falls back to the native camera
  picker, which is what phones hand you anyway.
- Streaks multiply points: 3 days → 1.25×, 7 days → 1.5×, 14 days → 2×.

## Layout

```
src/
  lib/        ai.js (photo check) · camera.js · dictation.js · photos.js · gamify.js · date.js
  store/      AppContext.jsx (all actions) · selectors.js · seed.js · storage.js
  components/ ProofSheet.jsx (the kid flow) · CameraCapture · DictationField · ui.jsx
  screens/    Today · Schedule · Jobs · Rewards · Family · Review · Manage
```
