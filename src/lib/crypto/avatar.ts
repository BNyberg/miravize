import { base64UrlToBytes, bytesToBase64Url, copyBuffer, utf8Bytes, zeroBytes } from './bytes.ts'
import { CryptoError } from './errors.ts'
import { decryptField, encryptField, type FieldCiphertext } from './formats.ts'

const AVATAR_SALT = 'miravize-avatar-v1'

export async function avatarKey(privateKey: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', copyBuffer(privateKey), 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: copyBuffer(utf8Bytes(AVATAR_SALT)),
      info: copyBuffer(utf8Bytes('avatar')),
    },
    base,
    256,
  )
  return new Uint8Array(bits)
}

function personalAad(userId: string) {
  return {
    workspaceId: userId,
    table: 'user_crypto_profiles',
    recordId: userId,
    field: 'avatar',
    keyVersion: 1,
  }
}

export function packAvatar(bytes: Uint8Array, mime: string) {
  if (!/^image\/[a-z0-9.+-]+$/.test(mime)) throw new CryptoError('malformed', 'Encrypted value is malformed')
  return `${mime},${bytesToBase64Url(bytes)}`
}

export function unpackAvatar(packed: string) {
  const comma = packed.indexOf(',')
  const mime = packed.slice(0, comma)
  const payload = packed.slice(comma + 1)
  if (!/^image\/[a-z0-9.+-]+$/.test(mime) || payload.length === 0) {
    throw new CryptoError('malformed', 'Encrypted value is malformed')
  }
  return { mime, bytes: base64UrlToBytes(payload) }
}

export async function sealPersonalAvatar(userId: string, packed: string, privateKey: Uint8Array): Promise<FieldCiphertext> {
  const key = await avatarKey(privateKey)
  try {
    const aad = personalAad(userId)
    const encrypted = await encryptField(packed, key, aad)
    const opened = await decryptField(encrypted, key, aad)
    if (opened !== packed) throw new CryptoError('integrity', 'Ciphertext integrity check failed')
    return encrypted
  } finally {
    zeroBytes(key)
  }
}

export async function openPersonalAvatar(userId: string, payload: FieldCiphertext, privateKey: Uint8Array) {
  const key = await avatarKey(privateKey)
  try {
    return await decryptField(payload, key, personalAad(userId))
  } finally {
    zeroBytes(key)
  }
}
