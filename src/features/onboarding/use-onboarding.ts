import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { useAuth } from '@/features/auth/auth-context'
import { loadCryptoProfile } from '@/lib/crypto/account-profile'
import { supabase } from '@/lib/supabase'

import { resumeOnboarding, type OnboardingChoice, type OnboardingServerState } from './progress'

export const onboardingKey = (userId: string | undefined) => ['onboarding', userId] as const

type OnboardingRow = {
  mfa_choice: OnboardingChoice
  recovery_confirmed_at: string | null
  completed_at: string | null
}

async function loadOnboarding(userId: string, emailConfirmed: boolean): Promise<OnboardingServerState> {
  const [row, profile] = await Promise.all([
    supabase
      .from('user_onboarding')
      .select('mfa_choice, recovery_confirmed_at, completed_at')
      .eq('user_id', userId)
      .maybeSingle(),
    loadCryptoProfile(),
  ])
  if (row.error) throw row.error
  const data = row.data as OnboardingRow | null
  return {
    emailConfirmed,
    mfaChoice: data?.mfa_choice ?? null,
    cryptoStatus: profile?.crypto_status ?? null,
    recoveryConfirmed: Boolean(data?.recovery_confirmed_at),
    completed: Boolean(data?.completed_at),
  }
}

export function useOnboardingStatus() {
  const { user, loading } = useAuth()
  const emailConfirmed = Boolean(user?.email_confirmed_at ?? user?.confirmed_at)
  const query = useQuery({
    queryKey: onboardingKey(user?.id),
    enabled: Boolean(user?.id),
    queryFn: () => loadOnboarding(user!.id, emailConfirmed),
  })
  const state = query.data
  return {
    loading: loading || (Boolean(user) && query.isLoading),
    error: query.error,
    state,
    complete: state?.completed === true,
    step: state ? resumeOnboarding(state) : null,
    refetch: query.refetch,
  }
}

export function useRefreshOnboarding() {
  const { user } = useAuth()
  const client = useQueryClient()
  return useCallback(async () => {
    await client.invalidateQueries({ queryKey: onboardingKey(user?.id) })
  }, [client, user?.id])
}
