import { copyBuffer, utf8Bytes, zeroBytes } from './bytes.ts'
import { CryptoError } from './errors.ts'
import { decryptField, encryptField, type FieldCiphertext } from './formats.ts'

const DISPLAY_NAME_SALT = 'miravize-display-name-v1'

export async function displayNameKey(privateKey: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', copyBuffer(privateKey), 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: copyBuffer(utf8Bytes(DISPLAY_NAME_SALT)),
      info: copyBuffer(utf8Bytes('display-name')),
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
    field: 'display_name',
    keyVersion: 1,
  }
}

export async function sealPersonalDisplayName(userId: string, name: string, privateKey: Uint8Array): Promise<FieldCiphertext> {
  const key = await displayNameKey(privateKey)
  try {
    const aad = personalAad(userId)
    const encrypted = await encryptField(name, key, aad)
    const opened = await decryptField(encrypted, key, aad)
    if (opened !== name) throw new CryptoError('integrity', 'Ciphertext integrity check failed')
    return encrypted
  } finally {
    zeroBytes(key)
  }
}

export async function openPersonalDisplayName(userId: string, payload: FieldCiphertext, privateKey: Uint8Array) {
  const key = await displayNameKey(privateKey)
  try {
    return await decryptField(payload, key, personalAad(userId))
  } finally {
    zeroBytes(key)
  }
}
