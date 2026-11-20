import { base64UrlToBytes, bytesToBase64Url, bytesToUtf8, randomBytes, utf8Bytes } from './bytes.ts'
import { CryptoError } from './errors.ts'
import { AES_KEY_BYTES, AES_NONCE_BYTES, aesGcmDecrypt, aesGcmEncrypt } from './primitives.ts'

export type FieldAad = {
  workspaceId: string
  table: string
  recordId: string
  field: string
  keyVersion: number
}

export type FieldCiphertext = {
  v: 1
  alg: 'A256GCM'
  key_version: number
  iv: string
  ct: string
}

const IDENTIFIER = /^[A-Za-z0-9_-]+$/

export function canonicalFieldAad(aad: FieldAad): string {
  if (!IDENTIFIER.test(aad.workspaceId) || !IDENTIFIER.test(aad.recordId)) {
    throw new CryptoError('malformed', 'Encrypted value is malformed')
  }
  if (!/^[a-z_]+$/.test(aad.table) || !/^[a-z_]+$/.test(aad.field)) {
    throw new CryptoError('malformed', 'Encrypted value is malformed')
  }
  if (!Number.isInteger(aad.keyVersion) || aad.keyVersion < 1) {
    throw new CryptoError('malformed', 'Encrypted value is malformed')
  }
  return JSON.stringify({
    v: 1,
    workspace_id: aad.workspaceId,
    table: aad.table,
    record_id: aad.recordId,
    field: aad.field,
    key_version: aad.keyVersion,
  })
}

export async function encryptField(plaintext: string, workspaceKey: Uint8Array, aad: FieldAad): Promise<FieldCiphertext> {
  if (workspaceKey.byteLength !== AES_KEY_BYTES) throw new CryptoError('malformed', 'Encrypted value is malformed')
  const nonce = randomBytes(AES_NONCE_BYTES)
  const ciphertext = await aesGcmEncrypt(workspaceKey, utf8Bytes(plaintext), utf8Bytes(canonicalFieldAad(aad)), nonce)
  return {
    v: 1,
    alg: 'A256GCM',
    key_version: aad.keyVersion,
    iv: bytesToBase64Url(nonce),
    ct: bytesToBase64Url(ciphertext),
  }
}

export async function decryptField(payload: FieldCiphertext, workspaceKey: Uint8Array, aad: FieldAad): Promise<string> {
  if (payload.v !== 1 || payload.alg !== 'A256GCM') throw new CryptoError('unsupported', 'Unsupported encryption format')
  if (payload.key_version !== aad.keyVersion) throw new CryptoError('integrity', 'Ciphertext integrity check failed')
  const nonce = base64UrlToBytes(payload.iv)
  const ciphertext = base64UrlToBytes(payload.ct)
  if (nonce.byteLength !== AES_NONCE_BYTES || ciphertext.byteLength < 16) {
    throw new CryptoError('malformed', 'Encrypted value is malformed')
  }
  const plain = await aesGcmDecrypt(workspaceKey, ciphertext, utf8Bytes(canonicalFieldAad(aad)), nonce)
  return bytesToUtf8(plain)
}
