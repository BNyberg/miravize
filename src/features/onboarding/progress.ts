export type OnboardingChoice = 'enrolled' | 'skipped' | null
export type OnboardingCrypto = 'setup_pending' | 'ready' | null

export type OnboardingServerState = {
  emailConfirmed: boolean
  mfaChoice: OnboardingChoice
  cryptoStatus: OnboardingCrypto
  recoveryConfirmed: boolean
  completed: boolean
}

export type OnboardingResume = 'verify' | 'mfa' | 'recovery' | 'workspace' | 'done'

export function resumeOnboarding(state: OnboardingServerState): OnboardingResume {
  if (!state.emailConfirmed) return 'verify'
  if (!state.mfaChoice) return 'mfa'
  if (state.cryptoStatus !== 'ready' || !state.recoveryConfirmed) return 'recovery'
  if (!state.completed) return 'workspace'
  return 'done'
}

export const ONBOARDING_STEPS = [
  { id: 'email', label: 'Email' },
  { id: 'password', label: 'Password' },
  { id: 'verify', label: 'Verify' },
  { id: 'mfa', label: 'Security' },
  { id: 'recovery', label: 'Recovery' },
  { id: 'workspace', label: 'Workspace' },
] as const

export function onboardingIndex(step: (typeof ONBOARDING_STEPS)[number]['id']) {
  return ONBOARDING_STEPS.findIndex((item) => item.id === step)
}
