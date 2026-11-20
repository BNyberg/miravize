const RECOVERY_KEY = 'miravize-onboarding-recovery'

export function rememberRecoveryKey(value: string) {
  sessionStorage.setItem(RECOVERY_KEY, value)
}

export function readRecoveryKey() {
  return sessionStorage.getItem(RECOVERY_KEY)
}

export function clearRecoveryKey() {
  sessionStorage.removeItem(RECOVERY_KEY)
}
