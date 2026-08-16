/**
 * ChoreQuest photo-check service.
 *
 * The app sends two photos and the parent's checklist; this asks Claude whether
 * the job is actually done and hands back a verdict. It exists purely to hold
 * the API key: anything shipped to the browser is readable by anyone who opens
 * the page, so the key can never live in the app itself.
 *
 * Deploy: see server/README.md — it's two commands.
 */

const MODEL = 'claude-sonnet-5'

/*
 * Judging a chore photo is mostly about NOT being fooled by photography. The
 * local check failed in practice because camera angle and lighting swamped the
 * thing we cared about, so the prompt leans hard on that: judge the room, not
 * the picture of it. Being wrong here has a cost — a child who did the work and
 * gets told they didn't will stop trusting the whole thing.
 */
const SYSTEM = `You judge whether a child has finished a household chore, by comparing their photo against a photo of the same place when the job was done properly.

How to judge:
- Judge the ROOM, not the photograph. Different angle, distance, crop, time of day, lighting, white balance or image quality are NEVER reasons to fail someone.
- The two photos will rarely line up. Work out what you are looking at and compare the state of things, not the pixels.
- Focus on what is actually asked: are surfaces clear, is the thing put away, is it made/wiped/tidied. Ignore permanent fixtures and furniture that differ only in framing.
- Small imperfections pass. A child who has plainly done the work should pass even if it is not immaculate.
- Fail when something specific and visible is still undone, and say exactly what and where.
- If you genuinely cannot tell — the photo is too dark, too blurry, or shows somewhere else entirely — say so rather than guessing.

Tone: speak to the child. Warm, plain, specific, never sarcastic. One or two sentences.

Reply with JSON only, no prose around it.`

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  })

const stripDataUrl = (d) => String(d || '').replace(/^data:image\/\w+;base64,/, '')

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })

    // A GET is the app's "test connection" ping.
    if (request.method === 'GET') {
      return json({ ok: true, service: 'chorequest-photo-check', model: MODEL, keySet: !!env.ANTHROPIC_API_KEY })
    }

    if (request.method !== 'POST') return json({ error: 'Use POST' }, 405)
    if (!env.ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY is not set on the worker' }, 500)

    let payload
    try {
      payload = await request.json()
    } catch {
      return json({ error: 'Body must be JSON' }, 400)
    }

    const { referencePhoto, submittedPhoto, title = 'this chore', checklist = [], mode = 'chore' } = payload
    if (!referencePhoto || !submittedPhoto) return json({ error: 'Two photos are required' }, 400)

    const task = mode === 'defuse'
      ? `The first image is a mess that was reported. The second is the same place after someone says they cleared it up. Decide whether it has genuinely been cleaned.`
      : `The chore is "${title}". The first image shows what DONE looks like. The second is what the child submitted.`

    const checkText = checklist.length
      ? `The parent's checklist:\n${checklist.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\nAnswer each item.`
      : 'There is no checklist — judge whether the job looks done.'

    const body = {
      model: MODEL,
      max_tokens: 900,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: task },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: stripDataUrl(referencePhoto) } },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: stripDataUrl(submittedPhoto) } },
          { type: 'text', text: `${checkText}

Return exactly this JSON shape:
{
  "pass": true | false,
  "outcome": "clean" | "cluttered" | "unsure",
  "headline": "up to six words, for the child",
  "detail": "one or two sentences, addressed to the child, specific about what and where",
  "confidence": 0-100,
  "findings": [{ "what": "the object", "where": "where in the frame" }],
  "checklistResults": [{ "item": "...", "ok": true|false, "why": "short reason" }]
}` },
        ],
      }],
    }

    let res
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      })
    } catch (e) {
      return json({ error: `Could not reach Anthropic: ${e.message}` }, 502)
    }

    if (!res.ok) {
      const text = await res.text()
      return json({ error: `Anthropic returned ${res.status}`, detail: text.slice(0, 400) }, 502)
    }

    const data = await res.json()
    const text = data?.content?.find((c) => c.type === 'text')?.text ?? ''

    // Models occasionally wrap JSON in a sentence; take the outermost object.
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return json({ error: 'Could not parse the model reply', raw: text.slice(0, 400) }, 502)

    let verdict
    try {
      verdict = JSON.parse(match[0])
    } catch {
      return json({ error: 'Model reply was not valid JSON', raw: match[0].slice(0, 400) }, 502)
    }

    return json({
      pass: !!verdict.pass,
      outcome: verdict.outcome || (verdict.pass ? 'clean' : 'cluttered'),
      headline: verdict.headline || (verdict.pass ? 'Looks done' : 'Not quite'),
      detail: verdict.detail || '',
      confidence: typeof verdict.confidence === 'number' ? verdict.confidence : null,
      findings: Array.isArray(verdict.findings) ? verdict.findings : [],
      checklistResults: Array.isArray(verdict.checklistResults) ? verdict.checklistResults : [],
      usage: data.usage ?? null,
    })
  },
}
