const STORAGE_KEY = 'miravize-login-secret'

let pending: { email: string; password: string } | null = null

function storage() {
  if (typeof sessionStorage === 'undefined') return null
  return sessionStorage
}

export function rememberLoginPassword(email: string, password: string) {
  pending = { email, password }
  storage()?.setItem(STORAGE_KEY, JSON.stringify(pending))
}

export function hasLoginPassword() {
  return peekLoginPassword() !== null
}

export function peekLoginPassword() {
  if (pending) return pending
  const raw = storage()?.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { email?: unknown; password?: unknown }
    if (typeof parsed.email !== 'string' || typeof parsed.password !== 'string' || parsed.password.length === 0) return null
    pending = { email: parsed.email, password: parsed.password }
    return pending
  } catch {
    return null
  }
}

export function loginPasswordFor(email: string) {
  const saved = peekLoginPassword()
  if (!saved || saved.email.toLowerCase() !== email.toLowerCase()) return null
  return saved.password
}

export function clearLoginPassword() {
  pending = null
  storage()?.removeItem(STORAGE_KEY)
}
