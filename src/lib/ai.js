/**
 * The photo check.
 *
 * Two tiers, by design:
 *
 *  1. LOCAL (free, instant, offline) — scene-change detection from lib/vision.js.
 *     It aligns the two photos, then looks for contiguous lumps of new detail:
 *     things left out on surfaces. It cannot tell you a bed is badly made, but
 *     it is good at "there are two objects on the counter that weren't there".
 *
 *  2. REMOTE (a real vision model, on request) — for when the local pass is
 *     unsure, or someone disagrees with it. This is the "Ask for extra help"
 *     path. It reads the parent's checklist and answers it item by item.
 *
 * The remote tier needs a server route holding an API key. There is no key in
 * this bundle and there never should be — anything shipped to the browser is
 * readable by anyone who loads the page. See remoteCheck() below.
 */

import { analysePair, describeRegions, countPhrase } from './vision.js'

/** Set by the app when a server route is configured. */
export const REMOTE_ENDPOINT = '/api/check-photo'

/**
 * Verdict bands, as % of the frame taken up by things that don't match.
 * For reference: a mug on a worktop is roughly 2%, a phone about 0.6%, and
 * camera drift of a few percent leaves under 1% behind.
 */
const BANDS = {
  strict:  { clean: 0.4, messy: 0.9 },   // catches a phone or a sock
  normal:  { clean: 1.0, messy: 2.2 },   // catches a mug or a bowl
  relaxed: { clean: 2.0, messy: 4.5 },   // only obvious piles
}

/**
 * @typedef {object} Verdict
 * @property {boolean} pass
 * @property {'clean'|'cluttered'|'unsure'|'wrong-place'|'identical'} outcome
 * @property {number|null} score      confidence this is tidy, 0-100
 * @property {string} headline
 * @property {string} detail
 * @property {{label:string,value:number}[]} signals
 * @property {Array} findings         the objects it thinks were left out
 * @property {string[]} checklist
 * @property {boolean} canEscalate    worth spending a real model on?
 */

/**
 * Did they actually tidy up? Compares their photo against the parent's
 * "this is what finished looks like" reference.
 */
export async function checkCompletionPhoto({
  referencePhoto, submittedPhoto, title = 'this job', checklist = [], sensitivity = 'normal',
}) {
  if (!referencePhoto) {
    return {
      pass: true, outcome: 'unsure', score: null, skipped: true,
      headline: 'No reference photo on file',
      detail: `There's no "finished" photo saved for ${title}, so this goes straight to a parent to look at.`,
      signals: [], findings: [], checklist, canEscalate: true,
    }
  }

  const a = await analysePair(referencePhoto, submittedPhoto, { sensitivity })
  const band = BANDS[sensitivity] ?? BANDS.normal
  const drift = Math.hypot(a.offset.dx, a.offset.dy)

  const signals = [
    { label: 'Same place', value: a.matchQuality },
    { label: 'Surfaces clear', value: Math.max(0, Math.round(100 - a.changes.areaPct * 14)) },
    { label: 'Lined up', value: Math.max(0, 100 - Math.round(drift * 8)) },
  ]

  // Cheating is submitting the reference file itself, and that's an exact byte
  // match — nothing else. A photo that merely *looks* identical to "finished"
  // is someone who did the job and framed it beautifully, which is the best
  // possible outcome, not a crime. The earlier version accused them of it.
  if (referencePhoto === submittedPhoto) {
    return {
      pass: false, outcome: 'identical', score: 0,
      headline: 'That looks like the example photo',
      detail: 'This is essentially the same image as the reference. Take a fresh photo of the real thing.',
      signals, findings: [], checklist, canEscalate: false,
    }
  }

  // Nothing lines up: a different room, or the lights changed so much that the
  // comparison is meaningless. Either way, say so instead of guessing.
  if (!a.sameScene) {
    const lighting = a.lightingShift > 0.12
    return {
      pass: true, outcome: 'wrong-place', score: null,
      headline: lighting ? "Can't tell — the lighting is completely different" : "Can't tell — this looks like a different spot",
      detail: lighting
        ? 'The two photos are lit so differently that nothing useful can be compared. Try again in similar light, or send it to a parent as is.'
        : "This doesn't line up with the reference photo at all. Try again from roughly where the example was taken.",
      signals, findings: [], checklist, canEscalate: true,
    }
  }

  // Standing well away from where the reference was shot. Beyond about this
  // much drift the leftover misalignment starts looking like clutter, so ask
  // for a better shot rather than accusing anyone of leaving things out.
  if (drift >= 8) {
    return {
      pass: true, outcome: 'unsure', score: null,
      headline: 'Line it up a bit closer',
      detail: 'This was taken from a fair way off the reference angle, which makes it hard to tell what has actually moved. Use the 👻 ghost overlay to match the shot, or send it on and let a parent decide.',
      signals, findings: [], checklist, canEscalate: true,
    }
  }

  const found = a.changes.blobs
  const area = a.changes.areaPct
  const score = Math.max(0, Math.min(100, Math.round(100 - (area / band.messy) * 55)))

  if (area <= band.clean) {
    return {
      pass: true, outcome: 'clean', score,
      headline: 'Nothing left out',
      detail: 'Surfaces match the finished photo — nothing sitting out that shouldn\'t be. Sent to a parent for the final OK.',
      // Below the clean bar, whatever turned up is noise, so don't parade it.
      signals, findings: [], checklist, canEscalate: true,
    }
  }

  if (area >= band.messy) {
    return {
      pass: false, outcome: 'cluttered', score,
      headline: `${countPhrase(found.length)} still out`,
      detail: `There's something on ${describeRegions(found)} that isn't in the finished photo. Put it away and shoot it again from the same spot.`,
      signals, findings: found, checklist, canEscalate: true,
    }
  }

  // In between: something's there, but not obviously a mess.
  return {
    pass: true, outcome: 'unsure', score,
    headline: 'Mostly clear — one for a parent',
    detail: found.length
      ? `Nearly there. There's a little something around ${describeRegions(found, 1)}, so a parent should be the judge.`
      : 'Close to the finished photo. A parent should take the final look.',
    signals, findings: found, checklist, canEscalate: true,
  }
}

/**
 * Landmine defusal runs the same machinery backwards: here the good outcome is
 * that stuff has been REMOVED since the mess photo was taken.
 */
export async function checkDefusePhoto({ messPhoto, defusePhoto, title = 'this mess', sensitivity = 'normal' }) {
  if (!messPhoto) {
    return {
      pass: true, outcome: 'unsure', score: null, skipped: true,
      headline: 'No before photo on file',
      detail: `There's no photo of ${title} to compare against, so a parent will judge this one directly.`,
      signals: [], findings: [], checklist: [], canEscalate: true,
    }
  }

  const a = await analysePair(messPhoto, defusePhoto, { sensitivity })
  const band = BANDS[sensitivity] ?? BANDS.normal

  const signals = [
    { label: 'Same place', value: a.matchQuality },
    { label: 'Scene changed', value: Math.min(100, Math.round(a.changes.areaPct * 16)) },
    { label: 'Lined up', value: Math.max(0, 100 - Math.round(Math.hypot(a.offset.dx, a.offset.dy) * 8)) },
  ]

  if (a.changes.areaPct < 0.3 && a.matchQuality > 96) {
    return {
      pass: false, outcome: 'identical', score: 0,
      headline: 'That is the same mess',
      detail: 'Nothing has changed since the photo that armed this. Bold. Clean it for real and try again.',
      signals, findings: [], checklist: [], canEscalate: false,
    }
  }

  if (!a.sameScene) {
    return {
      pass: true, outcome: 'wrong-place', score: null,
      headline: 'Different spot entirely',
      detail: "This doesn't line up with the crime scene, so it can't be compared. Flagged for a parent to look at.",
      signals, findings: [], checklist: [], canEscalate: true,
    }
  }

  // For a defusal, change IS the good news — the pile that was there is gone.
  if (a.changes.areaPct >= band.messy) {
    return {
      pass: true, outcome: 'clean', score: Math.min(100, Math.round(a.changes.areaPct * 14)),
      headline: 'That got cleared up',
      detail: `Plenty has changed around ${describeRegions(a.changes.blobs)}. Sent to a parent to confirm and release the pot.`,
      signals, findings: a.changes.blobs, checklist: [], canEscalate: false,
    }
  }

  return {
    pass: false, outcome: 'cluttered', score: Math.round(a.changes.areaPct * 14),
    headline: 'Not much has moved',
    detail: 'Barely anything has changed since the mine was armed. Clear it properly, then shoot the same spot again.',
    signals, findings: a.changes.blobs, checklist: [], canEscalate: true,
  }
}

/* ─────────────────────── tier two: the real model ─────────────────────── */

/**
 * "Ask for extra help" — hand both photos and the checklist to a vision model.
 *
 * Requires a server route that holds the API key. Never put a key in this
 * bundle: everything here is downloadable by anyone who opens the app. The
 * route should accept { referencePhoto, submittedPhoto, title, checklist } as
 * data URLs and return the same Verdict shape used above.
 *
 * A reference implementation lives in docs/photo-check-server.md.
 */
export async function askForHelp({ referencePhoto, submittedPhoto, title, checklist = [] }) {
  let res
  try {
    res = await fetch(REMOTE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referencePhoto, submittedPhoto, title, checklist }),
    })
  } catch {
    return {
      unavailable: true,
      headline: 'Extra help isn’t set up yet',
      detail: 'This asks a real vision model to read the photo against your checklist. It needs a small server holding an API key — see docs/photo-check-server.md.',
    }
  }

  if (res.status === 404) {
    return {
      unavailable: true,
      headline: 'Extra help isn’t set up yet',
      detail: 'No checking service is connected to this app yet. Until one is, a parent makes the call.',
    }
  }
  if (!res.ok) {
    return { unavailable: true, headline: 'Extra help failed', detail: `The checking service returned ${res.status}.` }
  }

  const data = await res.json()
  return { ...data, remote: true }
}
