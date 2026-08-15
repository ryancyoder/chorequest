/** Shrink a captured image so photos stay small enough to keep locally. */
export function downscale(src, maxEdge = 720, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight))
      const w = Math.round(img.naturalWidth * scale)
      const h = Math.round(img.naturalHeight * scale)
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)
      resolve(c.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => reject(new Error('Could not read that image'))
    img.src = src
  })
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(file)
  })
}

export function hasLiveCamera() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext)
}

/** Grab a still from a running <video>. */
export function grabFrame(video, maxEdge = 720, quality = 0.75) {
  const vw = video.videoWidth
  const vh = video.videoHeight
  const scale = Math.min(1, maxEdge / Math.max(vw, vh))
  const c = document.createElement('canvas')
  c.width = Math.round(vw * scale)
  c.height = Math.round(vh * scale)
  c.getContext('2d').drawImage(video, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', quality)
}
