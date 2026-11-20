export class CryptoError extends Error {
  readonly code: 'integrity' | 'malformed' | 'unsupported'

  constructor(code: CryptoError['code'], message: string) {
    super(message)
    this.name = 'CryptoError'
    this.code = code
  }
}
