export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (value: string) => value.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: (value: string) => /[A-Z]/.test(value) },
  { id: 'lower', label: 'One lowercase letter', test: (value: string) => /[a-z]/.test(value) },
  { id: 'number', label: 'One number', test: (value: string) => /\d/.test(value) },
  { id: 'special', label: 'One special character', test: (value: string) => /[^A-Za-z0-9]/.test(value) },
] as const

export const DIFFERENT_PASSWORD_RULE = {
  id: 'different',
  label: 'Different from the current password',
} as const

export function passwordIsStrong(value: string) {
  return PASSWORD_RULES.every((rule) => rule.test(value))
}

export function passwordDiffersFromCurrent(current: string, next: string) {
  return current.length > 0 && next.length > 0 && next !== current
}

export function isSamePasswordError(error: { message?: string; code?: string | null }) {
  const message = error.message ?? ''
  return error.code === 'same_password' || /different from the old password/i.test(message)
}
