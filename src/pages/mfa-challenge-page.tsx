import { useNavigate, useSearchParams } from 'react-router'

import { MfaChallengeForm } from '@/components/auth/mfa-challenge-form'

export function MfaChallengePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const next = params.get('next') || '/timer'

  return (
    <MfaChallengeForm
      onVerified={() => navigate(next, { replace: true })}
      onBackupRedeemed={() => navigate(`/mfa/setup?next=${encodeURIComponent(next)}`, { replace: true })}
    />
  )
}
