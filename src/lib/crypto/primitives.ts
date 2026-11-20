import sodium from 'libsodium-wrappers'

import { copyBuffer, utf8Bytes } from './bytes.ts'
import { CryptoError } from './errors.ts'

export const AES_KEY_BYTES = 32
export const AES_NONCE_BYTES = 12
export const X25519_KEY_BYTES = 32

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', copyBuffer(bytes))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function aesKey(keyBytes: Uint8Array) {
  if (keyBytes.byteLength !== AES_KEY_BYTES) throw new CryptoError('malformed', 'Encrypted value is malformed')
  return crypto.subtle.importKey('raw', copyBuffer(keyBytes), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function aesGcmEncrypt(keyBytes: Uint8Array, plaintext: Uint8Array, aad: Uint8Array, nonce: Uint8Array): Promise<Uint8Array> {
  if (nonce.byteLength !== AES_NONCE_BYTES) throw new CryptoError('malformed', 'Encrypted value is malformed')
  const key = await aesKey(keyBytes)
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: copyBuffer(nonce), additionalData: copyBuffer(aad) },
    key,
    copyBuffer(plaintext),
  )
  return new Uint8Array(encrypted)
}

export async function aesGcmDecrypt(keyBytes: Uint8Array, ciphertext: Uint8Array, aad: Uint8Array, nonce: Uint8Array): Promise<Uint8Array> {
  if (nonce.byteLength !== AES_NONCE_BYTES) throw new CryptoError('malformed', 'Encrypted value is malformed')
  const key = await aesKey(keyBytes)
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: copyBuffer(nonce), additionalData: copyBuffer(aad) },
      key,
      copyBuffer(ciphertext),
    )
    return new Uint8Array(plain)
  } catch {
    throw new CryptoError('integrity', 'Ciphertext integrity check failed')
  }
}

export async function deriveHkdfKey(secret: Uint8Array, salt: string, info: string) {
  const base = await crypto.subtle.importKey('raw', copyBuffer(secret), 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: copyBuffer(utf8Bytes(salt)), info: copyBuffer(utf8Bytes(info)) },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function aesGcmEncryptWithKey(key: Awaited<ReturnType<typeof aesKey>>, plaintext: Uint8Array, aad: Uint8Array, nonce: Uint8Array): Promise<Uint8Array> {
  if (nonce.byteLength !== AES_NONCE_BYTES) throw new CryptoError('malformed', 'Encrypted value is malformed')
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: copyBuffer(nonce), additionalData: copyBuffer(aad) },
    key,
    copyBuffer(plaintext),
  )
  return new Uint8Array(encrypted)
}

export async function aesGcmDecryptWithKey(key: Awaited<ReturnType<typeof aesKey>>, ciphertext: Uint8Array, aad: Uint8Array, nonce: Uint8Array): Promise<Uint8Array> {
  if (nonce.byteLength !== AES_NONCE_BYTES) throw new CryptoError('malformed', 'Encrypted value is malformed')
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: copyBuffer(nonce), additionalData: copyBuffer(aad) },
      key,
      copyBuffer(ciphertext),
    )
    return new Uint8Array(plain)
  } catch {
    throw new CryptoError('integrity', 'Ciphertext integrity check failed')
  }
}

async function loadSodium() {
  await sodium.ready
  return sodium
}

export async function publicKeyFromPrivate(privateKey: Uint8Array): Promise<Uint8Array> {
  const box = await loadSodium()
  if (privateKey.byteLength !== X25519_KEY_BYTES) throw new CryptoError('malformed', 'Encrypted value is malformed')
  const publicKey = box.crypto_scalarmult_base(privateKey, 'uint8array')
  if (publicKey.byteLength !== X25519_KEY_BYTES) throw new CryptoError('malformed', 'Encrypted value is malformed')
  return publicKey
}

export async function generateBoxKeyPair(): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array }> {
  const box = await loadSodium()
  const pair = box.crypto_box_keypair('uint8array')
  if (pair.publicKey.byteLength !== X25519_KEY_BYTES || pair.privateKey.byteLength !== X25519_KEY_BYTES) {
    throw new CryptoError('malformed', 'Encrypted value is malformed')
  }
  return { publicKey: pair.publicKey, privateKey: pair.privateKey }
}

export async function sealBox(message: Uint8Array, recipientPublicKey: Uint8Array): Promise<Uint8Array> {
  const box = await loadSodium()
  if (recipientPublicKey.byteLength !== X25519_KEY_BYTES) throw new CryptoError('malformed', 'Encrypted value is malformed')
  return box.crypto_box_seal(message, recipientPublicKey, 'uint8array')
}

export async function openBox(sealed: Uint8Array, publicKey: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array> {
  const box = await loadSodium()
  if (publicKey.byteLength !== X25519_KEY_BYTES || privateKey.byteLength !== X25519_KEY_BYTES) {
    throw new CryptoError('malformed', 'Encrypted value is malformed')
  }
  try {
    return box.crypto_box_seal_open(sealed, publicKey, privateKey, 'uint8array')
  } catch {
    throw new CryptoError('integrity', 'Ciphertext integrity check failed')
  }
}

