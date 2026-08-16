# "Ask for extra help" — wiring up a real vision model

The app checks photos on the device for free. That check is good at one specific
thing — spotting objects left out on surfaces — and blind to everything else. It
cannot tell you whether a bed is *well* made, whether the right things went in
the right drawers, or whether your checklist was actually satisfied.

The **Ask for extra help** button on the result screen is for those calls. It
POSTs both photos and the parent's checklist to a server route, which asks a
real vision model and returns a verdict.

## Why it needs a server at all

The API key must never be in the app. Everything the browser downloads is
readable by anyone who opens the page — including your kids, and including
anyone you share the link with. A key in the bundle is a key on the internet.

So the flow is: **app → your tiny server (holds the key) → Anthropic → back**.

## The contract

`POST /api/check-photo`

```json
{
  "referencePhoto": "data:image/jpeg;base64,...",
  "submittedPhoto": "data:image/jpeg;base64,...",
  "title": "Make your bed",
  "checklist": ["Pillows at the head", "Blanket pulled flat", "Nothing on the floor"]
}
```

Respond with the same shape the local check returns:

```json
{
  "pass": false,
  "outcome": "cluttered",
  "headline": "Two of the three aren't done",
  "detail": "Pillows are at the head and the blanket is flat, but there's a towel and a pair of jeans on the floor by the bed.",
  "findings": [{ "region": "bottom-left", "areaPct": 6 }],
  "checklistResults": [
    { "item": "Pillows at the head", "ok": true },
    { "item": "Blanket pulled flat", "ok": true },
    { "item": "Nothing on the floor", "ok": false, "why": "A towel and jeans are on the floor" }
  ]
}
```

## A Cloudflare Worker that does it

Deploy free at [workers.cloudflare.com](https://workers.cloudflare.com), then set
the key with `wrangler secret put ANTHROPIC_API_KEY`.

```js
export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return new Response('Not found', { status: 404 })

    const { referencePhoto, submittedPhoto, title, checklist = [] } = await request.json()
    const strip = (d) => d.replace(/^data:image\/\w+;base64,/, '')

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 700,
        system:
          'You judge whether a child has completed a household chore, by comparing their photo ' +
          'against the parent\'s photo of the finished job. Be fair and specific. Reward genuine ' +
          'effort; do not fail someone over camera angle, lighting, or a slightly different crop. ' +
          'Judge the room, not the photography. Reply with JSON only.',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: `The chore is "${title}". The first image is what DONE should look like. The second is what the child submitted.` },
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: strip(referencePhoto) } },
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: strip(submittedPhoto) } },
            { type: 'text', text:
              `Check each item: ${JSON.stringify(checklist)}\n\n` +
              'Return JSON: {"pass":bool,"outcome":"clean"|"cluttered"|"unsure",' +
              '"headline":string (max 6 words),"detail":string (one or two sentences, addressed to the child),' +
              '"checklistResults":[{"item":string,"ok":bool,"why":string}]}' },
          ],
        }],
      }),
    })

    const data = await res.json()
    const text = data?.content?.[0]?.text ?? '{}'
    const verdict = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}')

    return new Response(JSON.stringify({ ...verdict, findings: verdict.findings ?? [] }), {
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
    })
  },
}
```

Then point the app at it — set `REMOTE_ENDPOINT` in `src/lib/ai.js` to the
Worker's URL.

## What it costs

Two photos at 720px plus the prompt is roughly 2,000 input tokens and a few
hundred out. At Sonnet pricing that's well under a cent per check. Because it
only fires when someone taps the button, a busy family week is pennies — the
free local pass handles the ordinary cases.

## Until it's connected

The button explains that extra help isn't set up and the parent makes the call.
Nothing breaks; the local check and the review queue work exactly as before.
