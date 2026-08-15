/** Thin wrapper over the browser SpeechRecognition API. */

const SR = typeof window !== 'undefined'
  ? window.SpeechRecognition || window.webkitSpeechRecognition
  : null

export const dictationSupported = !!SR

/**
 * @param {object} handlers
 * @param {(text:string, isFinal:boolean)=>void} handlers.onText
 * @param {(msg:string)=>void} [handlers.onError]
 * @param {()=>void} [handlers.onEnd]
 * @returns {{stop:()=>void}}
 */
export function startDictation({ onText, onError, onEnd }) {
  if (!SR) {
    onError?.('Voice input needs Chrome, Edge or Safari.')
    onEnd?.()
    return { stop() {} }
  }
  const rec = new SR()
  rec.lang = 'en-US'
  rec.continuous = true
  rec.interimResults = true

  let finalText = ''
  rec.onresult = (e) => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const chunk = e.results[i][0].transcript
      if (e.results[i].isFinal) finalText += chunk
      else interim += chunk
    }
    onText((finalText + interim).trim(), false)
  }
  rec.onerror = (e) => {
    const map = {
      'not-allowed': 'Microphone permission was blocked.',
      'no-speech': "Didn't catch that — try again.",
      'audio-capture': 'No microphone found.',
      network: 'Voice recognition needs a network connection.',
    }
    onError?.(map[e.error] || `Voice input error: ${e.error}`)
  }
  rec.onend = () => {
    onText(finalText.trim(), true)
    onEnd?.()
  }

  try {
    rec.start()
  } catch {
    onError?.('Could not start the microphone.')
    onEnd?.()
  }

  return { stop: () => { try { rec.stop() } catch { /* already stopped */ } } }
}

/**
 * Pull structure out of a dictated sentence so "quick add" really is quick.
 * e.g. "clean the garage worth 50 points due Saturday, this is urgent"
 */
export function parseSpokenJob(text) {
  let title = text.trim()
  const out = { points: null, due: null, urgent: false }

  const pts = title.match(/\b(?:worth\s+)?(\d{1,3})\s*(?:points?|pts?|xp)\b/i)
  if (pts) {
    out.points = Number(pts[1])
    title = title.replace(pts[0], ' ')
  }

  const coins = title.match(/\b(\d{1,3})\s*(?:coins?|bucks?|dollars?)\b/i)
  if (coins) {
    out.coins = Number(coins[1])
    title = title.replace(coins[0], ' ')
  }

  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const dm = title.match(new RegExp(`\\b(?:due|by|before|on)?\\s*(today|tomorrow|${days.join('|')})\\b`, 'i'))
  if (dm) {
    out.due = dm[1].toLowerCase()
    title = title.replace(dm[0], ' ')
  }

  if (/\b(urgent|asap|right away|today only)\b/i.test(title)) {
    out.urgent = true
    title = title.replace(/\b(urgent|asap|right away|today only)\b/gi, ' ')
  }

  title = title
    .replace(/\b(due|by|before|worth|and|please|can someone|somebody|needs? to be)\b\s*$/i, '')
    .replace(/[\s,]+/g, ' ')
    .replace(/^[\s,.-]+|[\s,.-]+$/g, '')
    .trim()

  out.title = title.charAt(0).toUpperCase() + title.slice(1)
  return out
}
