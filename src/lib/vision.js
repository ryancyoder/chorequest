/**
 * Scene-change detection: what got left out, and what got cleared away.
 *
 * The first version of this compared two photos for overall similarity, which
 * answers the wrong question. Similarity is dominated by camera position and
 * lighting, so a messy room shot from the reference angle beat a tidy room shot
 * two feet to the left, and a sock covering 2% of the frame moved the number by
 * about 2% — invisible.
 *
 * This asks the question we actually care about: **is there stuff in the new
 * photo that wasn't there before, and where is it?**
 *
 * The pipeline:
 *
 *  1. Center-crop both to a square and scale to 96x96, so differing aspect
 *     ratios don't register as change.
 *  2. High-pass filter (subtract a local mean). This throws away brightness and
 *     keeps edges and texture — an object leaves edges behind, a lamp being on
 *     does not.
 *  3. Search translations to find the offset where the two agree best. This is
 *     what makes alignment forgiving: shoot from a foot to the left and the
 *     search simply finds it, instead of scoring you down for it.
 *  4. Subtract aligned detail maps to get what was ADDED and what was REMOVED.
 *  5. Cluster the leftovers into connected blobs and throw away specks. Blobs
 *     are the whole point — a real object is a contiguous lump of new detail,
 *     while noise and lighting are diffuse. Averaging, which is what the old
 *     version did, destroys exactly this signal.
 *
 * Everything runs on a canvas, on the device, in a few milliseconds.
 */

const SIZE = 96          // working resolution
const SEARCH = 12        // translation search radius, px (±12.5% of frame)
const WINDOW = 7         // local-mean window for the high-pass
const MIN_BLOB = 12      // px at 96x96 — anything smaller is noise, not an object

export const REGION_NAMES = [
  'top-left', 'top-centre', 'top-right',
  'middle-left', 'centre', 'middle-right',
  'bottom-left', 'bottom-centre', 'bottom-right',
]

/* ─────────────────────────── loading ─────────────────────────── */

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read that image'))
    img.src = src
  })
}

/** Shared pixel maths for both a still photo and a live video frame. */
function gridFromPixels(data) {
  const n = SIZE * SIZE
  const lum = new Float32Array(n)
  const rg = new Float32Array(n)
  const by = new Float32Array(n)

  let sum = 0
  for (let i = 0; i < n; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]
    const v = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    lum[i] = v
    sum += v
    const t = r + g + b + 1
    rg[i] = (r - g) / t
    by[i] = (b - (r + g) / 2) / t
  }

  const mean = sum / n
  let varSum = 0
  for (let i = 0; i < n; i++) varSum += (lum[i] - mean) ** 2
  const std = Math.sqrt(varSum / n) || 1e-3
  const z = new Float32Array(n)
  for (let i = 0; i < n; i++) z[i] = (lum[i] - mean) / std

  let mrg = 0, mby = 0
  for (let i = 0; i < n; i++) { mrg += rg[i]; mby += by[i] }
  mrg /= n; mby /= n
  for (let i = 0; i < n; i++) { rg[i] -= mrg; by[i] -= mby }

  const detail = detailMap(lum)
  let dMean = 0
  for (let i = 0; i < n; i++) dMean += detail[i]
  dMean = dMean / n || 1e-4
  for (let i = 0; i < n; i++) detail[i] /= dMean

  return { z: boxBlur(z, 1), rg: boxBlur(rg, 1), by: boxBlur(by, 1), detail, brightness: mean }
}

let scratch = null
/** Centre-crop whatever is handed in to a square and reduce it to SIZE x SIZE. */
function gridFromDrawable(src, w, h) {
  if (!scratch) {
    scratch = document.createElement('canvas')
    scratch.width = SIZE
    scratch.height = SIZE
  }
  const side = Math.min(w, h)
  const ctx = scratch.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(src, (w - side) / 2, (h - side) / 2, side, side, 0, 0, SIZE, SIZE)
  return gridFromPixels(ctx.getImageData(0, 0, SIZE, SIZE).data)
}

/**
 * Centre-crop to a square, then scale — so a 4:3 and a 16:9 shot still line up.
 *
 * Three channels come out, because no single one can see everything:
 *
 *  lum   — brightness, globally normalised so a dim room and a bright one are
 *          comparable, while a pale object on a dark counter still stands out.
 *  rg/by — colour opponency (red-vs-green, blue-vs-yellow) as a fraction of
 *          total intensity. Chromaticity barely moves when the lights change,
 *          but a red mug on a brown worktop is an enormous shift. This is what
 *          catches a flat object sitting on a flat surface, which brightness
 *          and texture both miss.
 */
async function toGrid(src) {
  const img = await loadImage(src)
  return gridFromDrawable(img, img.naturalWidth, img.naturalHeight)
}

/* ─────────────────────────── filtering ─────────────────────────── */

/** Separable box blur via prefix sums — the local mean, cheaply. */
function boxBlur(src, radius) {
  const tmp = new Float32Array(SIZE * SIZE)
  const out = new Float32Array(SIZE * SIZE)

  for (let y = 0; y < SIZE; y++) {
    let acc = 0
    for (let x = -radius; x <= radius; x++) acc += src[y * SIZE + Math.min(SIZE - 1, Math.max(0, x))]
    for (let x = 0; x < SIZE; x++) {
      tmp[y * SIZE + x] = acc / (radius * 2 + 1)
      const out_ = Math.min(SIZE - 1, Math.max(0, x - radius))
      const in_ = Math.min(SIZE - 1, Math.max(0, x + radius + 1))
      acc += src[y * SIZE + in_] - src[y * SIZE + out_]
    }
  }
  for (let x = 0; x < SIZE; x++) {
    let acc = 0
    for (let y = -radius; y <= radius; y++) acc += tmp[Math.min(SIZE - 1, Math.max(0, y)) * SIZE + x]
    for (let y = 0; y < SIZE; y++) {
      out[y * SIZE + x] = acc / (radius * 2 + 1)
      const out_ = Math.min(SIZE - 1, Math.max(0, y - radius))
      const in_ = Math.min(SIZE - 1, Math.max(0, y + radius + 1))
      acc += tmp[in_ * SIZE + x] - tmp[out_ * SIZE + x]
    }
  }
  return out
}

/**
 * Local contrast magnitude. Brightness is subtracted away, so what survives is
 * structure: edges, texture, the outline of a thing sitting on a counter.
 */
function detailMap(gray) {
  const mean = boxBlur(gray, (WINDOW - 1) / 2)
  const out = new Float32Array(SIZE * SIZE)
  for (let i = 0; i < out.length; i++) out[i] = Math.abs(gray[i] - mean[i])
  return out
}

/* ─────────────────────────── change signal ─────────────────────────── */

/**
 * How different are these two pixels, really?
 *
 * Brightness alone misses a mug the same tone as the worktop. Texture alone
 * misses anything flat, and actually goes *down* where an object covers a
 * patterned surface — which is how the first version of this managed to score
 * a cluttered counter as unchanged. Colour catches both of those.
 */
function pixelChange(A, B, i, j) {
  const dz = Math.abs(A.z[i] - B.z[j])
  const dc = Math.abs(A.rg[i] - B.rg[j]) + Math.abs(A.by[i] - B.by[j])
  const dd = Math.abs(A.detail[i] - B.detail[j])
  // Detail is normalised to a mean of 1, so its weight is ~20x smaller than it
  // would be against the raw map. Too much here and hairline alignment residue
  // starts registering as objects; too little and the alignment search loses
  // the edges it needs to lock onto.
  return 0.30 * dz + 3.6 * dc + 0.045 * dd
}

/* ─────────────────────────── alignment ─────────────────────────── */

/**
 * Find the translation where the two scenes agree best.
 * This is the forgiveness: a photo taken from a foot to the left is shifted,
 * not different, and a shift is something we can simply undo.
 */
function findOffset(A, B) {
  let best = { dx: 0, dy: 0, cost: Infinity }

  for (let dy = -SEARCH; dy <= SEARCH; dy++) {
    for (let dx = -SEARCH; dx <= SEARCH; dx++) {
      let cost = 0, n = 0
      // Every other pixel — plenty for picking an offset, four times faster.
      for (let y = SEARCH; y < SIZE - SEARCH; y += 2) {
        for (let x = SEARCH; x < SIZE - SEARCH; x += 2) {
          cost += pixelChange(A, B, y * SIZE + x, (y + dy) * SIZE + (x + dx))
          n++
        }
      }
      cost /= n
      if (cost < best.cost) best = { dx, dy, cost }
    }
  }
  return best
}

/* ─────────────────────────── blobs ─────────────────────────── */

/**
 * Morphological opening — erode, then dilate.
 *
 * Imperfect alignment leaves hairline residue along every edge in the picture,
 * and a long enough hairline beats a minimum-area filter. Eroding deletes
 * anything one or two pixels thick outright; dilating puts the surviving lumps
 * back to their proper size. Objects are thick, artefacts are thin, and this
 * separates them far more cleanly than any threshold.
 */
function open(mask) {
  const eroded = new Uint8Array(mask.length)
  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      const i = y * SIZE + x
      if (mask[i] && mask[i - 1] && mask[i + 1] && mask[i - SIZE] && mask[i + SIZE]) eroded[i] = 1
    }
  }
  const out = new Uint8Array(mask.length)
  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      const i = y * SIZE + x
      if (eroded[i] || eroded[i - 1] || eroded[i + 1] || eroded[i - SIZE] || eroded[i + SIZE]) out[i] = 1
    }
  }
  return out
}

/** Flood-fill the mask into connected lumps; specks are dropped. */
function findBlobs(mask, minArea = MIN_BLOB) {
  const seen = new Uint8Array(SIZE * SIZE)
  const blobs = []

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue

    const stack = [start]
    seen[start] = 1
    let area = 0, sx = 0, sy = 0
    let minX = SIZE, maxX = 0, minY = SIZE, maxY = 0

    while (stack.length) {
      const i = stack.pop()
      const x = i % SIZE, y = (i / SIZE) | 0
      area++; sx += x; sy += y
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y

      // 4-connectivity is enough and keeps separate objects separate.
      if (x > 0        && mask[i - 1]    && !seen[i - 1])    { seen[i - 1] = 1;    stack.push(i - 1) }
      if (x < SIZE - 1 && mask[i + 1]    && !seen[i + 1])    { seen[i + 1] = 1;    stack.push(i + 1) }
      if (y > 0        && mask[i - SIZE] && !seen[i - SIZE]) { seen[i - SIZE] = 1; stack.push(i - SIZE) }
      if (y < SIZE - 1 && mask[i + SIZE] && !seen[i + SIZE]) { seen[i + SIZE] = 1; stack.push(i + SIZE) }
    }

    if (area < minArea) continue

    // Shape filter. A thing on a worktop is a solid, roughly compact lump.
    // Residue left by imperfect alignment hugs edges: long, thin, and hollow.
    const bw = maxX - minX + 1
    const bh = maxY - minY + 1
    const fill = area / (bw * bh)
    if (Math.min(bw, bh) < 3 || fill < 0.35) continue

    const cx = sx / area, cy = sy / area
    blobs.push({
      areaPct: (area / (SIZE * SIZE)) * 100,
      cx: cx / SIZE, cy: cy / SIZE,
      w: bw / SIZE, h: bh / SIZE,
      region: REGION_NAMES[Math.min(2, (cy / SIZE * 3) | 0) * 3 + Math.min(2, (cx / SIZE * 3) | 0)],
    })
  }

  return blobs.sort((a, b) => b.areaPct - a.areaPct)
}

/* ─────────────────────────── the analysis ─────────────────────────── */

/**
 * Compare two photos of the same place.
 * @returns {Promise<{
 *   offset:{dx:number,dy:number}, aligned:boolean, matchQuality:number,
 *   added:{areaPct:number, blobs:Array}, removed:{areaPct:number, blobs:Array},
 *   lightingShift:number
 * }>}
 */
export async function analysePair(beforeSrc, afterSrc, { sensitivity = 'normal' } = {}) {
  const [A, B] = await Promise.all([toGrid(beforeSrc), toGrid(afterSrc)])

  const off = findOffset(A, B)

  // Sensitivity moves the bar for "that's a thing" vs "that's noise".
  const TOL = { strict: 0.085, normal: 0.115, relaxed: 0.16 }[sensitivity] ?? 0.115

  const changed = new Uint8Array(SIZE * SIZE)
  let changedCount = 0, considered = 0

  for (let y = SEARCH; y < SIZE - SEARCH; y++) {
    for (let x = SEARCH; x < SIZE - SEARCH; x++) {
      const i = y * SIZE + x
      const j = (y + off.dy) * SIZE + (x + off.dx)
      considered++
      if (pixelChange(A, B, i, j) > TOL) { changed[i] = 1; changedCount++ }
    }
  }

  const changedPct = (changedCount / considered) * 100

  // Almost the entire frame moved: this isn't the same place, so there's
  // nothing meaningful to say about tidiness.
  const sameScene = changedPct < 42

  /*
   * Deliberately NOT split into "added" and "removed".
   *
   * An earlier version guessed direction from brightness and texture — darker
   * or busier meant an object had appeared. That's simply not sound: a white
   * mug on a dark worktop is brighter than what it covers, and a flat object
   * has less texture than the patterned surface underneath it. A grey box on a
   * brown counter was being filed as "removed" and vanished from the results.
   *
   * What can be known reliably is WHERE the two photos differ. For a chore,
   * that's "something here doesn't match the finished photo"; for a defusal,
   * it's "something here genuinely changed". Both are answerable. Which
   * direction it went is not, so it isn't claimed.
   */
  const blobs = findBlobs(open(changed))

  return {
    offset: { dx: off.dx, dy: off.dy },
    aligned: sameScene,
    sameScene,
    changedPct,
    matchQuality: Math.max(0, Math.min(100, Math.round(100 - changedPct * 1.9))),
    changes: { areaPct: blobs.reduce((n, b) => n + b.areaPct, 0), blobs },
    lightingShift: Math.abs(A.brightness - B.brightness),
  }
}

/* ─────────────────────── live alignment (auto-snap) ─────────────────────── */

/** Cheap offset search around a hint — for tracking a moving viewfinder. */
function findOffsetNear(A, B, radius, hint) {
  let best = { dx: hint.dx, dy: hint.dy, cost: Infinity }
  const lo = (v) => Math.max(-SEARCH, v - radius)
  const hi = (v) => Math.min(SEARCH, v + radius)

  for (let dy = lo(hint.dy); dy <= hi(hint.dy); dy++) {
    for (let dx = lo(hint.dx); dx <= hi(hint.dx); dx++) {
      let cost = 0, n = 0
      // Coarser sampling than the full analysis — this runs many times a second
      // and only needs to know which way to nudge, not to grade the room.
      for (let y = SEARCH; y < SIZE - SEARCH; y += 3) {
        for (let x = SEARCH; x < SIZE - SEARCH; x += 3) {
          cost += pixelChange(A, B, y * SIZE + x, (y + dy) * SIZE + (x + dx))
          n++
        }
      }
      cost /= n
      if (cost < best.cost) best = { dx, dy, cost }
    }
  }
  return best
}

/**
 * Live viewfinder alignment, the way the iOS document scanner works: watch the
 * camera, tell the user how close they are, and fire the shutter for them once
 * they've held it steady.
 *
 * Direction convention, verified against known shifts: a positive dx means the
 * scene sits further right in the viewfinder than in the reference, so the phone
 * needs to move right to bring it back.
 *
 * @param {string} referenceSrc data URL of the shot to match
 */
export async function createAligner(referenceSrc) {
  const ref = await toGrid(referenceSrc)
  let hint = { dx: 0, dy: 0 }
  let firstPass = true

  return {
    /**
     * @returns {{distance:number, quality:number, locked:boolean,
     *            nudge:{x:'left'|'right'|null, y:'up'|'down'|null}}}
     */
    track(video) {
      if (!video || !video.videoWidth) return null
      const frame = gridFromDrawable(video, video.videoWidth, video.videoHeight)

      // Track-then-redetect. Normally it searches a small window around where
      // the shot was last frame, which is fast and steady. But a local search
      // can't follow a fast pan — it pins itself to the edge of its window and
      // stays there, so auto-snap would quietly stop working until the camera
      // was closed. Losing confidence triggers a full re-scan on the next look.
      const off = firstPass
        ? findOffset(ref, frame)
        : findOffsetNear(ref, frame, 5, hint)

      const distance = Math.hypot(off.dx, off.dy)
      // Cost rises with genuine scene differences too, so this is "does this
      // look like the same place", not merely "is it lined up".
      const quality = Math.max(0, Math.min(100, Math.round((1 - off.cost / 0.28) * 100)))

      // Poor match, or pinned to the edge of the search window: start over.
      const pinned = Math.abs(Math.abs(off.dx) - Math.abs(hint.dx)) >= 5 ||
                     Math.abs(Math.abs(off.dy) - Math.abs(hint.dy)) >= 5
      firstPass = quality < 35 || pinned
      hint = { dx: off.dx, dy: off.dy }

      return {
        distance,
        quality,
        offset: { dx: off.dx, dy: off.dy },
        locked: distance <= 2 && quality >= 45,
        nudge: {
          x: off.dx > 2 ? 'right' : off.dx < -2 ? 'left' : null,
          y: off.dy > 2 ? 'down' : off.dy < -2 ? 'up' : null,
        },
      }
    },
  }
}

/** "the bottom-left and the centre" */
export function describeRegions(blobs, limit = 2) {
  const seen = []
  for (const b of blobs) {
    if (!seen.includes(b.region)) seen.push(b.region)
    if (seen.length >= limit) break
  }
  if (!seen.length) return ''
  if (seen.length === 1) return `the ${seen[0]}`
  return `the ${seen.slice(0, -1).join(', ')} and the ${seen[seen.length - 1]}`
}

export function countPhrase(n) {
  if (n === 1) return 'one thing'
  if (n === 2) return 'two things'
  if (n === 3) return 'three things'
  return `${n} things`
}
