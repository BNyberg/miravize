export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (value: string) => value.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: (value: string) => /[A-Z]/.test(value) },
  { id: 'lower', label: 'One lowercase letter', test: (value: string) => /[a-z]/.test(value) },
  { id: 'number', label: 'One number', test: (value: string) => /\d/.test(value) },
  { id: 'special', label: 'One special character', test: (value: string) => /[^A-Za-z0-9]/.test(value) },
] as const

export function passwordIsStrong(value: string) {
  return PASSWORD_RULES.every((rule) => rule.test(value))
}
