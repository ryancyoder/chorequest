/**
 * Photo storage.
 *
 * Photos live in IndexedDB (not localStorage — a dozen proof photos would blow
 * the 5MB quota instantly). The app state keeps only short photo ids.
 *
 * Everything is loaded into an in-memory Map at boot so components can render
 * `photoUrl(id)` synchronously. A family accumulates tens of photos, not tens of
 * thousands, so this stays cheap.
 */

const DB_NAME = 'chorequest-photos'
const STORE = 'photos'

let memory = new Map()
let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function tx(mode, fn) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const store = t.objectStore(STORE)
    const result = fn(store)
    t.oncomplete = () => resolve(result?.result ?? result)
    t.onerror = () => reject(t.error)
  })
}

/** Pull every stored photo into memory. Call once at boot. */
export async function hydratePhotos() {
  try {
    const db = await openDb()
    await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readonly')
      const store = t.objectStore(STORE)
      const keys = store.getAllKeys()
      const vals = store.getAll()
      t.oncomplete = () => {
        keys.result.forEach((k, i) => memory.set(k, vals.result[i]))
        resolve()
      }
      t.onerror = () => reject(t.error)
    })
  } catch {
    // Private browsing / IDB blocked — fall back to memory-only for the session.
  }
  return memory.size
}

let counter = 0
export function newPhotoId() {
  counter += 1
  return `ph_${Date.now().toString(36)}_${counter}`
}

/** Store a data URL, returns its id. */
export async function putPhoto(dataUrl, id = newPhotoId()) {
  memory.set(id, dataUrl)
  try {
    await tx('readwrite', (s) => s.put(dataUrl, id))
  } catch {
    /* memory-only fallback */
  }
  return id
}

/** Synchronous read — null if unknown. */
export function photoUrl(id) {
  if (!id) return null
  if (id.startsWith('data:')) return id // inline seed images
  return memory.get(id) ?? null
}

export async function deletePhoto(id) {
  memory.delete(id)
  try {
    await tx('readwrite', (s) => s.delete(id))
  } catch {
    /* ignore */
  }
}

export async function clearPhotos() {
  memory = new Map()
  try {
    await tx('readwrite', (s) => s.clear())
  } catch {
    /* ignore */
  }
}
