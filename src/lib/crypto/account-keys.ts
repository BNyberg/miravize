import { argon2id } from 'hash-wasm'

import { base64UrlToBytes, bytesEqual, bytesToBase64Url, copyBuffer, randomBytes, utf8Bytes, zeroBytes } from './bytes.ts'
import { CryptoError } from './errors.ts'
import {
  AES_NONCE_BYTES,
  X25519_KEY_BYTES,
  aesGcmDecryptWithKey,
  aesGcmEncryptWithKey,
  deriveHkdfKey,
  generateBoxKeyPair,
  sha256Hex,
} from './primitives.ts'

/** OWASP minimum: 19 MiB, 2 iterations, parallelism 1. Stored on each wrapper so later increases can still open old keys. */
export const PASSWORD_KDF_PARAMS = {
  memory_kib: 19 * 1024,
  iterations: 2,
  parallelism: 1,
} as const

const PRIVATE_KEY_CIPHERTEXT_BYTES = X25519_KEY_BYTES + 16
const RECOVERY_KEY_BYTES = 32
const RECOVERY_HKDF_SALT = 'miravize-recovery-v1'

export type PasswordKdfParams = {
  memory_kib: number
  iterations: number
  parallelism: number
}

export type PasswordWrappedPrivateKey = {
  format_version: 1
  kdf: 'argon2id'
  salt: string
  params: PasswordKdfParams
  nonce: string
  ciphertext: string
}

export type RecoveryWrappedPrivateKey = {
  format_version: 1
  kdf: 'hkdf-sha256'
  recovery_key_id: string
  nonce: string
  ciphertext: string
}

export type AccountKeyBundle = {
  publicKey: string
  publicKeyFingerprint: string
  privateKey: Uint8Array
  passwordWrapped: PasswordWrappedPrivateKey
  recoveryWrapped: RecoveryWrappedPrivateKey
  recoveryKey: string
}

function assertUserId(userId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(userId)) throw new CryptoError('malformed', 'Encrypted value is malformed')
}

function passwordAad(userId: string): Uint8Array {
  assertUserId(userId)
  return utf8Bytes(JSON.stringify({ v: 1, purpose: 'password-private-key', user_id: userId }))
}

function recoveryAad(userId: string, recoveryKeyId: string): Uint8Array {
  assertUserId(userId)
  if (!/^[A-Za-z0-9_-]+$/.test(recoveryKeyId)) throw new CryptoError('malformed', 'Encrypted value is malformed')
  return utf8Bytes(
    JSON.stringify({ v: 1, purpose: 'recovery-private-key', user_id: userId, recovery_key_id: recoveryKeyId }),
  )
}

function acceptedKdf(params: PasswordKdfParams) {
  if (!Number.isInteger(params.memory_kib) || params.memory_kib < 8 * 1024 || params.memory_kib > 256 * 1024) {
    throw new CryptoError('unsupported', 'Unsupported encryption format')
  }
  if (!Number.isInteger(params.iterations) || params.iterations < 1 || params.iterations > 8) {
    throw new CryptoError('unsupported', 'Unsupported encryption format')
  }
  if (!Number.isInteger(params.parallelism) || params.parallelism < 1 || params.parallelism > 4) {
    throw new CryptoError('unsupported', 'Unsupported encryption format')
  }
}

async function passwordKey(password: string, salt: Uint8Array, params: PasswordKdfParams) {
  acceptedKdf(params)
  const derived = await argon2id({
    password,
    salt,
    memorySize: params.memory_kib,
    iterations: params.iterations,
    parallelism: params.parallelism,
    hashLength: 32,
    outputType: 'binary',
  })
  try {
    return await crypto.subtle.importKey('raw', copyBuffer(derived), 'AES-GCM', false, ['encrypt', 'decrypt'])
  } finally {
    zeroBytes(derived)
  }
}

export function formatRecoveryKey(recoveryKey: string): string {
  const compact = parseRecoveryKey(recoveryKey)
  return compact.replace(/(.{4})/g, '$1 ').trim()
}

export function parseRecoveryKey(value: string): string {
  return value.replace(/\s+/g, '')
}

export async function createAccountKeys(input: { userId: string; password: string }): Promise<AccountKeyBundle> {
  const pair = await generateBoxKeyPair()
  const passwordWrapped = await wrapPrivateKeyWithPassword(input.userId, input.password, pair.privateKey)
  const recovery = await wrapPrivateKeyWithRecovery(input.userId, pair.privateKey)
  return {
    publicKey: bytesToBase64Url(pair.publicKey),
    publicKeyFingerprint: await sha256Hex(pair.publicKey),
    privateKey: pair.privateKey,
    passwordWrapped,
    recoveryWrapped: recovery.wrapped,
    recoveryKey: recovery.recoveryKey,
  }
}

export async function wrapPrivateKeyWithPassword(userId: string, password: string, privateKey: Uint8Array): Promise<PasswordWrappedPrivateKey> {
  if (privateKey.byteLength !== X25519_KEY_BYTES) throw new CryptoError('malformed', 'Encrypted value is malformed')
  const salt = randomBytes(16)
  const nonce = randomBytes(AES_NONCE_BYTES)
  const key = await passwordKey(password, salt, PASSWORD_KDF_PARAMS)
  const ciphertext = await aesGcmEncryptWithKey(key, privateKey, passwordAad(userId), nonce)
  return {
    format_version: 1,
    kdf: 'argon2id',
    salt: bytesToBase64Url(salt),
    params: { ...PASSWORD_KDF_PARAMS },
    nonce: bytesToBase64Url(nonce),
    ciphertext: bytesToBase64Url(ciphertext),
  }
}

export async function unlockPrivateKeyWithPassword(input: {
  userId: string
  password: string
  wrapped: PasswordWrappedPrivateKey
}): Promise<Uint8Array> {
  if (input.wrapped.format_version !== 1 || input.wrapped.kdf !== 'argon2id') {
    throw new CryptoError('unsupported', 'Unsupported encryption format')
  }
  const salt = base64UrlToBytes(input.wrapped.salt)
  const nonce = base64UrlToBytes(input.wrapped.nonce)
  const ciphertext = base64UrlToBytes(input.wrapped.ciphertext)
  if (salt.byteLength !== 16 || nonce.byteLength !== AES_NONCE_BYTES || ciphertext.byteLength !== PRIVATE_KEY_CIPHERTEXT_BYTES) {
    throw new CryptoError('malformed', 'Encrypted value is malformed')
  }
  const key = await passwordKey(input.password, salt, input.wrapped.params)
  return aesGcmDecryptWithKey(key, ciphertext, passwordAad(input.userId), nonce)
}

async function wrapPrivateKeyWithRecovery(userId: string, privateKey: Uint8Array): Promise<{ wrapped: RecoveryWrappedPrivateKey; recoveryKey: string }> {
  const secret = randomBytes(RECOVERY_KEY_BYTES)
  const recoveryKeyId = bytesToBase64Url(randomBytes(16))
  const nonce = randomBytes(AES_NONCE_BYTES)
  try {
    const key = await deriveHkdfKey(secret, RECOVERY_HKDF_SALT, bytesToUtf8Safe(recoveryAad(userId, recoveryKeyId)))
    const ciphertext = await aesGcmEncryptWithKey(key, privateKey, recoveryAad(userId, recoveryKeyId), nonce)
    return {
      recoveryKey: bytesToBase64Url(secret),
      wrapped: {
        format_version: 1,
        kdf: 'hkdf-sha256',
        recovery_key_id: recoveryKeyId,
        nonce: bytesToBase64Url(nonce),
        ciphertext: bytesToBase64Url(ciphertext),
      },
    }
  } finally {
    zeroBytes(secret)
  }
}

function bytesToUtf8Safe(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

export async function replaceRecoveryWrap(
  userId: string,
  privateKey: Uint8Array,
): Promise<{ recoveryKey: string; wrapped: RecoveryWrappedPrivateKey }> {
  if (privateKey.byteLength !== X25519_KEY_BYTES) throw new CryptoError('malformed', 'Encrypted value is malformed')
  const replacement = await wrapPrivateKeyWithRecovery(userId, privateKey)
  const opened = await unlockPrivateKeyWithRecovery({
    userId,
    recoveryKey: replacement.recoveryKey,
    wrapped: replacement.wrapped,
  })
  try {
    if (!samePrivateKey(opened, privateKey)) throw new CryptoError('integrity', 'Ciphertext integrity check failed')
  } finally {
    zeroBytes(opened)
  }
  return replacement
}

export async function unlockPrivateKeyWithRecovery(input: {
  userId: string
  recoveryKey: string
  wrapped: RecoveryWrappedPrivateKey
}): Promise<Uint8Array> {
  if (input.wrapped.format_version !== 1 || input.wrapped.kdf !== 'hkdf-sha256') {
    throw new CryptoError('unsupported', 'Unsupported encryption format')
  }
  const secret = base64UrlToBytes(parseRecoveryKey(input.recoveryKey))
  const nonce = base64UrlToBytes(input.wrapped.nonce)
  const ciphertext = base64UrlToBytes(input.wrapped.ciphertext)
  if (secret.byteLength !== RECOVERY_KEY_BYTES || nonce.byteLength !== AES_NONCE_BYTES || ciphertext.byteLength !== PRIVATE_KEY_CIPHERTEXT_BYTES) {
    throw new CryptoError('malformed', 'Encrypted value is malformed')
  }
  try {
    const key = await deriveHkdfKey(secret, RECOVERY_HKDF_SALT, bytesToUtf8Safe(recoveryAad(input.userId, input.wrapped.recovery_key_id)))
    return await aesGcmDecryptWithKey(key, ciphertext, recoveryAad(input.userId, input.wrapped.recovery_key_id), nonce)
  } finally {
    zeroBytes(secret)
  }
}

export async function rewrapPrivateKeyWithRecovery(input: {
  userId: string
  recoveryKey: string
  nextPassword: string
  wrapped: RecoveryWrappedPrivateKey
}): Promise<PasswordWrappedPrivateKey> {
  const privateKey = await unlockPrivateKeyWithRecovery({
    userId: input.userId,
    recoveryKey: input.recoveryKey,
    wrapped: input.wrapped,
  })
  try {
    const next = await wrapPrivateKeyWithPassword(input.userId, input.nextPassword, privateKey)
    const opened = await unlockPrivateKeyWithPassword({
      userId: input.userId,
      password: input.nextPassword,
      wrapped: next,
    })
    try {
      if (!samePrivateKey(opened, privateKey)) throw new CryptoError('integrity', 'Ciphertext integrity check failed')
    } finally {
      zeroBytes(opened)
    }
    return next
  } finally {
    zeroBytes(privateKey)
  }
}

export async function rewrapPrivateKeyWithPassword(input: {
  userId: string
  currentPassword: string
  nextPassword: string
  wrapped: PasswordWrappedPrivateKey
}): Promise<PasswordWrappedPrivateKey> {
  const privateKey = await unlockPrivateKeyWithPassword({
    userId: input.userId,
    password: input.currentPassword,
    wrapped: input.wrapped,
  })
  try {
    return await wrapPrivateKeyWithPassword(input.userId, input.nextPassword, privateKey)
  } finally {
    zeroBytes(privateKey)
  }
}

export function samePrivateKey(left: Uint8Array, right: Uint8Array): boolean {
  return bytesEqual(left, right)
}
