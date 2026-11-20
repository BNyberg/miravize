import { verifyCurrentPassword } from '@/features/auth/verify-password'
import { supabase } from '@/lib/supabase'

import {
  createAccountKeys,
  replaceRecoveryWrap,
  rewrapPrivateKeyWithRecovery,
  samePrivateKey,
  wrapPrivateKeyWithPassword,
  unlockPrivateKeyWithPassword,
  unlockPrivateKeyWithRecovery,
  type AccountKeyBundle,
  type PasswordWrappedPrivateKey,
  type RecoveryWrappedPrivateKey,
} from './account-keys.ts'
import { zeroBytes } from './bytes.ts'
import { CryptoError } from './errors.ts'

export const RECOVERY_CONFIRMATION = 'i saved my recovery key'

export type StoredCryptoProfile = {
  crypto_status: 'setup_pending' | 'ready'
  public_key_fingerprint: string
  recovery_rotation_pending: boolean
}

export async function loadCryptoProfile(): Promise<StoredCryptoProfile | null> {
  const { data, error } = await supabase
    .from('user_crypto_profiles')
    .select('crypto_status, public_key_fingerprint, recovery_rotation_pending')
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return data as StoredCryptoProfile
}

export async function workspaceDataStillPlaintext(): Promise<boolean> {
  const [workspaces, envelopes] = await Promise.all([
    supabase.from('workspaces').select('encryption_status'),
    supabase.from('workspace_member_key_envelopes').select('workspace_id', { count: 'exact', head: true }),
  ])
  if (workspaces.error) throw workspaces.error
  if (envelopes.error) throw envelopes.error
  return (workspaces.data ?? []).every((row) => row.encryption_status === 'plaintext') && (envelopes.count ?? 0) === 0
}

export async function proveAccountKeys(bundle: AccountKeyBundle, userId: string, password: string) {
  const fromPassword = await unlockPrivateKeyWithPassword({
    userId,
    password,
    wrapped: bundle.passwordWrapped,
  })
  const fromRecovery = await unlockPrivateKeyWithRecovery({
    userId,
    recoveryKey: bundle.recoveryKey,
    wrapped: bundle.recoveryWrapped,
  })
  try {
    if (!samePrivateKey(fromPassword, bundle.privateKey) || !samePrivateKey(fromRecovery, bundle.privateKey)) {
      throw new CryptoError('integrity', 'Ciphertext integrity check failed')
    }
  } finally {
    zeroBytes(fromPassword)
    zeroBytes(fromRecovery)
  }
}

export async function createProvenAccountKeys(userId: string, email: string, password: string): Promise<AccountKeyBundle> {
  await verifyCurrentPassword(email, password)
  const bundle = await createAccountKeys({ userId, password })
  try {
    await proveAccountKeys(bundle, userId, password)
    return bundle
  } catch (error) {
    zeroBytes(bundle.privateKey)
    throw error
  }
}

export async function savePendingProfile(userId: string, bundle: AccountKeyBundle, password: string) {
  await proveAccountKeys(bundle, userId, password)
  const existing = await loadCryptoProfile()
  if (existing?.crypto_status === 'ready') {
    throw new Error('Encryption keys were already saved. Leave this screen and compare the fingerprint on your profile. Do not keep a recovery key from a setup that did not finish.')
  }
  if (existing) {
    throw new Error('Encryption setup already started. Continue with the recovery key on this screen.')
  }
  const inserted = await supabase.from('user_crypto_profiles').insert({
    user_id: userId,
    public_key: bundle.publicKey,
    public_key_fingerprint: bundle.publicKeyFingerprint,
    encrypted_private_key: bundle.passwordWrapped,
    recovery_wrapped_private_key: bundle.recoveryWrapped,
    crypto_version: 1,
    crypto_status: 'setup_pending',
    updated_at: new Date().toISOString(),
  })
  if (inserted.error) throw inserted.error
}

export async function promotePendingProfile(userId: string) {
  const updated = await supabase
    .from('user_crypto_profiles')
    .update({ crypto_status: 'ready', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('crypto_status', 'setup_pending')
    .select('crypto_status')
  if (updated.error) throw updated.error
  if (updated.data?.length) return
  const current = await loadCryptoProfile()
  if (current?.crypto_status === 'ready') return
  throw new Error('Encryption setup did not finish. Try again.')
}

export async function replacePendingRecovery(userId: string, email: string, password: string) {
  await verifyCurrentPassword(email, password)
  const profile = await supabase
    .from('user_crypto_profiles')
    .select('encrypted_private_key, crypto_status')
    .eq('user_id', userId)
    .maybeSingle()
  if (profile.error) throw profile.error
  if (profile.data?.crypto_status === 'ready') {
    throw new Error('Your recovery key was already saved. Enter a group from that key.')
  }
  if (profile.data?.crypto_status !== 'setup_pending') throw new Error('Set up your encryption key before continuing.')
  const privateKey = await unlockWithPassword(userId, password, profile.data.encrypted_private_key as PasswordWrappedPrivateKey)
  try {
    const replacement = await replaceRecoveryWrap(userId, privateKey)
    const saved = await supabase
      .from('user_crypto_profiles')
      .update({
        recovery_wrapped_private_key: replacement.wrapped,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('crypto_status', 'setup_pending')
      .select('crypto_status')
    if (saved.error) throw saved.error
    if (!saved.data?.length) throw new Error('A recovery key was already saved.')
    return replacement.recoveryKey
  } finally {
    zeroBytes(privateKey)
  }
}

export async function saveReadyProfile(userId: string, bundle: AccountKeyBundle, password: string) {
  await proveAccountKeys(bundle, userId, password)
  const existing = await loadCryptoProfile()
  if (existing?.crypto_status === 'ready') {
    throw new Error('Encryption keys were already saved. Leave this screen and compare the fingerprint on your profile. Do not keep a recovery key from a setup that did not finish.')
  }
  if (existing && !(await workspaceDataStillPlaintext())) {
    throw new Error('Encryption setup already started and workspace data is protected. A new key was not created.')
  }

  const row = {
    user_id: userId,
    public_key: bundle.publicKey,
    public_key_fingerprint: bundle.publicKeyFingerprint,
    encrypted_private_key: bundle.passwordWrapped,
    recovery_wrapped_private_key: bundle.recoveryWrapped,
    crypto_version: 1,
    crypto_status: 'ready',
    updated_at: new Date().toISOString(),
  }

  if (!existing) {
    const inserted = await supabase.from('user_crypto_profiles').insert(row)
    if (inserted.error) {
      const current = await loadCryptoProfile()
      if (current?.crypto_status === 'ready') {
        throw new Error('Encryption keys were already saved. Leave this screen and compare the fingerprint on your profile. Do not keep a recovery key from a setup that did not finish.')
      }
      throw inserted.error
    }
    return
  }

  const updated = await supabase
    .from('user_crypto_profiles')
    .update(row)
    .eq('user_id', userId)
    .eq('crypto_status', 'setup_pending')
    .select('public_key_fingerprint')
  if (updated.error) throw updated.error
  if (!updated.data?.length) {
    throw new Error('Encryption keys were already saved. Leave this screen and compare the fingerprint on your profile. Do not keep a recovery key from a setup that did not finish.')
  }
}

export type RecoveryReplacement = {
  recoveryKey: string
  wrapped: RecoveryWrappedPrivateKey
  previousRecoveryKeyId: string
}

function samePasswordWrap(left: PasswordWrappedPrivateKey, right: PasswordWrappedPrivateKey) {
  return (
    left.format_version === right.format_version &&
    left.ciphertext === right.ciphertext &&
    left.nonce === right.nonce &&
    left.salt === right.salt
  )
}

async function loadReadyWraps(userId: string) {
  const profile = await supabase
    .from('user_crypto_profiles')
    .select('encrypted_private_key, recovery_wrapped_private_key, crypto_status, recovery_rotation_pending')
    .eq('user_id', userId)
    .maybeSingle()
  if (profile.error) throw profile.error
  if (profile.data?.crypto_status !== 'ready') throw new Error('Set up your encryption key before replacing the recovery key.')
  return {
    passwordWrapped: profile.data.encrypted_private_key as PasswordWrappedPrivateKey,
    recoveryWrapped: profile.data.recovery_wrapped_private_key as RecoveryWrappedPrivateKey,
    recoveryRotationPending: profile.data.recovery_rotation_pending === true,
  }
}

async function unlockWithPassword(userId: string, password: string, wrapped: PasswordWrappedPrivateKey) {
  try {
    return await unlockPrivateKeyWithPassword({ userId, password, wrapped })
  } catch (error) {
    if (error instanceof CryptoError && error.code === 'integrity') {
      throw new Error('That password does not open the saved encryption key.')
    }
    throw error
  }
}

async function restoreWraps(
  userId: string,
  recoveryWrapped: RecoveryWrappedPrivateKey,
  passwordWrapped: PasswordWrappedPrivateKey,
  recoveryRotationPending: boolean,
  failure: string,
) {
  const restored = await supabase
    .from('user_crypto_profiles')
    .update({
      recovery_wrapped_private_key: recoveryWrapped,
      encrypted_private_key: passwordWrapped,
      recovery_rotation_pending: recoveryRotationPending,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('crypto_status', 'ready')
    .select('recovery_wrapped_private_key')
  if (restored.error || !restored.data?.length) throw new Error(failure)
}

export async function prepareRecoveryRotation(userId: string, email: string, password: string): Promise<RecoveryReplacement> {
  await verifyCurrentPassword(email, password)
  const wraps = await loadReadyWraps(userId)
  const privateKey = await unlockWithPassword(userId, password, wraps.passwordWrapped)
  try {
    const replacement = await replaceRecoveryWrap(userId, privateKey)
    return {
      recoveryKey: replacement.recoveryKey,
      wrapped: replacement.wrapped,
      previousRecoveryKeyId: wraps.recoveryWrapped.recovery_key_id,
    }
  } finally {
    zeroBytes(privateKey)
  }
}

export async function commitRecoveryRotation(userId: string, email: string, password: string, replacement: RecoveryReplacement) {
  await verifyCurrentPassword(email, password)
  const wraps = await loadReadyWraps(userId)
  if (wraps.recoveryWrapped.recovery_key_id !== replacement.previousRecoveryKeyId) {
    throw new Error('A recovery key was already replaced. The key on this screen was not saved. The current key still works.')
  }
  const privateKey = await unlockWithPassword(userId, password, wraps.passwordWrapped)
  let opened: Uint8Array | null = null
  try {
    opened = await unlockPrivateKeyWithRecovery({
      userId,
      recoveryKey: replacement.recoveryKey,
      wrapped: replacement.wrapped,
    })
    if (!samePrivateKey(opened, privateKey)) {
      throw new Error('The new recovery key does not open the saved encryption key. Nothing was changed.')
    }
    const updated = await supabase
      .from('user_crypto_profiles')
      .update({
        recovery_wrapped_private_key: replacement.wrapped,
        recovery_rotation_pending: false,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('crypto_status', 'ready')
      .select('encrypted_private_key, recovery_wrapped_private_key, recovery_rotation_pending')
    if (updated.error) throw updated.error
    const row = updated.data?.[0]
    if (!row) throw new Error('The recovery key was not replaced. The previous key still works.')
    const savedPassword = row.encrypted_private_key as PasswordWrappedPrivateKey
    const savedRecovery = row.recovery_wrapped_private_key as RecoveryWrappedPrivateKey
    const savedMatches =
      samePasswordWrap(savedPassword, wraps.passwordWrapped) &&
      savedRecovery.recovery_key_id === replacement.wrapped.recovery_key_id &&
      savedRecovery.ciphertext === replacement.wrapped.ciphertext &&
      row.recovery_rotation_pending !== true
    if (!savedMatches) {
      await restoreWraps(
        userId,
        wraps.recoveryWrapped,
        wraps.passwordWrapped,
        wraps.recoveryRotationPending,
        'The new recovery key did not match the saved copy, and the previous key could not be restored. Your password still opens the encryption key. Keep the previous recovery key.',
      )
      throw new Error('The saved recovery key did not match the new one. The previous key was restored.')
    }
    let stored: Uint8Array
    try {
      stored = await unlockPrivateKeyWithRecovery({
        userId,
        recoveryKey: replacement.recoveryKey,
        wrapped: savedRecovery,
      })
    } catch {
      await restoreWraps(
        userId,
        wraps.recoveryWrapped,
        wraps.passwordWrapped,
        wraps.recoveryRotationPending,
        'The new recovery key did not match the saved copy, and the previous key could not be restored. Your password still opens the encryption key. Keep the previous recovery key.',
      )
      throw new Error('The new recovery key did not open the saved copy. The previous key still works.')
    }
    try {
      if (!samePrivateKey(stored, privateKey)) {
        await restoreWraps(
          userId,
          wraps.recoveryWrapped,
          wraps.passwordWrapped,
          wraps.recoveryRotationPending,
          'The new recovery key did not match the saved copy, and the previous key could not be restored. Your password still opens the encryption key. Keep the previous recovery key.',
        )
        throw new Error('The new recovery key did not open the saved copy. The previous key still works.')
      }
    } finally {
      zeroBytes(stored)
    }
  } finally {
    if (opened) zeroBytes(opened)
    zeroBytes(privateKey)
  }
}

const PASSWORD_WRAP_RESTORE_FAILED =
  'The password wrap could not be restored. Your recovery key still opens the encryption key. Keep that recovery key.'

async function savePasswordWrap(
  userId: string,
  password: string,
  nextWrap: PasswordWrappedPrivateKey,
  privateKey: Uint8Array,
  wraps: { passwordWrapped: PasswordWrappedPrivateKey; recoveryWrapped: RecoveryWrappedPrivateKey; recoveryRotationPending: boolean },
) {
  const updated = await supabase
    .from('user_crypto_profiles')
    .update({
      encrypted_private_key: nextWrap,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('crypto_status', 'ready')
    .select('encrypted_private_key, recovery_wrapped_private_key')
  if (updated.error) throw updated.error
  const row = updated.data?.[0]
  if (!row) throw new Error('The password wrap was not saved. The recovery key still works.')
  const savedPassword = row.encrypted_private_key as PasswordWrappedPrivateKey
  const savedRecovery = row.recovery_wrapped_private_key as RecoveryWrappedPrivateKey
  const recoverySame =
    savedRecovery.recovery_key_id === wraps.recoveryWrapped.recovery_key_id &&
    savedRecovery.ciphertext === wraps.recoveryWrapped.ciphertext
  if (!recoverySame || !samePasswordWrap(savedPassword, nextWrap)) {
    await restoreWraps(userId, wraps.recoveryWrapped, wraps.passwordWrapped, wraps.recoveryRotationPending, PASSWORD_WRAP_RESTORE_FAILED)
    throw new Error('The saved password wrap did not match. The previous wrap was restored. The recovery key still works.')
  }
  let stored: Uint8Array
  try {
    stored = await unlockPrivateKeyWithPassword({ userId, password, wrapped: savedPassword })
  } catch {
    await restoreWraps(userId, wraps.recoveryWrapped, wraps.passwordWrapped, wraps.recoveryRotationPending, PASSWORD_WRAP_RESTORE_FAILED)
    throw new Error('The saved password wrap did not open. The previous wrap was restored. The recovery key still works.')
  }
  try {
    if (!samePrivateKey(stored, privateKey)) {
      await restoreWraps(userId, wraps.recoveryWrapped, wraps.passwordWrapped, wraps.recoveryRotationPending, PASSWORD_WRAP_RESTORE_FAILED)
      throw new Error('The saved password wrap did not open. The previous wrap was restored. The recovery key still works.')
    }
  } finally {
    zeroBytes(stored)
  }
}

async function markRecoveryRotationPending(userId: string) {
  const updated = await supabase
    .from('user_crypto_profiles')
    .update({
      recovery_rotation_pending: true,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('crypto_status', 'ready')
    .select('recovery_rotation_pending')
  if (updated.error) throw updated.error
  if (updated.data?.[0]?.recovery_rotation_pending !== true) {
    throw new Error('The password was saved, but the recovery key still needs to be replaced. Submit this form again.')
  }
}

export async function commitPasswordRewrapFromRecovery(
  userId: string,
  email: string,
  password: string,
  recoveryKey: string,
  requireRecoveryRotation = false,
): Promise<'already' | 'rewrapped'> {
  await verifyCurrentPassword(email, password)
  const wraps = await loadReadyWraps(userId)
  let privateKey: Uint8Array
  try {
    privateKey = await unlockPrivateKeyWithRecovery({
      userId,
      recoveryKey,
      wrapped: wraps.recoveryWrapped,
    })
  } catch (error) {
    if (error instanceof CryptoError && error.code === 'integrity') {
      throw new Error('That recovery key does not open the saved encryption key.')
    }
    throw error
  }
  try {
    let already: Uint8Array | null = null
    try {
      already = await unlockPrivateKeyWithPassword({ userId, password, wrapped: wraps.passwordWrapped })
    } catch (error) {
      if (!(error instanceof CryptoError && error.code === 'integrity')) throw error
    }
    if (already) {
      const matches = samePrivateKey(already, privateKey)
      zeroBytes(already)
      if (matches) {
        if (requireRecoveryRotation) await markRecoveryRotationPending(userId)
        return 'already'
      }
    }
    const nextWrap = await rewrapPrivateKeyWithRecovery({
      userId,
      recoveryKey,
      nextPassword: password,
      wrapped: wraps.recoveryWrapped,
    })
    await savePasswordWrap(userId, password, nextWrap, privateKey, wraps)
    if (requireRecoveryRotation) await markRecoveryRotationPending(userId)
    return 'rewrapped'
  } finally {
    zeroBytes(privateKey)
  }
}

export async function commitPasswordRewrapFromCurrent(userId: string, currentPassword: string, nextPassword: string) {
  const wraps = await loadReadyWraps(userId)
  const privateKey = await unlockWithPassword(userId, currentPassword, wraps.passwordWrapped)
  try {
    const nextWrap = await wrapPrivateKeyWithPassword(userId, nextPassword, privateKey)
    const opened = await unlockPrivateKeyWithPassword({ userId, password: nextPassword, wrapped: nextWrap })
    try {
      if (!samePrivateKey(opened, privateKey)) {
        throw new Error('The new password wrap does not open the encryption key. Nothing was changed.')
      }
    } finally {
      zeroBytes(opened)
    }
    await savePasswordWrap(userId, nextPassword, nextWrap, privateKey, wraps)
  } finally {
    zeroBytes(privateKey)
  }
}
