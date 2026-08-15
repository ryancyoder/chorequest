const KEY = 'chorequest.state.v1'

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.members)) return null
    return parsed
  } catch {
    return null
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
    return true
  } catch (err) {
    // Quota blown (usually an inline seed image) — the app keeps working from
    // memory for this session rather than dying on a write.
    console.warn('ChoreQuest: could not save state —', err?.name || err)
    return false
  }
}

export function clearState() {
  try {
    localStorage.removeItem(KEY)
  } catch { /* ignore */ }
}
