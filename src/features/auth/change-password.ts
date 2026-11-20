import { commitPasswordRewrapFromCurrent, loadCryptoProfile } from '@/lib/crypto/account-profile'
import { passwordDiffersFromCurrent } from '@/lib/password'
import { supabase } from '@/lib/supabase'

import { verifyCurrentPassword } from './verify-password'

export async function changePassword(email: string, currentPassword: string, nextPassword: string) {
  if (!passwordDiffersFromCurrent(currentPassword, nextPassword)) {
    throw new Error('New password must be different from the current password.')
  }
  await verifyCurrentPassword(email, currentPassword)
  const user = await supabase.auth.getUser()
  const userId = user.data.user?.id
  if (!userId) throw new Error('Not signed in')
  const profile = await loadCryptoProfile()
  const ready = profile?.crypto_status === 'ready'
  if (ready) {
    try {
      await commitPasswordRewrapFromCurrent(userId, currentPassword, nextPassword)
    } catch (error) {
      if (error instanceof Error && error.message === 'That password does not open the saved encryption key.') {
        throw new Error(
          'That password does not open the saved encryption key. Use your recovery key on this page to wrap the encryption key for your login password. The login password was not changed.',
        )
      }
      throw error
    }
  }
  const updated = await supabase.auth.updateUser({ password: nextPassword })
  if (updated.error) {
    if (ready) {
      try {
        await commitPasswordRewrapFromCurrent(userId, nextPassword, currentPassword)
      } catch {
        throw new Error(
          'The login password was not changed, but the encryption key is wrapped for the new password. Use your recovery key and your current login password to wrap it again.',
        )
      }
    }
    throw new Error(updated.error.message)
  }
}
