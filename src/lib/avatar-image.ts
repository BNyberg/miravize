export function avatarUrlFromUser(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') return undefined
  const url = (metadata as { avatar_url?: unknown }).avatar_url
  return typeof url === 'string' && url.length > 0 ? url : undefined
}

export const AVATAR_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,image/avif,.jpg,.jpeg,.png,.webp,.gif,.avif'

const AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
const AVATAR_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'])

export const AVATAR_VIEW = 280
export const AVATAR_OUTPUT = 128

export type AvatarCrop = {
  zoom: number
  panX: number
  panY: number
}

export function isAvatarImage(file: File) {
  if (AVATAR_TYPES.has(file.type)) return true
  const ext = file.name.split('.').pop()?.toLowerCase()
  return Boolean(ext && AVATAR_EXTENSIONS.has(ext))
}

export function coverScale(naturalWidth: number, naturalHeight: number, view = AVATAR_VIEW) {
  return Math.max(view / naturalWidth, view / naturalHeight)
}

export function panLimit(displayed: number, view = AVATAR_VIEW) {
  return Math.max(0, (displayed - view) / 2)
}

export function clampPan(value: number, displayed: number, view = AVATAR_VIEW) {
  const limit = panLimit(displayed, view)
  return Math.min(limit, Math.max(-limit, value))
}

export async function renderAvatar(image: CanvasImageSource & { naturalWidth: number; naturalHeight: number }, crop: AvatarCrop) {
  const scale = coverScale(image.naturalWidth, image.naturalHeight) * crop.zoom
  const displayedWidth = image.naturalWidth * scale
  const displayedHeight = image.naturalHeight * scale
  const left = (AVATAR_VIEW - displayedWidth) / 2 + clampPan(crop.panX, displayedWidth)
  const top = (AVATAR_VIEW - displayedHeight) / 2 + clampPan(crop.panY, displayedHeight)
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_OUTPUT
  canvas.height = AVATAR_OUTPUT
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not prepare the image')
  context.drawImage(
    image,
    (0 - left) / scale,
    (0 - top) / scale,
    AVATAR_VIEW / scale,
    AVATAR_VIEW / scale,
    0,
    0,
    AVATAR_OUTPUT,
    AVATAR_OUTPUT,
  )
  const webp = await canvasBlob(canvas, 'image/webp')
  if (webp) return webp
  const jpeg = await canvasBlob(canvas, 'image/jpeg')
  if (jpeg) return jpeg
  throw new Error('Could not prepare the image')
}

function canvasBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob && blob.size > 0 ? blob : null), type, 0.85)
  })
}
