/**
 * AI "did they actually finish it?" photo check.
 *
 * ── How this works today (local, offline, no API key) ────────────────────────
 * We compare the kid's proof photo against the parent-set "this is what "done"
 * looks like" reference photo using classic computer-vision heuristics that run
 * entirely in the browser on a <canvas>:
 *
 *   1. Structural similarity  — both images are downscaled to a 16x16 luminance
 *      grid, contrast-normalized, and compared cell by cell. Catches "the bed is
 *      made / the counter is clear" style layout matches.
 *   2. Gradient (dHash) match — direction of brightness change between adjacent
 *      cells. Robust to lighting, exposure and white balance differences, which
 *      matters a lot when a kid shoots at night and the reference was shot at noon.
 *   3. Color histogram    — 4x4x4 RGB bins, histogram intersection. Catches
 *      "there is still a giant red laundry pile in frame."
 *   4. Region breakdown   — the frame is split 3x3 so we can tell the kid *where*
 *      it doesn't match ("bottom-left still doesn't match the reference").
 *
 * It is deliberately forgiving on lighting/angle and strict on large blobs of
 * stuff that shouldn't be there. It also refuses to pass a photo that is
 * essentially identical to the reference (a kid photographing the reference
 * photo off another screen) — see the `spoof` check.
 *
 * ── Swapping in real Claude vision ───────────────────────────────────────────
 * Everything in the app calls exactly one function: `checkCompletionPhoto()`.
 * To go from heuristics to a real multimodal model, implement `remoteCheck()`
 * below and flip AI_BACKEND to 'claude'. The return shape must stay the same.
 * Do NOT ship an Anthropic API key in the browser bundle — proxy it through a
 * tiny server route (see README) so the key stays server-side.
 */

export const AI_BACKEND = 'local-cv' // 'local-cv' | 'claude'

export const PASS_THRESHOLD = 68

const GRID = 16
const REGION = 3

/* ─────────────────────────── image plumbing ─────────────────────────── */

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read that image'))
    img.src = src
  })
}

/** Downscale to GRID x GRID and pull luminance + rgb out. */
async function fingerprint(src) {
  const img = await loadImage(src)
  const c = document.createElement('canvas')
  c.width = GRID
  c.height = GRID
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, GRID, GRID)
  const { data } = ctx.getImageData(0, 0, GRID, GRID)

  const gray = new Float32Array(GRID * GRID)
  const rgb = []
  for (let i = 0; i < GRID * GRID; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]
    gray[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    rgb.push([r, g, b])
  }
  return { gray, rgb, w: img.naturalWidth, h: img.naturalHeight }
}

/** Contrast-normalize so a dark bedroom photo can still match a bright one. */
function normalize(gray) {
  let min = 1, max = 0
  for (const v of gray) { if (v < min) min = v; if (v > max) max = v }
  const span = Math.max(0.08, max - min)
  const out = new Float32Array(gray.length)
  for (let i = 0; i < gray.length; i++) out[i] = (gray[i] - min) / span
  return out
}

/* ─────────────────────────── the three signals ─────────────────────────── */

function structuralScore(a, b) {
  const na = normalize(a), nb = normalize(b)
  let sum = 0
  for (let i = 0; i < na.length; i++) sum += Math.abs(na[i] - nb[i])
  return 1 - sum / na.length
}

function gradientScore(a, b) {
  const na = normalize(a), nb = normalize(b)
  let same = 0, total = 0
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID - 1; x++) {
      const i = y * GRID + x
      if ((na[i] < na[i + 1]) === (nb[i] < nb[i + 1])) same++
      total++
    }
  }
  return same / total
}

function colorScore(rgbA, rgbB) {
  const bins = 4
  const histA = new Float32Array(bins ** 3)
  const histB = new Float32Array(bins ** 3)
  const idx = ([r, g, b]) =>
    Math.min(bins - 1, (r / 256) * bins | 0) * bins * bins +
    Math.min(bins - 1, (g / 256) * bins | 0) * bins +
    Math.min(bins - 1, (b / 256) * bins | 0)
  for (const px of rgbA) histA[idx(px)]++
  for (const px of rgbB) histB[idx(px)]++
  let inter = 0
  const n = rgbA.length
  for (let i = 0; i < histA.length; i++) inter += Math.min(histA[i], histB[i])
  return inter / n
}

const REGION_NAMES = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
]

function regionScores(a, b) {
  const na = normalize(a), nb = normalize(b)
  const step = GRID / REGION
  const out = []
  for (let ry = 0; ry < REGION; ry++) {
    for (let rx = 0; rx < REGION; rx++) {
      let sum = 0, count = 0
      for (let y = Math.floor(ry * step); y < Math.floor((ry + 1) * step); y++) {
        for (let x = Math.floor(rx * step); x < Math.floor((rx + 1) * step); x++) {
          sum += Math.abs(na[y * GRID + x] - nb[y * GRID + x])
          count++
        }
      }
      out.push({
        name: REGION_NAMES[ry * REGION + rx],
        score: Math.round((1 - sum / count) * 100),
      })
    }
  }
  return out
}

/* ─────────────────────────── public API ─────────────────────────── */

/**
 * @param {object} opts
 * @param {string} opts.referencePhoto  data URL of the parent's "finished" standard
 * @param {string} opts.submittedPhoto  data URL of the kid's proof photo
 * @param {string} [opts.title]         task name, for message copy
 * @param {string[]} [opts.checklist]   parent's must-haves, surfaced to the reviewer
 * @returns {Promise<AiVerdict>}
 *
 * @typedef {object} AiVerdict
 * @property {boolean} pass
 * @property {number} score            0-100 confidence this matches the standard
 * @property {string} headline         one-liner for the kid
 * @property {string} detail           what to fix, or what looked good
 * @property {{name:string,score:number}[]} regions
 * @property {{label:string,value:number}[]} signals
 * @property {string[]} checklist      passed through for the parent's review card
 * @property {string} backend
 */
export async function checkCompletionPhoto(opts) {
  if (AI_BACKEND === 'claude') return remoteCheck(opts)
  return localCheck(opts)
}

async function localCheck({ referencePhoto, submittedPhoto, title = 'this job', checklist = [] }) {
  // No reference photo on file — we can't grade it, so route straight to a human.
  if (!referencePhoto) {
    return {
      pass: true,
      score: null,
      headline: 'No reference photo on file',
      detail: `There's no "finished" standard saved for ${title}, so this one goes straight to a parent to look at.`,
      regions: [],
      signals: [],
      checklist,
      backend: AI_BACKEND,
      skipped: true,
    }
  }

  const [ref, sub] = await Promise.all([fingerprint(referencePhoto), fingerprint(submittedPhoto)])

  const structural = structuralScore(ref.gray, sub.gray)
  const gradient = gradientScore(ref.gray, sub.gray)
  const color = colorScore(ref.rgb, sub.rgb)
  const regions = regionScores(ref.gray, sub.gray)

  // Weighted blend, then a gentle curve so mid-range scores spread out and read
  // as a believable percentage rather than clustering at 80-something.
  const raw = 0.45 * structural + 0.35 * gradient + 0.20 * color
  const score = Math.max(0, Math.min(100, Math.round((raw - 0.35) / 0.6 * 100)))

  // Anti-spoof: a pixel-perfect match means they photographed the reference
  // itself (or re-uploaded it), not the actual room.
  const spoof = structural > 0.985 && gradient > 0.99 && color > 0.985

  const worst = [...regions].sort((a, b) => a.score - b.score)[0]
  const weak = regions.filter((r) => r.score < 55).map((r) => r.name)

  const signals = [
    { label: 'Layout match', value: Math.round(structural * 100) },
    { label: 'Shape & edges', value: Math.round(gradient * 100) },
    { label: 'Color match', value: Math.round(color * 100) },
  ]

  if (spoof) {
    return {
      pass: false,
      score,
      headline: 'That looks like the example photo',
      detail: 'This is a pixel-for-pixel match with the reference image. Take a fresh photo of the real thing.',
      regions, signals, checklist, backend: AI_BACKEND, spoof: true,
    }
  }

  const pass = score >= PASS_THRESHOLD

  const headline = pass
    ? score >= 90 ? 'Spotless. Nailed it.' : score >= 78 ? 'Looks done!' : 'Close enough — passing it on'
    : score >= 50 ? 'Almost there' : 'Not done yet'

  const detail = pass
    ? weak.length
      ? `Matches the standard. The ${weak.join(' and ')} is a little different, but a parent will make the call.`
      : 'This matches the finished photo across the whole frame. Sent to a parent for the final OK.'
    : weak.length
      ? `The ${weak.slice(0, 2).join(' and ')} ${weak.length > 1 ? 'areas don\'t' : 'area doesn\'t'} match the finished photo yet. Take another look, then re-shoot from the same spot.`
      : `Overall this doesn't match the finished photo closely enough — the ${worst.name} is the biggest difference. Try shooting from the same angle as the example.`

  return { pass, score, headline, detail, regions, signals, checklist, backend: AI_BACKEND }
}

/**
 * Real multimodal check. Wire this to a server route that holds the API key.
 * Kept here so the swap is a one-line change to AI_BACKEND above.
 */
async function remoteCheck({ referencePhoto, submittedPhoto, title, checklist }) {
  const res = await fetch('/api/check-photo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ referencePhoto, submittedPhoto, title, checklist }),
  })
  if (!res.ok) throw new Error(`Photo check failed (${res.status})`)
  return res.json()
}
