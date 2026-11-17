import { supabase } from '@/lib/supabase'

export const BACKUP_CONFIRMATION = 'i saved my codes'
export const OTP_LENGTH = 6

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function metadataFlag(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== 'object') return false
  return (metadata as Record<string, unknown>)[key] === true
}

export function metadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== 'object') return ''
  const value = (metadata as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : ''
}

export function digitsOnly(value: string) {
  return value.replace(/\D/g, '').slice(0, OTP_LENGTH)
}

export function otpButtonLabel(length: number, readyLabel: string) {
  const remaining = OTP_LENGTH - length
  return remaining > 0 ? String(remaining) : readyLabel
}

export function groupSecret(secret: string) {
  const compact = secret.replace(/\s/g, '')
  return compact.match(/.{1,4}/g)?.join(' ') ?? compact
}

export function qrSource(qr: string) {
  if (qr.startsWith('data:') || qr.startsWith('<svg')) {
    return qr.startsWith('<svg') ? `data:image/svg+xml;utf-8,${encodeURIComponent(qr)}` : qr
  }
  return qr
}

export function factorIsMissing(error: { code?: string; message?: string } | null) {
  if (!error) return false
  return error.code === 'mfa_factor_not_found' || /factor not found/i.test(error.message ?? '')
}

export async function removeUnverifiedTotp() {
  const listed = await supabase.auth.mfa.listFactors()
  if (listed.error) throw listed.error
  const verified = listed.data.all.some((factor) => factor.factor_type === 'totp' && factor.status === 'verified')
  for (const factor of listed.data.all) {
    if (factor.factor_type !== 'totp' || factor.status === 'verified') continue
    const removed = await supabase.auth.mfa.unenroll({ factorId: factor.id })
    if (removed.error && !factorIsMissing(removed.error)) throw removed.error
  }
  return verified
}

type EnrolledAuthenticator = { id: string; qr: string; secret: string }

let authenticatorEnroll: Promise<{ verified: true } | { error: string } | EnrolledAuthenticator> | null = null

export function clearAuthenticatorEnroll() {
  authenticatorEnroll = null
}

export function enrollAuthenticator(
  attempt = 0,
  options?: { force?: boolean },
): Promise<{ verified: true } | { error: string } | EnrolledAuthenticator> {
  const force = options?.force === true
  if (!authenticatorEnroll) {
    authenticatorEnroll = (async () => {
      try {
        const listed = await supabase.auth.mfa.listFactors()
        if (listed.error) throw listed.error
        if (force) {
          for (const factor of listed.data.all) {
            if (factor.factor_type !== 'totp') continue
            const removed = await supabase.auth.mfa.unenroll({ factorId: factor.id })
            if (removed.error && !factorIsMissing(removed.error)) throw removed.error
          }
        } else {
          const verified = await removeUnverifiedTotp()
          if (verified) {
            authenticatorEnroll = null
            return { verified: true as const }
          }
        }
        const enrolled = await supabase.auth.mfa.enroll({
          factorType: 'totp',
          issuer: 'Miravize',
          friendlyName: force ? `Authenticator ${Date.now()}` : 'Authenticator',
        })
        if (enrolled.error || !enrolled.data?.totp) {
          authenticatorEnroll = null
          return { error: enrolled.error?.message ?? 'No authenticator secret was returned.' }
        }
        return {
          id: enrolled.data.id,
          qr: enrolled.data.totp.qr_code,
          secret: enrolled.data.totp.secret,
        }
      } catch (error) {
        authenticatorEnroll = null
        return { error: error instanceof Error ? error.message : 'Could not start setup.' }
      }
    })()
  }
  return authenticatorEnroll.then(async (result) => {
    if ('id' in result && attempt === 0) {
      const listed = await supabase.auth.mfa.listFactors()
      if (!listed.error) {
        const stillThere = listed.data.all.some((factor) => factor.id === result.id)
        if (!stillThere) {
          authenticatorEnroll = null
          return enrollAuthenticator(attempt + 1, options)
        }
      }
    }
    if (!('id' in result)) authenticatorEnroll = null
    return result
  })
}

export function createBackupCodes() {
  const bytes = crypto.getRandomValues(new Uint8Array(100))
  return Array.from({ length: 10 }, (_, index) => {
    let raw = ''
    for (let offset = 0; offset < 10; offset += 1) {
      raw += alphabet[bytes[index * 10 + offset]! % alphabet.length]
    }
    return `${raw.slice(0, 5)}-${raw.slice(5)}`
  })
}

export function normalizeBackupCode(value: string) {
  return value.replace(/[\s-]/g, '').toUpperCase()
}

export async function replaceBackupCodes(codes: string[]) {
  const { error } = await supabase.rpc('replace_mfa_recovery_codes', {
    p_codes: codes.map(normalizeBackupCode),
  })
  if (error) throw error
}

export async function deleteBackupCodes() {
  const { error } = await supabase.rpc('delete_mfa_recovery_codes')
  if (error) throw error
}

export function backupCodesText(codes: string[]) {
  return `Miravize backup codes\n\nEach code works once. After you use one, set up a new authenticator.\n\n${codes.join('\n')}\n`
}
