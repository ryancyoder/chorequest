# The photo-check service

A ~150-line Cloudflare Worker that sits between the app and Anthropic. Its only
real job is to hold the API key, because anything shipped to the browser is
readable by anyone who opens the page.

Free tier covers this comfortably — 100,000 requests a day, and a busy family
week is a few dozen.

## Deploy it

You need an [Anthropic API key](https://console.anthropic.com/settings/keys) and
a free [Cloudflare account](https://dash.cloudflare.com/sign-up).

```bash
cd server
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY   # paste your key when prompted
npx wrangler deploy
```

The last command prints a URL like:

```
https://chorequest-photo-check.<your-subdomain>.workers.dev
```

## Connect it

In the app: **Manage → 🤖 AI check → Photo checking service**. Paste that URL,
press **Test**. It should come back "Connected". That's it — the setting is
saved on the device, so no rebuild and no redeploy of the app itself.

Once connected, every photo check goes to Claude. If the service is ever
unreachable — no signal, worker down — the app quietly falls back to the
on-device check and says which one it used.

## What it costs

Two photos plus the prompt is roughly 2,000 input tokens; the reply is a few
hundred. At Sonnet pricing that's well under a cent per check. Realistically a
few dollars a month even with five children submitting daily.

To keep an eye on it: the worker returns Anthropic's token `usage` with every
verdict, and the Cloudflare dashboard shows request counts.

## Checking it works

```bash
curl https://your-worker-url.workers.dev
# {"ok":true,"service":"chorequest-photo-check","model":"claude-sonnet-5","keySet":true}
```

`keySet: false` means the secret didn't take — run the `wrangler secret put`
step again.

## Notes

- CORS is wide open (`access-control-allow-origin: *`) so the app can call it
  from GitHub Pages. The endpoint takes photos and returns a verdict; it holds
  no data and has nothing to steal but your quota. If you'd rather lock it down,
  replace the `*` with your Pages origin in `worker.js`.
- The model is set at the top of `worker.js`.
- The prompt is the accuracy. It leans hard on judging the room rather than the
  photograph, because that's exactly where the on-device version fell down —
  angle and lighting swamped the thing that mattered. If verdicts feel too harsh
  or too soft, that system prompt is the dial.
