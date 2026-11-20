import { base64UrlToBytes, bytesEqual, bytesToBase64Url, randomBytes } from './bytes.ts'
import { CryptoError } from './errors.ts'
import { AES_KEY_BYTES, openBox, sealBox } from './primitives.ts'

export async function createWorkspaceKey(): Promise<Uint8Array> {
  return randomBytes(AES_KEY_BYTES)
}

export async function sealWorkspaceKey(workspaceKey: Uint8Array, recipientPublicKey: Uint8Array): Promise<string> {
  if (workspaceKey.byteLength !== AES_KEY_BYTES) throw new CryptoError('malformed', 'Encrypted value is malformed')
  const sealed = await sealBox(workspaceKey, recipientPublicKey)
  return bytesToBase64Url(sealed)
}

export async function openWorkspaceKey(sealed: string, recipientPublicKey: Uint8Array, recipientPrivateKey: Uint8Array): Promise<Uint8Array> {
  const message = await openBox(base64UrlToBytes(sealed), recipientPublicKey, recipientPrivateKey)
  if (message.byteLength !== AES_KEY_BYTES) throw new CryptoError('integrity', 'Ciphertext integrity check failed')
  return message
}

export function sameWorkspaceKey(left: Uint8Array, right: Uint8Array): boolean {
  return bytesEqual(left, right)
}
