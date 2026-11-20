import { CryptoError } from './errors.ts'

export function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

export function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false
  let diff = 0
  for (let index = 0; index < left.byteLength; index += 1) diff |= left[index] ^ right[index]
  return diff === 0
}

export function zeroBytes(bytes: Uint8Array) {
  bytes.fill(0)
}

export function copyBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export function base64UrlToBytes(value: string): Uint8Array {
  try {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/')
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
    const binary = atob(padded + pad)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes
  } catch {
    throw new CryptoError('malformed', 'Encrypted value is malformed')
  }
}
