let pending: { email: string; password: string } | null = null

export function rememberLoginPassword(email: string, password: string) {
  pending = { email, password }
}

export function hasLoginPassword() {
  return pending !== null
}

export function peekLoginPassword() {
  return pending
}

export function clearLoginPassword() {
  pending = null
}
